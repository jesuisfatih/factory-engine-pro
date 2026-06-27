import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  createSegmentSchema,
  MEMBER_PERMISSIONS,
  previewSegmentSchema,
  upsertSegmentOwnershipSchema,
  updateSegmentSchema,
  type CreateSegmentInput,
  type PreviewSegmentInput,
  type UpsertSegmentOwnershipInput,
  type UpdateSegmentInput,
} from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js';
import { SegmentsService } from './segments.service.js';

@Controller('segments')
export class SegmentsController {
  constructor(private readonly segments: SegmentsService) {}

  @Get()
  @RequirePermission(MEMBER_PERMISSIONS.segmentsRead)
  list() {
    return this.segments.list();
  }

  @Get('stats')
  @RequirePermission(MEMBER_PERMISSIONS.segmentsRead)
  stats() {
    return this.segments.stats();
  }

  @Post('preview')
  @RequirePermission(MEMBER_PERMISSIONS.segmentsRead)
  preview(@Body(new ZodValidationPipe(previewSegmentSchema)) body: PreviewSegmentInput) {
    return this.segments.preview(body);
  }

  @Post('evaluate-all')
  @RequirePermission(MEMBER_PERMISSIONS.segmentsWrite)
  evaluateAll() {
    return this.segments.evaluateAll();
  }

  @Post()
  @RequirePermission(MEMBER_PERMISSIONS.segmentsWrite)
  create(@Body(new ZodValidationPipe(createSegmentSchema)) body: CreateSegmentInput) {
    return this.segments.create(body);
  }

  @Get(':id')
  @RequirePermission(MEMBER_PERMISSIONS.segmentsRead)
  getOne(@Param('id') id: string) {
    return this.segments.getOne(id);
  }

  @Put(':id')
  @RequirePermission(MEMBER_PERMISSIONS.segmentsWrite)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSegmentSchema)) body: UpdateSegmentInput,
  ) {
    return this.segments.update(id, body);
  }

  @Post(':id/evaluate')
  @RequirePermission(MEMBER_PERMISSIONS.segmentsWrite)
  evaluate(@Param('id') id: string) {
    return this.segments.evaluate(id);
  }

  @Get(':id/ownership')
  @RequirePermission(MEMBER_PERMISSIONS.segmentsRead)
  getOwnerships(@Param('id') id: string) {
    return this.segments.getOwnerships(id);
  }

  @Put(':id/ownership')
  @RequirePermission(MEMBER_PERMISSIONS.segmentsWrite)
  upsertOwnership(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(upsertSegmentOwnershipSchema)) body: UpsertSegmentOwnershipInput,
  ) {
    return this.segments.upsertOwnership(id, body);
  }

  @Delete(':id/ownership')
  @RequirePermission(MEMBER_PERMISSIONS.segmentsWrite)
  removeOwnership(@Param('id') id: string, @Query('ownershipId') ownershipId?: string) {
    return this.segments.removeOwnership(id, ownershipId);
  }

  @Delete(':id')
  @RequirePermission(MEMBER_PERMISSIONS.segmentsWrite)
  remove(@Param('id') id: string) {
    return this.segments.remove(id);
  }
}
