import { Module } from '@nestjs/common';
import { AircallModule } from '../aircall/aircall.module.js';
import { RulesModule } from '../rules/rules.module.js';
import { WorkflowMcpController } from './workflow-mcp.controller.js';
import { WorkflowMcpHttpService } from './workflow-mcp-http.service.js';

@Module({
  imports: [AircallModule, RulesModule],
  controllers: [WorkflowMcpController],
  providers: [WorkflowMcpHttpService],
})
export class McpModule {}
