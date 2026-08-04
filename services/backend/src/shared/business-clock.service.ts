import { Injectable } from '@nestjs/common';
import { companyProfileSchema } from '@factory-engine-pro/contracts';
import { businessDayRange, isValidTimeZone } from './business-time.js';
import { PrismaService } from './prisma.service.js';
import { TenantContextService } from './tenant-context.js';

const DEFAULT_BUSINESS_TIME_ZONE = 'America/New_York';

@Injectable()
export class BusinessClockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async currentDay(now = new Date()) {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required for business time');
    const config = await this.prisma.db.tenantConfig.findFirst({
      where: { tenantId },
      select: { companyProfile: true },
    });
    const parsed = companyProfileSchema.safeParse(config?.companyProfile ?? {});
    const configured = parsed.success ? parsed.data.timezone : DEFAULT_BUSINESS_TIME_ZONE;
    const timeZone = isValidTimeZone(configured) ? configured : DEFAULT_BUSINESS_TIME_ZONE;
    return businessDayRange(timeZone, now);
  }
}
