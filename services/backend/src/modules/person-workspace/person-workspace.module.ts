import { Module } from '@nestjs/common';
import { PersonWorkspaceController } from './person-workspace.controller.js';
import { PersonWorkspaceService } from './person-workspace.service.js';

@Module({
  controllers: [PersonWorkspaceController],
  providers: [PersonWorkspaceService],
})
export class PersonWorkspaceModule {}
