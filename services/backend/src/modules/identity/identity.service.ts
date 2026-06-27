import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  DEFAULT_CUSTOMER_ROLES,
  DEFAULT_MEMBER_ROLES,
  MEMBER_PERMISSIONS,
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
  ) {}

  async seedDefaultRoles() {
    for (const role of DEFAULT_MEMBER_ROLES) {
      const existing = await this.prisma.db.memberRole.findFirst({ where: { slug: role.slug } });
      if (!existing) {
        await this.repository.createMemberRole({ ...role, permissions: role.permissions as Record<string, boolean>, isSystem: true });
      }
    }
    for (const role of DEFAULT_CUSTOMER_ROLES) {
      const existing = await this.prisma.db.customerRole.findFirst({ where: { slug: role.slug } });
      if (!existing) {
        await this.repository.createCustomerRole({ ...role, permissions: role.permissions as Record<string, boolean>, isSystem: true });
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

  listCustomerRoles() {
    return this.repository.listCustomerRoles();
  }

  listMembers(search?: string) {
    return this.repository.listMembers(search);
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
      const invitation = input.sendInvite
        ? await this.createInvitation(member.id, 'member')
        : null;
      return {
        ...(await this.repository.findMemberById(member.id)),
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
    return this.repository.findMemberById(id);
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
      return {
        ...(await this.repository.findCustomerUserById(user.id)),
        invitation,
      };
    } catch (error) {
      throw uniqueConflict(error, 'A customer user with this email already exists');
    }
  }

  async listCustomerUsers() {
    return this.repository.listCustomerUsers();
  }

  async listSubUsersForCurrentPrincipal() {
    const context = this.tenantContext.require();
    if (context.principalType === 'customer_user' && context.principalId) {
      return this.repository.listSubUsers(context.principalId);
    }
    return this.repository.listSubUsers();
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
      return {
        ...(await this.prisma.db.subUser.findFirst({ where: { id: subUser.id }, include: { roleAssignments: { include: { role: true } } } })),
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
      };
    }
    return {
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
    };
  }

  async updateTenantConfig(input: TenantConfigInput) {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    const existing = await this.prisma.db.tenantConfig.findFirst({});
    const data = {
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
    return {
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
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
