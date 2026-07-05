# Planlayıcı Agent — Sistem Sinir Uçları Brifingi

> Bu doc **planlayan agent için**. Kodlayan agent bunu okumaz — kodlayan agent ROADMAP.md'ye bakar. Bu doc planlayıcının roadmap'i hazırlarken bilmesi gereken **gerçek** sistem röntgenidir. Tarih: 2026-06-28.
>
> **Tüm bilgiler şu kaynaklardan alınmıştır** — varsayım yok, tahmin yok:
> - `services/backend/src/modules/*/` (controller + service dosyaları)
> - `services/backend/prisma/schema.prisma`
> - `packages/contracts/src/permissions.ts`
> - `apps/admin/src/components/Sidebar.tsx`
> - `git log` (factory-engine-pro)
> - `c:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/CLAUDE.md` (eski sistem)
> - Memory: `feedback_no_assumption.md`, `feedback_server_scope.md`, `feedback_deploy_canary.md`

---

## 0. Planlayıcının uyması gereken kullanıcı kuralları

Kullanıcı bu kuralları **defalarca, agresif tonla** tekrar etti. Roadmap yazarken bunları çiğnersen kullanıcı kızar:

| Kural | Açıklama | Nereden |
|---|---|---|
| **VARSAYIM YASAK** | Liste/path/komut/tenant adı yazmadan ÖNCE kaynağı aç + doğrula. Memory tek başına yetersiz. | `feedback_no_assumption.md` |
| **HEDEFİ ANLAT, DETAY VERME** | Roadmap'te bir maddeyi "şunu şunu silelim, şu fonksiyonu ekleyelim" değil "şu hedefe varılsın" diye yaz. Kodlama agenti kararı verir. | Conversation 2026-06-27 |
| **KAPALI LİSTE** | Roadmap 7.2'de "ASLA dokunma" listesi var; oraya bakmadan modül adı yazma. ssactivewear/gangsheetbuilder/gss-/us-/caddy = başka projeler. | `feedback_server_scope.md` |
| **LOKAL ÇALIŞTIRMA YASAK** | `pnpm dev`, `vite`, `nest start`, `127.0.0.1`, `localhost:*` — kanıtta, screenshot'ta, test'te görünemez. Tüm iş Mutagen-synced dtfbank container'ında. | ROADMAP 3.7 |
| **MANAGED DB** | Postgres ve Redis Vultr managed; bilgi **eski tenant container'ının .env**'inden alınır, yeni deploy dir'inden değil. | ROADMAP 3.2 |
| **CANARY = DTFBANK** | Sadece dtfbank serbestçe deploy edilebilir. Diğer 5 tenant için her seferinde izin istenir. | `feedback_deploy_canary.md` |
| **FACTORYENGINE-* SCOPE** | Server'da yalnızca `factoryengine-*` container'lara dokunulur. | `feedback_server_scope.md` |
| **HEDEF MERKEZLİ ROADMAP** | Bölüm 9'da sadece **hedef cümleleri** olur (Hedef 1, Hedef 2…). Adım adım talimat değil. | Conversation 2026-06-27 |

---

## 1. Sistem röntgeni — gerçek topoloji

### 1.1. 6 tenant (`eagledtfprint/CLAUDE.md`'den doğrulandı)

`dtfbank`, `dtfprintdepot`, `eagledtfprint`, `eagledtfsupply`, `fastdtfsupply`, `fastdtftransfer` — **hepsi tek codebase**, tek image, ayrı `.env.<tenant>` + ayrı DB + ayrı `tenant-configs/<tenant>/.env`.

### 1.2. 3 frontend yüzeyi

