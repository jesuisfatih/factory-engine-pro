# Factory Engine Pro Developer Handoff

## Repository

- GitHub: `git@github.com:jesuisfatih/factory-engine-pro.git`
- Branch: `main`
- Verified HEAD: `9074810`
- `origin/main` and local `main` were equal at handoff time.
- GitHub collaborator `ugurkeskin53` has write access.

The Codex task named `Factory Engine Pro - Developer Handoff` contains the
completed conversation history and the latest operational context. Read the
newest messages first because later product decisions replace earlier ones.

## Important Commits

- `a9cc412` - repair matched transcript to staff task delivery
- `27e4015` - add live transcript task delivery proof
- `708d46a` - register all tenant Mutagen deployments
- `9074810` - exclude package cache from tenant synchronization

## Production State

The current source was synchronized and deployed to these Factory Engine
tenant containers:

- `factoryengine-dtfbank-app`
- `factoryengine-dtfprint-app`
- `factoryengine-eagledtfsupply-app`
- `factoryengine-fastdtftransfer-app`
- `factoryengine-fastdtfsupply-app`
- `factoryengine-dtfprintdepot-app`

At handoff time every container had:

- backend health response `200`
- API, admin, person, and accounts processes online (`4/4`)
- zero PM2 restarts after deployment
- an active Mutagen session in `Watching for changes` state

No unrelated container and no Caddy configuration was changed.

### Known External DNS Blocker

Eagle DTF Supply and DTF Print Depot are healthy on the new server, but their
public `app` and `api` DNS records still point to old infrastructure. Their DNS
is hosted by GoDaddy. Do not change these records or Caddy without explicit
approval and a rollback plan. The target Factory Engine server is
`144.202.125.169`.

## Mandatory Reading

Before changing code, read the repository-level agent instructions and:

- `docs/ROADMAP.md`
- `docs/TASK_MANAGEMENT.md`
- `docs/FRONTEND_MCP_AGENT_GUIDE.md`
- `docs/RULE_ENGINE_MVP_AGENT_GUIDE.md`

The old Eagle system is a read-only behavioral reference. Do not transfer
modules outside the closed ROADMAP scope.

## Engineering Rules

- Keep the existing Tenant -> Member and Customer -> CustomerUser -> SubUser
  identity model unchanged.
- Enforce `tenantId` centrally and on every persisted tenant row.
- Use the managed PostgreSQL and managed Redis services from tenant
  configuration. Do not install database or Redis containers on the API host.
- Do not leave mock, seed, fixture, or static operational data in production UI.
- Keep module boundaries and semantic file separation.
- Staff UI must consume staff-safe backend contracts, not infer business meaning
  from internal rule metadata.
- Do not touch Caddy, Gang Sheet applications, Shopify applications, or any
  unrelated container during Factory Engine deployment.
- Preserve tenant `.env`, uploads, compose files, and managed-service settings.
- Test first, commit and push every completed change, then collect production
  endpoint, log, database, and UI evidence.

## New Workstation Start

```powershell
gh auth status
gh repo clone jesuisfatih/factory-engine-pro
cd factory-engine-pro
git checkout main
git pull --ff-only origin main
corepack enable
pnpm install --frozen-lockfile
```

Do not copy production secrets into the repository. Obtain tenant environment
files only through the approved secure operational channel.
