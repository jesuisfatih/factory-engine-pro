# Factory Engine Pro — Transfer Notları

Bu doc sadece **şu an yapılacak transferleri** tarif eder. Hafta/saat tahmini,
test planı, gelecek faz spekülasyonu **yoktur**. Bu listede olmayan bir
modüle dokunma — gerekirse önce kullanıcıya sor.

> ⚠ **AGENT İÇİN ANA KURAL — KAPALI LİSTE**
> Bu doc'ta 6. bölümde açıkça transfer edilecek olarak listelenmeyen
> hiçbir şey yeni sisteme alınmaz. Eski sistem (`eagledtfprint/`) çok
> büyük ve dolu — içinde Dittofeed, event-bus, fingerprint, notifications
> gateway, sales/sellerusers, çoklu storefront ve onlarca başka modül
> var; **bunların hiçbiri bu çalışmaya dahil değil**. 7.2'deki "ASLA
> dokunulmayacak" listesini de oku. Şüphedeysen kullanıcıya sor;
> kendi inisiyatifinle "bunu da alalım" deme.

> **Genel kural:** Bu transferdeki modüllerin **hepsi eski sistemde var**. UI
> ve backend zaten yazılmış durumda. Burada yapılan iş tek tip:
> **eski koddan örnekle, yeni hedefe port et**. Yeniden tasarım yok, yeniden
> mimari yok. Bir modülün koduna dokunmadan önce **mutlaka** eski klasörü
> aç ve mevcut implementasyonu oku.

---

## 1. Hedef sistem

3 ayrı Vite uygulaması:

| App | Port | Kullanıcı tipi |
|---|---|---|
| admin | 5189 | İç ekip yönetimi (owner / admin / agent) |
| person | 5188 | Personel çalışma alanı (CallQueue + Messages + Calendar + …) |
| accounts | 5187 | Müşteri self-service (B2B kullanıcısı) |

Backend (henüz kurulmadı): NestJS + Prisma + Postgres + Redis, multi-tenant
(tek DB + `tenantId` field).

**Mimari**: tek DB + modüler monolit, yanında tek integrations servisi.

```
factoryengine/
├─ apps/
│  ├─ admin/         # tmbr_ (owner/admin)
│  ├─ person/        # tmbr_ (agent) · personel CRM
│  └─ accounts/      # cusr_/csub_ · müşteri
├─ services/
│  ├─ backend/   modules/ identity · customers · tasks · personnel · admin
│  └─ integrations/   # shopify · aircall · ai
└─ packages/   contracts(zod) · api-client · ui · config
```

**Kurallar:**
- Her satırda `tenant_id`; token'dan gelir.
- Modüller tabloya değil servise konuşur.
- Request context: `{tenant_id, principal_id, principal_type, permissions[]}`.
- Integrations event'le besler, panel query invalidate eder.

**Bu transfer bittiğinde sistem prod-ready olmalı.** Sadece **Task Management**
ve **Rule engine** açık kalır (bunlar için ayrı bir kısa planlama
yapacağız — bkz. [TASK_MANAGEMENT.md](./TASK_MANAGEMENT.md)). Aşağıdaki
yetenekler **çalışır halde teslim edilir**:

