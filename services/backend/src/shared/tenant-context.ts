import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrincipalType } from '@factory-engine-pro/contracts';

export interface RequestContext {
  requestId: string;
  tenantId?: string;
  principalId?: string;
  principalType?: PrincipalType;
  permissions: string[];
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  require(): RequestContext {
    const context = this.get();
    if (!context) {
      throw new Error('Request context is not initialized');
    }
    return context;
  }

  set(patch: Partial<RequestContext>) {
    const context = this.require();
    Object.assign(context, patch);
  }
}
