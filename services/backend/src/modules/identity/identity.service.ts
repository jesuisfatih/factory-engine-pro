import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  DEFAULT_CUSTOMER_ROLES,
  DEFAULT_MEMBER_ROLES,
  MEMBER_PERMISSIONS,
  urgencyScoringConfigSchema,
  type CreateCustomerUserInput,
  type CreateMemberInput,
  type CreateMemberRoleInput,
  type CreateSubUserInput,
  type TenantConfigInput,
  type UpdateMemberInput,
  type UpdateMemberRoleInput,
} from '@factory-engine-pro/contracts';
import { AuthTokenService } from '../../shared/auth-token.service.js';
import { CryptoService } from '../../shared/crypto.service.js';
import { prefixedId } from '../../shared/id.js';
import { PasswordService } from '../../shared/password.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { MailService } from '../mail/mail.service.js';
import { IdentityRepository } from './identity.repository.js';

@Injectable()
export class IdentityService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly password: PasswordService,
    private readonly authTokens: AuthTokenService,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
  ) {}

  async ensureDefaultRoles() {
    for (const role of DEFAULT_MEMBER_ROLES) {
      const existing = await this.prisma.db.memberRole.findFirst({ where: { slug: role.slug } });
      if (!existing) {
        await this.repository.createMemberRole({ ...role, permissions: role.permissions as Record<string, boolean>, isSystem: true });
      } else if (existing.isSystem) {
        const permissions = role.permissions as Record<string, boolean>;
        await this.prisma.db.memberRole.updateMany({ where: { id: existing.id }, data: { permissions } });
      }
    }
    for (const role of DEFAULT_CUSTOMER_ROLES) {
      const existing = await this.prisma.db.customerRole.findFirst({ where: { slug: role.slug } });
      if (!existing) {
        await this.repository.createCustomerRole({ ...role, permissions: role.permissions as Record<string, boolean>, isSystem: true });
      } else if (existing.isSystem) {
        const permissions = role.permissions as Record<string, boolean>;
        await this.prisma.db.customerRole.updateMany({ where: { id: existing.id }, data: { permissions } });
      }
    }
  }

  listMemberRoles() {
    return this.repository.listMemberRoles();
  }

  async createMemberRole(input: CreateMemberRoleInput) {
    try {
      return await this.repository.createMemberRole(input);
    } catch (error) {
      throw uniqueConflict(error, 'Member role slug already exists');
    }
  }

  async updateMemberRole(id: string, input: UpdateMemberRoleInput) {
    const role = await this.repository.findMemberRoleById(id);
    if (role.isSystem && input.permissions) {
      throw new BadRequestException('System role permissions cannot be changed');
    }
    await this.repository.updateMemberRole(id, input);
    return this.repository.findMemberRoleById(id);
  }

  async deleteMemberRole(id: string) {
    const role = await this.repository.findMemberRoleById(id);
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }
    await this.repository.deleteMemberRole(id);
    return { ok: true };
  }

  listCustomerRoles() {
    return this.repository.listCustomerRoles();
  }

  async listCustomerRoleOptionsForCurrentPrincipal() {
    const context = this.tenantContext.require();
    if (!['customer_user', 'sub_user'].includes(context.principalType ?? '')) {
      throw new BadRequestException('Customer role options are only available in the account portal');
    }
    await this.ensureDefaultRoles();
    const roles = await this.repository.listCustomerRoles();
    return roles.map((role) => ({
      id: role.id,
      slug: role.slug,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions,
    }));
  }

  async listMembers(search?: string) {
    return (await this.repository.listMembers(search)).map(stripPasswordHash);
  }

  async createMember(input: CreateMemberInput) {
    await this.assertMemberRoles(input.roleIds);
    if (!input.password && !input.sendInvite) {
      throw new BadRequestException('Set a password or enable invite flow');
    }
    const passwordHash = input.password ? await this.password.hash(input.password) : undefined;
    try {
      const member = await this.repository.createMember({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        passwordHash,
        status: passwordHash ? 'active' : 'invited',
        aircallUserId: input.aircallUserId,
      });
      await this.repository.setMemberRoles(member.id, input.roleIds);
      if (input.aircallUserId) {
        await this.syncMemberAircallMap(member.id, input.aircallUserId, 'identity_create');
      }
      const invitation = input.sendInvite
        ? await this.createInvitation(member.id, 'member')
        : null;
      const created = await this.repository.findMemberById(member.id);
      if (!created) throw new NotFoundException('Member not found after creation');
      return {
        ...stripPasswordHash(created),
        invitation,
      };
    } catch (error) {
      throw uniqueConflict(error, 'A member with this email already exists');
    }
  }

  async updateMember(id: string, input: UpdateMemberInput) {
    const existing = await this.repository.findMemberById(id);
    if (!existing) throw new NotFoundException('Member not found');
    if (input.roleIds) await this.assertMemberRoles(input.roleIds);
    await this.repository.updateMember(id, {
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.lastName !== undefined && { lastName: input.lastName }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.aircallUserId !== undefined && { aircallUserId: input.aircallUserId }),
    });
    if (input.roleIds) await this.repository.setMemberRoles(id, input.roleIds);
    if (input.aircallUserId !== undefined) {
      await this.syncMemberAircallMap(id, input.aircallUserId ?? null, 'identity_update');
    }
    const updated = await this.repository.findMemberById(id);
    if (!updated) throw new NotFoundException('Member not found');
    return stripPasswordHash(updated);
  }

  async createCustomerUser(input: CreateCustomerUserInput) {
    await this.assertCustomerRoles(input.roleIds);
    if (!input.password && !input.sendInvite) {
      throw new BadRequestException('Set a password or enable invite flow');
    }
    const customer = input.customerId
      ? await this.prisma.db.customer.findFirst({ where: { id: input.customerId } })
      : await this.repository.createCustomer({
          companyName: input.companyName,
          email: input.email,
          phone: input.phone,
        });
    if (!customer) throw new NotFoundException('Customer not found');

    const passwordHash = input.password ? await this.password.hash(input.password) : undefined;
    try {
      const user = await this.repository.createCustomerUser({
        customerId: customer.id,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        passwordHash,
        status: passwordHash ? 'active' : 'invited',
        spendingLimitCents: input.spendingLimitCents,
      });
      await this.repository.setCustomerUserRoles(user.id, input.roleIds);
      const invitation = input.sendInvite
        ? await this.createInvitation(user.id, 'customer_user')
        : null;
      const created = await this.repository.findCustomerUserById(user.id);
      if (!created) throw new NotFoundException('Customer user not found after creation');
      return {
        ...stripPasswordHash(created),
        invitation,
      };
    } catch (error) {
      throw uniqueConflict(error, 'A customer user with this email already exists');
    }
  }

  async listCustomerUsers() {
    return (await this.repository.listCustomerUsers()).map(stripPasswordHash);
  }

  async listSubUsersForCurrentPrincipal() {
    const context = this.tenantContext.require();
    if (context.principalType === 'customer_user' && context.principalId) {
      return (await this.repository.listSubUsers(context.principalId)).map(stripSubUserSensitiveFields);
    }
    return (await this.repository.listSubUsers()).map(stripSubUserSensitiveFields);
  }

  async createSubUser(input: CreateSubUserInput) {
    const context = this.tenantContext.require();
    if (context.principalType !== 'customer_user' || !context.principalId) {
      throw new BadRequestException('Only a customer user can create B2B sub-users from this endpoint');
    }
    const parent = await this.repository.findCustomerUserById(context.principalId);
    if (!parent) throw new NotFoundException('Parent customer user not found');
    const roleIds = input.roleIds.length > 0 ? input.roleIds : await this.defaultCustomerRoleIds(['b2b_user']);
    await this.assertCustomerRoles(roleIds);
    if (!input.password && !input.sendInvite) {
      throw new BadRequestException('Set a password or enable invite flow');
    }
    const passwordHash = input.password ? await this.password.hash(input.password) : undefined;
    try {
      const subUser = await this.repository.createSubUser({
        customerId: parent.customerId,
        parentUserId: parent.id,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        passwordHash,
        status: passwordHash ? 'active' : 'invited',
        spendingLimitCents: input.spendingLimitCents,
      });
      await this.repository.setSubUserRoles(subUser.id, roleIds);
      const invitation = input.sendInvite
        ? await this.createInvitation(subUser.id, 'sub_user')
        : null;
      const created = await this.prisma.db.subUser.findFirst({ where: { id: subUser.id }, include: { roleAssignments: { include: { role: true } } } });
      if (!created) throw new NotFoundException('Sub-user not found after creation');
      return {
        ...stripSubUserSensitiveFields(created),
        invitation,
      };
    } catch (error) {
      throw uniqueConflict(error, 'A sub-user with this email already exists');
    }
  }

  async getTenantConfig() {
    const config = await this.prisma.db.tenantConfig.findFirst({});
    if (!config) {
      return {
        workspaceName: null,
        brandBadge: null,
        brandLogo: null,
        urgencyScoringConfig: urgencyScoringConfigSchema.parse({}),
        shopifyDomain: null,
        hasShopifyAdminToken: false,
        hasShopifyApiKey: false,
        hasShopifyApiSecret: false,
        hasWebhookHmacKey: false,
        hasAircallApiId: false,
        hasAircallApiToken: false,
        hasAircallWebhookSecret: false,
        hasAnthropicApiKey: false,
        hasResendApiKey: false,
        hasResendWebhookSecret: false,
      };
    }
    return {
      workspaceName: config.workspaceName,
      brandBadge: config.brandBadge,
      brandLogo: config.brandLogo,
      urgencyScoringConfig: parseUrgencyScoringConfig(config.urgencyScoringConfig),
      shopifyDomain: config.shopifyDomain,
      hasShopifyAdminToken: Boolean(config.shopifyAdminTokenEncrypted),
      hasShopifyApiKey: Boolean(config.shopifyApiKeyEncrypted),
      hasShopifyApiSecret: Boolean(config.shopifyApiSecretEncrypted),
      hasWebhookHmacKey: Boolean(config.webhookHmacKeyEncrypted),
      hasAircallApiId: Boolean(config.aircallApiIdEncrypted),
      hasAircallApiToken: Boolean(config.aircallApiTokenEncrypted),
      hasAircallWebhookSecret: Boolean(config.aircallWebhookSecretEncrypted),
      hasAnthropicApiKey: Boolean(config.anthropicApiKeyEncrypted),
      hasResendApiKey: Boolean(config.resendApiKeyEncrypted),
      hasResendWebhookSecret: Boolean(config.resendWebhookSecretEncrypted),
    };
  }

  async getWorkspaceBrand() {
    const config = await this.prisma.db.tenantConfig.findFirst({
      select: {
        workspaceName: true,
        brandBadge: true,
        brandLogo: true,
      },
    });
    return {
      workspaceName: config?.workspaceName ?? null,
      brandBadge: config?.brandBadge ?? null,
      brandLogo: config?.brandLogo ?? null,
    };
  }

  async updateTenantConfig(input: TenantConfigInput) {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    const existing = await this.prisma.db.tenantConfig.findFirst({});
    const data = {
      workspaceName: input.workspaceName,
      brandBadge: input.brandBadge,
      brandLogo: input.brandLogo,
      urgencyScoringConfig: input.urgencyScoringConfig,
      shopifyDomain: input.shopifyDomain,
      shopifyAdminTokenEncrypted: this.crypto.encrypt(input.shopifyAdminToken),
      shopifyApiKeyEncrypted: this.crypto.encrypt(input.shopifyApiKey),
      shopifyApiSecretEncrypted: this.crypto.encrypt(input.shopifyApiSecret),
      webhookHmacKeyEncrypted: this.crypto.encrypt(input.webhookHmacKey),
      aircallApiIdEncrypted: this.crypto.encrypt(input.aircallApiId),
      aircallApiTokenEncrypted: this.crypto.encrypt(input.aircallApiToken),
      aircallWebhookSecretEncrypted: this.crypto.encrypt(input.aircallWebhookSecret),
      anthropicApiKeyEncrypted: this.crypto.encrypt(input.anthropicApiKey),
      resendApiKeyEncrypted: this.crypto.encrypt(input.resendApiKey),
      resendWebhookSecretEncrypted: this.crypto.encrypt(input.resendWebhookSecret),
    };
    if (existing) {
      await this.prisma.db.tenantConfig.updateMany({ where: { id: existing.id }, data: stripUndefined(data) });
    } else {
      await this.prisma.db.tenantConfig.create({ data: { id: prefixedId('cfg'), tenantId, ...stripUndefined(data) } });
    }
    return this.getTenantConfig();
  }

  private async assertMemberRoles(roleIds: string[]) {
    const roles = await this.prisma.db.memberRole.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) throw new BadRequestException('One or more member roles do not exist');
  }

  private async assertCustomerRoles(roleIds: string[]) {
    const roles = await this.prisma.db.customerRole.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) throw new BadRequestException('One or more customer roles do not exist');
  }

  private async defaultCustomerRoleIds(slugs: string[]) {
    const roles = await this.prisma.db.customerRole.findMany({ where: { slug: { in: slugs } } });
    if (roles.length !== slugs.length) throw new BadRequestException('Default customer roles are missing');
    return roles.map((role) => role.id);
  }

  private async createInvitation(principalId: string, principalType: 'member' | 'customer_user' | 'sub_user') {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    const token = await this.authTokens.create({
      tenantId,
      kind: 'invitation',
      principalType,
      principalId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdById: this.tenantContext.get()?.principalId,
    });
    const principal = await this.principalsForInvitation(principalId, principalType);
    const delivery = await this.mail.sendInvitation({
      to: principal.email,
      recipientName: `${principal.firstName} ${principal.lastName}`.trim(),
      token,
      surface: principalType === 'member' ? 'admin' : 'accounts',
      eventKey: principalType === 'member' ? 'identity.member_invitation' : 'identity.customer_invitation',
      metadata: { principalId, principalType },
    });
    return {
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      delivery: {
        id: delivery.id,
        status: delivery.status,
      },
    };
  }

  private async syncMemberAircallMap(memberId: string, aircallUserId: string | null, source: string) {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    await this.prisma.$transaction(async (tx) => {
      await tx.aircallMemberMap.deleteMany({
        where: {
          tenantId,
          OR: [
            { memberId },
            ...(aircallUserId ? [{ aircallUserId }] : []),
          ],
        },
      });
      if (aircallUserId) {
        await tx.member.updateMany({
          where: { tenantId, aircallUserId, id: { not: memberId } },
          data: { aircallUserId: null },
        });
        await tx.aircallMemberMap.create({
          data: {
            id: prefixedId('acmap'),
            tenantId,
            aircallUserId,
            memberId,
            source,
          },
        });
      }
      await tx.member.updateMany({
        where: { tenantId, id: memberId },
        data: { aircallUserId },
      });
    });
  }

  private async principalsForInvitation(principalId: string, principalType: 'member' | 'customer_user' | 'sub_user') {
    if (principalType === 'member') {
      const member = await this.prisma.db.member.findFirst({ where: { id: principalId } });
      if (!member) throw new NotFoundException('Invitation member not found');
      return member;
    }
    if (principalType === 'customer_user') {
      const user = await this.prisma.db.customerUser.findFirst({ where: { id: principalId } });
      if (!user) throw new NotFoundException('Invitation customer user not found');
      return user;
    }
    const subUser = await this.prisma.db.subUser.findFirst({ where: { id: principalId } });
    if (!subUser) throw new NotFoundException('Invitation sub-user not found');
    return subUser;
  }
}

function uniqueConflict(error: unknown, message: string): never {
  if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === 'P2002') {
    throw new ConflictException(message);
  }
  throw error;
}

function stripUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null)) as Partial<T>;
}

function parseUrgencyScoringConfig(value: Prisma.JsonValue) {
  const parsed = urgencyScoringConfigSchema.safeParse(value && typeof value === 'object' && !Array.isArray(value) ? value : {});
  return parsed.success ? parsed.data : urgencyScoringConfigSchema.parse({});
}

function stripPasswordHash<T extends { passwordHash?: unknown }>(record: T) {
  const { passwordHash: _passwordHash, ...safe } = record;
  return safe;
}

function stripSubUserSensitiveFields<T extends { passwordHash?: unknown; parentUser?: ({ passwordHash?: unknown } | null) }>(record: T) {
  const { passwordHash: _passwordHash, parentUser, ...safe } = record;
  return {
    ...safe,
    ...(parentUser !== undefined && { parentUser: parentUser ? stripPasswordHash(parentUser) : parentUser }),
  };
}
