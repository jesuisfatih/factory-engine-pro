import { Body, Controller, Delete, Get, Headers, Param, Post, Req } from '@nestjs/common';
import {
  acceptInvitationSchema,
  bootstrapTenantSchema,
  createMcpTokenSchema,
  customerLoginSchema,
  customerRegisterSchema,
  forgotPasswordSchema,
  logoutSchema,
  MEMBER_PERMISSIONS,
  memberLoginSchema,
  refreshTokenSchema,
  resetPasswordSchema,
  type AcceptInvitationInput,
  type BootstrapTenantInput,
  type CreateMcpTokenInput,
  type CustomerLoginInput,
  type CustomerRegisterInput,
  type ForgotPasswordInput,
  type LogoutInput,
  type MemberLoginInput,
  type RefreshTokenInput,
  type ResetPasswordInput,
} from '@factory-engine-pro/contracts';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, Body as NestBody } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { Public } from '../../shared/public.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('bootstrap')
  bootstrap(
    @Headers('x-bootstrap-token') bootstrapToken: string | undefined,
    @Body(new ZodValidationPipe(bootstrapTenantSchema)) body: BootstrapTenantInput,
  ) {
    if (!bootstrapToken || bootstrapToken !== this.config.get<string>('BOOTSTRAP_TOKEN')) {
      throw new BadRequestException('Invalid bootstrap token');
    }
    return this.auth.bootstrapTenant(body);
  }

  @Public()
  @Post('member/login')
  memberLogin(@Body(new ZodValidationPipe(memberLoginSchema)) body: MemberLoginInput) {
    return this.auth.loginMember(body, 'admin');
  }

  @Public()
  @Post('person/login')
  personLogin(@Body(new ZodValidationPipe(memberLoginSchema)) body: MemberLoginInput) {
    return this.auth.loginMember(body, 'person');
  }

  @Public()
  @Post('customer/login')
  customerLogin(@Body(new ZodValidationPipe(customerLoginSchema)) body: CustomerLoginInput) {
    return this.auth.loginCustomer(body);
  }

  @Public()
  @Post('customer/register')
  customerRegister(@Body(new ZodValidationPipe(customerRegisterSchema)) body: CustomerRegisterInput) {
    return this.auth.registerCustomer(body);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput) {
    return this.auth.forgotPassword(body);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    return this.auth.resetPassword(body);
  }

  @Public()
  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(refreshTokenSchema)) body: RefreshTokenInput) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post('invitations/accept')
  acceptInvitation(@Body(new ZodValidationPipe(acceptInvitationSchema)) body: AcceptInvitationInput) {
    return this.auth.acceptInvitation(body);
  }

  @Post('logout')
  logout(
    @Req() request: Request,
    @NestBody(new ZodValidationPipe(logoutSchema)) body: LogoutInput,
  ) {
    return this.auth.logout({
      refreshToken: body.refreshToken,
      accessToken: bearerToken(request.headers.authorization),
    });
  }

  @Get('me')
  me() {
    return this.auth.me();
  }

  @Get('mcp-tokens')
  @RequirePermission(MEMBER_PERMISSIONS.settingsRead)
  mcpTokens() {
    return this.auth.listMcpTokens();
  }

  @Post('mcp-tokens')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  createMcpToken(@Body(new ZodValidationPipe(createMcpTokenSchema)) body: CreateMcpTokenInput) {
    return this.auth.createMcpToken(body);
  }

  @Delete('mcp-tokens/:id')
  @RequirePermission(MEMBER_PERMISSIONS.settingsWrite)
  revokeMcpToken(@Param('id') id: string) {
    return this.auth.revokeMcpToken(id);
  }
}

function bearerToken(header: string | undefined) {
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}
