import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service.js';
import { TenantContextService } from './tenant-context.js';

export const CUSTOMER_PHONE_SOURCES = [
  'customer',
  'customer_user',
  'sub_user',
  'billing_address',
  'shipping_address',
  'customer_shopify_data',
  'order',
  'order_billing_address',
  'order_shipping_address',
  'order_shopify_data',
] as const;

export type CustomerPhoneSource = (typeof CUSTOMER_PHONE_SOURCES)[number];

export interface CustomerContactSeed {
  id: string;
  shopifyCustomerId?: string | null;
  email?: string | null;
  phone?: string | null;
  billingAddress?: Prisma.JsonValue | null;
  shippingAddress?: Prisma.JsonValue | null;
  rawData?: Prisma.JsonValue | null;
}

export interface ResolvedCustomerPhone {
  phone: string;
  displayPhone: string;
  source: CustomerPhoneSource;
}

export interface ResolvedCustomerContact {
  customerId: string;
  shopifyCustomerId: string | null;
  canonicalIdentityKey: string;
  email: string | null;
  normalizedEmail: string | null;
  phone: string | null;
  displayPhone: string | null;
  phoneCallable: boolean;
  phoneSource: CustomerPhoneSource | null;
  alternatePhones: ResolvedCustomerPhone[];
}

export interface CustomerIdentityInput {
  customerId?: string | null;
  shopifyCustomerId?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface PhoneCandidate {
  value: unknown;
  source: CustomerPhoneSource;
}

@Injectable()
export class CustomerContactResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async resolveOne(customerId: string) {
    const customer = await this.prisma.db.customer.findFirst({ where: { id: customerId } });
    if (!customer) return null;
    return (await this.resolveMany([customer])).get(customer.id) ?? null;
  }

