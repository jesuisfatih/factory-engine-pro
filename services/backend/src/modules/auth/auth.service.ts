import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { PrincipalType } from '@factory-engine-pro/contracts';
import {
  type AcceptInvitationInput,
  type AuthSession,
  type BootstrapTenantInput,
  type CreateMcpTokenInput,
  type CustomerLoginInput,
  type CustomerRegisterInput,
  type ForgotPasswordInput,
  MEMBER_PERMISSIONS,
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
import { MailService } from '../mail/mail.service.js';
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
    private readonly mail: MailService,
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
        await this.identity.ensureDefaultRoles();
        const ownerRole = await this.prisma.db.memberRole.findFirst({ where: { slug: 'owner' } });
        if (!ownerRole) throw new BadRequestException('Owner role is missing after default role bootstrap');
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
    await this.identity.ensureDefaultRoles();
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
      await this.mail.sendPasswordReset({
        to: principal.email,
        recipientName: `${principal.firstName} ${principal.lastName}`.trim(),
        token: devToken,
        surface: input.surface,
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

  async logout(input: { refreshToken?: string; accessToken?: string }) {
    const [refreshRevoked, accessRevoked] = await Promise.all([
      this.authTokens.revokeIfPresent('refresh', input.refreshToken),
      this.sessions.revokeAccessToken(input.accessToken),
    ]);
    this.logger.log('auth', 'logout', 'Principal logged out', {
      refresh_revoked: refreshRevoked,
      access_revoked: accessRevoked,
    });
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

  async listMcpTokens() {
    const tenantId = this.requireTenant();
    const rows = await this.prisma.db.authToken.findMany({
      where: { tenantId, kind: 'mcp_access' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      tenantId,
      tokens: rows.map((row) => this.mcpTokenDto(row)),
    };
  }

  async createMcpToken(input: CreateMcpTokenInput) {
    const context = this.tenantContext.require();
    const tenantId = this.requireTenant();
    if (context.principalType !== 'member' || !context.principalId) {
      throw new BadRequestException('MCP tokens can only be created by workspace members');
    }
    const permissions = input.canPublish
      ? [MEMBER_PERMISSIONS.settingsRead, MEMBER_PERMISSIONS.settingsWrite]
      : [MEMBER_PERMISSIONS.settingsRead];
    const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
    const token = await this.sessions.issueMcpAccessToken({
      tenantId,
      principalId: context.principalId,
      permissions,
      expiresAt,
    });
    const row = await this.authTokens.storeToken({
      tenantId,
      kind: 'mcp_access',
      principalType: 'member',
      principalId: context.principalId,
      token,
      expiresAt,
      createdById: context.principalId,
      metadata: {
        label: input.label,
        canPublish: input.canPublish,
        permissions,
        lastFour: token.slice(-8),
        surface: 'workflow_mcp',
      },
    });
    this.logger.log('auth', 'mcp_token.created', 'Workflow MCP token created', {
      token_id: row.id,
      principal_id: context.principalId,
      can_publish: input.canPublish,
      expires_at: expiresAt.toISOString(),
    });
    return {
      ...this.mcpTokenDto(row),
      tenantId,
      token,
    };
  }

  async revokeMcpToken(id: string) {
    const tenantId = this.requireTenant();
    await this.authTokens.revokeById({ tenantId, id, kind: 'mcp_access' });
    this.logger.log('auth', 'mcp_token.revoked', 'Workflow MCP token revoked', { token_id: id });
    return { ok: true };
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

  private mcpTokenDto(row: {
    id: string;
    metadata: Prisma.JsonValue;
    createdById: string | null;
    createdAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
  }) {
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {};
    const permissions = Array.isArray(metadata.permissions)
      ? metadata.permissions.filter((permission): permission is string => typeof permission === 'string')
      : [];
    const status = row.revokedAt
      ? 'revoked'
      : row.expiresAt.getTime() <= Date.now()
        ? 'expired'
        : 'active';
    return {
      id: row.id,
      label: typeof metadata.label === 'string' && metadata.label.trim() ? metadata.label : 'Workflow MCP token',
      permissions,
      canPublish: metadata.canPublish === true,
      status,
      lastFour: typeof metadata.lastFour === 'string' ? metadata.lastFour : null,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
    };
  }
}
