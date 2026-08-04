import type { Prisma } from '@prisma/client';
import { normalizePhoneE164 } from './customer-contact-resolver.service.js';

export function aircallWhereFor(email: string | null | undefined, phone: string | null | undefined): Prisma.AircallCallEventWhereInput | null {
  return aircallWhereForContacts(email, phone ? [phone] : []);
}

export function aircallWhereForContacts(
  email: string | null | undefined,
  phones: Array<string | null | undefined>,
): Prisma.AircallCallEventWhereInput | null {
  const or: Prisma.AircallCallEventWhereInput[] = [];
  const normalizedEmail = email?.trim();
  if (normalizedEmail) {
    or.push({ contactEmail: { equals: normalizedEmail, mode: 'insensitive' } });
  }
  for (const value of uniqueStrings(phones.flatMap((phone) => phoneVariants(phone)))) {
    or.push({ contactPhone: value }, { contactPhoneE164: value });
  }
  return or.length ? { OR: or } : null;
}

export function phoneVariants(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return [];
  const digits = raw.replace(/\D/g, '');
  const e164 = normalizePhoneE164(raw);
  return uniqueStrings([raw, digits, digits ? `+${digits}` : null, e164, e164?.replace(/\D/g, '')]);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
}
