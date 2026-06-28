import { Module } from '@nestjs/common';
import { SupportModule } from '../support/support.module.js';
import { RulesController } from './rules.controller.js';
import { RulesRepository } from './rules.repository.js';
import { RulesService } from './rules.service.js';
import { WorkflowExecutorService } from './workflow-executor.service.js';
import { WorkflowPromptService } from './workflow-prompt.service.js';

@Module({
  imports: [SupportModule],
  controllers: [RulesController],
  providers: [RulesRepository, RulesService, WorkflowExecutorService, WorkflowPromptService],
  exports: [RulesService, WorkflowPromptService, WorkflowExecutorService],
})
export class RulesModule {}
