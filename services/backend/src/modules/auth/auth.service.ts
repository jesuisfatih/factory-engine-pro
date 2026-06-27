import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
} from '@factory-engine-pro/contracts';
import { AuthTokenService } from '../../shared/auth-token.service.js';
import { prefixedId } from '../../shared/id.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PasswordService } from '../../shared/password.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { IdentityRepository } from '../identity/identity.repository.js';
import { IdentityService } from '../identity/identity.service.js';
import { AuthAuditService } from './auth-audit.service.js';
import { AuthPrincipalService } from './auth-principal.service.js';
import { AuthSessionService } from './auth-session.service.js';
import { permissionsFromRecords, type PrincipalRecord } from './auth.types.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityRepository: IdentityRepository,
    private readonly identity: IdentityService,
    private readonly password: PasswordService,
    private readonly authTokens: AuthTokenService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: AppLogger,
    private readonly principals: AuthPrincipalService,
    private readonly sessions: AuthSessionService,
    private readonly audit: AuthAuditService,
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
        return this.sessions.issue(tenant.id, principal);
      },
    );
  }

  async loginMember(input: MemberLoginInput, surface: 'admin' | 'person'): Promise<AuthSession> {
    const tenantId = this.requireTenant();
    const principal = await this.principals.findMemberByEmail(input.email);
    await this.assertPassword(principal, input.password, input.email, surface);
    await this.prisma.db.member.updateMany({ where: { id: principal!.id }, data: { lastLoginAt: new Date() } });
    return this.sessions.issue(tenantId, principal!);
  }

  async loginCustomer(input: CustomerLoginInput): Promise<AuthSession> {
    const tenantId = this.requireTenant();
    const principal = await this.principals.findCustomerByEmail(input.email);
    await this.assertPassword(principal, input.password, input.email, 'accounts');
    if (principal!.type === 'customer_user') {
      await this.prisma.db.customerUser.updateMany({ where: { id: principal!.id }, data: { lastLoginAt: new Date() } });
    }
    return this.sessions.issue(tenantId, principal!);
  }

  async registerCustomer(input: CustomerRegisterInput): Promise<AuthSession> {
    const tenantId = this.requireTenant();
    await this.identity.seedDefaultRoles();
    const adminRole = await this.prisma.db.customerRole.findFirst({ where: { slug: 'b2b_admin' } });
    if (!adminRole) throw new BadRequestException('B2B admin role missing');
    const adminRoleId = adminRole.id;
    const adminPermissions = adminRole.permissions;

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
      await this.identityRepository.setCustomerUserRoles(user.id, [adminRoleId]);
      return this.sessions.issue(tenantId, {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        passwordHash: user.passwordHash,
        status: user.status,
        permissions: permissionsFromRecords([adminPermissions]),
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
      ? await this.principals.findCustomerByEmail(input.email)
      : await this.principals.findMemberByEmail(input.email);

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
    await this.principals.updatePassword(token.principalType as PrincipalType, token.principalId, passwordHash, true);
    this.logger.log('auth', 'password_reset.completed', 'Password was reset', {
      principal_id: token.principalId,
      principal_type: token.principalType,
    });
    return { ok: true };
  }

  async acceptInvitation(input: AcceptInvitationInput): Promise<AuthSession> {
    const token = await this.authTokens.consume('invitation', input.token);
    const passwordHash = await this.password.hash(input.password);
    await this.principals.updatePassword(token.principalType as PrincipalType, token.principalId, passwordHash, true);
    const principal = await this.principals.findById(token.principalType as PrincipalType, token.principalId);
    if (!principal) throw new UnauthorizedException('Invitation principal not found');
    return this.sessions.issue(token.tenantId, principal);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const token = await this.authTokens.consume('refresh', refreshToken);
    const principal = await this.principals.findById(token.principalType as PrincipalType, token.principalId);
    if (!principal) throw new UnauthorizedException('Principal no longer exists');
    return this.sessions.issue(token.tenantId, principal);
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) await this.authTokens.revoke('refresh', refreshToken);
    return { ok: true };
  }

  async me() {
    const context = this.tenantContext.require();
    if (!context.principalId || !context.principalType) throw new UnauthorizedException('Missing principal context');
    const principal = await this.principals.findById(context.principalType, context.principalId);
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

  private requireTenant() {
    const tenantId = this.tenantContext.get()?.tenantId;
    if (!tenantId) throw new BadRequestException('x-tenant-id header is required');
    return tenantId;
  }

  private async assertPassword(principal: PrincipalRecord | null, password: string, email: string, surface: string) {
    const valid = principal && principal.status === 'active' && await this.password.verify(password, principal.passwordHash);
    await this.audit.writeLoginAttempt({
      principal,
      email,
      action: `${surface}.login`,
      success: Boolean(valid),
    });
    if (!valid) throw new UnauthorizedException('Invalid email or password');
  }
}
