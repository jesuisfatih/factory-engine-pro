import { Controller, Get, Post, Query } from '@nestjs/common';
import { MEMBER_PERMISSIONS } from '@factory-engine-pro/contracts';
import { RequirePermission } from '../../shared/permissions.decorator.js';
import { ShopifyCustomerSegmentsService } from './shopify-customer-segments.service.js';

@Controller('shopify-customers')
export class ShopifyCustomerSegmentsController {
  constructor(private readonly shopifySegments: ShopifyCustomerSegmentsService) {}

  @Get('segments')
  @RequirePermission(MEMBER_PERMISSIONS.segmentsRead)
  listSegments(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('ids') ids?: string | string[],
  ) {
    return this.shopifySegments.listSegments({
      search,
      limit: limit ? Number(limit) : undefined,
      ids: normalizeIds(ids),
    });
  }

  @Post('segments/sync')
  @RequirePermission(MEMBER_PERMISSIONS.segmentsWrite)
  async syncSegment(@Query('id') id: string) {
    await this.shopifySegments.syncSegmentMembershipSnapshot(id);
    return { ok: true, shopifySegmentId: id };
  }
}

function normalizeIds(ids?: string | string[]) {
  if (!ids) return [];
  const raw = Array.isArray(ids) ? ids : [ids];
  return raw.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
}
