import assert from 'node:assert/strict';
import test from 'node:test';
import { BusinessClockService } from './business-clock.service.js';

function service(holidays: string[] = []) {
  return new BusinessClockService({
    db: {
      businessCalendar: {
        findFirst: async () => ({
          id: 'bcal_chicago',
          timezone: 'America/Chicago',
          weeklyHours: {
            monday: ['09:00', '17:00'],
            tuesday: ['09:00', '17:00'],
            wednesday: ['09:00', '17:00'],
            thursday: ['09:00', '17:00'],
            friday: ['09:00', '17:00'],
          },
          holidays,
          repeatPolicy: {
            maxCalls: 2,
            windowDays: 5,
            defaultFollowUpBusinessDays: 4,
            completionReappearanceDays: 15,
          },
        }),
      },
      tenantConfig: {
        findFirst: async () => ({ companyProfile: { timezone: 'America/Chicago' } }),
      },
    },
  } as never, { require: () => ({ tenantId: 'ten_dtfbank' }) } as never);
}

test('adds four Chicago business days without counting weekends or tenant holidays', async () => {
  const result = await service(['2026-07-03']).addBusinessDays(new Date('2026-07-02T15:30:00.000Z'), 4);
  assert.equal(result.toISOString(), '2026-07-09T15:30:00.000Z');
});

test('adds calendar days while preserving Chicago local time across daylight-saving changes', async () => {
  const result = await service().addCalendarDays(new Date('2026-03-07T18:00:00.000Z'), 15);
  assert.equal(result.toISOString(), '2026-03-22T17:00:00.000Z');
});
