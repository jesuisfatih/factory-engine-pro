import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { PrincipalType } from '@factory-engine-pro/contracts';
import { AuthTokenService } from './auth-token.service.js';
import { getJwtAccessSecret } from './jwt-secret.js';
import { AppLogger } from './logger.service.js';
import { RealtimeService } from './realtime.service.js';

interface AccessTokenPayload {
  sub: string;
  tenant_id: string;
  principal_type: PrincipalType;
  permissions?: string[];
}

@Injectable()
@WebSocketGateway({
  namespace: '/call-center',
  path: '/api/v1/realtime/socket.io',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly authTokens: AuthTokenService,
    private readonly realtime: RealtimeService,
    private readonly logger: AppLogger,
  ) {}

  afterInit(server: Server) {
    this.realtime.bind(server);
    this.logger.log('realtime', 'gateway.ready', 'Call Center realtime gateway is ready');
  }

  async handleConnection(client: Socket) {
    try {
      const accessToken = this.accessToken(client);
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(accessToken, {
        secret: getJwtAccessSecret(this.config),
      });
      if (await this.authTokens.isAccessTokenRevoked(accessToken)) {
        throw new UnauthorizedException('Session was revoked');
      }
      if (payload.principal_type !== 'member') {
        throw new UnauthorizedException('Realtime Call Center is only available to member sessions');
      }

      client.data.tenantId = payload.tenant_id;
      client.data.principalId = payload.sub;
      client.data.principalType = payload.principal_type;
      await client.join(this.realtime.tenantRoom(payload.tenant_id));
      client.emit('realtime.ready', {
        module: 'call_center',
        at: new Date().toISOString(),
      });
      this.logger.log('realtime', 'client.connected', 'Call Center realtime client joined tenant room', {
        tenant_id: payload.tenant_id,
        principal_id: payload.sub,
      });
    } catch (error) {
      client.emit('realtime.error', {
        message: error instanceof Error ? error.message : 'Realtime authentication failed',
      });
      client.disconnect(true);
    }
  }

  private accessToken(client: Socket) {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);
    throw new UnauthorizedException('Bearer token is required for realtime');
  }
}
