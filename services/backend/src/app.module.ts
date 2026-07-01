import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AircallModule } from './modules/aircall/aircall.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BackfillModule } from './modules/backfill/backfill.module.js';
import { B2BAccessModule } from './modules/b2b-access/b2b-access.module.js';
import { CallCenterModule } from './modules/call-center/call-center.module.js';
import { CommissionsModule } from './modules/commissions/commissions.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { McpModule } from './modules/mcp/mcp.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PersonWorkspaceModule } from './modules/person-workspace/person-workspace.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { RulesModule } from './modules/rules/rules.module.js';
import { SegmentsModule } from './modules/segments/segments.module.js';
import { SupportModule } from './modules/support/support.module.js';
import { SyncModule } from './modules/sync/sync.module.js';
import { JwtAuthGuard } from './shared/auth.guard.js';
import { HttpExceptionFilter } from './shared/http-exception.filter.js';
import { PermissionsGuard } from './shared/permissions.guard.js';
import { QueueModule } from './shared/queue.module.js';
import { RequestContextMiddleware } from './shared/request-context.middleware.js';
import { SharedModule } from './shared/shared.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({}),
    SharedModule,
    QueueModule,
    AiModule,
    AccountsModule,
    AircallModule,
    IdentityModule,
    MailModule,
    McpModule,
    AuthModule,
    OrdersModule,
    PersonWorkspaceModule,
    CustomersModule,
    PricingModule,
    RulesModule,
    SegmentsModule,
    SupportModule,
    B2BAccessModule,
    CallCenterModule,
    CommissionsModule,
    SyncModule,
    BackfillModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
