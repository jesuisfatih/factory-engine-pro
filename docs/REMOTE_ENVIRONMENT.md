# Remote Environment Rules

Factory Engine Pro uses managed PostgreSQL and managed Redis for remote test, staging, and production.

- Do not install PostgreSQL on the API server.
- Do not run Factory Engine Pro migrations against legacy Eagle databases such as `eagle_dtfbank_db` or `eagle_print_db`.
- Use a dedicated managed database whose name starts with `factory_engine_pro`, for example `factory_engine_pro_test`.
- Keep `sslmode=require` for the Vultr managed PostgreSQL URL.
- Use the Vultr managed Redis `rediss://` URL in remote environments.
- Copy secrets only from the target server environment; do not commit real env values.

The backend Prisma scripts run `services/backend/scripts/guard-database-url.mjs` before migrations so a wrong local or legacy database URL fails fast.
