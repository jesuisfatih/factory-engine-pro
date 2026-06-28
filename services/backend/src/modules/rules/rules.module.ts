import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module.js';
import { MailModule } from '../mail/mail.module.js';
import { SupportModule } from '../support/support.module.js';
import { RulesController } from './rules.controller.js';
import { RulesRepository } from './rules.repository.js';
import { RulesService } from './rules.service.js';
import { RULES_RUNTIME } from './rules.tokens.js';
import { WorkflowExecutorService } from './workflow-executor.service.js';
import { WorkflowPromptService } from './workflow-prompt.service.js';

@Module({
  imports: [CustomersModule, MailModule, SupportModule],
  controllers: [RulesController],
  providers: [
    RulesRepository,
    RulesService,
    { provide: RULES_RUNTIME, useExisting: RulesService },
    WorkflowExecutorService,
    WorkflowPromptService,
  ],
  exports: [RulesService, RULES_RUNTIME, WorkflowPromptService, WorkflowExecutorService],
})
export class RulesModule {}
