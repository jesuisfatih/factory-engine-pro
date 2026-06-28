import { PrismaClient } from '@prisma/client';
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { DEFAULT_MEMBER_ROLES, MEMBER_PERMISSIONS } from '@factory-engine-pro/contracts';

const prisma = new PrismaClient();

async function main() {
  const tenantId = process.env.SEED_TENANT_ID ?? 'ten_local';
  const suffix = tenantId.replace(/[^a-zA-Z0-9]/g, '_');
  await prisma.tenant.upsert({
    where: { id: tenantId },
    create: {
      id: tenantId,
      name: process.env.BRAND_NAME ?? 'Factory Engine Test Tenant',
      slug: suffix.toLowerCase().replace(/^ten_/, '') || 'dtfbank',
    },
    update: {},
  });
  await seedTenantConfig(tenantId, suffix);
  await seedRoadmapMemberRoles(tenantId, suffix);
  await seedDtfbankRoadmapStaff(tenantId, suffix);

  const customerId = `cust_${suffix}_northstar`;
  await prisma.customer.upsert({
    where: { id: customerId },
    create: {
      id: customerId,
      tenantId,
      shopifyCustomerId: '1000000001',
      companyName: 'Northstar Print Supply',
      firstName: 'Aylin',
      lastName: 'Kara',
      email: 'orders+northstar@example.com',
      phone: '+15555550101',
      tags: ['b2b', 'vip', 'wholesale'],
      totalSpent: 1842.5,
      ordersCount: 2,
      averageOrderValue: 921.25,
      lastOrderAt: new Date('2026-06-20T12:00:00.000Z'),
      syncedAt: new Date(),
    },
    update: {
      totalSpent: 1842.5,
      ordersCount: 2,
      averageOrderValue: 921.25,
      lastOrderAt: new Date('2026-06-20T12:00:00.000Z'),
      tags: ['b2b', 'vip', 'wholesale'],
      syncedAt: new Date(),
    },
  });

  const productId = `prod_${suffix}_dtf`;
  const variantId = `var_${suffix}_dtf_22`;
  await prisma.catalogProduct.upsert({
    where: { id: productId },
    create: {
      id: productId,
      tenantId,
      shopifyProductId: '9000000001',
      title: 'Premium DTF Transfer',
      handle: 'premium-dtf-transfer',
      vendor: 'Factory Engine',
      productType: 'DTF Transfer',
      tags: ['dtf', 'transfer'],
      status: 'active',
    },
    update: {},
  });
  await prisma.catalogVariant.upsert({
    where: { id: variantId },
    create: {
      id: variantId,
      tenantId,
      productId,
      shopifyVariantId: '9100000001',
      sku: 'DTF-22',
      title: '22 inch gang sheet',
      price: 42,
      availableForSale: true,
      position: 1,
    },
    update: {
      price: 42,
      availableForSale: true,
    },
  });

  const orderId = `ord_${suffix}_1001`;
  await prisma.commerceOrder.upsert({
    where: { id: orderId },
    create: {
      id: orderId,
      tenantId,
      customerId,
      shopifyOrderId: '8000001001',
      shopifyOrderNumber: '#FEP-1001',
      shopifyCustomerId: '1000000001',
      source: 'shopify',
      email: 'orders+northstar@example.com',
      phone: '+15555550101',
      subtotal: 420,
      totalDiscounts: 42,
      totalTax: 0,
      totalPrice: 378,
      totalShipping: 0,
      totalRefunded: 0,
      currency: 'USD',
      financialStatus: 'paid',
      fulfillmentStatus: 'unfulfilled',
      fulfillmentMode: 'pickup',
      tags: ['pickup', 'b2b'],
      lineItems: [{ title: '22 inch gang sheet', sku: 'DTF-22', quantity: 10, unitPrice: 42, shopifyVariantId: '9100000001' }],
      designFiles: [{ name: 'Artwork URL', value: 'https://cdn.example.com/designs/fep-1001.pdf' }],
      fulfillmentEvidence: { matchedTags: ['pickup'], hasShippingAddress: false },
      processedAt: new Date('2026-06-20T12:00:00.000Z'),
    },
    update: {
      totalPrice: 378,
      fulfillmentMode: 'pickup',
      fulfillmentStatus: 'unfulfilled',
      designFiles: [{ name: 'Artwork URL', value: 'https://cdn.example.com/designs/fep-1001.pdf' }],
    },
  });
  await prisma.commercePickupOrder.upsert({
    where: { orderId },
    create: {
      id: `pick_${suffix}_1001`,
      tenantId,
      orderId,
      customerId,
      status: 'pending',
      orderNumber: '#FEP-1001',
      customerName: 'Northstar Print Supply',
      customerEmail: 'orders+northstar@example.com',
      designFiles: [{ name: 'Artwork URL', value: 'https://cdn.example.com/designs/fep-1001.pdf' }],
      metadata: {},
    },
    update: {
      status: 'pending',
    },
  });

  await prisma.customerInsight.upsert({
    where: { customerId },
    create: {
      id: `cins_${suffix}_northstar`,
      tenantId,
      customerId,
      clvScore: 37,
      projectedClv: 2211,
      clvTier: 'growth',
      rfmRecency: 5,
      rfmFrequency: 2,
      rfmMonetary: 4,
      rfmSegment: 'vip',
      healthScore: 88,
      churnRisk: 'low',
      daysSinceLastOrder: 7,
      avgOrderValue: 921.25,
      maxOrderValue: 1464.5,
      orderTrend: 'rising',
      firstOrderAt: new Date('2026-06-01T12:00:00.000Z'),
      lastOrderAt: new Date('2026-06-20T12:00:00.000Z'),
      customerSince: new Date('2026-06-01T12:00:00.000Z'),
      isReturning: true,
      deepMetrics: { seeded: true },
    },
    update: {
      rfmSegment: 'vip',
      healthScore: 88,
      churnRisk: 'low',
      calculatedAt: new Date(),
    },
  });

  const seedMember = await prisma.member.findFirst({
    where: { tenantId, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });

  const segmentId = `seg_${suffix}_vip`;
  const segmentConditions = [
    { field: 'shopifyCustomerTags', operator: 'contains', value: 'vip', scopeType: 'all', scopeValues: [] },
    { field: 'totalRevenue', operator: 'gte', value: 1000, scopeType: 'all', scopeValues: [] },
  ];
  await prisma.segment.upsert({
    where: { id: segmentId },
    create: {
      id: segmentId,
      tenantId,
      name: 'VIP B2B Customers',
      description: 'Seed segment for high value B2B customers',
      color: '#2f80ed',
      priority: 20,
      priorityGlobal: 20,
      audienceType: 'customer',
      matchMode: 'all',
      conditions: segmentConditions,
      rules: { matchMode: 'all', conditions: segmentConditions },
      rulesHash: 'seed-vip-b2b',
      customerCount: 1,
      lastEvaluatedAt: new Date(),
      isActive: true,
    },
    update: {
      conditions: segmentConditions,
      rules: { matchMode: 'all', conditions: segmentConditions },
      customerCount: 1,
      lastEvaluatedAt: new Date(),
      isActive: true,
    },
  });
  await prisma.segmentCustomerMembership.upsert({
    where: { tenantId_segmentId_customerId: { tenantId, segmentId, customerId } },
    create: {
      id: `smem_${suffix}_vip_northstar`,
      tenantId,
      segmentId,
      customerId,
      score: 1,
    },
    update: {
      matchedAt: new Date(),
      score: 1,
    },
  });
  if (seedMember) {
    const ownershipId = `sown_${suffix}_vip_${seedMember.id}`.slice(0, 190);
    await prisma.segmentOwnership.upsert({
      where: { tenantId_segmentId_memberId: { tenantId, segmentId, memberId: seedMember.id } },
      create: {
        id: ownershipId,
        tenantId,
        segmentId,
        memberId: seedMember.id,
        priority: 10,
        importance: 'high',
        dailyCap: 25,
        autoAssignNew: true,
      },
      update: {
        priority: 10,
        importance: 'high',
        dailyCap: 25,
        autoAssignNew: true,
      },
    });
  }

  const serviceRequestId = `sr_${suffix}_welcome`;
  await prisma.serviceRequest.upsert({
    where: { id: serviceRequestId },
    create: {
      id: serviceRequestId,
      tenantId,
      customerId,
      assignedMemberId: seedMember?.id,
      source: 'manual',
      surface: 'internal',
      title: 'Seed support follow-up',
      description: 'Verify VIP customer artwork and pickup workflow.',
      status: 'open',
      priority: 'high',
      createdByActorId: seedMember?.id,
      metadata: { category: 'operations', ticketNumber: `SR-${suffix.toUpperCase()}-001` },
    },
    update: {
      priority: 'high',
      status: 'open',
      assignedMemberId: seedMember?.id,
      metadata: { category: 'operations', ticketNumber: `SR-${suffix.toUpperCase()}-001` },
    },
  });
  await prisma.serviceRequestComment.upsert({
    where: { id: `srcm_${suffix}_welcome` },
    create: {
      id: `srcm_${suffix}_welcome`,
      tenantId,
      serviceRequestId,
      actorId: seedMember?.id,
      actorType: seedMember ? 'member' : 'system',
      body: 'Seed support request is ready for operations smoke testing.',
      internal: true,
      attachmentsJson: [],
    },
    update: {
      body: 'Seed support request is ready for operations smoke testing.',
      internal: true,
    },
  });

  const b2bRequestId = `b2br_${suffix}_seed`;
  await prisma.b2BAccessRequest.upsert({
    where: { id: b2bRequestId },
    create: {
      id: b2bRequestId,
      tenantId,
      status: 'pending',
      email: `b2b.seed+${suffix}@example.com`,
      firstName: 'Seed',
      lastName: 'Buyer',
      phone: '+15555550199',
      companyName: 'Seed B2B Buyer',
      legalName: 'Seed B2B Buyer LLC',
      website: 'https://example.com',
      industry: 'Apparel',
      estimatedMonthlyVolume: '$5,000 / month',
      message: 'Seed application for B2B approval smoke testing.',
      passwordHash: hashSeedPassword('SeedB2B!2026'),
      metadata: { sourceSurface: 'seed', flowIntent: 'request-invitation' },
    },
    update: {
      status: 'pending',
      reviewNotes: null,
      reviewedAt: null,
      resolvedCustomerId: null,
      resolvedCustomerUserId: null,
      metadata: { sourceSurface: 'seed', flowIntent: 'request-invitation' },
    },
  });
  await prisma.b2BAccessRequestFile.upsert({
    where: { id: `b2bf_${suffix}_seed_cert` },
    create: {
      id: `b2bf_${suffix}_seed_cert`,
      tenantId,
      requestId: b2bRequestId,
      storageKey: `seed/${b2bRequestId}/certificate.txt`,
      originalFilename: 'seed-certificate.txt',
      mimeType: 'text/plain',
      sizeBytes: 28,
      contentBase64: Buffer.from('seed certificate placeholder').toString('base64'),
    },
    update: {
      contentBase64: Buffer.from('seed certificate placeholder').toString('base64'),
    },
  });

  await prisma.pricingRule.upsert({
    where: { id: `prule_${suffix}_vip10` },
    create: {
      id: `prule_${suffix}_vip10`,
      tenantId,
      name: 'VIP B2B 10% off',
      description: 'Tenant-scoped seed rule for B2B VIP customers',
      targetType: 'customer_tag',
      targetTags: ['vip'],
      scopeType: 'all',
      discountType: 'percentage',
      discountPercentage: 10,
      discountPolicy: 'best',
      priority: 20,
      isActive: true,
      executionMode: 'draft_order',
      shopifySyncState: 'not_applicable',
    },
    update: {
      isActive: true,
      discountPercentage: 10,
      shopifySyncState: 'not_applicable',
    },
  });
}

function hashSeedPassword(password: string) {
  const salt = randomBytes(24).toString('base64url');
  const derived = pbkdf2Sync(password, salt, 210_000, 64, 'sha512');
  return `pbkdf2$sha512$210000$${salt}$${derived.toString('base64url')}`;
}

async function seedRoadmapMemberRoles(tenantId: string, suffix: string) {
  for (const role of DEFAULT_MEMBER_ROLES) {
    await prisma.memberRole.upsert({
      where: { tenantId_slug: { tenantId, slug: role.slug } },
      create: {
        id: `mrol_${suffix}_${role.slug}`,
        tenantId,
        slug: role.slug,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isSystem: true,
      },
      update: {
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isSystem: true,
      },
    });
  }
}

async function seedDtfbankRoadmapStaff(tenantId: string, suffix: string) {
  const passwordHash = () => hashSeedPassword('1453');
  const staff = [
    {
      id: `tmbr_${suffix}_info_owner`,
      email: 'info@dtfbank.com',
      firstName: 'DTF Bank',
      lastName: 'Owner',
      roleSlug: 'owner',
    },
    {
      id: `tmbr_${suffix}_linda_marroquin`,
      email: 'dtfbanktx@gmail.com',
      firstName: 'Linda',
      lastName: 'Marroquin',
      roleSlug: 'customer_service',
    },
    {
      id: `tmbr_${suffix}_charlette_boatman`,
      email: 'charlette@dtfbank.com',
      firstName: 'Charlette',
      lastName: 'Boatman',
      roleSlug: 'customer_service',
    },
    {
      id: `tmbr_${suffix}_ihsan_taskiran`,
      email: 'ihsan@dtfbank.com',
      firstName: 'Ihsan',
      lastName: 'Taskiran',
      roleSlug: 'sales_personel',
    },
  ];

  const roles = await prisma.memberRole.findMany({
    where: { tenantId, slug: { in: staff.map((member) => member.roleSlug) } },
    select: { id: true, slug: true },
  });
  const roleBySlug = new Map(roles.map((role) => [role.slug, role.id]));

  for (const member of staff) {
    const roleId = roleBySlug.get(member.roleSlug);
    if (!roleId) throw new Error(`Missing roadmap member role: ${member.roleSlug}`);

    const record = await prisma.member.upsert({
      where: { tenantId_email: { tenantId, email: member.email } },
      create: {
        id: member.id,
        tenantId,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        passwordHash: passwordHash(),
        status: 'active',
      },
      update: {
        firstName: member.firstName,
        lastName: member.lastName,
        status: 'active',
      },
    });

    await prisma.memberRoleAssignment.deleteMany({ where: { tenantId, memberId: record.id } });
    await prisma.memberRoleAssignment.create({
      data: {
        id: `asgn_${suffix}_${member.roleSlug}_${record.id}`.slice(0, 190),
        tenantId,
        memberId: record.id,
        roleId,
      },
    });
  }

  await prisma.member.updateMany({
    where: {
      tenantId,
      email: { startsWith: 'owner.prodtest+', endsWith: '@dtfbank.com' },
    },
    data: { status: 'disabled' },
  });

  const salesRoleId = roleBySlug.get('sales_personel');
  const customerServiceRoleId = roleBySlug.get('customer_service');
  const ownerRoleId = roleBySlug.get('owner');
  const rolePermissions = await prisma.memberRole.findMany({
    where: { id: { in: [salesRoleId, customerServiceRoleId, ownerRoleId].filter((id): id is string => Boolean(id)) } },
    select: { slug: true, permissions: true },
  });
  const customerService = rolePermissions.find((role) => role.slug === 'customer_service')?.permissions as Record<string, boolean> | undefined;
  const sales = rolePermissions.find((role) => role.slug === 'sales_personel')?.permissions as Record<string, boolean> | undefined;
  if (!customerService || customerService[MEMBER_PERMISSIONS.commissionSubmit]) {
    throw new Error('Customer Service role must not include commission.submit');
  }
  if (!sales?.[MEMBER_PERMISSIONS.commissionSubmit]) {
    throw new Error('Sales Personel role must include commission.submit');
  }
}

async function seedTenantConfig(tenantId: string, suffix: string) {
  const workspaceName = firstEnv('WORKSPACE_NAME', 'BRAND_NAME');
  const config = {
    workspaceName,
    brandBadge: firstEnv('BRAND_BADGE') ?? initialsFromName(workspaceName),
    brandLogo: firstEnv('BRAND_LOGO_URL', 'BRAND_LOGO'),
    shopifyDomain: firstEnv('SHOPIFY_STORE_DOMAIN', 'SHOPIFY_DOMAIN'),
    shopifyAdminTokenEncrypted: encryptEnv('SHOPIFY_ACCESS_TOKEN', 'SHOPIFY_ADMIN_TOKEN', 'SHOPIFY_ADMIN_ACCESS_TOKEN'),
    shopifyApiKeyEncrypted: encryptEnv('SHOPIFY_API_KEY'),
    shopifyApiSecretEncrypted: encryptEnv('SHOPIFY_API_SECRET'),
    webhookHmacKeyEncrypted: encryptEnv('SHOPIFY_WEBHOOK_SECRET', 'SHOPIFY_WEBHOOK_HMAC_KEY', 'SHOPIFY_API_SECRET'),
    aircallApiIdEncrypted: encryptEnv('AIRCALL_API_ID'),
    aircallApiTokenEncrypted: encryptEnv('AIRCALL_API_TOKEN'),
    aircallWebhookSecretEncrypted: encryptEnv('AIRCALL_WEBHOOK_SECRET'),
    anthropicApiKeyEncrypted: encryptEnv('ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'),
    resendApiKeyEncrypted: encryptEnv('RESEND_API_KEY'),
  };

  if (!Object.values(config).some(Boolean)) return;

  const existing = await prisma.tenantConfig.findUnique({ where: { tenantId } });
  if (!existing) {
    await prisma.tenantConfig.create({
      data: {
        id: `tcfg_${suffix}`,
        tenantId,
        ...config,
      },
    });
    return;
  }

  const update = Object.fromEntries(
    Object.entries(config).filter(([key, value]) => value && !existing[key as keyof typeof existing]),
  );
  if (Object.keys(update).length > 0) {
    await prisma.tenantConfig.update({ where: { tenantId }, data: update });
  }
}

function firstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function initialsFromName(name: string | null) {
  if (!name) return null;
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

function encryptEnv(...keys: string[]) {
  const value = firstEnv(...keys);
  return value ? encrypt(value) : null;
}

function encrypt(value: string) {
  const rawKey = firstEnv('CONFIG_ENCRYPTION_KEY', 'SETTINGS_ENCRYPTION_KEY', 'TOKEN_ENCRYPTION_KEY', 'JWT_SECRET');
  if (!rawKey) {
    throw new Error('CONFIG_ENCRYPTION_KEY, SETTINGS_ENCRYPTION_KEY, TOKEN_ENCRYPTION_KEY, or JWT_SECRET is required to seed tenant secrets');
  }
  const key = /^[a-f0-9]{64}$/i.test(rawKey)
    ? Buffer.from(rawKey, 'hex')
    : Buffer.from(rawKey, 'base64').length === 32
      ? Buffer.from(rawKey, 'base64')
      : createHash('sha256').update(rawKey).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
