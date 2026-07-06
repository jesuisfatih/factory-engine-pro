import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { CUSTOMER_PERMISSIONS } from '@factory-engine-pro/contracts';
import { TenantContextService } from '../../shared/tenant-context.js';
import { ShopifyCustomerSessionService } from './shopify-customer-session.service.js';

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
    private readonly sessions: ShopifyCustomerSessionService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const session = await this.sessions.requirePortalCustomerUser(request);

    this.tenantContext.set({
      tenantId: session.tenantId,
      permissions: SHOPIFY_ACCOUNT_PERMISSIONS,
    });

    this.tenantContext.set({
      principalId: session.customerUser?.id,
      principalType: 'customer_user',
    });
    return true;
  }
}
