import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import type { PrincipalType } from '@factory-engine-pro/contracts';
import {
  type AcceptInvitationInput,
  type AuthSession,
  type BootstrapTenantInput,
  type CustomerLoginInput,
  type CustomerRegisterInput,
  type ForgotPasswordInput,
  type MemberLoginInput,
  type ResetPasswordInput,
  DEFAULT_CUSTOMER_ROLES,
} from '@factory-engine-pro/contracts';
import { AuthTokenService } from '../../shared/auth-token.service.js';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PasswordService } from '../../shared/password.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { IdentityRepository } from '../identity/identity.repository.js';
import { IdentityService } from '../identity/identity.service.js';

interface PrincipalRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string | null;
  status: string;
  permissions: string[];
  type: PrincipalType;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityRepository: IdentityRepository,
    private readonly identity: IdentityService,
    private readonly password: PasswordService,
    private readonly authTokens: AuthTokenService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
  ) {}

  async bootstrapTenant(input: BootstrapTenantInput): Promise<AuthSession> {
    const bootstrapTenantId = input.tenantId ?? prefixedId('ten');
    const existing = await this.identityRepository.findTenantById(bootstrapTenantId);
    if (existing) throw new ConflictException('Tenant already exists');
    const tenant = await this.identityRepository.createTenant({
      id: bootstrapTenantId,
      name: input.tenantName,
      slug: input.tenantSlug,
    });

    return this.tenantContext.run(
      {
        requestId: this.tenantContext.get()?.requestId ?? 'bootstrap',
        tenantId: tenant.id,
        permissions: [],
      },
      async () => {
        await this.identity.seedDefaultRoles();
        const ownerRole = await this.prisma.db.memberRole.findFirst({ where: { slug: 'owner' } });
        if (!ownerRole) throw new BadRequestException('Owner role was not seeded');
        const owner = await this.identityRepository.createMember({
          email: input.ownerEmail,
          firstName: input.ownerFirstName,
          lastName: input.ownerLastName,
          passwordHash: await this.password.hash(input.ownerPassword),
          status: 'active',
        });
        await this.identityRepository.setMemberRoles(owner.id, [ownerRole.id]);
        const principal = {
          id: owner.id,
          email: owner.email,
          firstName: owner.firstName,
          lastName: owner.lastName,
          passwordHash: owner.passwordHash,
          status: owner.status,
          permissions: permissionsFromRecords([ownerRole.permissions]),
          type: 'member' as const,
        };
        this.logger.log('auth', 'bootstrap', 'Tenant bootstrapped', { tenant_id: tenant.id, owner_id: owner.id });
        return this.issueSession(tenant.id, principal);
      },
    );
  }

  async loginMember(input: MemberLoginInput, surface: 'admin' | 'person'): Promise<AuthSession> {
    const tenantId = this.requireTenant();
    const member = await this.identityRepository.findMemberByEmail(input.email);
    const principal = member
      ? {
          id: member.id,
          email: member.email,
          firstName: member.firstName,
          lastName: member.lastName,
          passwordHash: member.passwordHash,
          status: member.status,
          permissions: permissionsFromRecords(member.roleAssignments.map((assignment) => assignment.role.permissions)),
          type: 'member' as const,
        }
      : null;
    await this.assertPassword(principal, input.password, input.email, surface);
    await this.prisma.db.member.updateMany({ where: { id: principal!.id }, data: { lastLoginAt: new Date() } });
    return this.issueSession(tenantId, principal!);
  }

  async loginCustomer(input: CustomerLoginInput): Promise<AuthSession> {
    const tenantId = this.requireTenant();
    const user = await this.identityRepository.findCustomerUserByEmail(input.email);
    const subUser = user ? null : await this.identityRepository.findSubUserByEmail(input.email);
    const principal = user
      ? {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          passwordHash: user.passwordHash,
          status: user.status,
          permissions: permissionsFromRecords(user.roleAssignments.map((assignment) => assignment.role.permissions)),
          type: 'customer_user' as const,
        }
      : subUser
        ? {
            id: subUser.id,
            email: subUser.email,
            firstName: subUser.firstName,
            lastName: subUser.lastName,
            passwordHash: subUser.passwordHash,
            status: subUser.status,
            permissions: permissionsFromRecords(subUser.roleAssignments.map((assignment) => assignment.role.permissions)),
            type: 'sub_user' as const,
          }
        : null;
    await this.assertPassword(principal, input.password, input.email, 'accounts');
    if (principal!.type === 'customer_user') {
      await this.prisma.db.customerUser.updateMany({ where: { id: principal!.id }, data: { lastLoginAt: new Date() } });
    }
    return this.issueSession(tenantId, principal!);
  }

  async registerCustomer(input: CustomerRegisterInput): Promise<AuthSession> {
    const tenantId = this.requireTenant();
    await this.ensureCustomerRoles();
    const adminRole = await this.prisma.db.customerRole.findFirst({ where: { slug: 'b2b_admin' } });
    if (!adminRole) throw new BadRequestException('B2B admin role missing');

    try {
      const customer = await this.identityRepository.createCustomer({
        companyName: input.companyName,
        email: input.email,
        phone: input.phone,
        taxId: input.taxId,
        billingAddress: input.billingAddress as Prisma.InputJsonValue | undefined,
        shippingAddress: input.shippingAddress as Prisma.InputJsonValue | undefined,
      });
      const user = await this.identityRepository.createCustomerUser({
        customerId: customer.id,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        passwordHash: await this.password.hash(input.password),
        status: 'active',
      });
      await this.identityRepository.setCustomerUserRoles(user.id, [adminRole.id]);
      return this.issueSession(tenantId, {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        passwordHash: user.passwordHash,
        status: user.status,
        permissions: permissionsFromRecords([adminRole.permissions]),
        type: 'customer_user',
      });
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === 'P2002') {
        throw new ConflictException('A customer account with this email already exists');
      }
      throw error;
    }
  }

  async forgotPassword(input: ForgotPasswordInput) {
    const tenantId = this.requireTenant();
    const principal = input.surface === 'accounts'
      ? await this.findCustomerPrincipal(input.email)
      : await this.findMemberPrincipal(input.email);

    let devToken: string | undefined;
    if (principal) {
      devToken = await this.authTokens.create({
        tenantId,
        kind: 'password_reset',
        principalType: principal.type,
        principalId: principal.id,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        metadata: { surface: input.surface },
      });
      this.logger.log('auth', 'password_reset.requested', 'Password reset token created', {
        principal_id: principal.id,
        principal_type: principal.type,
      });
    }

    return {
      ok: true,
      request_id: this.tenantContext.require().requestId,
      ...(this.config.get<string>('NODE_ENV') !== 'production' && devToken ? { devToken } : {}),
    };
  }

  async resetPassword(input: ResetPasswordInput): Promise<{ ok: true }> {
    const token = await this.authTokens.consume('password_reset', input.token);
    const passwordHash = await this.password.hash(input.password);
    await this.updatePrincipalPassword(token.principalType as PrincipalType, token.principalId, passwordHash, true);
    this.logger.log('auth', 'password_reset.completed', 'Password was reset', {
      principal_id: token.principalId,
      principal_type: token.principalType,
    });
    return { ok: true };
  }

  async acceptInvitation(input: AcceptInvitationInput): Promise<AuthSession> {
    const token = await this.authTokens.consume('invitation', input.token);
    const passwordHash = await this.password.hash(input.password);
    await this.updatePrincipalPassword(token.principalType as PrincipalType, token.principalId, passwordHash, true);
    const principal = await this.findPrincipalById(token.principalType as PrincipalType, token.principalId);
    if (!principal) throw new UnauthorizedException('Invitation principal not found');
    return this.issueSession(token.tenantId, principal);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const token = await this.authTokens.consume('refresh', refreshToken);
    const principal = await this.findPrincipalById(token.principalType as PrincipalType, token.principalId);
    if (!principal) throw new UnauthorizedException('Principal no longer exists');
    return this.issueSession(token.tenantId, principal);
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) await this.authTokens.revoke('refresh', refreshToken);
    return { ok: true };
  }

  async me() {
    const context = this.tenantContext.require();
    if (!context.principalId || !context.principalType) throw new UnauthorizedException('Missing principal context');
    const principal = await this.findPrincipalById(context.principalType, context.principalId);
    if (!principal) throw new UnauthorizedException('Principal no longer exists');
    return {
      id: principal.id,
      type: principal.type,
      email: principal.email,
      firstName: principal.firstName,
      lastName: principal.lastName,
      permissions: principal.permissions,
    };
  }

  private async issueSession(tenantId: string, principal: PrincipalRecord): Promise<AuthSession> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: principal.id,
        tenant_id: tenantId,
        principal_type: principal.type,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );
    const refreshToken = await this.authTokens.create({
      tenantId,
      kind: 'refresh',
      principalType: principal.type,
      principalId: principal.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    return {
      accessToken,
      refreshToken,
      tenantId,
      principal: {
        id: principal.id,
        type: principal.type,
        email: principal.email,
        firstName: principal.firstName,
        lastName: principal.lastName,
        permissions: principal.permissions,
      },
    };
  }

  private requireTenant() {
    const tenantId = this.tenantContext.get()?.tenantId;
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required');
    return tenantId;
  }

  private async assertPassword(principal: PrincipalRecord | null, password: string, email: string, surface: string) {
    const valid = principal && principal.status === 'active' && await this.password.verify(password, principal.passwordHash);
    await this.writeAudit({
      principal,
      email,
      action: `${surface}.login`,
      success: Boolean(valid),
    });
    if (!valid) throw new UnauthorizedException('Invalid email or password');
  }

  private async writeAudit(input: { principal: PrincipalRecord | null; email: string; action: string; success: boolean }) {
    const tenantId = this.requireTenant();
    await this.prisma.db.authAuditLog.create({
      data: {
        id: prefixedId('alog'),
        tenantId,
        principalId: input.principal?.id,
        principalType: input.principal?.type,
        email: input.email,
        action: input.action,
        requestId: this.tenantContext.get()?.requestId,
        success: input.success,
      },
    });
  }

  private async findMemberPrincipal(email: string): Promise<PrincipalRecord | null> {
    const member = await this.identityRepository.findMemberByEmail(email);
    if (!member) return null;
    return {
      id: member.id,
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      passwordHash: member.passwordHash,
      status: member.status,
      permissions: permissionsFromRecords(member.roleAssignments.map((assignment) => assignment.role.permissions)),
      type: 'member',
    };
  }

  private async findCustomerPrincipal(email: string): Promise<PrincipalRecord | null> {
    const user = await this.identityRepository.findCustomerUserByEmail(email);
    if (user) {
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        passwordHash: user.passwordHash,
        status: user.status,
        permissions: permissionsFromRecords(user.roleAssignments.map((assignment) => assignment.role.permissions)),
        type: 'customer_user',
      };
    }
    const subUser = await this.identityRepository.findSubUserByEmail(email);
    if (!subUser) return null;
    return {
      id: subUser.id,
      email: subUser.email,
      firstName: subUser.firstName,
      lastName: subUser.lastName,
      passwordHash: subUser.passwordHash,
      status: subUser.status,
      permissions: permissionsFromRecords(subUser.roleAssignments.map((assignment) => assignment.role.permissions)),
      type: 'sub_user',
    };
  }

  private async findPrincipalById(type: PrincipalType, id: string): Promise<PrincipalRecord | null> {
    if (type === 'member') {
      const member = await this.identityRepository.findMemberById(id);
      if (!member) return null;
      return {
        id: member.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        passwordHash: member.passwordHash,
        status: member.status,
        permissions: permissionsFromRecords(member.roleAssignments.map((assignment) => assignment.role.permissions)),
        type,
      };
    }
    if (type === 'customer_user') {
      const user = await this.identityRepository.findCustomerUserById(id);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        passwordHash: user.passwordHash,
        status: user.status,
        permissions: permissionsFromRecords(user.roleAssignments.map((assignment) => assignment.role.permissions)),
        type,
      };
    }
    const subUser = await this.prisma.db.subUser.findFirst({
      where: { id },
      include: { roleAssignments: { include: { role: true } } },
    });
    if (!subUser) return null;
    return {
      id: subUser.id,
      email: subUser.email,
      firstName: subUser.firstName,
      lastName: subUser.lastName,
      passwordHash: subUser.passwordHash,
      status: subUser.status,
      permissions: permissionsFromRecords(subUser.roleAssignments.map((assignment) => assignment.role.permissions)),
      type,
    };
  }

  private async updatePrincipalPassword(type: PrincipalType, id: string, passwordHash: string, activate: boolean) {
    const data = { passwordHash, ...(activate ? { status: 'active' as const, invitationAcceptedAt: new Date() } : {}) };
    if (type === 'member') {
      await this.prisma.db.member.updateMany({ where: { id }, data });
      return;
    }
    if (type === 'customer_user') {
      await this.prisma.db.customerUser.updateMany({ where: { id }, data: { passwordHash, ...(activate ? { status: 'active' as const } : {}) } });
      return;
    }
    await this.prisma.db.subUser.updateMany({ where: { id }, data: { passwordHash, ...(activate ? { status: 'active' as const } : {}) } });
  }

  private async ensureCustomerRoles() {
    const tenantId = this.requireTenant();
    for (const role of DEFAULT_CUSTOMER_ROLES) {
      const existing = await this.prisma.db.customerRole.findFirst({ where: { slug: role.slug } });
      if (!existing) {
        await this.prisma.db.customerRole.create({
          data: {
            id: prefixedId('crol'),
            tenantId,
            slug: role.slug,
            name: role.name,
            description: role.description,
            permissions: role.permissions as Record<string, boolean>,
            isSystem: true,
          },
        });
      }
    }
  }
}

function permissionsFromRecords(records: unknown[]) {
  const set = new Set<string>();
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
      if (value === true) set.add(key);
    }
  }
  return [...set];
}
