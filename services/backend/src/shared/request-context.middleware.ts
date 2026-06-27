import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { TenantContextService } from './tenant-context.js';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly tenantContext: TenantContextService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = String(req.headers['x-request-id'] ?? randomUUID());
    const tenantId = typeof req.headers['x-tenant-id'] === 'string' ? req.headers['x-tenant-id'] : undefined;
    res.setHeader('x-request-id', requestId);

    this.tenantContext.run({ requestId, tenantId, permissions: [] }, () => next());
  }
}
