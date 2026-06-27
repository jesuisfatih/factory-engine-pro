const raw = process.env.DATABASE_URL;

if (!raw) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const url = new URL(raw);
const database = url.pathname.replace(/^\//, '');
const legacyDatabases = new Set([
  'eagle_print_db',
  'eagle_dtfbank_db',
  'eagle_dtfprintdepot_db',
  'eagle_dtfsupply_db',
  'eagle_fastdtfsupply_db',
  'fast_dtf_transfer',
]);

if (legacyDatabases.has(database) && !url.searchParams.get('schema')) {
  url.searchParams.set('schema', process.env.FACTORY_ENGINE_PRISMA_SCHEMA ?? 'factory_engine_pro');
}

process.stdout.write(url.toString());
