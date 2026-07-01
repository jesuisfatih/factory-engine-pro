import { Controller, Delete, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { WorkflowMcpHttpService } from './workflow-mcp-http.service.js';

@Controller('mcp/workflow')
export class WorkflowMcpController {
  constructor(private readonly workflowMcp: WorkflowMcpHttpService) {}

  @Post()
  post(@Req() req: Request, @Res() res: Response) {
    return this.workflowMcp.handlePost(req, res);
  }

  @Get()
  get(@Req() req: Request, @Res() res: Response) {
    return this.workflowMcp.handleGet(req, res);
  }

  @Delete()
  delete(@Req() req: Request, @Res() res: Response) {
    return this.workflowMcp.handleDelete(req, res);
  }
}
