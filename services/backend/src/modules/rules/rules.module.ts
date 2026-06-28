import { Module } from '@nestjs/common';
import { RulesController } from './rules.controller.js';
import { RulesRepository } from './rules.repository.js';
import { RulesService } from './rules.service.js';
import { WorkflowExecutorService } from './workflow-executor.service.js';
import { WorkflowPromptService } from './workflow-prompt.service.js';

@Module({
  controllers: [RulesController],
  providers: [RulesRepository, RulesService, WorkflowExecutorService, WorkflowPromptService],
  exports: [WorkflowPromptService, WorkflowExecutorService],
})
export class RulesModule {}