  async resolveMany(seeds: CustomerContactSeed[]) {
    const uniqueSeeds = uniqueById(seeds);
    const ids = uniqueSeeds.map((seed) => seed.id);
    const result = new Map<string, ResolvedCustomerContact>();
    if (ids.length === 0) return result;

    const relations = await this.prisma.db.customer.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        shopifyCustomerId: true,
        email: true,
        phone: true,
        billingAddress: true,
        shippingAddress: true,
        rawData: true,
        customerUsers: {
          select: { email: true, phone: true },
          orderBy: [{ updatedAt: 'desc' }],
          take: 4,
        },
        subUsers: {
          select: { email: true, phone: true },
          orderBy: [{ updatedAt: 'desc' }],
          take: 4,
        },
        orders: {
          select: {
            phone: true,
            billingAddress: true,
            shippingAddress: true,
            rawData: true,
          },
          orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
          take: 8,
        },
      },
    });
    const relationsByCustomer = new Map(relations.map((row) => [row.id, row] as const));

    for (const seed of uniqueSeeds) {
      const related = relationsByCustomer.get(seed.id);
      const users = related?.customerUsers ?? [];
      const children = related?.subUsers ?? [];
      const customerOrders = related?.orders ?? [];
      const shopifyCustomerId = clean(related?.shopifyCustomerId ?? seed.shopifyCustomerId);
      const candidates: PhoneCandidate[] = [
        { value: related?.phone ?? seed.phone, source: 'customer' },
        ...users.map((row) => ({ value: row.phone, source: 'customer_user' as const })),
        ...children.map((row) => ({ value: row.phone, source: 'sub_user' as const })),
        ...phoneCandidatesFromJson(related?.billingAddress ?? seed.billingAddress, 'billing_address'),
        ...phoneCandidatesFromJson(related?.shippingAddress ?? seed.shippingAddress, 'shipping_address'),
        ...phoneCandidatesFromJson(related?.rawData ?? seed.rawData, 'customer_shopify_data'),
        ...customerOrders.flatMap((order) => [
          { value: order.phone, source: 'order' as const },
          ...phoneCandidatesFromJson(order.billingAddress, 'order_billing_address'),
          ...phoneCandidatesFromJson(order.shippingAddress, 'order_shipping_address'),
          ...phoneCandidatesFromJson(order.rawData, 'order_shopify_data'),
        ]),
      ];
      const phones = resolvedPhones(candidates);
      const email = firstEmail(
        related?.email ?? seed.email,
        users.map((row) => row.email),
        children.map((row) => row.email),
      );
      const primary = phones[0] ?? null;
      result.set(seed.id, {
        customerId: seed.id,
        shopifyCustomerId,
        canonicalIdentityKey: shopifyCustomerId ? `shopify:${shopifyCustomerId}` : `customer:${seed.id}`,
        email,
        normalizedEmail: email?.toLowerCase() ?? null,
        phone: primary?.phone ?? null,
        displayPhone: primary?.displayPhone ?? null,
        phoneCallable: Boolean(primary),
        phoneSource: primary?.source ?? null,
        alternatePhones: phones,
      });
    }
    return result;
  }

  async findCustomer(input: CustomerIdentityInput) {
    const tenantId = this.tenantId();
    const shopifyCustomerId = clean(input.shopifyCustomerId);
    if (shopifyCustomerId) {
      const customer = await this.prisma.db.customer.findFirst({ where: { tenantId, shopifyCustomerId } });
      if (customer) return customer;
    }
    const customerId = clean(input.customerId);
    if (customerId) {
      const customer = await this.prisma.db.customer.findFirst({ where: { tenantId, id: customerId } });
      if (customer) return customer;
    }
    const email = normalizeEmail(input.email);
    if (email) {
      const customer = await this.prisma.db.customer.findFirst({
        where: {
          tenantId,
          OR: [
            { email: { equals: email, mode: 'insensitive' } },
            { customerUsers: { some: { email: { equals: email, mode: 'insensitive' } } } },
            { subUsers: { some: { email: { equals: email, mode: 'insensitive' } } } },
          ],
        },
      });
      if (customer) return customer;
    }
    const phone = normalizePhoneE164(input.phone);
    if (!phone) return null;
    const candidateIds = await this.customerIdsMatchingPhone(phone);
    if (candidateIds.length === 0) return null;
    const candidates = await this.prisma.db.customer.findMany({ where: { tenantId, id: { in: candidateIds } } });
    const contacts = await this.resolveMany(candidates);
    return candidates.find((candidate) => contacts.get(candidate.id)?.alternatePhones.some((entry) => entry.phone === phone)) ?? null;
  }

  async matchingCustomerIds(search: string) {
    const phone = normalizePhoneE164(search);
    return phone ? this.customerIdsMatchingPhone(phone) : [];
  }

  private async customerIdsMatchingPhone(phone: string) {
    const tenantId = this.tenantId();
    const digits = phone.replace(/\D/g, '');
    const nationalDigits = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    const rows = await this.prisma.db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT DISTINCT c.id
      FROM customers c
      WHERE c.tenant_id = ${tenantId}
        AND (
          regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') IN (${digits}, ${nationalDigits})
          OR regexp_replace(COALESCE(c.billing_address->>'phone', c.billing_address->>'phone_number', c.billing_address->>'phoneNumber', c.billing_address->>'mobile', ''), '[^0-9]', '', 'g') IN (${digits}, ${nationalDigits})
          OR regexp_replace(COALESCE(c.shipping_address->>'phone', c.shipping_address->>'phone_number', c.shipping_address->>'phoneNumber', c.shipping_address->>'mobile', ''), '[^0-9]', '', 'g') IN (${digits}, ${nationalDigits})
          OR EXISTS (
            SELECT 1 FROM customer_users cu
            WHERE cu.tenant_id = ${tenantId} AND cu.customer_id = c.id
              AND regexp_replace(COALESCE(cu.phone, ''), '[^0-9]', '', 'g') IN (${digits}, ${nationalDigits})
          )
          OR EXISTS (
            SELECT 1 FROM sub_users su
            WHERE su.tenant_id = ${tenantId} AND su.customer_id = c.id
              AND regexp_replace(COALESCE(su.phone, ''), '[^0-9]', '', 'g') IN (${digits}, ${nationalDigits})
          )
          OR EXISTS (
            SELECT 1 FROM (
              SELECT value FROM jsonb_path_query(COALESCE(c.raw_data, '{}'::jsonb), '$.**.phone')
              UNION ALL SELECT value FROM jsonb_path_query(COALESCE(c.raw_data, '{}'::jsonb), '$.**.phone_number')
              UNION ALL SELECT value FROM jsonb_path_query(COALESCE(c.raw_data, '{}'::jsonb), '$.**.phoneNumber')
              UNION ALL SELECT value FROM jsonb_path_query(COALESCE(c.raw_data, '{}'::jsonb), '$.**.telephone')
              UNION ALL SELECT value FROM jsonb_path_query(COALESCE(c.raw_data, '{}'::jsonb), '$.**.mobile')
            ) AS p(value)
            WHERE regexp_replace(COALESCE(p.value #>> '{}', ''), '[^0-9]', '', 'g') IN (${digits}, ${nationalDigits})
          )
          OR EXISTS (
            SELECT 1 FROM commerce_orders co
            WHERE co.tenant_id = ${tenantId} AND co.customer_id = c.id
              AND (
                regexp_replace(COALESCE(co.phone, ''), '[^0-9]', '', 'g') IN (${digits}, ${nationalDigits})
                OR regexp_replace(COALESCE(co.billing_address->>'phone', co.billing_address->>'phone_number', co.billing_address->>'phoneNumber', co.billing_address->>'mobile', ''), '[^0-9]', '', 'g') IN (${digits}, ${nationalDigits})
                OR regexp_replace(COALESCE(co.shipping_address->>'phone', co.shipping_address->>'phone_number', co.shipping_address->>'phoneNumber', co.shipping_address->>'mobile', ''), '[^0-9]', '', 'g') IN (${digits}, ${nationalDigits})
                OR EXISTS (
                  SELECT 1 FROM (
                    SELECT value FROM jsonb_path_query(COALESCE(co.raw_data, '{}'::jsonb), '$.**.phone')
                    UNION ALL SELECT value FROM jsonb_path_query(COALESCE(co.raw_data, '{}'::jsonb), '$.**.phone_number')
                    UNION ALL SELECT value FROM jsonb_path_query(COALESCE(co.raw_data, '{}'::jsonb), '$.**.phoneNumber')
                    UNION ALL SELECT value FROM jsonb_path_query(COALESCE(co.raw_data, '{}'::jsonb), '$.**.telephone')
                    UNION ALL SELECT value FROM jsonb_path_query(COALESCE(co.raw_data, '{}'::jsonb), '$.**.mobile')
                  ) AS op(value)
                  WHERE regexp_replace(COALESCE(op.value #>> '{}', ''), '[^0-9]', '', 'g') IN (${digits}, ${nationalDigits})
                )
              )
          )
        )
      ORDER BY c.id
      LIMIT 20
    `);
    return rows.map((row) => row.id);
  }

  private tenantId() {
    const tenantId = this.tenantContext.require().tenantId;
    if (!tenantId) throw new Error('Tenant context is required for customer contact resolution');
    return tenantId;
  }
}

export function normalizePhoneE164(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function displayPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return value;
}

function phoneCandidatesFromJson(value: Prisma.JsonValue | null | undefined, source: CustomerPhoneSource): PhoneCandidate[] {
  return extractPhoneValues(value).map((entry) => ({ value: entry, source }));
}

export function extractPhoneValues(value: unknown) {
  const output: unknown[] = [];
  collectPhoneValues(value, output, 0);
  return output;
}

function collectPhoneValues(value: unknown, output: unknown[], depth: number) {
  if (depth > 8 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const entry of value) collectPhoneValues(entry, output, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (
      normalizedKey === 'phone'
      || normalizedKey === 'phonenumber'
      || normalizedKey === 'telephone'
      || normalizedKey === 'mobile'
      || normalizedKey.endsWith('phone')
    ) output.push(entry);
    else collectPhoneValues(entry, output, depth + 1);
  }
}

function resolvedPhones(candidates: PhoneCandidate[]) {
  const seen = new Set<string>();
  const result: ResolvedCustomerPhone[] = [];
  for (const candidate of candidates) {
    const phone = normalizePhoneE164(candidate.value);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    result.push({ phone, displayPhone: displayPhone(phone), source: candidate.source });
  }
  return result;
}

function firstEmail(primary: string | null | undefined, users: string[], children: string[]) {
  for (const value of [primary, ...users, ...children]) {
    const email = normalizeEmail(value);
    if (email) return email;
  }
  return null;
}

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim();
  return email && email.includes('@') ? email : null;
}

function clean(value: string | null | undefined) {
  const result = value?.trim();
  return result || null;
}

function uniqueById<T extends { id: string }>(rows: T[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row] as const)).values());
}
