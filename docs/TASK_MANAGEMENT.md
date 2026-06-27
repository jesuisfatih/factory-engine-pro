# Task Management & Rule Engine — Tasarım Notları

> **Status:** Yaşayan belge. 2026-06-28 itibariyle tartışılmış kararlar + henüz
> netleşmemiş açık sorular + canvas editör için araştırılmış özellik listesi.
>
> Bu belgeyi okurken: önce **Bölüm 1**'i atlama (ürün için "task management"
> ne demek, dışarıdan bakan biri için tarifi). Sonra **Bölüm 4 (JSON
> contract)** ve **Bölüm 7 (Decision Log)** en kritik kısımlar — şema
> üzerinde değişiklik yapmadan önce mutlaka oku.

## İçindekiler

1. [Task management nedir — bu üründe](#1-task-management-nedir--bu-üründe)
2. [Üç katmanlı döngü (diğer agent'ın tasarımı)](#2-üç-katmanlı-döngü)
3. [SpaceX prensiplerinin uygulanması](#3-spacex-prensiplerinin-uygulanması)
4. [Rule engine — JSON contract](#4-rule-engine--json-contract)
5. [Canvas editör — neler var, neler eklenecek](#5-canvas-editör)
6. [Mimari kararlar (apps/services/packages)](#6-mimari-kararlar)
7. [Decision log](#7-decision-log)
8. [Açık sorular](#8-açık-sorular)
9. [Eski admin'den ne transfer, ne sıfırdan](#9-tech-transfer-planı)

---

## 1. Task management nedir — bu üründe

**Generic CRM "to-do listesi" değildir.** Bu üründe task management
**operasyonun omurgası** — sabah ekipler işe başlayınca ne arayacaklarını
buradan görürler. Sales ve customer service rolündeki personellerin Aircall
hesaplarındaki aramaların **canlı transcript**'leri yapay zekâ tarafından
parse ediliyor, structured JSON'a (intent, ürün, niyet, urgency, vb.)
çevriliyor, ve bu sinyaller döngünün içine besleniyor.

Çıktı: **günlük çağrı listesi, aciyet sırasına göre sıralı**. Kanban
state'leri (unassigned/in progress/positive/closed) + pin board + segment
mesh + öncelik sıralaması → ne yapılacağına karar veren mekanizma.

Yani şu üçü aynı sistem:
- Telefon ekibinin sabah açtığı **görev kuyruğu**
- AI'ın transcript'ten ürettiği **structured signal akışı**
- Admin'in "şu sinyalden şu task çıksın" diye **kural koyduğu konfig katmanı**

**Personel paneli (tanstack-demo / apps/person) bu üçlünün UI ucu:**
- Kanban + AI source badge (transcript / segment / stale)
- TaskBriefModal → AI'ın çıkardığı yapı (whyCalling, upsetAbout, callGoal,
  suggestedActions, transcript snippet, confidence)
- Pin board, segment chips, priority sıralaması

> **Burada satır arası:** AI bizim için **extraction layer'dır,
> orchestration değil.** Eski admin'de AI'ın kendine ait bir "task
> management" altyapısı vardı (Faz 1-4, Wave 5...) — bunu transfer
> ETMİYORUZ. Sebebi: "AI Task" diye ayrı bir kavram olarak tasarlanmıştı,
> halbuki Task tek bir varlık olmalı, source bir metadata field'ı olmalı.
> Detay: [Bölüm 7 — Decision Log → "AI task management transfer
> edilmedi"](#7-decision-log).

---

## 2. Üç katmanlı döngü

**Bu diyagram diğer agent ile yapılan oturumdan geldi**, üzerinde mutabık
kalındı. Sistem üç katmandan oluşuyor:

```
┌─────────────────────────────────────────────────────────────────┐
│ ADMIN (üst, kırmızı)                                            │
│ Döngünün İÇİNE GİRMEZ — kuralları ayarlar.                      │
│ • intent → axis eşlemesi                                        │
│ • eskalasyon eşiği                                              │
│ • devir/havuz dağıtımı                                          │
│ Davranışı: "tanımlamak", yürütmek değil                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (config olarak okur)
┌─────────────────────────────────────────────────────────────────┐
│ OTOMATİK DÖNENCE (orta) — kuralla çalışır, insan dokunmaz       │
│                                                                 │
│   transcript ──▶ intent  ──▶ açık task var mı?                  │
│                                  │                              │
│                          ┌───────┴───────┐                      │
│                          ▼               ▼                      │
│                   varsa: mevcut       yoksa: yeni task aç       │
│                   task'a ekle         (eksen primary = assignee)│
│                   (repeat++)                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (task üretir, personele atar)
┌─────────────────────────────────────────────────────────────────┐
│ PERSONEL (alt, yeşil) — döngünün İÇİNDE, sonucu yaşar           │
│ • Arar (kayıt task'a bağlanır)                                  │
│ • Watcher'sa görür ama sahiplenmez                              │
│ • İşi bitince kapatır                                           │
│ • Devir ister → admin onayına gider                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              └──────► geri dönüş: tekrar arama
                                       başa döner, aynı case'e eklenir
```

**Demir kurallar (değişmez):**
- Çıkışta tek assignee (birden fazla kişinin sahiplendiği task olmaz)
- Çağrı sahibi otomatik assignee'yi değiştirmez (watcher olur, sahip olmaz)
- Admin tekil task'a değil **kurala** dokunur (manuel müdahale = sürdürülemez)

---

## 3. SpaceX prensiplerinin uygulanması

**Diğer agent'tan gelen perspektif.** Musk'ın 5 adımlı algoritması:

```
1. Gereksinimleri sorgula  → "bu adım gerçekten gerekli mi?"
2. Parçayı/adımı sil       → "en iyi parça parça olmayan parçadır"
3. Sadeleştir              → tek karar fonksiyonu, dağınık if'ler değil
4. Hızlandır               → optimize
5. Otomatikleştir          → en sona — yanlış kuralı otomatikleştirmek hatayı ölçekler
```

**Bu döngüye uyarlanması:**

### "Sil" sorusu
- **Segment ayrı bir kavram mı?** customer_assignments tablosu zaten grubu
  ve sahibi temsil ediyorsa segment silinebilir mi? (Açık soru — Bölüm 8.)
- AI task ayrı entity'si **silindi** (artık tek Task, source field'ı var).

### "Sadeleştir" — tek karar fonksiyonu
Dağınık intent/segment/axis kontrollerini tek bir saf fonksiyona toplamak:

```ts
decide(context: RuleContext, rules: Rule[]) → Action[]
```

Test edilebilir, tek yer, deterministic. **Önemli not:** "Rules data
(admin yazar) + decide function (sen yazarsın)" — bunlar karşıt
değil, birleşik mimari.

### "Otomasyon en sona"
Senin "müşteri 3 kez ararsa otomatik devir önerisi" fikrini önce
**manuel + ölç + kanıtla**, sonra otomatikleştir. Yanlış kuralı
otomatikleştirmek = hatayı ölçeklemek.

### Telemetri — en kritik
SpaceX her roketi sensörle donatır. Burada karşılığı **her rule
firing'i log'lamak**. Admin kuralı tahminle değil, veriyle ayarlar:
> "Şu intent'te task çözümü 3 günü buluyor, eşiği düşür"

→ Admin "kural yazan" değil, **metriğe bakıp kural ayarlayan** olur.

---

## 4. Rule engine — JSON contract

**Schema:** `apps/admin/src/lib/rules.ts`. Bu contract **engine
yazılırken aynen tüketilecek** — değişikliğe ihtiyaç olursa **migration
gerekecek**, o yüzden hızlı kararlar değiştirmesinler.

### Tasarım prensibi

```
Config = veri (admin yazar)  ←──  rules tablosu / JSON  ──→  Motor = kod (deterministic tüketir)
```

Esneklik veri tarafında, davranış kod tarafında. **Asla** karşı taraf.

### 7 kritik gap — şemada hazır olmalı (canvas hepsini göstermek zorunda değil ama JSON taşımalı)

Bu 7 boşluğu engine olmadan ŞİMDİ şemaya koymadık → 3 ay sonra
hepsini migrate edersin.

| # | Gap | Şema yeri | Niye kritik |
|---|---|---|---|
| 1 | **Temporal** | `ConditionField` union'ında `call.count_in_last_7d`, `customer.last_contact_days_ago`, `time.hour_local`, vs. | Döngünün ritmini sadece bunlar yakalar |
| 2 | **Confidence** | `Condition.confidence_gte?: number` (AI-derived field'larda) | `intent=sales @ 0.58` ile auto-task açmak = prod yangını |
| 3 | **Telemetry** | `Rule.telemetry: { fires_total, fires_count_7d, avg_resolution_hours, last_fired_at, reassignment_rate_7d }` | Admin tahminle değil veriyle ayarlasın |
| 4 | **Lifecycle** | `Rule.lifecycle: 'draft' \| 'shadow' \| 'active' \| 'archived'` | Shadow mode = log only, gerçek action yok → güvenli test |
| 5 | **Axis** | `CreateTaskActionConfig.assignee_axis: AssigneeAxis` (5 axis tanımlı) | "Task kime düşer" soyut kavram değil, tip-güvenli |
| 6 | **Multi-action** | `Rule.actions: RuleAction[]` (her zaman array, MVP'de 1 göstersek de) | "Create task + add watcher + notify" tek kuralda |
| 7 | **No-op** | `RuleAction` union'unda `{ type: 'skip', config: { reason } }` | Bazı transcript'ler task yaratmamalı (teşekkür araması) |

### Critical metadata fields

```ts
Rule {
  priority: number,            // 1..100, küçük önce çalışır
  terminating: boolean,        // first-match-wins (true, default) vs compose (false)
  lifecycle: ...,              // yukarıdaki gap #4
  trigger: { type: ... },      // şimdilik transcript_received | stale_detected | order_placed
  conditions: Condition[],     // AND'lenmiş array
  actions: Action[],           // multi-action array
  telemetry: { ... },          // engine doldurur
}
```

**Field whitelist:** `CONDITION_FIELDS` (14 alan tanımlı, kategorize edildi).
Admin sadece bu listeden seçer. Yeni alan eklemek = liste'yi genişletmek
+ tip eklemek. **Genişletme kolay, daraltma migration**.

### "First-match-wins vs compose" semantiği

- `terminating: true` (default) → bir rule eşleşince diğerleri çalışmaz
- `terminating: false` → eşleşse de devam et, alttaki rule'lar da değerlendir

Admin UI'da bu açıkça gösterilmeli ("Composable — don't stop on match"
checkbox toolbar'da var). Eski sistem'in gizli sürpriz davranışına düşmeyelim.

### `decide()` algoritması (engine yazılırken)

```ts
function decide(context: RuleContext, rules: Rule[]): Action[] {
  const matched: Rule[] = [];
  const sorted = rules
    .filter(r => r.lifecycle === 'active' || r.lifecycle === 'shadow')
    .sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    if (rule.conditions.every(c => evalCondition(c, context))) {
      matched.push(rule);
      if (rule.terminating) break;
    }
  }

  const actions = matched.flatMap(r => r.actions);

  // Telemetry yaz
  for (const rule of matched) {
    logRuleExecution(rule, context, actions);
  }

  // Shadow mode'daki kurallar log'a yazar AMA action dönmez
  return actions.filter(a => /* rule of action is active, not shadow */);
}
```

---

## 5. Canvas editör

**Bugün build edildi:** `apps/admin/src/routes/rules.tsx` —
React Flow (@xyflow/react v12.11.1) tabanlı.

**Mevcut özellikler:**
- Sol panel: rule listesi (lifecycle rozet, telemetry sayıları)
- Canvas: trigger → conditions → actions (auto-laid out)
- Inline node config: dropdown/input direkt node içinde
- Compact node CSS (170-200px)
- `useNodesState` → sürükleyince pozisyon korunur
- MiniMap (renk-kodlu)
- "ENGINE NOT CONNECTED — UI PROTOTYPE ONLY" sarı banner

**Sürükle-bırak çalışır**, drag-grabbing cursor değişir.

### Roadmap (araştırılmış, ekleme bekliyor)

Detaylı araştırma raporu için ileride: bu doc'a notlar.

#### Tier 1 — "Hemen ekle" (8 saat ~)
1. `<Panel>` komponenti — toolbar canvas üstüne köşe-anchored
2. `<NodeToolbar>` — hover'da node'un üstünde mini action menü
3. `snapToGrid={true} snapGrid={[15,15]}`
4. **Auto-layout butonu (dagre)** — JSON import sonrası tek tık hizalama
5. Copy/Paste/Delete keyboard shortcut (Ctrl+C/V, Del)
6. Marquee (rubber-band) çoklu seçim
7. Sticky note node tipi — admin "bu kural niye var" yorum düşürür
8. **Clone rule** butonu — sol panelde sağ click duplicate

#### Tier 2 — "Yakın vade" (12 saat ~)
9. **Undo/Redo (Cmd+Z/Y)** — history middleware
10. **Cmd+K quick-add palette** — Figma/ComfyUI pattern
11. **Edge üzerinde "+" butonu** — Zapier/Make pattern
12. **Cmd+F node search** — 50+ node'da hayat kurtarır
13. **`isValidConnection`** — type-safe edge validation
14. **Turkish ariaLabelConfig**

#### Tier 3 — "Engine geldikten sonra"
- Pinned sample data + dry-run (n8n killer feature)
- Telemetry overlay on nodes (haftada N kez ateşledi rozeti)
- Step-through debugger (run history per-step)
- Named version history (rule_revisions tablosu)
- Node groups / colored frames

#### Skip (katma değer yok)
- Multi-user cursors / yorum sistemi (tek admin)
- Mobile editing (sektörde kimse yapmıyor)
- Template marketplace (1 tenant absürt)
- Subflows (per-rule canvas zaten temiz)
- Type-coded port colors (ComfyUI tarzı — bizim 3 tip yeter)

### Mimari önemli not

**Canvas = JSON editör.** Motor canvas'ı değil JSON'ı çalıştırır. Yani:
- Canvas bozulsa/kaldırılsa bile motor çalışır
- Aynı kuralı hem canvas'tan hem form'dan düzenleyebilirsin
- Debug `matched_rule_id` ile JSON üstünden yürür

**Yapma:** Canvas state'ini direkt engine'e besleme. Her zaman JSON'a serialize
et, motoru JSON'la beslemeyle yaz.

---

## 6. Mimari kararlar

### Klasör yapısı

```
factory-engine-pro/
├─ apps/
│  ├─ admin/        # tmbr_ (owner/admin)         port 5189
│  ├─ person/       # tmbr_ (agent) · personel CRM port 5188
│  └─ accounts/     # cusr_/csub_ · müşteri        port 5187
├─ services/
│  ├─ backend/      # NestJS modular monolith (HENÜZ YOK)
│  │  modules/: identity · customers · tasks · personnel · admin
│  └─ integrations/ # shopify · aircall · ai     (HENÜZ YOK)
├─ packages/        # contracts (zod) · api-client · ui · config  (HENÜZ YOK)
└─ docs/            # bu dosya
```

### User model (yapılacak schema)

```
Tenant ten_
├─ Member tmbr_           # iç ekip (RBAC)
└─ Customer cust_         # Shopify kaydı (login değil)
   └─ CustomerUser cusr_  # müşteri login'i
      └─ SubUser csub_    # B2B alt hesap
```

### Rol sistemi

**İki düzlem:**
- `member_roles`: owner / admin / agent
- `customer_roles`: b2b_admin / b2b_user

**Yetki role değil permission'a bağlı** — `can('task.assign')` gibi.
Role permission setine sahiptir, kod sadece permission'a bakar.

### Stack

- **Frontend**: Vite + React + TanStack (Router, Query, Table, Form, Virtual)
  + Radix Dialog + sonner + i18next + React Flow (admin'de)
- **Backend (gelecek)**: NestJS + Prisma + Postgres + Redis + zod contracts
- **Monorepo**: npm workspaces (şu an basit), Turborepo'ya migrate (gelecek)

### Kurallar
- Her satırda `tenant_id` — token'dan gelir, middleware enforce eder
- Modüller tabloya değil **servise** konuşur (cross-module DB read yok)
- Request context: `{tenant_id, principal_id, principal_type, permissions[]}`
- Integrations event'le besler, panel query invalidate eder (gerçek-zamanlı UI)

---

## 7. Decision Log

> Tarihler önemli — bu kararlar yapıldığı bağlamda doğruydu. Bağlam değişirse
> tartışılabilir.

### 2026-06-28: 3 ayrı Vite app, monorepo altında

`apps/admin`, `apps/person`, `apps/accounts` — her biri kendi Vite
projesi, ortak `package.json` workspaces ile bağlı. Şimdilik shared
package'lar yok (`packages/contracts` vs.) — backend yazılırken eklenecek.

**Niye 3 ayrı app:** Üç farklı kullanıcı türü, üç farklı UX, üç farklı
deploy yüzeyi. Tek app'te tüm rol-based gating yapmak ortalama bir UX
yaratıyor.

### 2026-06-28: Eski admin'deki AI task management TRANSFER EDİLMEDİ

**Sebep:** Eski sistem AI task'ı ayrı bir varlık (entity) olarak tutuyordu,
4 farklı task yaratma yolu vardı (transcript / segment / stale / manual)
her birinin kendi pipeline'ı. Bu **kavramsal hataydı** — Task tek bir
varlıktır, source bir metadata field'ıdır.

**Onun yerine:** Yeni platformda tek `Task` entity, `source` enum field'ı.
AI servisi `taskModule.create({ source: 'ai_transcript', aiBrief: {...} })`
çağırır. Ayrı table yok, ayrı approval queue yok, ayrı orchestration yok.

Personel kanban kartının `source` badge'i + TaskBriefModal'ı bu modelle
zaten uyumlu — backend bunu desteklemek zorunda.

### 2026-06-28: Canvas editör ÖNCE inşa edildi (engine'den önce)

**Sebep:** UI canvas'ın ürettiği JSON şeması = engine'in tüketeceği şema.
UI'ı tasarlamak = JSON'ı tasarlamak. Şema canvas'ta "garip duruyorsa"
engine yazılırken de bozuk gelir.

**Disiplin:** Canvas'a "ENGINE NOT CONNECTED" sarı banner kalıcı duruyor.
Admin "kuralım çalışmıyor" sürprizi yok.

### 2026-06-28: Rule engine = data + decide() function

`decide(context, rules) → Action[]` saf fonksiyon. Tek yerde, test
edilebilir, deterministic.

Rules **datadır**, admin tablodan/canvas'tan yazar. `decide` koddur, sen
yazarsın. **İkisi karşıt değil**, birleşik mimari.

### 2026-06-28: 7 kritik gap şemada hazır olmak ZORUNDA

Engine yazılırken zaten ihtiyaç olacak. Şimdi şemaya koymadık → migration
yazarız.

1. Temporal, 2. Confidence, 3. Telemetry, 4. Lifecycle, 5. Axis,
6. Multi-action (array), 7. No-op (`type: 'skip'`).

Detay: [Bölüm 4](#4-rule-engine--json-contract).

### 2026-06-28: Admin "customer" = tenant admin, son müşteri DEĞİL

Önceki versiyonda "müşterim kendi otomasyonunu kursun" derken karışıklık
oldu. Net olalım:

- **Customer-facing accounts portal** (cusr_/csub_) — son B2B müşterisinin
  kullandığı yer. Burada otomasyon kurma YOK.
- **Tenant admin** (tmbr_ owner) — DTF Bank'ın sahibi gibi. Bu kişi
  kendi tenant'ının task management kurallarını çiziyor. Burada
  canvas editör VAR.

Yani rule engine canvas **admin app'inde**, accounts app'inde değil.

---

## 8. Açık sorular

Henüz karar verilmedi, ileride netleşmesi gerekli.

### Q1: Segment ayrı kavram mı, customer_assignments'a gömülebilir mi?
SpaceX'in "sil" sorusu. Segment'in atama tablosundan ne **fazlasını**
sakladığı net değil. Eğer fark sadece "etiket grubu" ise, segment ayrı
tablo yerine `customer_assignments.group_label` olabilir.

**Karar tetikleyicisi:** Segment kullanım casesleri yazıldıktan sonra.

### Q2: Confidence threshold per-condition mu, per-rule mı?
Şu anki şema **per-condition** (her AI alanın kendi `confidence_gte`'si).
Alternatif: rule seviyesinde tek `min_confidence`. Per-condition daha
esnek ama UI karmaşık.

**Karar tetikleyicisi:** Admin gerçek kural yazınca. 5+ rule yazılınca
hangi pattern dominant olduğu görülür.

### Q3: First-match-wins default doğru mu?
Şu an evet, ama admin'in mental modeli "tüm eşleşen kurallar uygulansın"
olabilir. UI'da çakışma gösterimi (rule preview: "şu kural önce
ateşleyecek") eklenebilir.

**Karar tetikleyicisi:** İlk admin'in 3 ay sonraki ticket'ı: "rule X
ateşlemiyor" diyorsa muhtemelen first-match-wins ile çakışan başka
rule var. O zaman UI iyileştir.

### Q4: Axis tanımı esnek mi sabit mi?
Şu an enum: `sales | customer_service | support_lead | accounting | admin`.
Custom axis (tenant'ın kendi tanımladığı) gerekirse `Axis` table'a
çıkarmak gerekecek.

**Karar tetikleyicisi:** 2. tenant onboarding'inde "biz öyle role
değil, bizde 'Trade Show Team' var" denirse.

### Q5: Telemetry retention period?
`rule_executions` tablosu hızla büyür. 90 gün? 1 yıl? Tenant başına
config? Aggregation strategy (daily rollup tablosu?) — şu an sadece
"engine yazılırken karar verilecek" deniyor.

### Q6: Eski admin'den kaç müşteri "müşteri otomasyonu kuruyorum"
demek için gerçekten bekliyor?
Customer-facing canvas yok, admin-facing var. Eğer son B2B müşterisi de
"ben kendi siparişim için kural kurmak istiyorum" derse, **müşteri-
facing rule engine** ayrı bir ürün — şu an kapsam dışı.

**Karar tetikleyicisi:** İlk 5 müşteriden 3'ü açıkça "kendi
otomasyonumu kuracağım yer istiyorum" derse.

---

## 9. Tech transfer planı

Eski `eagledtfprint` kodbase'inden ne alınır, ne sıfırdan yazılır.
Detaylı tartışma için dış doc gerekiyor; özet:

### Risksiz transfer (sadece tenant context bağla)
- **Shopify GraphQL client + webhook signature doğrulama** — saf adapter
- **Aircall API client + webhook handler** — saf adapter
- **Discount evaluation engine** (qty break math, percentage/fixed karar mantığı) — saf fonksiyon
- **AI prompt template'leri** — data
- **Tenant config schema'ları** — tasarım

### Transfer gibi görünen ama aslında yeniden yazılması gereken
- **Segments**: rule engine transfer, ilişkiler `cust_/cusr_/csub_` modeline göre yeniden
- **Support sistemi**: ticket model + state machine transfer, principal mapping yeni
- **B2B access request**: form + onay akışı transfer, "kim onaylayabilir" permission'a bağlı
- **B2B discounts**: rule tanımı transfer, target type yeni identity
- **Email templates / Mail marketing**: template engine transfer, alıcı seçimi yeni customer modeli

### Hiç transfer etme
- **Auth/identity** — sıfırdan (`tmbr_/cusr_/csub_` model)
- **Role tanımları** — permission-based, sıfırdan
- **Task management** — bu doc'da anlatılan model, sıfırdan
- **Eski AI task orchestration** — yukarıda "AI TRANSFER EDİLMEDİ" maddesi
- **Tenant resolution middleware** — token-based, sıfırdan
- **Cross-tenant cleanup script'leri** — eski şemaya bağlı, geçersiz

### Tek cümlede

> **Transfer** = entegrasyon adapter'ları + saf business fonksiyonları + AI prompt'ları.
> **Yeniden yaz** = identity, permission, ve onlara bağlı her şeyin controller/service katmanı.

---

## Ekler

### A. Bugün build edildi (UI only)

- `factory-engine-pro/apps/admin/src/routes/rules.tsx` — canvas editör
- `factory-engine-pro/apps/admin/src/lib/rules.ts` — JSON contract + mock
- `factory-engine-pro/apps/admin/src/styles/global.css` — node CSS
- Sidebar'da AUTOMATION grubu, "Rule engine" entry

### B. Henüz yok (yapılacak)

- Backend (NestJS) — services/backend tamamı
- Engine execution runtime — `decide()` fonksiyonu + `rule_executions` log
- Shadow mode handling — lifecycle: 'shadow' → log yes, action no
- Telemetry tablo — rule firing history
- `rule_revisions` tablosu — version control
- `packages/contracts` — zod schema'ları paylaşan paket
- Multi-tenant isolation — middleware + `tenant_id` enforcement

### C. Canvas editör araştırması — kaynaklar

Şunlar tarandı (2026-06-28 araştırması):
- **@xyflow/react v12** docs + examples gallery
- **n8n** — drag-drop, right-drawer config, sample data pinning
- **Zapier canvas mode** — "+" on edges, auto-connect
- **Make.com** — vendor-color nodes, dotted "+" connectors
- **ComfyUI** — double-click quick-add, type-coded ports, refuse-bad-connect
- **Langflow / Flowise** — LLM pipeline patterns
- **Figma/FigJam** — Cmd+K, sticky notes, frames, Cmd+F search
- **Microsoft Logic Apps** — labeled branching

Bulgular ileride: yine bu doc'da Bölüm 5.

### D. İletişim / sahiplik

Bu doc bir tasarım kaydı, gerçek-zamanlı code değildir. Kod değişirse
buradaki kararlar **yanlış kalabilir** — bağlam değiştiğinde decision log'a
ek karar yaz, eski kararı silmе.

Açık soruların cevabı geldiğinde Bölüm 8'i güncelle.
