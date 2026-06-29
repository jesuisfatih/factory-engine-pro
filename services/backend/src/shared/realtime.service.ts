import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { RealtimeInvalidate } from '@factory-engine-pro/contracts';
import { realtimeInvalidateSchema } from '@factory-engine-pro/contracts';
import { AppLogger } from './logger.service.js';

const TENANT_ROOM_PREFIX = 'tenant:';

@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  constructor(private readonly logger: AppLogger) {}

  bind(server: Server) {
    this.server = server;
  }

  tenantRoom(tenantId: string) {
    return `${TENANT_ROOM_PREFIX}${tenantId}`;
  }

  emitTenantInvalidate(tenantId: string, payload: RealtimeInvalidate) {
    const parsed = realtimeInvalidateSchema.parse(payload);
    if (!this.server) {
      this.logger.warn('realtime', 'emit.skipped', 'Realtime server is not ready', {
        tenant_id: tenantId,
        module: parsed.module,
        reason: parsed.reason,
      });
      return;
    }
    this.server.to(this.tenantRoom(tenantId)).emit(`${parsed.module}.overview.invalidate`, parsed);
  }
}