- Admin login + forgot/reset + member invite + customer invite
- Admin → kullanıcı oluştur (Member), rol ata (MemberRole), şifreyi tanımla **veya** email davet ile şifre kurdurt
- Eklenen Member → Aircall kullanıcısına bağlanabilir (kullanıcı oluşturma sırasında veya sonradan, /settings/aircall/users üstünden)
- Customer login + register + forgot/reset + B2B alt hesap (SubUser) oluşturma + role atama
- **B2B Access Request** akışı: accounts public form → admin onay → CustomerUser + `b2b_admin` rolü otomatik oluşur + davet maili gider
- Shopify orders + customers + products **eski sistemdeki gibi** akıyor (sync + webhook)
- **B2B Discounts** çalışır: pricing rule motoru aktif + admin "Discount Create" akışı Shopify Admin API üstünden gerçek discount code basar
- Storefront extensions (**analiz extension'ları hariç**) hazır → customer-account-extension, pricing-kernel-discount
- Mail kaynağı **tek bir yer** (system mail merkezi gönderim pipeline'ı), email-templates kütüphanesi bağlı, mail marketing ayrı modül çalışır
- Aircall çağrı ingest + transcript pull çalışır (sonrasında task'a dönüştüren TM ayrı çalışmada)
- AI sync (Claude çağrı + budget + kill switch) çalışır (prompt registry hariç)
- Tüm UI ekranları boş / dolu / hata durumlarında sağlam çalışır (5.2)

---

## 2. Repolar

| Repo | Yol | Rol |
|---|---|---|
| YENİ (bu repo) | `c:/Users/mhmmd/Desktop/factory-engine-pro/` | Geliştirme yapılan repo |
| ESKİ (kaynak) | `c:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/` | **Sadece okuma** — transfer kaynağı, dokunma |

---

## 3. Sunucu / SSH

Yeni sistem **henüz prod'a deploy edilmedi**.

Eski sistem (yalnız referans / canary):

```bash
ssh root@144.202.125.169   # uygulama host'u (factoryengine-* container'lar)
ssh root@45.32.66.125      # worker host'u
```

- Postgres: Vultr managed `defaultdb` (tenant başına credentials TenantConfig'te tutulacak)
- Redis: `rediss://...` (TLS)

**Kural:** `144.202.125.169` üzerinde `factoryengine-*` dışındaki container/dosyalara
dokunma. Diğer 5 tenant (`dtfbank`, `fastdtfsupply`, `fastdtftransfer`,
`gangsheetbuilder`, `ssactivewear`) canlı. `eagledtfprint` = canary.

---

## 4. Yeni agent — İlk görev

Aşağıdaki maddelerden birini almadan önce, ilgili eski klasörü **OKU**:
ne döndüyor, hangi DTO, hangi BullMQ queue, hangi Prisma model, hangi
endpoint. Okumadan kod yazma.

---

## 5. Çalışma prensipleri (her transfer maddesinde geçerli)

Agent'ın ana hedefi sistemi **backend çöplüğüne** çevirmek değildir.
Aşağıdaki kurallar her transfer maddesinde **istisnasız** uygulanır.

### 5.1 Prod-ready olmadan bir sonrakine geçme

Bir transfer maddesi, **tüm yönleriyle** prod-ready olmadan bir sonraki
maddeye **geçilmez**.

Prod-ready demek, tek bir madde için şunların hepsi tamamlanmış demek:

- Backend modülü çalışıyor, endpoint'ler canlı
- DTO + zod schema yazılmış, validation aktif
- Prisma model'leri migrate edilmiş
- BullMQ queue / worker (gerekirse) çalışıyor
- UI o backend'e bağlandı — **mock data yok, gerçek API çağrısı**
- UI'nın **her detayı** (her buton, her tab, her filtre, her column, her modal) backend'le çalışır durumda
- Hata durumları UI'da gösteriliyor (loading, empty, error, retry)
- Multi-tenant kuralı uygulanıyor (`tenantId` enforced)

Yarım kalmış bir madde "sonra döneriz" denmez. Bitir, kanıtla, sonraki maddeye geç.

### 5.2 Statik / mock UI bırakmak yasak

Backend ↔ UI diyagramında **en ufak bir statik hedef** kalmaz. Bir
ekranda görünen her veri, her aksiyon, her form, her filtre, her chip,
her badge **gerçek backend ile bağlı** olur.

UI'da bir alan eksik kalıyorsa **silme**. Onun yerine sırayla şunu yap:

1. Bu alan ne için var? Müşteri ne yapmak istiyor?
2. Backend'de karşılığı ne olmalı? (yeni endpoint? yeni DTO field? yeni Prisma sütunu?)
3. Eksik kısmı backend'e ekle, UI'yı bağla.

"Şimdilik mock bırakalım, sonra bağlarız" yaklaşımı **yoktur**.

**Boş durum ≠ dolu durum.** Mock data ile çalışan UI hep "data var"
varsayar — bu yanıltıcı. Her ekran **en az 3 durumda** sağlam çalışmalı,
hepsi düşünüldü ve test edildi olarak teslim edilir:

| Durum | Ne demek | UI'da ne olmalı |
|---|---|---|
| **İlk açılış (henüz veri yok)** | Yeni tenant, sıfır segment / sıfır customer / sıfır campaign | Anlamlı empty state: ne olduğunu anlatan kısa metin + ilk aksiyon CTA ("İlk segment'i oluştur") + opsiyonel onboarding ipucu |
| **Dolu durum** | Veri var, normal akış | List + filter + sort + paginate + bulk action, hepsi backend bağlı |
| **Hata durumu** | Backend hata döndü, network kesik, validation fail | Anlamlı hata mesajı + retry butonu + `request_id` gösterimi |

İlk veri eklendiği an UI'nın davranışı değişmeli — boş state'ten dolu
state'e geçiş canlı (TanStack Query invalidation). "İlk segment
eklenince ne olur, ikincisi eklenince ne değişir" sorularına UI cevap
verebilmeli. **Veri yok ile veri var aynı ekran değildir.**

### 5.3 Semantik dosya ayrımı + hata ayıklama kolaylığı + merkeziyetçi yapı (MVP)

Tek bir büyük dosya yok. Her dosya **tek sorumluluk** taşır. İsim
ne yaptığını söyler. Aşağıdaki yapı her modül için referans:

```
services/backend/src/modules/<module>/
├─ <module>.module.ts        # NestJS module composition
├─ <module>.controller.ts    # HTTP routes (HTTP layer; iş mantığı YOK)
├─ <module>.service.ts       # iş mantığı (orchestration)
├─ <module>.repository.ts    # Prisma erişimi (DB layer; tek noktada)
├─ dto/                      # input DTO + zod schema
├─ events/                   # event emit + listener
├─ workers/                  # BullMQ processor'lar (varsa)
└─ <module>.module.spec.ts   # smoke + contract test
```

**Merkeziyetçi (paylaşılan) altyapı tek noktada:**

```
services/backend/src/shared/
├─ prisma.service.ts         # Prisma client + tenant extension
├─ tenant-context.ts         # request-scoped tenant + principal
├─ auth.guard.ts             # JWT verify
├─ permissions.guard.ts      # @RequirePermission decorator
├─ crypto.service.ts         # AES encrypt/decrypt (token at-rest)
├─ logger.service.ts         # structured logging + request_id
├─ http-exception.filter.ts  # tek noktada hata cevap formatı
└─ queue.module.ts           # BullMQ bağlantısı
```

Her modül bu shared katmanı kullanır. Aynı işi iki yerde tekrar yazma
yasak (örn. her modülde ayrı tenant filtresi yazılmaz; Prisma extension
hepsine otomatik uygulanır).

**Hata ayıklama kolaylığı** için minimum:

- Her log satırında `request_id` + `tenant_id` + `module` + `action`
- Her exception merkezi `http-exception.filter.ts`'ten geçer ve UI'ya **anlamlı** mesaj döner ("Bir hata oluştu" yasak)
- Her BullMQ job'ı bir kayıt bırakır (start / success / fail + retry sayısı)
- UI'da error state'ler debug için `request_id`'yi gösterir

**Frontend tarafı da semantik ayrımla** (her modül için):

```
apps/admin/src/
├─ routes/<module>/          # TanStack route dosyaları (sadece composition)
├─ features/<module>/        # business component'ler + state (asıl iş)
│  ├─ <Module>List.tsx
│  ├─ <Module>Detail.tsx
│  ├─ use<Module>Query.ts    # TanStack Query hook
│  └─ <module>.api.ts        # api-client wrapper
├─ components/               # paylaşılan atom-level UI (sadece)
└─ lib/                      # paylaşılan util / context / hook
```

Route dosyaları HTML/JSX karmaşası içermez — `features/`'tan import eder.

---

## 6. Bu çalışmada YAPILACAK (TRANSFER)

Sıra teknik bağımlılığa göre: önce Identity (diğer her şey buna bağlı),
sonra Commerce / Operations / Mail / System / Extensions / Commissions.

### 6.1 Identity / Auth / RBAC — **SIFIRDAN YAZILACAK (transfer DEĞİL)**

> User + rol şeması ve auth katmanı **eski sistemden kopyalanmaz**. Yeni
> 5-katmanlı kullanıcı hiyerarşisi ve iki RBAC düzlemi sıfırdan yazılır.
> Eski `eagledtfprint/backend/src/{auth,team,accounts}/` kodu sadece
> **akış referansı** olarak okunabilir — transfer kaynağı değildir.

**Hedef kullanıcı modeli:**

```
Tenant ten_                        # mağaza / şirket
├─ Member tmbr_                    # iç ekip — admin app'e login
│  └─ MemberRole atamaları         # member_roles düzlemi
└─ Customer cust_                  # Shopify kaydı — login YOK
   └─ CustomerUser cusr_           # müşteri login'i — accounts app'e
      ├─ CustomerRole atamaları    # customer_roles düzlemi
      └─ SubUser csub_             # B2B alt hesap (spending cap'li)
```

**ID prefix:** `ten_`, `tmbr_`, `cust_`, `cusr_`, `csub_`, `mrol_`, `crol_`
(cuid2 + prefix).

**İki RBAC düzlemi:**
- `member_roles` → `owner / admin / agent / custom_xxx` (admin app erişimi)
- `customer_roles` → `b2b_admin / b2b_user / custom_xxx` (accounts app erişimi)

Yetki **role'a değil permission'a bağlıdır**. JWT payload'daki
`permissions[]` array'i üstünden `can('task.assign')` helper'ı veya
`@RequirePermission('customers.write')` guard'ı ile kontrol edilir.

**Request context (her endpoint için):**
```ts
{ tenant_id, principal_id, principal_type, permissions[] }
```

**TenantConfig modeli** (per-tenant entegrasyon ayarları, AES at-rest):
- Shopify: `shopifyDomain`, `shopifyAdminToken`, `shopifyApiKey`, `shopifyApiSecret`, `webhookHmacKey`
- Aircall: `aircallApiId`, `aircallApiToken`, `aircallWebhookSecret`
- AI: `anthropicApiKey` (opsiyonel, env override edilebilir)
- Mail: `resendApiKey`

**Yeni backend:**
- `services/backend/src/modules/identity/` (Tenant + Member + Customer + CustomerUser + SubUser CRUD, role assignments, TenantConfig)
- `services/backend/src/modules/auth/` (login + JWT issue + refresh + forgot/reset + invite + password set)
- `services/backend/src/shared/permissions.guard.ts`, `tenant-context.ts`, `crypto.service.ts`

**Yeni UI** (mock iskeletler mevcut, gerçek backend'e bağlanır):
- admin: `routes/login.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `routes/team/{users,users.add,roles}.tsx`
- accounts: `routes/{login,register,forgot-password,reset-password,team}.tsx`
- person: `views/auth/{Login,ForgotPassword,ResetPassword}View.tsx`

**Bu modül tamamlandığında çalışır akışlar:**
- Member login + forgot/reset
- Customer login + register + forgot/reset
- Admin'in Member ekleyip rol ataması + şifre tanımlaması **veya** email davet ile şifre kurdurtması (mail için 6.4.1 kullanılır)
- CustomerUser → SubUser oluşturma + role atama
- `tenantId` her query'de otomatik enforce (Prisma extension; modüller tabloya değil servise konuşur)
- `can('permission')` veya `@RequirePermission('permission')` tüm endpoint'lerde aktif

**Eski sistemde referans için okunabilir (transfer değil):**
- `eagledtfprint/backend/src/auth/` (auth + session + Shopify SSO akışları)
- `eagledtfprint/backend/src/team/` (permission registry + resolver mantığı)
- `eagledtfprint/backend/src/accounts/` (customer account akışı)
- `eagledtfprint/admin/app/sellerusers/`, `team/` (member UI akışı)

### 6.2 Commerce

| Sayfa | Eski backend | Eski admin UI | Yeni backend | Yeni UI |
|---|---|---|---|---|
| Orders | `eagledtfprint/backend/src/orders/` | `eagledtfprint/admin/app/orders/` | `services/backend/src/modules/orders/` | `apps/admin/src/routes/orders.tsx` |
| Customers | `eagledtfprint/backend/src/customers/` | `eagledtfprint/admin/app/customers/` | `services/backend/src/modules/customers/` | `apps/admin/src/routes/customers.tsx` |
| **B2B Discounts** (pricing rules **+ Discount Create**) | `eagledtfprint/backend/src/pricing/` (rule engine) + `eagledtfprint/backend/src/shopify/shopify-admin-discount.service.ts` (Shopify'a discount code push) | `eagledtfprint/admin/app/pricing/` | `services/backend/src/modules/pricing/` + `services/integrations/src/shopify/admin-discount.service.ts` | `apps/admin/src/routes/pricing.tsx` (rule listesi + Create akışı) |

> **B2B Discounts iki yarı:** (a) pricing rule motoru (segment / tag / role / customer hedefli kuralları üretir, qty break math), (b) **Discount Create** — Shopify Admin API üzerinden gerçek discount code basar. Eski sistemde aynı modül, aynı şekilde transfer edilir.

### 6.3 Operations

| Sayfa | Eski backend | Eski admin UI | Yeni backend | Yeni UI |
|---|---|---|---|---|
| Segments | `eagledtfprint/backend/src/segments/` | `eagledtfprint/admin/app/segments/` | `services/backend/src/modules/segments/` | `apps/admin/src/routes/segments/` |
| Support | `eagledtfprint/backend/src/service-requests/` | `eagledtfprint/admin/app/support/` | `services/backend/src/modules/support/` | `apps/admin/src/routes/support/` |
| **B2B Access Request** | `eagledtfprint/backend/src/b2b-access-requests/` (public form + admin onay akışı; onayda CustomerUser + `b2b_admin` rolü oluşturur, davet maili 6.4.1 ile gider) | `eagledtfprint/admin/app/b2b-requests/` (admin onay paneli) + accounts public form (`apps/accounts/src/routes/request-invitation.tsx` mevcut) | `services/backend/src/modules/b2b-access/` | `apps/admin/src/routes/b2b-requests.tsx` (yeni — sidebar'a `B2B applications` olarak eklenir) |

### 6.4 Mail — 3 ayrı yapı (KARIŞTIRMA)

> Eski sistemde mail tek bir modül değil, **3 farklı sorumluluğa** bölünmüş.
> Bu ayrımı bozma, yeni sisteme de aynı 3 modül olarak gelir.
> **Mail kaynağı tek nokta**: System mail (6.4.1). Tüm mail gönderimi
> (system + marketing) bu pipeline'dan çıkar.

#### 6.4.1 System mail (transactional) — MERKEZİ GÖNDERİM PIPELINE'I

Sipariş onayı, hesap doğrulama, şifre sıfırlama, davet, fatura gibi
**otomatik sistem maillerinin** tek merkezi gönderim hattı.
**Tüm uygulamalardan gelen mail buradan çıkar** — Identity (invite,
password reset), Commerce (order confirm), Support (reply), Mail
Marketing (campaign send) hepsi bu pipeline'a job düşürür.

- **Eski backend:** `eagledtfprint/backend/src/mail/`
  - `mail.service.ts` (Resend ile gönderim)
  - `mail-outbound.worker.ts` (BullMQ outbound queue)
  - `mail-center.controller.ts` (mail center admin endpoint'leri)
  - `mail-settings.service.ts` + `mail-settings.defaults.ts` (per-tenant Resend config)
  - `mail-category.helper.ts` (kategori sınıflandırma)
- **Yeni backend:** `services/backend/src/modules/mail/`
- **Yeni admin UI:** `apps/admin/src/routes/system-mail/` (mail center: queue durumu, son gönderimler, retry, settings)
- **Sidebar grubu:** yeni `TRANSACTIONAL MAIL` eklenir

#### 6.4.2 Email templates — PAYLAŞILAN TEMPLATE KÜTÜPHANESİ

System mail VE mail marketing'in **ortak kullandığı** template
kütüphanesi + designer + starter set + AI ile template üretimi.

- **Eski backend:** `eagledtfprint/backend/src/email-templates/`
  - `email-templates.service.ts`, `email-templates.controller.ts`
  - `email-template-ai.service.ts` (AI ile template üretimi)
  - `email-template.catalog.ts` + `email-template.starters.ts` (default starter set)
- **Eski admin UI:** `eagledtfprint/admin/app/email-templates/page.tsx` (881 satır) + `components/{CodeEditor,WorkspaceMenu}.tsx` + `types.ts` + `workspace-data.ts`
- **Yeni backend:** `services/backend/src/modules/email-templates/`
- **Yeni admin UI:** `apps/admin/src/routes/email-templates.tsx`
- **Sidebar:** `TRANSACTIONAL MAIL` grubuna eklenir

#### 6.4.3 Mail marketing — KAMPANYA / AUDIENCE / FLOW

Müşteri segmentlerine kampanya gönderimi, drip flow'ları, audience
tanımları, analytics. **System mail'den ayrı bir motor** — burası
marketing pipeline'ı, ama gönderim için 6.4.1'in queue'sunu kullanır.

- **Eski backend:** `eagledtfprint/backend/src/mail-marketing/`
  - `mail-marketing.service.ts` + `mail-marketing.controller.ts`
  - `mail-marketing-templates.service.ts` (marketing'e özel template katmanı, email-templates üstüne biner)
  - `mail-marketing-flows.service.ts` + `mail-marketing-flow.processor.ts` (BullMQ flow runner)
  - `mail-marketing-flow-events.listener.ts` (flow trigger event'leri)
  - `mail-marketing-analytics.service.ts`
  - `mail-marketing-settings.service.ts`
- **Eski admin UI:** `eagledtfprint/admin/app/mail-marketing/` — 7 workspace component (~5.700 satır):
  - `components/MailMarketingOverview.tsx`
  - `components/MailMarketingCampaignsWorkspace.tsx`
  - `components/AudiencesWorkspace.tsx`
  - `components/TemplatesWorkspace.tsx`
  - `components/MailMarketingFlowsWorkspace.tsx`
  - `components/MailMarketingAnalyticsWorkspace.tsx`
  - `components/MailMarketingSettingsWorkspace.tsx`
  - Alt sayfalar (`{campaigns,audiences,flows,analytics,settings,templates}/page.tsx`) hep 11 satır wrapper
- **Yeni backend:** `services/backend/src/modules/mail-marketing/`
- **Yeni admin UI:** `apps/admin/src/routes/mail-marketing/{index,campaigns,audiences,templates,flows,analytics,settings}.tsx`
- **Sidebar grubu:** yeni `MAIL & MARKETING` eklenir, eski paneldeki alt sayfa sıralamasıyla birebir

### 6.5 System — Integrations panosu + 3 sync pipeline

Sidebar'daki `SYSTEM` grubunda mevcut Aircall / AI keys / Shopify alt
girdilerinin **üstüne** genel `Integrations` sayfası eklenir, ve altta 3
backend sync pipeline'ı transfer edilir.

#### 6.5.1 Integrations panosu (UI)

- **Eski admin UI:** `eagledtfprint/admin/app/integrations/`
  - Servis kartları (Shopify · Aircall · AI · Resend · Postgres · Redis): bağlantı durumu, son senkronizasyon, reconnect butonu
- **Yeni admin UI:** `apps/admin/src/routes/settings/integrations.tsx`
- **Sidebar:** `SYSTEM` grubuna `Integrations` üst-girdi olarak eklenir

#### 6.5.2 Shopify sync (backend)

Customer / Order / Product senkronizasyonu + webhook ingestion. Multi-tenant.

- **Eski backend:**
  - `eagledtfprint/backend/src/shopify/` (ana modül):
    - `shopify.service.ts`, `shopify-graphql.service.ts`, `shopify-rest.service.ts`
    - `shopify-customer-sync.service.ts`
    - `shopify-token-refresh.service.ts`, `shopify-sso.service.ts`
    - `shopify-storefront.service.ts`, `shopify-admin-discount.service.ts`
  - `eagledtfprint/backend/src/sync/workers/`:
    - `customers-sync.worker.ts`
    - `orders-sync.worker.ts`
    - `products-sync.worker.ts`
  - `eagledtfprint/backend/src/sync/` (`sync.service.ts`, `sync-state.service.ts`, `sync.controller.ts`)
  - `eagledtfprint/backend/src/webhooks/` (`shopify-webhook-sync.service.ts` + `handlers/`)
- **Yeni:**
  - `services/integrations/src/shopify/` — saf integration katmanı: HTTP client + GraphQL + REST + customer-sync + token-refresh + SSO + storefront + admin-discount
  - `services/backend/src/modules/sync/` — business orchestration + workers + state (`services/integrations/shopify` çağırır)
  - `services/backend/src/modules/webhooks/shopify/` — webhook controller + handler dispatch

#### 6.5.3 Aircall sync (backend) + **Member ↔ Aircall user binding**

Çağrı ingestion, transcript pull, customer resolution, webhook + sweeper +
metric collection. Ayrıca **admin'de eklenen Member, Aircall kullanıcısına
buradan bağlanır** (kullanıcı oluşturma sırasında veya sonradan
`/settings/aircall/users` üstünden).

- **Eski backend:** `eagledtfprint/backend/src/aircall/`
  - `aircall.client.ts` (HTTP client)
  - `aircall-ingest.service.ts` + `aircall-ingest.processor.ts` (BullMQ ingest)
  - `aircall-sync.service.ts` (periodic sync)
  - `aircall-webhook.controller.ts` + `aircall-event-handlers.service.ts`
  - `aircall-transcript.service.ts` + `aircall-transcript.formatter.ts` + `aircall-transcript-ai.scheduler.ts`
  - `aircall-sweeper.service.ts` (failed call retry)
  - `aircall-metrics.service.ts`
  - `customer-resolution.service.ts` (telefon → customer mapping)
  - `phone.util.ts`
- **Eski admin UI:** `eagledtfprint/admin/app/integrations/aircall/page.tsx` (5 tab: connection, users, numbers, webhooks, sync logs — users tab'ında Member ↔ Aircall user eşleme tablosu var)
- **Yeni:**
  - `services/integrations/src/aircall/` — saf integration: `aircall.client.ts`, transcript pull/format, sweeper, phone util
  - `services/backend/src/modules/aircall/` — business: ingest + sync + webhook + customer-resolution + metrics + Member↔Aircall user binding
- **Yeni admin UI:**
  - `apps/admin/src/routes/settings/aircall/{connection,users,numbers,webhooks,sync-logs}.tsx` (mock mevcut, gerçek backend bağlanır)
  - `apps/admin/src/routes/team/users.add.tsx` invite akışına Aircall user dropdown'u eklenir (opsiyonel — sonradan da bağlanabilir)

#### 6.5.4 AI sync (backend) — **PROMPT REGISTRY HARİÇ**

Claude (Anthropic) çağrı pipeline'ı, per-tenant config, budget tracking,
usage log, kill switch, circuit breaker.

- **Eski backend:** `eagledtfprint/backend/src/ai-core/`
  - **TRANSFER:**
    - `ai-core.service.ts` (ana Claude client)
    - `ai-core.types.ts`
    - `ai-pricing.ts` (model maliyet hesabı)
    - `ai-settings.service.ts` + `ai-settings.defaults.ts` (per-tenant config)
    - `ai-task.service.ts` (AI task wrapper)
    - `customer-context.service.ts` (Claude'a verilen context builder)
    - `ai-hub.controller.ts`
  - **TRANSFER YOK (BİZ kendi prompt'larımızı sıfırdan yazacağız):**
    - `ai-prompt-registry.service.ts`
    - `seeds/` (eski sistemin başlangıç prompt'ları)
- **Yeni:**
  - `services/integrations/src/ai/` — saf integration: Claude client + `ai-pricing.ts`
  - `services/backend/src/modules/ai/` — business: settings + task wrapper + customer-context + ai-hub controller + budget + circuit breaker (**prompt registry hariç**)

> AI prompt'ları eski sistemden kopyalanmaz. Yeni sistemde hangi task'ı
> hangi prompt'la çözeceğimize **biz karar veririz**, yeni baştan yazılır.

### 6.6 Storefront extensions (analiz extension'ları HARİÇ)

Shopify mağazasına yüklenen extension'lar. Bu çalışmada **analiz/tracking
extension'ları HARİÇ** geri kalan extension'lar olduğu gibi transfer edilir.

| Extension | Eski yol | Yeni yol | Bu transferde? |
|---|---|---|---|
| `customer-account-extension` | `eagledtfprint/extensions/customer-account-extension/` | `services/integrations/src/shopify/extensions/customer-account-extension/` | ✅ EVET |
| `pricing-kernel-discount` | `eagledtfprint/extensions/pricing-kernel-discount/` | `services/integrations/src/shopify/extensions/pricing-kernel-discount/` | ✅ EVET |
| `eagle-tracking` | `eagledtfprint/extensions/eagle-tracking/` | – | ❌ **HAYIR** — analiz tracking extension'ı, bu çalışmaya dahil değil |

---

## 7. Bu çalışmada YAPILMAYACAK

> **AGENT İÇİN ANA KURAL:** Bu doc'ta **açıkça transfer edilecek** olarak
> listelenmeyen hiçbir şey transfer edilmez. Eski sistem büyük ve dolu —
> sadece 6'daki maddeleri al, gerisini **görmezden gel**. Şüphe varsa
> kullanıcıya sor; bahsi geçmeyen bir modülü kendi inisiyatifinle
> ekleme. Eski sistemin tamamını taşıma çabası **yasak**.

### 7.1 Yeniden tasarımla (TM çalışmasında) ele alınacaklar

| Madde | Niye dışarıda |
|---|---|
| **Task Management** | Yeniden tasarım. Aircall transcript → AI extraction → task ekosistem omurgası. Ayrı doc: [TASK_MANAGEMENT.md](./TASK_MANAGEMENT.md). |
| **Rule engine (runtime)** | TM'e bağlı runtime. UI prototype `/rules` mevcut (`ENGINE NOT CONNECTED`) — dokunulmaz. |
| **AI prompt registry + seeds** | Yeni sistemde hangi task hangi prompt'la çözülecek **BİZ karar veririz**. Eski prompt'lar kopyalanmaz. |
| **Commissions** | Kullanıcı spec'inde yok. UI mock'u `team/commissions.tsx` dokunulmaz. |
| **Person app sayfaları** (Messages · Calendar · Notes · Announcements · Email · Notifications · CallQueue) | Eski backend'de karşılığı yok, kullanıcı spec'inde yok. UI mock'ları dokunulmaz. CallQueue TM'e bağlı. |

### 7.2 Eski sistemde olup ASLA dokunulmayacak modüller

Aşağıdakiler eski `eagledtfprint/backend/src/`'te mevcuttur ama kullanıcı
**hiç bahsetmedi** → bu çalışmaya **dahil değil**. Yeni `services/`'e
**kopyalanmaz**:

| Eski klasör | Ne işe yarar | Neden YOK |
|---|---|---|
| `eagledtfprint/backend/src/dittofeed/` | Dittofeed (3rd party customer engagement) entegrasyonu | Kullanıcı bahsetmedi — yeni sistemde Dittofeed yok |
| `eagledtfprint/backend/src/event-bus/` | Internal pub/sub | Kullanıcı bahsetmedi |
| `eagledtfprint/backend/src/events/` | Event helpers | Kullanıcı bahsetmedi |
| `eagledtfprint/backend/src/notifications/` (özellikle `notifications.gateway.ts`) | Realtime WebSocket gateway | Kullanıcı bahsetmedi |
| `eagledtfprint/backend/src/fingerprint/` | Browser fingerprint / anti-fraud | Kullanıcı bahsetmedi |
| `eagledtfprint/extensions/eagle-tracking/` | Analiz tracking extension | Analiz extension'ları HARİÇ (6.6) |
| Penpot entegrasyonu (varsa) | Tasarım aracı | Kullanıcı bahsetmedi |
| `eagledtfprint/backend/src/` altındaki diğer tüm klasörler: `abandoned-carts/`, `accountscompany/`, `addresses/`, `analytics/`, `b2b-context/`, `calls/`, `carts/`, `catalog/`, `checkout/`, `commerce/`, `companies/`, `customer-account/`, `invoices/`, `mcp/`, `merchants/`, `multi-store/`, `partners/`, `pickup/`, `quotes/`, `sales/`, `sales-cs-panel/`, `sales-mockup-parity/`, `scheduler/`, `selleruser/`, `server-maintenance-billing/`, `settings/`, `shopify-customers/`, `storefront-features/`, `storefront-forms/`, `storefront/`, `support-tickets/`, `team-hub/`, `transactional-emails/`, `uploads/`, `wishlist/` | Çeşitli | Kullanıcı bahsetmedi — **hepsi atlanır** |

Bu tabloyu **mecazi değil literal** olarak oku. Listedeki bir klasörden
ihtiyaç olduğunu **kendi başına** karar verme. Kullanıcı söylemediyse YOK.

Bu listedeki bir şeye dokunma gerekirse **önce kullanıcıya sor**. Bu doc'a
eklenmedikçe transfer / kod yazımı **başlatma**.
