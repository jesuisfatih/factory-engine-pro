export interface BusinessDayRange {
  timeZone: string;
  localDate: string;
  start: Date;
  end: Date;
  workDate: Date;
}

export interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function businessDayRange(timeZone: string, now = new Date()): BusinessDayRange {
  if (!isValidTimeZone(timeZone)) throw new Error(`Invalid business timezone: ${timeZone}`);
  const current = zonedDateParts(now, timeZone);
  const nextDate = new Date(Date.UTC(current.year, current.month - 1, current.day + 1));
  const next = {
    year: nextDate.getUTCFullYear(),
    month: nextDate.getUTCMonth() + 1,
    day: nextDate.getUTCDate(),
  };
  const localDate = `${current.year}-${pad(current.month)}-${pad(current.day)}`;
  return {
    timeZone,
    localDate,
    start: zonedDateTimeToUtc({ ...current, hour: 0, minute: 0, second: 0 }, timeZone),
    end: zonedDateTimeToUtc({ ...next, hour: 0, minute: 0, second: 0 }, timeZone),
    workDate: new Date(`${localDate}T00:00:00.000Z`),
  };
}

export function zonedDateTimeToUtc(parts: ZonedDateParts, timeZone: string) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedDateParts(new Date(guess), timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const adjustment = target - actualAsUtc;
    if (adjustment === 0) break;
    guess += adjustment;
  }
  return new Date(guess);
}

export function zonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
