import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createCustomerUserSchema,
  createMemberRoleSchema,
  createMemberSchema,
  createSubUserSchema,
  identityListQuerySchema,
  MEMBER_PERMISSIONS,
  CUSTOMER_PERMISSIONS,
  tenantConfigSchema,
  updateCurrentMemberSchema,
  updateMemberRoleSchema,
  updateMemberSchema,
  type CreateCustomerUserInput,
  type CreateMemberInput,
  type CreateMemberRoleInput,
  type CreateSubUserInput,
  type IdentityListQuery,
  type TenantConfigInput,
  type UpdateCurrentMemberInput,
  type UpdateMemberInput,
  type UpdateMemberRoleInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { Public } from '../../shared/public.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { IdentityService } from './identity.service.js';

@Controller('identity')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Get('me/profile')
  currentMemberProfile() {
    return this.identity.getCurrentMemberProfile();
  }

  @Patch('me/profile')
  updateCurrentMemberProfile(
    @Body(new ZodValidationPipe(updateCurrentMemberSchema)) body: UpdateCurrentMemberInput,
  ) {
    return this.identity.updateCurrentMemberProfile(body);
  }

  @Get('member-roles')
  @RequirePermission(MEMBER_PERMISSIONS.rolesRead)
  memberRoles() {
    return this.identity.listMemberRoles();
  }

  @Post('member-roles')
  @RequirePermission(MEMBER_PERMISSIONS.rolesWrite)
  createMemberRole(@Body(new ZodValidationPipe(createMemberRoleSchema)) body: CreateMemberRoleInput) {
    return this.identity.createMemberRole(body);
  }

  @Patch('member-roles/:id')
  @RequirePermission(MEMBER_PERMISSIONS.rolesWrite)
  updateMemberRole(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema)) body: UpdateMemberRoleInput,
  ) {
    return this.identity.updateMemberRole(id, body);
  }

  @Delete('member-roles/:id')
  @RequirePermission(MEMBER_PERMISSIONS.rolesWrite)
  deleteMemberRole(@Param('id') id: string) {
    return this.identity.deleteMemberRole(id);
  }

  @Get('customer-roles')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  customerRoles() {
    return this.identity.listCustomerRoles();
  }

  @Get('customer-role-options')
  @RequirePermission(CUSTOMER_PERMISSIONS.subUsersRead)
  customerRoleOptions() {
    return this.identity.listCustomerRoleOptionsForCurrentPrincipal();
  }

  @Get('members')
  @RequirePermission(MEMBER_PERMISSIONS.membersRead)
  members(@Query(new ZodValidationPipe(identityListQuerySchema)) query: IdentityListQuery) {
    return this.identity.listMembers(query.search);
  }

  @Post('members')
  @RequirePermission(MEMBER_PERMISSIONS.membersWrite)
  createMember(@Body(new ZodValidationPipe(createMemberSchema)) body: CreateMemberInput) {
    return this.identity.createMember(body);
  }

  @Patch('members/:id')
  @RequirePermission(MEMBER_PERMISSIONS.membersWrite)
  updateMember(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: UpdateMemberInput,
  ) {
    return this.identity.updateMember(id, body);
  }

  @Get('customer-users')
  @RequirePermission(MEMBER_PERMISSIONS.customersRead)
  customerUsers() {
    return this.identity.listCustomerUsers();
  }

  @Post('customer-users')
  @RequirePermission(MEMBER_PERMISSIONS.customersWrite)
  createCustomerUser(@Body(new ZodValidationPipe(createCustomerUserSchema)) body: CreateCustomerUserInput) {
    return this.identity.createCustomerUser(body);
  }

  @Get('sub-users')
  @RequirePermission(CUSTOMER_PERMISSIONS.subUsersRead)
  subUsers() {
    return this.identity.listSubUsersForCurrentPrincipal();
  }

  @Post('sub-users')
  @RequirePermission(CUSTOMER_PERMISSIONS.subUsersWrite)
  createSubUser(@Body(new ZodValidationPipe(createSubUserSchema)) body: CreateSubUserInput) {
    return this.identity.createSubUser(body);
  }

  @Get('tenant-config')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  tenantConfig() {
    return this.identity.getTenantConfig();
  }

  @Public()
  @Get('workspace-brand')
  workspaceBrand() {
    return this.identity.getWorkspaceBrand();
  }

  @Patch('tenant-config')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  updateTenantConfig(@Body(new ZodValidationPipe(tenantConfigSchema)) body: TenantConfigInput) {
    return this.identity.updateTenantConfig(body);
  }
}
