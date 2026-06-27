const value = process.env.DATABASE_URL;

if (!value) {
  fail('DATABASE_URL is required before running Prisma migrations.');
}

let parsed;
try {
  parsed = new URL(value);
} catch {
  fail('DATABASE_URL must be a valid PostgreSQL URL.');
}

const host = parsed.hostname.toLowerCase();
const database = parsed.pathname.replace(/^\//, '');
const schema = parsed.searchParams.get('schema') ?? 'public';
const legacyDatabases = new Set([
  'eagle_print_db',
  'eagle_dtfbank_db',
  'eagle_dtfprintdepot_db',
  'eagle_dtfsupply_db',
  'eagle_fastdtfsupply_db',
  'fast_dtf_transfer',
]);

if (host === '127.0.0.1' || host === 'localhost') {
  fail('Refusing local Postgres for this project. Use the remote managed test database env.');
}

if (legacyDatabases.has(database)) {
  if (schema !== 'factory_engine_pro') {
    fail(`Refusing legacy database "${database}" without schema=factory_engine_pro. This prevents touching legacy public tables.`);
  }
  process.exit(0);
}

if (!database.startsWith('factory_engine_pro')) {
  fail(`Factory Engine Pro database name must start with "factory_engine_pro"; got "${database}".`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
