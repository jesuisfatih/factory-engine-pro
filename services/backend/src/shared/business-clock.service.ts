import { Injectable } from '@nestjs/common';
import { companyProfileSchema } from '@factory-engine-pro/contracts';
import { businessDayRange, isValidTimeZone, zonedDateParts, zonedDateTimeToUtc } from './business-time.js';
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
    const { timeZone } = await this.calendar();
    return businessDayRange(timeZone, now);
  }

  async calendar() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required for business time');
    const [calendar, config] = await Promise.all([
      this.prisma.db.businessCalendar.findFirst({
        where: { tenantId, isDefault: true },
        orderBy: [{ updatedAt: 'desc' }],
      }),
      this.prisma.db.tenantConfig.findFirst({
        where: { tenantId },
        select: { companyProfile: true },
      }),
    ]);
    const parsed = companyProfileSchema.safeParse(config?.companyProfile ?? {});
    const configured = calendar?.timezone || (parsed.success ? parsed.data.timezone : DEFAULT_BUSINESS_TIME_ZONE);
    const timeZone = isValidTimeZone(configured) ? configured : DEFAULT_BUSINESS_TIME_ZONE;
    return {
      id: calendar?.id ?? null,
      timeZone,
      weeklyHours: asWeeklyHours(calendar?.weeklyHours),
      holidays: asDateSet(calendar?.holidays),
      repeatPolicy: asRepeatPolicy(calendar?.repeatPolicy),
    };
  }

  async addBusinessDays(from: Date, count: number) {
    const calendar = await this.calendar();
    const source = zonedDateParts(from, calendar.timeZone);
    const cursor = new Date(Date.UTC(source.year, source.month - 1, source.day));
    let remaining = Math.max(0, Math.trunc(count));
    while (remaining > 0) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      const date = isoDate(cursor);
      const dayName = WEEKDAY_NAMES[cursor.getUTCDay()];
      if (!calendar.weeklyHours.has(dayName) || calendar.holidays.has(date)) continue;
      remaining -= 1;
    }
    return zonedDateTimeToUtc({
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
      day: cursor.getUTCDate(),
      hour: source.hour,
      minute: source.minute,
      second: source.second,
    }, calendar.timeZone);
  }

  async addCalendarDays(from: Date, count: number) {
    const calendar = await this.calendar();
    const source = zonedDateParts(from, calendar.timeZone);
    const cursor = new Date(Date.UTC(source.year, source.month - 1, source.day));
    cursor.setUTCDate(cursor.getUTCDate() + Math.trunc(count));
    return zonedDateTimeToUtc({
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
      day: cursor.getUTCDate(),
      hour: source.hour,
      minute: source.minute,
      second: source.second,
    }, calendar.timeZone);
  }
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function asWeeklyHours(value: unknown) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const configured = new Set<string>();
  for (const day of WEEKDAY_NAMES) {
    const hours = record[day];
    if (Array.isArray(hours) && hours.length >= 2 && hours.every((entry) => typeof entry === 'string')) configured.add(day);
  }
  if (configured.size === 0) ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach((day) => configured.add(day));
  return configured;
}

function asDateSet(value: unknown) {
  return new Set(Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry)) : []);
}

function asRepeatPolicy(value: unknown) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    maxCalls: boundedInteger(record.maxCalls, 2, 1, 20),
    windowDays: boundedInteger(record.windowDays, 5, 1, 90),
    defaultFollowUpBusinessDays: boundedInteger(record.defaultFollowUpBusinessDays, 4, 1, 60),
    completionReappearanceDays: boundedInteger(record.completionReappearanceDays, 15, 1, 365),
  };
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function isoDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
