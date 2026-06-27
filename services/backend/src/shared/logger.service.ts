import { Injectable, Logger } from '@nestjs/common';
import { TenantContextService } from './tenant-context.js';

type LogLevel = 'log' | 'warn' | 'error' | 'debug';

@Injectable()
export class AppLogger {
  private readonly logger = new Logger('AppLogger');

  constructor(private readonly tenantContext: TenantContextService) {}

  log(module: string, action: string, message: string, metadata: Record<string, unknown> = {}) {
    this.write('log', module, action, message, metadata);
  }

  warn(module: string, action: string, message: string, metadata: Record<string, unknown> = {}) {
    this.write('warn', module, action, message, metadata);
  }

  error(module: string, action: string, message: string, metadata: Record<string, unknown> = {}) {
    this.write('error', module, action, message, metadata);
  }

  private write(level: LogLevel, module: string, action: string, message: string, metadata: Record<string, unknown>) {
    const context = this.tenantContext.get();
    const payload = {
      request_id: context?.requestId,
      tenant_id: context?.tenantId,
      principal_id: context?.principalId,
      principal_type: context?.principalType,
      module,
      action,
      message,
      ...metadata,
    };
    this.logger[level](JSON.stringify(payload));
  }
}
