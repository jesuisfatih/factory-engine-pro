import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AircallUsersResponse } from '@factory-engine-pro/contracts';
import { CryptoService } from '../../shared/crypto.service.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { AircallApiError, AircallClient, type AircallCredentials } from './aircall.client.js';

type AircallUserPayload = {
  id?: string | number;
  name?: string;
  email?: string | null;
  extension?: string | number | null;
  available_status?: string | null;
  availability_status?: string | null;
};

@Injectable()
export class AircallService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  async listUsers(): Promise<AircallUsersResponse> {
    const [aircallUsers, members] = await Promise.all([
      this.fetchAircallUsers(),
      this.prisma.db.member.findMany({
        where: { status: { not: 'archived' } },
        select: { id: true, email: true, firstName: true, lastName: true, aircallUserId: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
    ]);
    const linkedByAircallId = new Map(
      members
        .filter((member) => member.aircallUserId)
        .map((member) => [
          member.aircallUserId,
          { id: member.id, email: member.email, name: displayName(member) },
        ]),
    );

    return {
      source: 'aircall_api',
      users: aircallUsers.map((user) => ({
        ...user,
        linkedMember: linkedByAircallId.get(user.aircallUserId) ?? null,
      })),
      members: members.map((member) => ({
        id: member.id,
        email: member.email,
        name: displayName(member),
        aircallUserId: member.aircallUserId,
      })),
    };
  }

  syncUsers() {
    return this.listUsers();
  }

  async linkUser(aircallUserId: string, memberId: string) {
    const users = await this.fetchAircallUsers();
    const aircallUser = users.find((user) => user.aircallUserId === aircallUserId);
    if (!aircallUser) throw new NotFoundException('Aircall user not found');

    const member = await this.prisma.db.member.findFirst({ where: { id: memberId } });
    if (!member) throw new NotFoundException('Member not found');

    await this.prisma.db.member.updateMany({
      where: { aircallUserId, id: { not: memberId } },
      data: { aircallUserId: null },
    });
    await this.prisma.db.member.updateMany({
      where: { id: memberId },
      data: { aircallUserId },
    });
    this.logger.log('aircall', 'link_user', 'Aircall user linked to member', {
      aircall_user_id: aircallUserId,
      member_id: memberId,
    });
    return this.listUsers();
  }

  async unlinkUser(aircallUserId: string) {
    await this.prisma.db.member.updateMany({
      where: { aircallUserId },
      data: { aircallUserId: null },
    });
    this.logger.log('aircall', 'unlink_user', 'Aircall user unlinked from member', { aircall_user_id: aircallUserId });
    return this.listUsers();
  }

  private async fetchAircallUsers() {
    const client = new AircallClient(await this.resolveCredentials());
    const response = await client.listUsers(1, 50).catch((error) => {
      if (error instanceof AircallApiError) {
        throw new BadRequestException({
          message: 'Aircall users could not be loaded.',
          code: 'aircall_api_error',
          details: { status: error.status },
        });
      }
      throw error;
    });
    return (response.users ?? []).map((raw) => this.presentUser(raw as AircallUserPayload));
  }

  private presentUser(user: AircallUserPayload) {
    const aircallUserId = String(user.id ?? '').trim();
    if (!aircallUserId) throw new BadRequestException('Aircall returned a user without id');
    return {
      id: aircallUserId,
      aircallUserId,
      name: String(user.name ?? user.email ?? `Aircall ${aircallUserId}`),
      email: user.email ?? null,
      extension: user.extension === undefined || user.extension === null ? null : String(user.extension),
      availableStatus: user.available_status ?? user.availability_status ?? null,
      linkedMember: null,
    };
  }

  private async resolveCredentials(): Promise<AircallCredentials> {
    const config = await this.prisma.db.tenantConfig.findFirst({
      select: { aircallApiIdEncrypted: true, aircallApiTokenEncrypted: true },
    });
    const apiId = this.crypto.decrypt(config?.aircallApiIdEncrypted)?.trim() || this.config.get<string>('AIRCALL_API_ID')?.trim();
    const apiToken = this.crypto.decrypt(config?.aircallApiTokenEncrypted)?.trim() || this.config.get<string>('AIRCALL_API_TOKEN')?.trim();
    if (!apiId || !apiToken) {
      throw new BadRequestException({
        message: 'Aircall credentials are not configured for this tenant.',
        code: 'aircall_credentials_missing',
      });
    }
    return { apiId, apiToken };
  }
}

function displayName(member: { firstName: string; lastName: string; email: string }) {
  return [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email;
}
