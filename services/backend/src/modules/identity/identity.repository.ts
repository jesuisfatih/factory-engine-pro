import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma.service.js';
import { prefixedId } from '../../shared/id.js';
import { TenantContextService } from '../../shared/tenant-context.js';

@Injectable()
export class IdentityRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  findTenantById(id: string) {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  createTenant(data: { id: string; name: string; slug: string }) {
    return this.prisma.tenant.create({ data });
  }

  async listMemberRoles() {
    return this.prisma.db.memberRole.findMany({ orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
  }

  async findMemberRoleById(id: string) {
    const role = await this.prisma.db.memberRole.findFirst({ where: { id } });
    if (!role) throw new NotFoundException('Member role not found');
    return role;
  }

  createMemberRole(data: { slug: string; name: string; description?: string; permissions: Record<string, boolean>; isSystem?: boolean }) {
    return this.prisma.db.memberRole.create({
      data: {
        id: prefixedId('mrol'),
        tenantId: this.tenantId(),
        slug: data.slug,
        name: data.name,
        description: data.description,
        permissions: data.permissions,
        isSystem: data.isSystem ?? false,
      },
    });
  }

  updateMemberRole(id: string, data: { name?: string; description?: string; permissions?: Record<string, boolean> }) {
    return this.prisma.db.memberRole.updateMany({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.permissions !== undefined && { permissions: data.permissions as Prisma.InputJsonValue }),
      },
    });
  }

  async deleteMemberRole(id: string) {
    const result = await this.prisma.db.memberRole.deleteMany({ where: { id, isSystem: false } });
    if (result.count === 0) throw new NotFoundException('Member role not found');
    return result;
  }

  async listCustomerRoles() {
    return this.prisma.db.customerRole.findMany({ orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
  }

  createCustomerRole(data: { slug: string; name: string; description?: string; permissions: Record<string, boolean>; isSystem?: boolean }) {
    return this.prisma.db.customerRole.create({
      data: {
        id: prefixedId('crol'),
        tenantId: this.tenantId(),
        slug: data.slug,
        name: data.name,
        description: data.description,
        permissions: data.permissions,
        isSystem: data.isSystem ?? false,
      },
    });
  }

  async listMembers(search?: string) {
    return this.prisma.db.member.findMany({
      where: search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      include: { roleAssignments: { include: { role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  findMemberById(id: string) {
    return this.prisma.db.member.findFirst({
      where: { id },
      include: { roleAssignments: { include: { role: true } } },
    });
  }

  findMemberByEmail(email: string) {
    return this.prisma.db.member.findFirst({
      where: { email },
      include: { roleAssignments: { include: { role: true } } },
    });
  }

  createMember(data: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    passwordHash?: string;
    status: 'invited' | 'active';
    aircallUserId?: string;
  }) {
    return this.prisma.db.member.create({
      data: {
        id: prefixedId('tmbr'),
        tenantId: this.tenantId(),
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        passwordHash: data.passwordHash,
        status: data.status,
        aircallUserId: data.aircallUserId,
      },
    });
  }

  updateMember(id: string, data: Prisma.MemberUpdateManyMutationInput) {
    return this.prisma.db.member.updateMany({ where: { id }, data });
  }

  async setMemberRoles(memberId: string, roleIds: string[]) {
    await this.prisma.db.memberRoleAssignment.deleteMany({ where: { memberId } });
    if (roleIds.length === 0) return;
    await this.prisma.db.memberRoleAssignment.createMany({
      data: roleIds.map((roleId) => ({ id: prefixedId('asgn'), tenantId: this.tenantId(), memberId, roleId })),
    });
  }

  async listCustomerUsers() {
    return this.prisma.db.customerUser.findMany({
      include: {
        customer: true,
        roleAssignments: { include: { role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  createCustomer(data: {
    companyName: string;
    email?: string;
    phone?: string;
    taxId?: string;
    billingAddress?: Prisma.InputJsonValue;
    shippingAddress?: Prisma.InputJsonValue;
  }) {
    return this.prisma.db.customer.create({
      data: {
        id: prefixedId('cust'),
        tenantId: this.tenantId(),
        companyName: data.companyName,
        email: data.email,
        phone: data.phone,
        taxId: data.taxId,
        billingAddress: data.billingAddress,
        shippingAddress: data.shippingAddress,
      },
    });
  }

  createCustomerUser(data: {
    customerId: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    passwordHash?: string;
    status: 'invited' | 'active';
    spendingLimitCents?: number;
  }) {
    return this.prisma.db.customerUser.create({
      data: {
        id: prefixedId('cusr'),
        tenantId: this.tenantId(),
        customerId: data.customerId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        passwordHash: data.passwordHash,
        status: data.status,
        spendingLimitCents: data.spendingLimitCents,
      },
    });
  }

  findCustomerUserByEmail(email: string) {
    return this.prisma.db.customerUser.findFirst({
      where: { email },
      include: { customer: true, roleAssignments: { include: { role: true } } },
    });
  }

  findCustomerUserById(id: string) {
    return this.prisma.db.customerUser.findFirst({
      where: { id },
      include: { customer: true, roleAssignments: { include: { role: true } } },
    });
  }

  async setCustomerUserRoles(customerUserId: string, roleIds: string[]) {
    await this.prisma.db.customerUserRoleAssignment.deleteMany({ where: { customerUserId } });
    if (roleIds.length === 0) return;
    await this.prisma.db.customerUserRoleAssignment.createMany({
      data: roleIds.map((roleId) => ({ id: prefixedId('asgn'), tenantId: this.tenantId(), customerUserId, roleId })),
    });
  }

  async listSubUsers(parentUserId?: string) {
    return this.prisma.db.subUser.findMany({
      where: parentUserId ? { parentUserId } : undefined,
      include: {
        customer: true,
        parentUser: true,
        roleAssignments: { include: { role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  createSubUser(data: {
    customerId: string;
    parentUserId: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    passwordHash?: string;
    status: 'invited' | 'active';
    spendingLimitCents?: number;
  }) {
    return this.prisma.db.subUser.create({
      data: {
        id: prefixedId('csub'),
        tenantId: this.tenantId(),
        customerId: data.customerId,
        parentUserId: data.parentUserId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        passwordHash: data.passwordHash,
        status: data.status,
        spendingLimitCents: data.spendingLimitCents,
      },
    });
  }

  findSubUserByEmail(email: string) {
    return this.prisma.db.subUser.findFirst({
      where: { email },
      include: { customer: true, parentUser: true, roleAssignments: { include: { role: true } } },
    });
  }

  findSubUserById(id: string) {
    return this.prisma.db.subUser.findFirst({
      where: { id },
      include: { customer: true, parentUser: true, roleAssignments: { include: { role: true } } },
    });
  }

  async setSubUserRoles(subUserId: string, roleIds: string[]) {
    await this.prisma.db.subUserRoleAssignment.deleteMany({ where: { subUserId } });
    if (roleIds.length === 0) return;
    await this.prisma.db.subUserRoleAssignment.createMany({
      data: roleIds.map((roleId) => ({ id: prefixedId('asgn'), tenantId: this.tenantId(), subUserId, roleId })),
    });
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required');
    return tenantId;
  }
}