- `apps/admin` (Vite, port 5189 lokal — prod'da `app.<tenant>.com`)
- `apps/accounts` (Vite, port 5187 lokal — prod'da `accounts.<tenant>.com`)
- `apps/person` (Vite, port 5188 lokal — prod'da `app.<tenant>.com/staff` path; commit `95b4fe4b`)

### 1.3. Backend tek monolit

`services/backend` (NestJS) — 14 modül, hepsi `services/backend/src/modules/<name>/` altında.

### 1.4. Sunucu (memory `project_dtfbank_infra.md`'den)

- App: Vultr `144.202.125.169` (eski adıyla `new-mothership`)
- Worker: `45.32.66.125`
- Managed Postgres: `defaultdb` (sslmode=require)
- Managed Redis: `rediss://`
- Compose project name: `eagledtfprint` (eski adıyla)

---

## 2. Backend modülleri — kapalı liste

`services/backend/src/modules/` altında **şu an gerçekten var olan** 14 controller:

| Modül | Controller | Ana sorumluluk |
|---|---|---|
| `auth` | `auth.controller.ts` | Bootstrap, member/customer/person login, register, forgot/reset, refresh, invitations, me |
| `identity` | `identity.controller.ts` | Tenant config, members, customer-users, sub-users, member-roles CRUD, customer-roles, workspace-brand |
| `orders` | `orders.controller.ts` | CommerceOrder + CommercePickupOrder, ActivityLog |
| `customers` | `customers.controller.ts` | Customer + CustomerInsight + CustomerList |
| `pricing` | `pricing.controller.ts` | PricingRule CRUD |
| `segments` | `segments.controller.ts` | Aşağıda detayı var (§5) |
| `support` | `support.controller.ts` | ServiceRequest + ServiceRequestComment |
| `b2b-access` | `b2b-access.controller.ts` | B2BAccessRequest + dosya |
| `mail` | `mail.controller.ts` | MailDelivery — system mail (provider health: commit `04c3902b`) |
| `aircall` | `aircall.controller.ts` + `aircall-webhook.controller.ts` | Aşağıda detayı var (§3) |
| `sync` | `sync.controller.ts` | Shopify ingest tetik + status; Aşağıda detayı var (§4) |
| `ai` | `ai.controller.ts` | Sadece health endpoint (commit `efca960f`) |
| `accounts` | `accounts.controller.ts` | Customer-portal API (commit `70344a71`) |
| `person-workspace` | `person-workspace.controller.ts` | Personel UI backend (commit `53f2d397`) |

**Planlayıcı notu:** Roadmap yazarken bu listenin dışından modül adı geçirme. "Notifications gateway", "Dittofeed", "event-bus", "fingerprint", "sales/sellerusers" gibi şeyler eski sistemde var ama buraya **dahil değil** (ROADMAP §6 kapalı liste).

---

## 3. Aircall sinir ucu

### 3.1. Schema
`AircallUser`, `AircallNumber`, `AircallWebhookConfig`, `AircallWebhookInbox`, `AircallCallEvent`, `AircallSyncState` — Prisma schema satırları sırasıyla 871, 896, 920, 941, 966, 1058.

### 3.2. Pipeline (commit `bb4211bf` "Add Aircall ingest pipeline and live tabs")

**2 aşamalı:**
1. **Webhook** (`aircall-webhook.controller.ts`) — ≤200ms her zaman 200 döner, payload `AircallWebhookInbox`'a düşer.
2. **Worker** — `AircallWebhookInbox` → `AircallCallEvent` idempotent upsert (event_id unique).

### 3.3. Credentials
`TenantConfig.aircallApiIdEncrypted` + `aircallApiTokenEncrypted` (schema satır 94+). Tenant config bağlama: commit `e0f7c47f` "Bind Aircall connection to tenant config".

### 3.4. Status (commit `b5ec29a8`)
LIVE — Aircall ingest çalışıyor, dtfbank tenant config'inde bağlı.

### 3.5. UI
Admin'de **agent paneli yok**. `customer.detail` sayfasında Aircall tab'ı var (commit `141cc039` "Document Aircall tabs live no-mock proof").

---

## 4. Shopify sync sinir ucu

### 4.1. Schema
`ShopifySyncState` (satır 1075), `SyncLog` (satır 1105).

### 4.2. Pipeline (commit `158d7191` "Add Shopify initial sync pipeline")
- `services/backend/src/modules/sync/shopify-client.service.ts` — REST/GraphQL client
- `services/backend/src/modules/sync/shopify-sync-state.service.ts` — cursor + lock state
- `services/backend/src/modules/sync/shopify-sync.worker.ts` — BullMQ worker
- `services/backend/src/modules/sync/shopify-sync.constants.ts` — limitler/sabitler

### 4.3. Lock disiplini (eski sistemden port: `eagledtfprint/backend/src/sync/sync-state.service.ts`)
- 60 dk TTL (`LOCK_TTL_MS = 60 * 60 * 1000`)
- 5 consecutive failure → manuel müdahale gerekir (`MAX_CONSECUTIVE_FAILURES = 5`)
- Stale lock auto-release (heartbeat dolduğunda)
- 3 entityType: `customers`, `products`, `orders`

### 4.4. Credentials
`TenantConfig.shopifyAdminTokenEncrypted` + `shopifyShopDomain`.

### 4.5. Status (commit `e2c43da4`)
LIVE-with-issue — kod çalışıyor ama **dtfbank için Shopify Admin Token 401 dönüyor**. Kullanıcı'nın eski container .env'inden doğru token alınıp yeni tenant config'e yazılması gerekiyor. **Planlayıcının açık not düşmesi gereken bir madde.**

---

## 5. Segments sinir ucu

### 5.1. "Segment nedir, nereden gelir?"
**Müşteri (Customer) gruplandırma sistemi.** Belirli kurallarla (ör. "son 30 günde sipariş veren") müşterileri etiketler.

3 model var (`schema.prisma`):
- **`Segment`** (satır 664) — segment tanımı (isim, kurallar, owner config).
- **`SegmentOwnership`** (satır 693) — hangi member/role bu segment'in **sahibi/sorumlusu** (kim göreceği, kim atayacağı).
- **`SegmentCustomerMembership`** (satır 717) — segment ↔ customer mapping; `evaluate` çalıştırıldığında yenilenir.

### 5.2. Endpoint'ler (`segments.controller.ts`, 11 endpoint)
```
GET    /segments              → list (segmentsRead)
GET    /segments/stats        → stats (segmentsRead)
POST   /segments/preview      → kuralları çalıştırmadan eşleşen müşteri sayısı (segmentsRead)
POST   /segments/evaluate-all → tüm segmentleri yeniden hesapla (segmentsWrite)
POST   /segments              → oluştur (segmentsWrite)
GET    /segments/:id          → tek segment (segmentsRead)
PUT    /segments/:id          → güncelle (segmentsWrite)
POST   /segments/:id/evaluate → tek segment yeniden hesapla (segmentsWrite)
GET    /segments/:id/ownership → ownership list (segmentsRead)
PUT    /segments/:id/ownership → ownership upsert (segmentsWrite)
DELETE /segments/:id/ownership → ownership sil (segmentsWrite)
DELETE /segments/:id          → segment sil (segmentsWrite)
```

### 5.3. Veri akışı
Customer → SegmentCustomerMembership (membership) → Segment → SegmentOwnership → Member.
`evaluate` worker kuralları çalıştırıp membership tablosunu yenileyen yer.

---

## 6. Rol & yetki sinir ucu (KRİTİK)

### 6.1. İki ayrı RBAC düzlemi
1. **Member düzlemi** (admin/personel/owner) — `MemberRole` + `MemberRoleAssignment`
2. **Customer düzlemi** (b2b müşteri) — `CustomerRole` + `CustomerRoleAssignment`

Birbirine karışmaz — bir member'a customer rolü atanamaz.

### 6.2. 24 MEMBER_PERMISSIONS (`packages/contracts/src/permissions.ts`)
```
identity.read, identity.write
members.read, members.write
roles.read, roles.write
customers.read, customers.write
orders.read, orders.write
pricing.read, pricing.write
segments.read, segments.write
support.read, support.write
b2b_access.read, b2b_access.write
settings.read, settings.write
sync.trigger
task.assign
aircall.users.read, aircall.users.write
```

### 6.3. 7 CUSTOMER_PERMISSIONS
```
account.read, account.write
subusers.read, subusers.write
orders.read, orders.create
spending_limits.write
```

### 6.4. Default rol setleri
**Member tarafı:**
- `owner` = `*` (her şey)
- `admin` = settings hariç çoğu (tipik ops yönetici)
- `agent` = read-mostly + `support.write` + `task.assign`

**Customer tarafı:**
- `b2b_admin` = `*` (customer düzleminde)
- `b2b_user` = `account.*` + `orders.read/create`

### 6.5. Sidebar permission map (`apps/admin/src/components/Sidebar.tsx`)
16 nav entry, **hepsi permission-gate'li**:

| Group | Item | Permission |
|---|---|---|
| overview | dashboard | (yok — herkese açık) |
| commerce | orders | `orders.read` |
| commerce | customers | `customers.read` |
| commerce | pricing | `pricing.read` |
| operations | segments | `segments.read` |
| operations | support | `support.read` |
| operations | b2b-requests | `b2b_access.read` |
| operations | tasks | `task.assign` |
| automation | rules | `settings.write` |
| organization | team-users | `members.read` |
| organization | team-roles | `roles.read` |
| organization | team-commissions | `members.read` |
| transactional_mail | system-mail | `settings.read` |
| system | workspace | `settings.read` |
| system | aircall | `aircall.users.read` |
| system | ai (legacy) | `settings.read` |
| system | shopify | `settings.read` |

### 6.6. Permission çözünürlüğü kuralı (kullanıcının açıkça koyduğu)
"Login'de **bir kez** çözülür, sayfa başına yeniden istek yok" — commit `0bd617de` "Make admin RBAC permission decisions session based". Planlayıcı yeni endpoint eklerken bu kuralı bozma.

---

## 7. TenantConfig — şifrelenmiş alanlar

`schema.prisma` satır 94'ten itibaren. Provider entegrasyonları **bu modelde yaşar**:

```
shopifyShopDomain                (plain)
shopifyAdminTokenEncrypted        (encrypted)
aircallApiIdEncrypted             (encrypted)
aircallApiTokenEncrypted          (encrypted)
anthropicApiKeyEncrypted          (encrypted)
resendApiKeyEncrypted             (encrypted)
```

**Planlayıcı notu:** Resend tüm tenant'larda **askıya alınmış** — kullanıcı bunu açıkça scope dışına aldı. Email gönderim hedefi yok şu an.

---

## 8. Kodlayan agent ne yaptı? (git log özeti, 35+ commit)

### Tamamlananlar
- **Hedef 1 — Auth & member iskeleti**: commits `b7d486c3` (managed env + identity evidence), `06da4d38` (admin route guard), `2b58474d` (member invite hardening), `c32295ad` (auth form helpers), `e75aee9e` (T1 live proof)
- **Hedef 2 — Commerce + operations**: commit `2368fb62` (orders/customers/pricing/segments/support/b2b-access), `0bd617de` (session-based RBAC), `6c22fb93` (T2 live proof)
- **Hedef 3 — Accounts portalı**: commit `70344a71` (live APIs), `57889d0e` (T3 live proof)
- **Provider entegrasyonları**:
  - Aircall ingest pipeline (`bb4211bf`), tabs (`dc3b43be` + `141cc039`), tenant bind (`e0f7c47f`), redeploy proof (`b5ec29a8`)
  - Shopify initial sync (`158d7191`), live verification (`e2c43da4` — token 401 not düşülmüş)
  - AI health endpoint (`efca960f`)
  - Mail pipeline (`36db25b6`), provider health (`04c3902b`), retry + admin UI (`8f1acfe6`, `36fe67b4`)
- **Workspace branding** (`3d61b753`)
- **Person app altına staff path** (`95b4fe4b`), live API'ler (`53f2d397`)

### Devam eden / kısmen biten
- **Hedef 4 — Person workspace**: commit'ler `53f2d397` → `46e9919b` arası tamamlama dalgaları. Henüz "T4 live proof" doc'u yok.
- **Hedef 5 — Task management**: kod yok. `docs/TASK_MANAGEMENT.md`'de tasarım var; AI task NOT transferred.
- **Hedef 6**: roadmap'te şu an boş bekliyor.

### Açık problemler
1. **Shopify Admin Token 401** — dtfbank için canlı token yeni TenantConfig'e yazılmamış (eski container'dan çekilmesi gerekiyor).
2. **Test coverage = 0** — hiç test yazılmadı.
3. **`person-workspace.service.ts`** — 743 satır, splitting bekliyor (planlayıcı bunu Hedef 6'ya not düşmeli mi karar verir).
4. **Eagledtfprint XMRig reinfection** (memory `project_eagledtfprint_xmrig_reinfection.md`) — canary'de mining process var, deploy bloklu.

---

## 9. Planlayıcının roadmap kurarken referans alacağı şablonlar

- **Hedef cümlesi formatı:** "X yüzeyinde Y akışı eski sistemle aynı davranışa ulaşır" → tek satır, fiil + kanıt + kapsam.
- **Kanıt cümlesi:** `https://app.dtfbank.com/...` veya `https://accounts.dtfbank.com/...` URL'i + container log satırı. `127.0.0.1`/`localhost` **YASAK**.
- **Kapsam kapısı:** Her hedef başında "bu hedef şu modüllere dokunur" listesi olur; dışındakine dokunulmaz.
- **Test hesabı:** `owner.prodtest+20260627184047@dtfbank.com` / `FepOwner20260627184047` (ROADMAP §0). Yeni hesap üretmeden bunu kullanır.

---

## 10. Planlayıcının ASLA önermemesi gerekenler

| Öneri | Neden yasak |
|---|---|
| "Local'de pnpm dev ile test edelim" | ROADMAP 3.7 + memory `feedback_deploy_flow.md` |
| "Yeni notifications gateway / sales / event-bus modülü ekleyelim" | ROADMAP §6 kapalı listenin dışı |
| "Resend'i kuralım, mail marketing aktif edelim" | API key askıya alınmış, kullanıcı scope dışına aldı |
| "Eagledtfprint'e deploy alalım" | Canary değil, üstelik XMRig reinfection blok'ta |
| "ssactivewear / gangsheetbuilder / gss-* / us-* container'larına bakalım" | `feedback_server_scope.md` — başka projeler |
| "GCP'den çekelim" | GCP DEAD (eski CLAUDE.md), Vultr managed kullanılıyor |
| "Tests yazalım önce" | Kullanıcı önce ürün aktarımı istiyor; test sonraki faz |
| "Refactor turu atalım" | "Don't add features beyond what the task requires" — sadece transfer |

---

## 11. Planlayıcının bana sorabileceği şeyler

Eğer planlayıcı bu doc'tan emin değilse bana (Claude) sorabileceği konular:
- "Bu modül eski sistemde var mı?" → ben `eagle-engine.dev/eagledtfprint/` altında grep'leyebilirim.
- "Şu permission'a kim sahip?" → contracts grep + commit history.
- "Şu endpoint hangi UI'dan tetikleniyor?" → admin/accounts/person source grep.
- "Şu commit gerçekte ne değiştirdi?" → `git show <sha>`.

Kullanıcı'dan sadece **gerçekten gerekli** olduğunda bilgi istesin (token, env değeri gibi).
