import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { CUSTOMER_PERMISSIONS } from '@factory-engine-pro/contracts';
import { CryptoService } from '../../shared/crypto.service.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { TenantContextService } from '../../shared/tenant-context.js';
import { normalizeShopDomain } from '../sync/shopify-domain.js';

type ShopifySessionPayload = {
  sub?: string;
  iss?: string;
  dest?: string;
  aud?: string | string[];
  exp?: number;
  [key: string]: unknown;
};

const SHOPIFY_ACCOUNT_PERMISSIONS = [
  CUSTOMER_PERMISSIONS.accountRead,
  CUSTOMER_PERMISSIONS.ordersRead,
  CUSTOMER_PERMISSIONS.ordersReorder,
  CUSTOMER_PERMISSIONS.invoicesRead,
  CUSTOMER_PERMISSIONS.cartWrite,
];

@Injectable()
export class ShopifyCustomerSessionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly tenantContext: TenantContextService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.bearerToken(request);
    const decoded = this.decodeToken(token);
    const shopDomain = this.shopDomainFromPayload(decoded);
    const tenantConfig = await this.resolveTenantConfig(shopDomain);
    const secret = this.resolveApiSecret(tenantConfig.shopifyApiSecretEncrypted);
    const payload = this.verifyToken(token, secret, tenantConfig.shopifyApiKeyEncrypted);
    const shopifyCustomerId = this.shopifyCustomerId(payload);

    this.tenantContext.set({
      tenantId: tenantConfig.tenantId,
      permissions: SHOPIFY_ACCOUNT_PERMISSIONS,
    });

    const customerUser = await this.resolveCustomerUser(shopifyCustomerId);
    this.tenantContext.set({
      principalId: customerUser.id,
      principalType: 'customer_user',
    });
    return true;
  }

  private bearerToken(request: Request) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Shopify customer account session token');
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedException('Missing Shopify customer account session token');
    return token;
  }

  private decodeToken(token: string): ShopifySessionPayload {
    const decoded = this.jwt.decode(token);
    if (!decoded || typeof decoded !== 'object') {
      throw new UnauthorizedException('Invalid Shopify customer account session token');
    }
    return decoded as ShopifySessionPayload;
  }

  private shopDomainFromPayload(payload: ShopifySessionPayload) {
    const raw = typeof payload.dest === 'string' && payload.dest
      ? payload.dest
      : typeof payload.iss === 'string'
        ? payload.iss
        : '';
    const match = raw.match(/https?:\/\/([^/]+\.myshopify\.com)/i);
    const shopDomain = normalizeShopDomain(match?.[1] ?? null);
    if (!shopDomain) {
      throw new UnauthorizedException('Shopify customer account session token is missing shop domain');
    }
    return shopDomain;
  }

  private async resolveTenantConfig(shopDomain: string) {
    const configs = await this.prisma.tenantConfig.findMany({
      where: { shopifyDomain: { not: null } },
      select: {
        tenantId: true,
        shopifyDomain: true,
        shopifyApiKeyEncrypted: true,
        shopifyApiSecretEncrypted: true,
        tenant: { select: { status: true } },
      },
    });
    const matches = configs.filter((item) => normalizeShopDomain(item.shopifyDomain) === shopDomain);
    if (matches.length !== 1 || matches[0]?.tenant.status !== 'active') {
      throw new UnauthorizedException('Shopify customer account is not connected to this workspace');
    }
    return matches[0];
  }

  private resolveApiSecret(encryptedSecret: string | null) {
    const tenantSecret = this.crypto.decrypt(encryptedSecret)?.trim();
    const envSecret = this.config.get<string>('SHOPIFY_API_SECRET')?.trim()
      || this.config.get<string>('SHOPIFY_CLIENT_SECRET')?.trim()
      || null;
    const secret = tenantSecret || envSecret;
    if (!secret) {
      throw new UnauthorizedException('Shopify customer account session verification is not configured');
    }
    return secret;
  }

  private verifyToken(token: string, secret: string, encryptedApiKey: string | null): ShopifySessionPayload {
    try {
      const payload = this.jwt.verify<ShopifySessionPayload>(token, { secret });
      const expectedAudience = this.crypto.decrypt(encryptedApiKey)?.trim()
        || this.config.get<string>('SHOPIFY_API_KEY')?.trim()
        || this.config.get<string>('SHOPIFY_CLIENT_ID')?.trim()
        || null;
      if (expectedAudience && !audienceMatches(payload.aud, expectedAudience)) {
        throw new UnauthorizedException('Shopify customer account session token audience is invalid');
      }
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('accounts', 'shopify_customer_session.verify_failed', 'Shopify customer session rejected', {
        reason: message,
      });
      throw new UnauthorizedException('Invalid Shopify customer account session token');
    }
  }

  private shopifyCustomerId(payload: ShopifySessionPayload) {
    const raw = typeof payload.sub === 'string' ? payload.sub : '';
    const match = raw.match(/Customer\/(\d+)/i);
    const id = match?.[1] ?? (/^\d+$/.test(raw) ? raw : null);
    if (!id) {
      throw new UnauthorizedException('Shopify customer account session token is missing customer id');
    }
    return id;
  }

  private async resolveCustomerUser(shopifyCustomerId: string) {
    const customer = await this.prisma.db.customer.findFirst({
      where: { shopifyCustomerId, status: { notIn: ['disabled', 'archived'] } },
      select: { id: true, email: true },
    });
    if (!customer) {
      throw new UnauthorizedException('This Shopify customer is not linked to a customer portal account');
    }
    const customerUser = await this.prisma.db.customerUser.findFirst({
      where: {
        customerId: customer.id,
        status: 'active',
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (!customerUser) {
      throw new UnauthorizedException('This customer portal account is not active yet');
    }
    return customerUser;
  }
}

function audienceMatches(aud: ShopifySessionPayload['aud'], expected: string) {
  if (Array.isArray(aud)) return aud.includes(expected);
  return aud === expected;
}
