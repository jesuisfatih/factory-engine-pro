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
