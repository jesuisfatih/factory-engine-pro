import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator.js';
import { TenantContextService } from './tenant-context.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
  ) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const permissions = new Set(this.tenantContext.get()?.permissions ?? []);
    const missing = required.filter((permission) => !permissions.has(permission));
    if (missing.length > 0) {
      throw new ForbiddenException({
        message: 'You do not have permission to perform this action.',
        code: 'permission_denied',
        details: { missing },
      });
    }
    return true;
  }
}
