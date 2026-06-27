#!/usr/bin/env sh
set -eu

cd /app

export NODE_ENV="${NODE_ENV:-production}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-4000}"
export SEED_TENANT_ID="${SEED_TENANT_ID:-ten_dtfbank}"

if [ -n "${JWT_SECRET:-}" ]; then
  export JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-$JWT_SECRET}"
  export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-$JWT_SECRET}"
fi

export CONFIG_ENCRYPTION_KEY="${CONFIG_ENCRYPTION_KEY:-${SETTINGS_ENCRYPTION_KEY:-${TOKEN_ENCRYPTION_KEY:-${JWT_SECRET:-}}}}"
export ADMIN_APP_URL="${ADMIN_APP_URL:-${ADMIN_URL:-http://127.0.0.1:3000}}"
export ACCOUNTS_APP_URL="${ACCOUNTS_APP_URL:-${ACCOUNTS_URL:-http://127.0.0.1:3001}}"
export PERSON_APP_URL="${PERSON_APP_URL:-${ADMIN_APP_URL}}"
export VITE_TENANT_ID="${VITE_TENANT_ID:-$SEED_TENANT_ID}"
export VITE_PERSON_BASE_PATH="${VITE_PERSON_BASE_PATH:-/staff/}"

if [ -n "${API_URL:-}" ]; then
  export VITE_API_URL="${VITE_API_URL:-$(printf '%s' "$API_URL" | sed 's#/*$##')/api/v1}"
fi

export DATABASE_URL="$(node /app/scripts/normalize-database-url.mjs)"

export COREPACK_ENABLE_PROJECT_SPEC=0
corepack enable
corepack prepare pnpm@10.24.0 --activate

pnpm install --frozen-lockfile --prod=false
pnpm --filter @factory-engine-pro/contracts build
pnpm --filter @factory-engine-pro/integrations build
pnpm --filter @factory-engine-pro/api-client build
pnpm --filter @factory-engine-pro/backend build
pnpm --filter @factory-engine-pro/admin build
pnpm --filter @factory-engine-pro/person build
pnpm --filter @factory-engine-pro/accounts build

pnpm --filter @factory-engine-pro/backend prisma:deploy
pnpm --filter @factory-engine-pro/backend seed

cat > /tmp/ecosystem.config.js <<'EOF'
module.exports = {
  apps: [
    {
      name: 'factory-engine-pro-api',
      cwd: '/app/services/backend',
      script: 'node',
      args: 'dist/services/backend/src/main.js',
      env: { NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '4000' },
    },
    {
      name: 'factory-engine-pro-admin',
      script: '/bin/sh',
      args: '-lc "cd /app/apps/admin && node_modules/.bin/vite preview --host 0.0.0.0 --port 3000"',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'factory-engine-pro-person',
      script: '/bin/sh',
      args: '-lc "cd /app/apps/person && node_modules/.bin/vite preview --host 0.0.0.0 --port 3002"',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'factory-engine-pro-accounts',
      script: '/bin/sh',
      args: '-lc "cd /app/apps/accounts && node_modules/.bin/vite preview --host 0.0.0.0 --port 3001"',
      env: { NODE_ENV: 'production' },
    },
  ],
};
EOF

exec pm2-runtime start /tmp/ecosystem.config.js
