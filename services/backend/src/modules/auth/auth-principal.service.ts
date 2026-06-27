import { Injectable } from '@nestjs/common';
import type { PrincipalType } from '@factory-engine-pro/contracts';
import { PrismaService } from '../../shared/prisma.service.js';
import { IdentityRepository } from '../identity/identity.repository.js';
import { permissionsFromRecords, type PrincipalRecord } from './auth.types.js';

type PrincipalSource = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string | null;
  status: string;
  roleAssignments: Array<{ role: { permissions: unknown } }>;
};

@Injectable()
export class AuthPrincipalService {
  constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly prisma: PrismaService,
  ) {}

  async findMemberByEmail(email: string): Promise<PrincipalRecord | null> {
    const member = await this.identityRepository.findMemberByEmail(email);
    return member ? this.fromSource(member, 'member') : null;
  }

  async findCustomerByEmail(email: string): Promise<PrincipalRecord | null> {
    const user = await this.identityRepository.findCustomerUserByEmail(email);
    if (user) return this.fromSource(user, 'customer_user');
    const subUser = await this.identityRepository.findSubUserByEmail(email);
    return subUser ? this.fromSource(subUser, 'sub_user') : null;
  }

  async findById(type: PrincipalType, id: string): Promise<PrincipalRecord | null> {
    if (type === 'member') {
      const member = await this.identityRepository.findMemberById(id);
      return member ? this.fromSource(member, type) : null;
    }
    if (type === 'customer_user') {
      const user = await this.identityRepository.findCustomerUserById(id);
      return user ? this.fromSource(user, type) : null;
    }
    const subUser = await this.identityRepository.findSubUserById(id);
    return subUser ? this.fromSource(subUser, type) : null;
  }

  async updatePassword(type: PrincipalType, id: string, passwordHash: string, activate: boolean) {
    if (type === 'member') {
      await this.prisma.db.member.updateMany({
        where: { id },
        data: { passwordHash, ...(activate ? { status: 'active', invitationAcceptedAt: new Date() } : {}) },
      });
      return;
    }
    if (type === 'customer_user') {
      await this.prisma.db.customerUser.updateMany({
        where: { id },
        data: { passwordHash, ...(activate ? { status: 'active' } : {}) },
      });
      return;
    }
    await this.prisma.db.subUser.updateMany({
      where: { id },
      data: { passwordHash, ...(activate ? { status: 'active' } : {}) },
    });
  }

  private fromSource(source: PrincipalSource, type: PrincipalType): PrincipalRecord {
    return {
      id: source.id,
      email: source.email,
      firstName: source.firstName,
      lastName: source.lastName,
      passwordHash: source.passwordHash,
      status: source.status,
      permissions: permissionsFromRecords(source.roleAssignments.map((assignment) => assignment.role.permissions)),
      type,
    };
  }
}
