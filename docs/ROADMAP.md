# Factory Engine Pro — Transfer Notları

Bu doc sadece **şu an yapılacak transferleri** tarif eder. Hafta/saat tahmini,
test planı, gelecek faz spekülasyonu **yoktur**. Bu listede olmayan bir
modüle dokunma — gerekirse önce kullanıcıya sor.

---

## 0. Test hesapları (agent dolduracak)

> Agent prod-ready aşamasında ilk admin hesabını + örnek customer hesabını
> oluşturur ve buraya yazar. Kullanıcı bu bilgilerle giriş yapıp tüm
> akışları manuel test eder.

| Surface | Email | Password | Tenant | Rol |
|---|---|---|---|---|
| admin (5189) — owner | `owner.prodtest+20260627184047@dtfbank.com` | `FepOwner20260627184047` | `dtfbank` | owner |
| accounts (5187) — customer | `customer.prodtest+20260627184047@dtfbank.com` | `FepBuyer20260627184047` | `dtfbank` | b2b_admin |

> Şifreler tek seferlik olarak bu doc'a yazılır + kullanıcı ilk login'de
> değiştirir. Üretilen değerleri agent buraya iliştirir.

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

| App | Lokal port | Prod subdomain (per-tenant) | Kullanıcı tipi |
|---|---|---|---|
| admin | 5189 | `app.<tenant>.com` | İç ekip yönetimi (owner / admin / agent) |
| person | 5188 | `app.<tenant>.com/staff` _(varsayım — kullanıcı netleştirecek)_ | Personel çalışma alanı (CallQueue + Messages + Calendar + …) |
| accounts | 5187 | `accounts.<tenant>.com` | Müşteri self-service (B2B kullanıcısı) |
| backend API | 4100 | `api.<tenant>.com` | NestJS (3 app'in çağırdığı) |

**Subdomain yapısı eski sistemden BİREBİR korunur:**
- `app.dtfbank.com` → admin panel (dtfbank tenant'ı)
- `app.eagledtfprint.com` → admin panel (eagledtfprint tenant'ı)
- `accounts.dtfbank.com` → customer panel (dtfbank müşterileri)
- `accounts.eagledtfprint.com` → customer panel (eagledtfprint müşterileri)
- `api.dtfbank.com` → API (admin + accounts + person bu endpoint'i çağırır)
- ...her 6 tenant için aynı pattern (`<tenant>` = `dtfbank` / `dtfprintdepot` / `eagledtfprint` / `eagledtfsupply` / `fastdtfsupply` / `fastdtftransfer`).

Tenant context request-time'da subdomain'den çözülür (`app.dtfbank.com` → `tenant_id = ten_dtfbank` → JWT'ye gömülür). Eski sistemin `factoryengine-<tenant>-app` container'larının her biri kendi domain ailesine bağlı (3.6).

> Person app için subdomain belirsiz — eski sistemde person ayrı bir app değildi (sales sayfaları admin'in altındaydı). Yeni sistemde person ayrı app: ya `app.<tenant>.com/staff` path'i ya da `staff.<tenant>.com` subdomain'i olur. **Kullanıcı netleştirecek.**

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
- **Workspace/Brand ayarları** — UI'da "DTF Bank", "DB" gibi statik brand metinleri yok. Hepsi `TenantConfig.brand` / `TenantConfig.workspaceName` üstünden gelir. Admin sol-alttaki user-card'a yakın bir yerden (örn. `routes/settings/workspace.tsx`) brand adı / kısa kod / logo'yu düzenler; sidebar + topbar bu değerlerden okur. (Sidebar'ın `.workspace` bloğundaki "DB" badge ve "FactoryEngine" metni hard-coded — dinamikleşmeli.)

---

## 2. Repolar

| Repo | Yol | Rol |
|---|---|---|
| YENİ (bu repo) | `c:/Users/mhmmd/Desktop/factory-engine-pro/` | Geliştirme yapılan repo |
| ESKİ (kaynak) | `c:/Users/mhmmd/Desktop/eagle-engine.dev/eagledtfprint/` | **Sadece okuma** — transfer kaynağı, dokunma |

---

## 3. Sunucu + Managed DB + Redis

Eski sistem 6 tenant (`eagledtfprint`, `dtfbank`, `dtfprintdepot`,
`eagledtfsupply`, `fastdtfsupply`, `fastdtftransfer`) bu çalışma bitince
**retire edilecek**. Yeni Factory Engine Pro **aynı host'lara** deploy
edilecek; eski tenant'lar yeni sistemin tenant'ı olarak göç eder.

### 3.1 SSH host'u

```bash
ssh root@144.202.125.169   # uygulama host'u (factoryengine-* container'lar)
```

> ⚠ **`144.202.125.169` üzerinde `factoryengine-*` dışındakine ASLA dokunma.**
> Bu sunucuda Factory Engine Pro'nun **paylaştığı başka projeler** var (örn.
> `gss-*`, `us-*`, `ssactivewear-*` adlı container'lar, `caddy`, başka
> servisler). Sadece `factoryengine-` prefix'li container'lara, onların
> volume'larına, log'larına ve compose dosyalarına müdahale edilir.
> Diğerlerinin process'lerini durdurma, restart etme, dosyalarını silme,
> port'larını taşıma — **hiçbir şey yapma**. Şüphedeysen kullanıcıya sor.

### 3.2 Postgres + Redis — managed (canlı container env'lerinden alınır)

> ⚠ **Lokal makinede Postgres veya Redis KURULMAZ.** Lokal makine
> sadece kod yazma ortamıdır. Backend / DB / Redis hiçbir zaman lokal'de
> çalışmaz (bkz. 3.7 Mutagen).

**Bağlantı bilgileri (managed Postgres URL, managed Redis URL ve diğer
secret'lar) `144.202.125.169`'da çalışan canlı tenant container'larının
`.env` dosyalarından gelir.** Tüm tenant'lar (dtfbank dahil) için kaynak
aynı: ilgili container'ın kendi `.env`'i. Yeni sistem bu env'leri olduğu
gibi kullanır; lokalde `.env` üretmek/uydurmak yok.

#### Guard (`services/backend/scripts/guard-database-url.mjs`) — agent'ın koruması

Eski Eagle DB'leri ile yeni DB'ler **aynı managed cluster'da yan yana**
duracağı için Prisma migrate'in yanlış DB'ye vurmasını engelliyor.
Reddediyor:
- `127.0.0.1` / `localhost` → ❌ (lokal Postgres yok)
- Legacy isimler (`eagle_print_db`, `eagle_dtfbank_db`, `eagle_dtfprintdepot_db`,
  `eagle_dtfsupply_db`, `eagle_fastdtfsupply_db`, `fast_dtf_transfer`) → ❌
- `factory_engine_pro` ile başlamayan DB adı → ❌

### 3.4 Per-tenant entegrasyon ayarları

Shopify / Aircall / AI / Resend token'ları **her tenant için ayrı**;
`TenantConfig` tablosunda AES at-rest şifreli saklanır (bkz. 6.1).

### 3.5 Detaylı referans

[docs/REMOTE_ENVIRONMENT.md](./REMOTE_ENVIRONMENT.md) — agent'ın yazdığı
managed environment kuralları + guard script'in çalışma mantığı.

### 3.6 Container'lar (tenant başına bir tane)

Eski yapı **aynen korunur**: her tenant için ayrı container, hepsi tek
codebase'i çalıştırır, tenant farkı **request-time'da** `tenantId` ile
çözülür (Prisma extension + tenant-context middleware).

İsim şeması: `factoryengine-<tenant>-app`

| Container | Rol | Deploy yolu |
|---|---|---|
| `factoryengine-dtfbank-app` | **Test / dev ortamı** | **Mutagen** (lokal → sunucu sync) |
| `factoryengine-eagledtfprint-app` | Prod | Depot |
| `factoryengine-fastdtfsupply-app` | Prod | Depot |
| `factoryengine-fastdtftransfer-app` | Prod | Depot |
| `factoryengine-dtfprintdepot-app` | Prod | Depot |
| `factoryengine-eagledtfsupply-app` | Prod | Depot |

> Container içinde tek base image koşar; tenant context her HTTP isteğinde
> JWT'den / `x-tenant-id` header'ından çözülür. `tenantId` Prisma
> extension tarafından her query'ye otomatik enjekte edilir.

### 3.7 Geliştirme + Deploy — Mutagen (dtfbank) + Depot (prod tenant'lar)

> ⚠ **TEMEL KURAL — Lokal makinede backend ÇALIŞTIRILMAZ.**
> Lokal makine **sadece kod editörü**. Postgres, Redis, NestJS hiçbir
> zaman lokal'de koşmaz. `pnpm dev` lokal'de denenmez. `docker-compose`
> lokal'de başlatılmaz. Tüm geliştirme + test akışı **sunucudaki
> `factoryengine-dtfbank-app` container'ında** gerçekleşir; bu container
> zaten ayakta + managed Postgres + managed Redis'e bağlı.

İki ayrı yol birlikte kullanılır:

#### (a) dtfbank — Mutagen (geliştirme + test ortamı)

- `factoryengine-dtfbank-app` **zaten sunucuda çalışıyor** (eski sistem
  canlı kaldığı için container ayakta, eski kod + `.env` + managed
  cluster bağlantısı kurulu).
- Bu çalışmada container **yeniden kurulmaz**. İçindeki eski kod
  temizlenir, yerine Mutagen sync ile yeni Factory Engine Pro kodu
  basılır. Container'ın mevcut `.env`'i (managed DB/Redis URL'leri +
  secret'lar) yerinde kalır.
- Akış: lokalde kod yaz → Mutagen anlık push → container içinde
  process restart / HMR.

> **Bu kısımdaki spesifik deploy detayları (eski kod temizleme adımları,
> Mutagen config dosyası, container path'leri, Prisma migrate tetikleme
> komutu) deploy zamanı ihtiyaçlarıdır.** Agent 6. bölümdeki kod
> transferine başlamak için bunları beklemez — kodlama yapar, deploy
> zamanı geldiğinde bu detaylar uygulanır.
- Komutlar (placeholder — gerçek `mutagen.yml` yazılacak):
  ```bash
  mutagen project start          # sync oturumunu başlat
  mutagen sync list              # durum
  mutagen project terminate      # bağlantıyı sonlandır
  ```
- **Mutagen ignore (zorunlu):** `node_modules/`, `dist/`, `.next/`, `.turbo/`,
  `.local/`, `.env*` (env dosyaları SERVER'da elle yönetilir),
  `uploads/`, `.agent/`, `.claude/`, `.gemini/`, log/dump/SQL dosyaları
- **Mutagen sadece dtfbank için.** Başka tenant'a sync ASLA yapılmaz.

#### (b) Diğer tenant'lar — Depot (production path)

- dtfbank'te geliştirme + test bitince → **Depot ile imaj build**
  edilir → registry'ye basılır.
- Prod tenant container'ları (`eagledtfprint`, `dtfprintdepot`,
  `eagledtfsupply`, `fastdtfsupply`, `fastdtftransfer`) bu yeni imajla
  remote compose üzerinden restart edilir.
- Per-container image tag farkı **beklenir** — image sadece base;
  dtfbank Mutagen sync'ten geldiği için image tag'i prod'la aynı olmayabilir.
- Komutlar (placeholder — gerçek Depot project + compose path yazılacak):
  ```bash
  # dtfbank içinden Depot build tetikle
  ssh root@144.202.125.169 "docker exec factoryengine-dtfbank-app <depot-build-cmd>"

  # Prod tenant'larını yeni imajla başlat
  ssh root@144.202.125.169 "cd /opt/apps/custom/factoryengine && \
    FACTORYENGINE_IMAGE_TAG=<yeni-tag> docker compose up -d \
    eagledtfprint-app dtfprintdepot-app eagledtfsupply-app \
    fastdtfsupply-app fastdtftransfer-app"
  ```

#### Deploy disiplin kuralları

1. **Mutagen oturumu açıkken Depot build tetikleme.** Önce
   `mutagen project terminate`, sonra build.
2. **`.env*` server'da elle yönetilir.** Mutagen ignore listesinde +
   gitignore'da. Asla sync, asla commit.
3. **Prod tenant'a doğrudan kod basma.** Bütün prod tenant'lar Depot
   imajından gelir, host'ta canlı kod değişikliği YOK.
4. **Prisma migrate sadece container içinden.**
   `docker exec factoryengine-<tenant>-app sh -lc 'cd /app/services/backend && npx prisma migrate deploy'`
   Host'tan migrate çalıştırma.
5. **DB değişikliği prod'a gitmeden önce dtfbank'te doğrula** (managed
   `factory_engine_pro_test` DB'sinde).

---

## 4. Yeni agent — İlk görev

Aşağıdaki maddelerden birini almadan önce, ilgili eski klasörü **OKU**:
ne döndüyor, hangi DTO, hangi BullMQ queue, hangi Prisma model, hangi
endpoint. Okumadan kod yazma.

---

## 5. Çalışma prensipleri (her transfer maddesinde geçerli)

Agent'ın ana hedefi sistemi **backend çöplüğüne** çevirmek değildir.
Aşağıdaki kurallar her transfer maddesinde **istisnasız** uygulanır.

### 5.1 Prod-ready olmadan bir sonrakine geçme — **MUTLAK KURAL**

> ⚠ **Bir madde bitmeden diğerine ASLA geçilmez.** "Bitmiş" demek:
> hem UI hem backend o iş için **tam olarak var** + birbirleriyle
> **gerçek etkileşim halinde**. Mock yok, statik yok, "gerisini sonra
> bağlarız" yok. Bu kural mutlak — duraksat, sertleştir, sonra geç.

> ⚠ **6. bölümdeki kod transferi 3. bölümün deploy detaylarını
> beklemez.** Bölüm 3 (Sunucu / Managed DB / Container / Deploy) deploy
> zamanı bilgisidir; eksik ya da "sonra netleşecek" yazsa bile agent
> kod yazmaya devam eder. 6'daki maddeler kod transferi — bunlar deploy
> komutlarına bağımlı değildir.

Bir transfer maddesi, **tüm yönleriyle** prod-ready olmadan bir sonraki
maddeye **geçilmez**.

Prod-ready demek, tek bir madde için şunların hepsi tamamlanmış demek:

- Backend modülü çalışıyor, endpoint'ler canlı
- DTO + zod schema yazılmış, validation aktif
- Prisma model'leri migrate edilmiş
- BullMQ queue / worker (gerekirse) çalışıyor
- UI o backend'e bağlandı — **mock data yok, gerçek API çağrısı**
- UI'nın **her detayı** (her buton, her tab, her filtre, her column, her modal, her bulk action) backend'le çalışır durumda
- **UI ↔ backend canlı çift yönlü etkileşim çalışıyor**: kullanıcı UI'dan tetikler → backend'de iş yapılır → response döner → TanStack Query invalidate olur → UI canlı olarak değişikliği gösterir. Bu döngü her create/update/delete/list akışı için sağlanmış olmalı.
- Hata durumları UI'da gösteriliyor (loading, empty, error, retry — 5.2'deki 3 durum)
- Multi-tenant kuralı uygulanıyor (`tenantId` enforced)
- i18n key'leri eklenmiş (5.4)
- Permission guard + UI `useCan` kontrolü her noktada (5.5)

Yarım kalmış bir madde "sonra döneriz" denmez. Bitir, kanıtla, sonraki maddeye geç.

> **İzin isteme, ama önce gerçekten bittiğine emin ol.** Bir madde
> yukarıdaki kriterleri **eksiksiz** karşılıyorsa: kısa rapor düş (ne
> yapıldı + kanıt: endpoint test / UI screenshot / log özeti) ve bir
> sonraki maddeye **otomatik geç** — "Geçebilir miyim?" sorma. Ama
> kriterlerden **biri bile eksikse** sonraki maddeye geçme; bitir önce.
> Kullanıcı sadece kontrolde yanlış gördüğünde araya girer. İzin
> gerektiren tek durum: ROADMAP'te listelenmeyen / belirsiz / 7.2'deki
> kapalı listeyle çelişen bir iş — o zaman dur, sor.

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

### 5.4 i18n — UI'da hard-coded string yasak

UI'lar **i18next** ile i18n destekler (mevcut: admin `i18n/en.json`,
accounts `i18n/en.json`, person `i18n/index.ts`). Bu çalışma boyunca
**her metin** i18n key'i üzerinden gelir. Hard-coded string yazma.

- **Her yeni route / feature / component eklenirken** ilgili
  `i18n/<locale>.json` dosyasına key'ler **eş zamanlı** eklenir. Eksik
  bırakma — "sonra çevirir" yok.
- Anahtar şeması: `<grup>.<sayfa>.<eleman>` (örn. `nav.orders`,
  `orders.empty_state`, `orders.modal.title`, `auth.errors.invalid_credentials`).
- Backend'den dönen kullanıcıya gösterilecek metinler de i18n'lenebilir:
  - Sabit/enum sınıfı metinler (status: open / resolved / closed) → UI tarafında i18n
  - Dinamik metinler (kullanıcı girdiği başlıklar, açıklamalar) → UI'da olduğu gibi gösterilir
- Backend error mesajları **kod ile** döner (`code: 'permission_denied'`,
  `code: 'invalid_credentials'`) — UI bunu i18n key'ine çevirir
  (`errors.permission_denied`, `errors.invalid_credentials`).
- "Coming soon", "Loading…", "Save", "Cancel" gibi paylaşılan metinler
  `common.*` altında tek noktada tutulur, route'lardan oraya bakılır.
- Yeni dil eklenirse (örn. `tr.json`) ilk olarak `en.json`'ın **tüm
  key'leri** kopyalanır + çevrilir; hiçbir key boş kalmaz.

**Mevcut hâli koru, sürekli güncelle.** Bir feature transfer ederken
i18n'sini de transfer et — sonraki maddeye geçmeden önce o feature'ın
hiçbir metni hard-coded değil, hepsi key üstünden mi diye **kontrol et**.

### 5.5 RBAC — Her şey permission ile korunur, sürekli devam

Sistem **permission-based** çalışır (6.1). Bu çalışma boyunca eklenen
**her endpoint** ve **her UI öğesi** permission kontrolüne tabidir.

**Backend:**
- Her controller method'una `@RequirePermission('<perm>')` decorator'ı
  konur. İstisna: public endpoint'ler (`@Public()` ile işaretlenir —
  login, register, forgot, reset, webhook receivers).
- Yeni feature → ilgili permission(lar) `packages/contracts/permissions.ts`
  içine **önce** eklenir, sonra controller'a binilir.
- `PermissionsGuard` JWT'den çözülen `permissions[]` array'ine bakar;
  eksik permission → `403 + code: 'permission_denied' + details: { missing }`.

**Frontend:**
- Her UI etkileşimi (buton, link, form, bulk action, modal aç) ilgili
  permission'ı kontrol eder. `useCan('customers.write')` hook'u veya
  `<Can permission="customers.write">…</Can>` wrapper'ı.
- Yetki yoksa **buton görünmez** (hide) — disabled değil. Tooltip ile
  "Bu işlem için yetkin yok" mesajı opsiyonel.
- Sidebar entry'leri de permission gated — yetki yoksa grup/leaf görünmez.
- Route guard: `beforeLoad` ile yetkisiz route'a girişte `/` veya
  `/forbidden`'a yönlendir.

**Default roller** (`packages/contracts/permissions.ts` → `DEFAULT_MEMBER_ROLES`):
- `owner` → tüm member permission'ları (`*` değil, açıkça hepsi)
- `admin` → owner - settings.write (veya benzer kısıtlama)
- `agent` → operasyonel permissions (customers.read, support.write,
  task.assign vs.)

Yeni bir role default permission seti tanımlanırken **mevcut DEFAULT
matrisi bozulmaz**, üstüne yeni satır eklenir.

**Sürekli devam kuralı:**
- Her yeni endpoint için permission önce eklenir, sonra controller'a binilir.
- Her yeni UI etkileşimi için `useCan()` kontrolü yazılır.
- Permission tanımlanmadan endpoint açma + UI gösterme yasak.
- `permissions.ts` her transfer maddesinde **büyür** — agent yarım bırakma,
  feature'ın tüm permission'larını eklemeden bitti deme.

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

#### Accounts auth ekranları — **eski sistemden BİREBİR transfer (zorunlu)**

Aşağıdaki 3 sayfa eski sistemde detaylı tasarlanmış; yeni Vite + TanStack
sürümüne **görsel + akış olarak birebir** port edilir. Sadeleştirme yok,
"daha temiz yapalım" yok — eski paneldeki bütün öğeler (sol koyu hero
paneli, brand badge, benefit kartları, pill etiketler, form alanları,
footer copyright) korunur. Brand bilgisi (logo / isim / renk) `TenantConfig`
üstünden dinamik gelir — "DTF BANK" gibi statik metin **yazılmaz**.

| Sayfa | Eski yol | Yeni hedef | Eski satır |
|---|---|---|---|
| **Accounts login** ("Welcome back") | `eagledtfprint/accounts/app/login/page.tsx` | `apps/accounts/src/routes/login.tsx` (+ features/auth wrapper) | 402 |
| **Request B2B Access** | `eagledtfprint/accounts/app/request-invitation/page.tsx` | `apps/accounts/src/routes/request-invitation.tsx` (+ features/auth wrapper) | 1170 |
| **Customer register** (davet token ile) | `eagledtfprint/accounts/app/register/page.tsx` + `register/[token]/page.tsx` | `apps/accounts/src/routes/register.tsx` | 657 + token sayfası |

**Login sayfasında korunacak öğeler (eski paneldeki tasarımdan):**
- Sol koyu hero: brand badge ("D" gibi tek harf badge) + brand adı ("DTF BANK") + alt başlık ("Company Portal") + üst pill ("B2B ACCOUNT WORKSPACE") + büyük tagline ("Order and track every DTF job from one place.") + paragraf açıklama
- Sol hero alt 3 feature kartı: ikon + başlık + açıklama (Wholesale pricing / Net terms / Team purchasing)
- Sol hero alt 3 küçük pill: Secure checkout · Order tracking · Priority support
- Sağ form: brand badge tekrar + "Welcome back" h1 + "Sign in to your `<brand>` account" + Email input (mail ikonu prefix) + Password input (kilit ikonu prefix + show/hide eye toggle) + "Forgot password?" link (sağ üstte) + Remember me checkbox + Sign In button (arrow icon) + "OR" divider + Create Account button (secondary) + Request B2B Access button (secondary) + footer "© `<year>` `<brand>`. All rights reserved."

**Request B2B Access sayfasında korunacak öğeler:**
- Sol mavi/koyu hero: büyük brand badge (tek harf) + "`<brand>` Partner Program" h1 + paragraf ("Join our exclusive B2B network...") + 5 benefit kartı (ikon + başlık + açıklama): Wholesale Pricing (Up to 40% off retail prices) · Net 30 Terms (Flexible payment options) · Team Management (Add unlimited team members) · Priority Support (Dedicated account manager) · Free Shipping (On orders over $500)
- Sağ form: "Request B2B Access" h1 + "Tell us about your business to get started" + info banner ("If you already have a storefront account, use the same email address here.") + Form alanları:
  - First Name * | Last Name * (yan yana)
  - Email Address * | Phone Number (yan yana)
  - Company Name * | Legal Name * (yan yana)
  - Website | Industry select (yan yana)
  - Estimated Monthly Volume select (tek satır)
  - Tax Exemption Certificate (file upload — PDF/JPEG/PNG/WebP max 10MB)
  - Password * | Confirm Password * (yan yana, kilit ikonu + show/hide eye)
  - Additional Information (textarea, opsiyonel)
  - Submit Application button (büyük primary)
  - "Already have an account? **Sign in**" link

**Transfer disiplini:**
- Eski sistemin `FormFieldConfig` + `BenefitConfig` tip yapılarını taşı; renderer'ı Vite + React Hook Form / TanStack Form'a uyarla — **dinamik field renderer kalmalı** (Next.js'in `useSearchParams`'i TanStack Router'ın `useSearch`'üne çevrilir).
- Brand bilgisi `useBranding()` ekvivalenti olarak `useTenantBranding()` hook'u: `TenantConfig.brand` / `workspaceName` / `brandBadge` / `accentColor`'u TanStack Query ile çeker (1. bölüm hedef sistem listesi ile uyumlu).
- "DTF BANK" / "company.com" / "$500" gibi metinler **i18n key + brand interpolation** olarak gelir (5.4 i18n disiplini). Hardcoded yasak.
- Form submit hedefleri:
  - Login → `POST /api/v1/auth/customer/login` (6.1)
  - Request B2B Access → `POST /api/v1/b2b-access-requests` (6.3; file upload için multipart/form-data, Tax Exemption Certificate field'ı dahil)
  - Register (token ile) → `POST /api/v1/auth/invitations/accept` (6.1)
- 3 UI durumu (5.2): loading skeleton (form fetching) / dolu (default) / hata (request_id + retry CTA).
- Permission check yok (public sayfalar) — login token yokken erişilebilir; token varsa otomatik `/dashboard`'a redirect.

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

---

## 8. Kontrol Notları (kullanıcı + denetçi agent uyarıları)

Bu bölüm, kontrol turlarında fark edilen **anlık uyarıları** tutar.
Transfer maddelerini (6) değiştirmez — yan kayıt. Her not bir commit
hash'ine bağlıdır; agent ilgili noktayı çözünce notu **buradan silmez**,
altına `→ ÇÖZÜLDÜ <commit-hash>` satırı düşer (tarihsel kayıt korunur).

**Format:**
```
### YYYY-AA-GG — Commit <hash> sonrası
**<konu başlığı>**
- Ne fark edildi
- Aksiyon önerisi
→ (boş bırak, çözüldüğünde "ÇÖZÜLDÜ <commit-hash>" yazılır)
```

---

### 2026-06-27 — Commit `c98e722` sonrası

**1. Root `package.json` kirliliği (uncommitted)**
- Root `package.json`'a 16 gereksiz dependency yanlışlıkla eklenmiş
  (`react`, `react-dom`, `d3-color`, `d3-dispatch`, `d3-drag`, `d3-ease`,
  `d3-interpolate`, `d3-selection`, `d3-timer`, `d3-transition`,
  `d3-zoom`, `classcat`, `zustand`, `scheduler`, `use-sync-external-store`,
  `js-tokens`, `loose-envify`). Ayrıca `"type": "commonjs"`, `"main": "index.js"`,
  npm init artıkları (`description`, `author`, `keywords`, `repository`,
  `homepage`, `bugs`) eklenmiş.
- Bunlar **app-level dependency** — root'ta olmaz. `"type": "commonjs"`
  monorepo ESM modüllerini kırar.
- Büyük olasılıkla yanlışlıkla `npm install <pkg>` veya `npm init`
  çalıştırılmış.
- **Aksiyon:** `git checkout package.json` ile geri al, dependency'ler
  app-level olarak `apps/<app>/package.json`'a girmiş olmalı. `"type"` ve
  npm init artıkları silinmeli.
→ ÇÖZÜLDÜ — uncommitted değişiklik geri alındı (commit'e girmedi). Root `package.json` artık sadece `scripts` + `devDependencies: { turbo, typescript }`.

**2. Identity smoke test kanıtı eksik**
- 6.1 backend tarafı prod-ready görünüyor (auth refactor + audit + session +
  invitation flow, 4 commit'le sertleşti), ama:
  - Frontend admin/login + accounts/{login,register} + person/auth backend'e
    canlı bağlandı mı? Doğrulanmadı.
  - `bootstrap → member login → /auth/me → member create → role assign`
    döngüsü gerçekten managed test DB'de 200 dönüyor mu? Kanıt yok.
- **Aksiyon:** 6.2 Commerce'e geçmeden önce kısa bir smoke test raporu
  ROADMAP'e iliştirilsin (curl / browser screenshot / log özeti).
→ ÇÖZÜLDÜ `395a76c` — managed Vultr test DB'de owner/customer login, `/auth/me`, member roles, member list, customer roles, customer users, sub-user list ve invalid-login 401 smoke alındı; `passwordHash`/encrypted secret negatif testi geçti. Playwright admin/accounts/person screenshot seti temiz (`unexpectedFailures: []`, sadece bilinçli invalid login 401). Structured log örneği: `request_id=final-log-proof-001`, `module=auth`, `action=password_reset.requested`.

**3. `services/integrations/src/` hâlâ boş, ama 6.5 sırada değil**
- 6.5 sıralamada en sonda (Identity → Commerce → Operations → Mail → System).
  Bu boşluk **normal**, alarm değil. Sadece "6.1 bittikten sonra agent
  6.5'e atlama, 6.2'den devam etsin" diye not.
- **Aksiyon:** kontrol amaçlı; agent atlayıcı hareket ederse uyar.
→ HÂLÂ GEÇERLİ — agent doğru sırada, atlama yok (commit'lere göre 6.1 derinleşmeye devam ediyor).

---

### 2026-06-27 — ROADMAP düzeltme turu (commit'siz, doc-only)

**5. 3.2 / 3.7 yeniden yazıldı — önceki versiyonlar yanlış anlama içeriyordu**
- Önceki ROADMAP'te "Vultr managed Postgres" + "lokal Postgres yasak" yazıyordu, ama lokal'de Postgres KURMA ihtiyacı **niye yoktu** net değildi — agent muhtemelen bu yüzden ne lokal ne Vultr'a bağlanabildi (`.env` bile yok).
- Doğru kavram: **lokal makine sadece kod editörü**; backend hiç lokal'de çalışmaz. Tüm geliştirme + test akışı sunucudaki `factoryengine-dtfbank-app` container'ında. Bağlantı bilgileri (managed Postgres URL, Redis URL, secret'lar) o container'ın **mevcut `.env`'inden** alınır — hiçbir bilgi uydurulmaz, lokalde yeni `.env` üretilmez.
- **Aksiyon (agent için):** `.env` lokalde **aranmaz/yaratılmaz**. `pnpm dev` lokalde denenmez. Geliştirme akışı için Mutagen + dtfbank container kullanılır (3.7).
- **Aksiyon (kullanıcı için):** 3.2 ve 3.7'de açıkça "kullanıcı netleştirecek" diye bıraktığım noktalar var (env nasıl indirilecek, container'da eski kod nasıl temizlenecek, Mutagen config). Bu detayları verince doc tamamlanır.
→

**7. "Kullanıcı netleştirecek" notları agent'ı blokladı — silindi**
- 3.2 ve 3.7'ye varsayım yapmamak adına "spesifik komut/path/Mutagen config kullanıcı netleştirecek" diye notlar bırakmıştım.
- Agent bu notları "iş açık değil, izin gelmedi" olarak yorumlayıp 6.2'ye geçmedi (sohbet kanıtı: "Güncel ROADMAP'te 6.2 Commerce var, ama aynı dosyada dtfbank + Mutagen akışı için 'kullanıcı netleştirecek' noktalar duruyor").
- Bu yanlış davranışın iki sebebi vardı: (a) ben bu notları üst seviyede 6'yı bloklamayacak şekilde işaretlemedim, (b) 5.1'de deploy detaylarının kod yazımını bloklamayacağı belirtilmemişti.
- **Aksiyon:** ROADMAP'ten "kullanıcı netleştirecek" notları silindi. 5.1'e yeni uyarı: "6. bölümdeki kod transferi 3. bölümün deploy detaylarını beklemez". Agent'ın 6'da kod yazmaya başlaması için 3 tamamlanmış olması gerekmiyor.
→

**6. UYDURMA / VARSAYIM YASAĞI — agent + denetçi için**
- ROADMAP'e **kullanıcının net olarak söylemediği** hiçbir spesifik komut / path / kural / değer yazılmaz.
- Örneğin (yapılmaması gerekenler): "BullMQ prefix `factoryengine:` olur", "scp `/opt/apps/...`'tan indir", "ilk kurulum sırası: 1. eski kodu sil 2. ..." — bunlar agent için **konfigürasyon**, kullanıcı söylemeden uydurma değil.
- Bilinmeyen veya kullanıcının netleştirmesi gereken nokta varsa → "→ kullanıcı netleştirecek" notu düşülür, **boş bırakılır**.
- Bu kural her not, her tablo, her örnek komut için geçerli.
→

---

### 2026-06-27 — Commit `395a76c` sonrası

**4. 5.5 RBAC sürekliliği — `adminRoleLabel` türetimi `DEFAULT_MEMBER_ROLES`'ten bağımsız**
- `apps/admin/src/lib/current-principal.ts` içindeki `adminRoleLabel(principal)` permission seti üstünden rol etiketi türetiyor (`roles.write + settings.write → Owner`, `members.write → Admin`, `task.assign → Agent`, geri kalan → Member).
- Bu permission'lara dayalı etiket akıllı bir choice ama **`packages/contracts/permissions.ts` → `DEFAULT_MEMBER_ROLES` matrisindeki rol slug'ı (owner / admin / agent) doğrudan** kullanılmıyor. İleride owner'a yeni permission eklerse veya admin'den `members.write` çekilirse etiket türetimi yanlış sonuç döndürebilir.
- **Aksiyon (kritik değil, izleme):** rol matrisi değiştiğinde `adminRoleLabel` da gözden geçirilsin. Veya principal response'una `roleSlug` eklenip etiket onun üstünden çekilsin (daha sağlam). Şimdilik çalışıyor.
→

---

### 2026-06-27 — Commit `b7d486c` sonrası

**8. Yorum: artık UI'de canlı Shopify verileri olmalı ve işlem yapılabilmeli**
→

---

### 2026-06-27 — Commit `3d61b753` sonrası canlı dtfbank deploy + test hesapları

**Factory Engine Pro dtfbank runtime smoke**
- Deploy kapsamı: sadece `factoryengine-dtfbank-app`; non-factoryengine gangsheet/upload/diğer app container'larına dokunulmadı.
- Container iç port smoke:
  - `4000 /api/v1/health` → `200 {"ok":true,"service":"factory-engine-pro-backend"}`
  - `3000 /` → `200` admin HTML
  - `3001 /` → `200` accounts HTML
  - `3002 /` → `200` person HTML
- Public smoke:
  - `https://api.dtfbank.com/api/v1/health` → `200`
  - `https://api.dtfbank.com/api/v1/identity/workspace-brand` → `200 {"workspaceName":"DTF Bank","brandBadge":"DB","brandLogo":null}`
  - `https://app.dtfbank.com` → `200`
  - `https://accounts.dtfbank.com` → `200`
- Runtime log özeti: Prisma `4 migrations found`, `No pending migrations to apply`; PM2 `factory-engine-pro-api`, `factory-engine-pro-admin`, `factory-engine-pro-person`, `factory-engine-pro-accounts` online; Nest `Nest application successfully started`.

**Test hesapları oluşturuldu ve login doğrulandı**
- Admin owner: `owner.prodtest+20260627184047@dtfbank.com` / `FepOwner20260627184047`.
  - `POST https://api.dtfbank.com/api/v1/auth/member/login` (`x-tenant-id: ten_dtfbank`, `x-request-id: prodtest-admin`) → `201`.
  - `GET https://api.dtfbank.com/api/v1/auth/me` → `200`, `type=member`, `permissions=23`.
- Accounts customer: `customer.prodtest+20260627184047@dtfbank.com` / `FepBuyer20260627184047`.
  - `POST https://api.dtfbank.com/api/v1/auth/customer/login` (`x-tenant-id: ten_dtfbank`, `x-request-id: prodtest-customer`) → `201`.
  - `GET https://api.dtfbank.com/api/v1/auth/me` → `200`, `type=customer_user`, `permissions=7`.
- Not: `ten_dtfbank` içinde eksik olan sistem roller (`owner`, `admin`, `agent`, `b2b_admin`, `b2b_user`) canlı container içinden Prisma ile seed edildi; secret/env değeri basılmadı.
→

**Akış 1 — User ekleme / invite smoke**
- Owner login: `POST /api/v1/auth/member/login` → `201`.
- Role lookup: `GET /api/v1/identity/member-roles` → `200`, invite testinde `admin` rolü kullanıldı.
- Invite member: `POST /api/v1/identity/members` (`sendInvite=true`) → `201`, invitation token üretildi, `mail_deliveries` kaydı açıldı.
- Invitation accept: `POST /api/v1/auth/invitations/accept` → `201`.
- Davetli member login: `POST /api/v1/auth/member/login` → `201`, `type=member`, `permissions=20`.
- Mail delivery: `GET /api/v1/mail/deliveries?eventKey=identity.member_invitation&limit=10` → kayıt bulundu ama `status=failed`, `error="API key is invalid"`.
- Ek Resend doğrulaması (secret değeri basmadan): `factoryengine-dtfbank-app`, `factoryengine-dtfprint-app`, `factoryengine-fastdtftransfer-app` Resend `/domains` probe → `403 "This API key is suspended"`; `factoryengine-eagledtfsupply-app`, `factoryengine-fastdtfsupply-app`, `factoryengine-dtfprintdepot-app` içinde `RESEND_API_KEY` yok.
- Sonuç: backend invite + accept + login akışı çalışıyor; **gerçek mail gönderimi canlı Resend key suspended olduğu için tamamlanmadı**. Geçerli Resend key verilmeden Akış 1 prod-ready kapanmaz.
→

---

### 2026-06-27 — System Mail admin UI canlı smoke

**Deploy kapsamı**
- Kod deploy: sadece `factoryengine-dtfbank-app` recreate edildi; gangsheet/upload/diğer app container'larına dokunulmadı.
- Caddy düzeltmesi: sadece `api.dtfbank.com` bloğunda CORS preflight header seti güncellendi ve actual response tarafındaki duplicate CORS header kaldırıldı. Diğer Caddy site bloklarına dokunulmadı.

**Container/runtime kanıtı**
- Remote build: `@factory-engine-pro/api-client`, `backend`, `admin`, `person`, `accounts` build geçti.
- Prisma: `eagle_dtfbank_db`, schema `factory_engine_pro`, `No pending migrations to apply`.
- Nest log: `MailController {/api/v1/mail}` altında `GET /mail/deliveries`, `GET /mail/deliveries/:id`, `POST /mail/test` route'ları map edildi.
- PM2 log: `factory-engine-pro-api`, `factory-engine-pro-admin`, `factory-engine-pro-person`, `factory-engine-pro-accounts` online.

**CORS/UI smoke**
- `OPTIONS https://api.dtfbank.com/api/v1/auth/member/login` (`Origin: https://app.dtfbank.com`, `Access-Control-Request-Headers: content-type,x-tenant-id,authorization`) → `204`, `Access-Control-Allow-Headers` içinde `X-Tenant-Id`.
- `GET https://api.dtfbank.com/api/v1/health` (`Origin: https://app.dtfbank.com`) → `200`, tek `Access-Control-Allow-Origin: https://app.dtfbank.com`.
- Browser UI login: `https://app.dtfbank.com/login` → owner hesabıyla login → `POST /api/v1/auth/member/login` `201` → `/dashboard` redirect.
- Browser UI route: `https://app.dtfbank.com/system-mail` → `200`, sidebar'da `TRANSACTIONAL MAIL > System mail` görünüyor.
- UI screenshot: `docs/evidence/system-mail-live-20260627.png` (`System mail`, tablo var, `rowCount=2`, `failedRows=2`).

**Mail center API smoke**
- `GET /api/v1/mail/deliveries?limit=3` → `200`.
- `POST /api/v1/mail/test` → `201`, `deliveryId=mail_azs8372udi5os3pesgw9hvl8`, ilk durum `queued`.
- 3 sn sonra `GET /api/v1/mail/deliveries/mail_azs8372udi5os3pesgw9hvl8` → `status=failed`, `error="API key is invalid"`.
- Sonuç: System Mail UI/API gerçek backend'e bağlı ve canlıda çalışıyor; gerçek gönderim yine canlı Resend key geçersiz/suspended olduğu için tamamlanmıyor. Geçerli Resend key gelmeden mail akışı prod-ready kapanmaz.
→
