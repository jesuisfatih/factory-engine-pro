# FactoryEngine — ROADMAP (Faz-1 Düzeltme & Tamamlama)

**dtfbank canary · UI experience = tek başarı ölçüsü · 2026-06-29 yeniden yazılmış**

> Linda hesabıyla canlı UI'da test ettim, motor çekirdeği + standart engine + segment taşıma + 23a-d wiring çalışıyor AMA bir dolu yanlış davranış, sığ taşıma, seed kalıntısı, eksik admin yüzeyi var. Bu doc o gözlemlerin punch list halidir. Yapılanlar bölümü referans için kalır, **madde 1'den itibaren SADECE yapılacaklar** sıralı listelenir.

---

## NASIL İLERLENİR (agent buna uyar)

1. Madde 1'den **sıra**. Bitti = `app.dtfbank.com` / `/staff` URL'i + container log + **gerçek hesapla UI senaryosu** ile ispatlanmadan sonraki maddeye geçilmez.
2. **UI experience = tek başarı ölçüsü.** Yarım, mock, "endpoint var UI boş" = bitmemiş.
3. **HER 5 COMMITTEN SONRA ROADMAP'in TAMAMINI baştan sona oku.** Sıra düzenini, kuralları, yeni eklenen maddeleri tekrar gözden geçir. Bu unutkanlığa karşı zorunlu.
4. Açık karar yok — parametreler maddelere gömülü. Belirsizlik bulursan **uydurma**, sor.
5. **Madde 38 yeşil olduğunda ROADMAP tamamdır.**

---

## KURALLAR (çiğneme — değişmez)

Yalnız **dtfbank** deploy · **factoryengine-\*** scope · managed Postgres/Redis · **lokal yok** (`127.0.0.1`/`localhost` kanıtta görünemez) · **varsayım yok** · trigger/condition/action/psych_tag/segment **kapalı liste** · **mock yok, seed kalıntısı yok** · **UI'da denenmeden Bitti yok** · **eski sistemden örnekle birebir taşı** (Mail'i sığ taşıdın, segments'i de defalarca derinleştirmem gerekti — dikkat) · kanıt = `app.dtfbank.com` / `/staff` URL + container log + canlı kullanıcı senaryosu.

---

## SİSTEMİN OMURGASI (referans, değişmez)

Sistem üç çekirdek varlığın etrafında döner: **Shopify customers** (eagle-dtf-print, 13,448) → **Aircall transcripts** (resolver 11-field JSON) → **AI routing** (workflow engine). Zincir: Shopify sync → Segment auto-evaluation → Aircall webhook → Resolver → Workflow trigger → Conditions → Actions → Task → Axis primary → Person UI kanban → TaskBriefModal → Customer Detail Panel.

---

## YAPILANLAR (referans — dokunma, sadece bilgi)

Foundation kuruldu:
- Auth iskeleti, 4 personel + permission kilidi, master enums.ts, AI resolver (11-field), motor çekirdeği (rule persist + executor + dispatcher + condition + action + WHEN combinator), standart engine omurga (idempotency + cooldown + trace + snapshot + versioning + backfill + stats), task chaining, assignee resolution, axis-scoped ownership, urgency scoring, default workflow rules seed, segment motoru (eski sistemden taşıma + Shopify native segment integration + 30 field + 9 operatör + scope sistemi + ownership), sync→segment hook, Initial Setup wizard (3 bulk action), admin mock cleanup (mock.ts silindi), person dual kanban + TaskBriefModal + Customer Detail Panel + transfer akışı.

Eksik & yanlış: aşağıdaki 38 madde.

---

# A · AUTH & SESSION (kökten çöz — çok tehlikeli)

### 1. Logout butonu çalışır (admin + person)
**Hedef:** Şu an logout butonu HİÇ ÇALIŞMIYOR. Hem `app.dtfbank.com` admin'inde hem `app.dtfbank.com/staff` person'da: butona tıklanınca token revoke edilir, local storage temizlenir, login sayfasına yönlendirilir.
**Bitti =** Linda /staff'ta logout tıklar → login sayfasına döner + kullandığı access token sonraki istekte 401 alır (revoked).

### 2. Session expire/timeout YOK
**Hedef:** "Session süresi doldu" diye bir kavram olmayacak. Token'lar uzun ömürlü (örn. 1 yıl) veya refresh otomatik sessiz olur. Kullanıcı browser'ı kapatıp 8 saat sonra açtığında **hala oturumda** olur.
**Bitti =** Linda /staff'a girdikten sonra browser tab'i 12 saat kapalı tutulur, yeniden açıldığında oturum açık (re-login yok).

### 3. Admin / Person login URL drift fix
**Hedef:** Şu an `app.dtfbank.com/login` (admin) ile `app.dtfbank.com/staff/login` (person) arasında oturum/role kararsızlıkları var. Auth katmanı **tek** middleware ile, token role bazlı surface'i otomatik açar (CS/Sales → /staff redirect, owner/admin → admin). URL drift = aynı token farklı yerlerde farklı davranıyor → hata.
**Bitti =** Linda `app.dtfbank.com/login` (admin URL) deniyor → otomatik `/staff`'a redirect. Owner `app.dtfbank.com/staff/login` deniyor → admin'e redirect. Token tek, surface karar otomatik.

### 4. Linda Messages 403 fix — permission audit
**Hedef:** Linda `/staff/messaging`'e girince `403: You do not have permission to perform this action. (request_id: d1957d71-...)`. Bu permission'ı `messaging.read` veya benzeri olarak master enum'a ekle, CS rolüne ver. **Tüm /staff sayfalarını Linda hesabıyla tek tek gez, 403 alan her yer için permission audit yap.**
**Bitti =** Linda /staff/messaging'i açar, 403 yok, mesaj listesi (canlı veya placeholder) görür. Tüm 9 /staff sayfasında 403 sıfır.

---

# B · PERSON KANBAN MİMARİ DÜZELTME (Linda surface)

### 5. Workflow → Support yolu TAMAMEN kapatılır (UI + backend + enum + migration)
**Hedef:** Önceki implementasyon sığ kaldı — sadece UI'da Support kartlarını gizledi, backend mimari ayrım yapmadı. **Workflow Support'a HİÇBİR ŞEKİLDE dokunmaz.** Support bir Cases sistemidir; sadece personel manuel açar (madde 11 buton + admin manuel + accounts portal self-service).

**Kapsam (kapalı, dört ayak):**
1. **Master enum kısıtı:** `enums.ts` içinde `create_task` action'ının `axis` parametresi enum'u **sadece `'sales' | 'account'`** kabul eder. `'support'` SEÇENEĞİ YOK. TypeScript exhaustive switch + Zod schema bunu zorunlu kılar.
2. **Workflow canvas UI:** `create_task` action seçili olduğunda axis dropdown'unda **3 seçenek değil 2 seçenek** görünür (sales, account). Admin Support'a workflow atamak ASLA seçim olarak göremez.
3. **Backend executor validation:** `workflow-executor.service.ts` `create_task` case'inde `axis === 'support'` gelirse `BadRequestException` atar — runtime guard.
4. **Service request source enum:** `SERVICE_REQUEST_SOURCES` master enum = `['manual', 'customer_self_service', 'admin_created']`. **`'workflow'` ve `'ai'` enum'da YOK.** Yeni satır oluşturulurken source'u doğrulanır.
5. **Migration — DB temizliği:** Mevcut `ServiceRequest` satırlarından `source IN ('workflow', 'ai_workflow', 'ai_transcript', 'ai_segment')` olanlar **SİLİNİR** (bunlar workflow tarafından üretilmiş çöp). İdempotent: zaten silinmişse no-op.

Bu mimari ayrımdan sonra **`support.case.created` event'i de workflow trigger katalogunda YOK** — Support workflow'a geri sinyal göndermez. Tek yön: kullanıcı → Support. Hiç ters yön (workflow → Support) yok.

**Bitti =**
- `enums.ts`: `CREATE_TASK_AXIS = ['sales', 'account']` (support yok, 3 değil 2 değer)
- `enums.ts`: `SERVICE_REQUEST_SOURCES = ['manual', 'customer_self_service', 'admin_created']` (workflow/ai yok)
- Workflow canvas axis dropdown'da `support` görünmez (UI screenshot)
- Backend executor `axis='support'` ile gelen create_task'a 400 BadRequest döner (curl test)
- DB: `SELECT count(*) FROM service_request WHERE source IN ('workflow', 'ai_workflow', 'ai_transcript', 'ai_segment')` → **0 satır**
- Linda priority kanban'da Support task yok + Workflow rule kanvas'ta support axis seçeneği yok
- Tüm Support sayfasındaki case'lerin source field'ı `manual` | `customer_self_service` | `admin_created`

### 6. Daily call list = AI workflow task'ları (SON 7 GÜN, gün+saat sıralı, segment grup YOK)
**Hedef:** Daily call list = SON 7 GÜN içinde gelen Aircall çağrılarından AI workflow'un ürettiği task'lar. Kaynak: `psych.tag.detected` / `call_intent.classified` / `aircall.transcript.received` trigger'larından fire eden `create_task` action'ları (madde 5 sözleşmesiyle: axis sales|account, support yok).

**Liste mantığı:**
- **Düz liste** (segment grup-dropdown YOK — segment Priority kanban'a ait, madde 7)
- **Sıralama: gün DESC, sonra saat DESC** — en yeni en üstte
  - Bugün gelenler önce (saat sırasına göre, son geleni en üstte)
  - Dün gelenler ondan sonra (saat sırasına göre)
  - 7 gün öncesine kadar
  - 7 günden eski olanlar listede görünmez (archive sekmesine düşer)
- Drag-drop ile **Linda kendi sıralamasını değiştirebilir** (madde 9 ile entegre — Linda'ya özel custom order, otomatik gün-saat sıralamasını override eder)

**Görsel:**
- Tarih separatorları ("Today", "Yesterday", "Mon Jun 23", vs.)
- Her kart psych_tag + call_intent badge'iyle
- "Last 7 days" toggle (kapatılırsa sadece bugün; default: 7 gün açık)

**Bitti =**
- Linda Daily call list açar, **son 7 günün** task'larını gün-bazlı separatorlarla görür
- En üstte bugün gelen en son task
- Drag-drop ile sıra değiştirir, sayfa yenilemede custom order kalır
- 7 günden eski task listede YOK
- Segment grup başlığı YOK (düz liste)
- DB query: `SELECT * FROM service_request WHERE source='workflow' AND axis IN ('sales', 'account') AND createdAt >= NOW() - INTERVAL '7 days' AND assignedMemberId = currentUser ORDER BY createdAt DESC`

### 7. Priority kanban = personele atanmış SEGMENT'lerin müşteri listesi (segment grup-dropdown)
**Hedef:** Priority kanban = Linda'ya **owner olarak atanmış SEGMENT'lerin** müşterilerinin arama listesi. Kaynak: `SegmentOwnership.memberId = Linda` olan segmentler → `SegmentCustomerMembership` join → bu müşterilerle yapılacak aramalar.

**Liste mantığı:**
- **Segment grup-dropdown** — her segment için bir başlık ("Champions ▼", "VIP B2B ▼", "At Risk ▼")
- Başlık tıklanınca o segmentin müşterileri listelenir
- Bir müşteri birden fazla segmente girmiş olabilir — her segmente bir kez görünür (duplicate değil tek satır, farklı gruplarda)
- Müşteri başına en yüksek priority segment'in chip'i kart üstünde görünür

**Sıralama (her segment grubu içinde):**
- Urgency formülü (madde 23 — segment_ağırlığı + repeat_count + intent + AI_urgency + bekleme)
- En urgent en üstte

**Bitti =**
- Linda Priority kanban açar, **3-5 segment grup başlığı** görür (sadece kendisinin owner olduğu)
- "Champions ▼" açılır → içindeki 15 müşteri urgency desc sıralı
- İçerik Daily call list ile **TAMAMEN FARKLI** (kanıt: ayrı API endpoint, ayrı sayılar, ayrı screenshot)
- DB query: `SELECT customer.* FROM segment_ownership JOIN segment_customer_membership ON segmentId WHERE memberId = currentUser GROUP BY segmentId`

### 8. Task header: Shopify match yoksa telefon, varsa Ad Soyad
**Hedef:** Task kartının üst başlığı:
- Shopify customer match YOK → telefon numarası (örn. `+13462873217`)
- Shopify customer match VAR → Ad Soyad (örn. `Gary Fairbanks`)

Karttaki secondary info değişmez; sadece header field değişir.
**Bitti =** Gary Fairbanks'in task'ı header'da "Gary Fairbanks" gösterir; matchsiz bir test çağrısının task'ı header'da telefon numarası gösterir.

### 9. Daily call list drag-drop sıralama
**Hedef:** Linda Daily call list içinde kartları SÜRÜKLEYEREK sıralayabilir. Bu sıralama Linda'nın hesabına özel (per-member custom order); başka personeli etkilemez. Sıralama DB'de saklanır (sayfa yenilemede kalır).
**Bitti =** Linda 3 kartı drag-drop ile yeniden sıralar → sayfa yenilenir → aynı sıralama kalır → Charlette'in görünümünü etkilemez.

### 10. Email sayfasında yazım UI (statik gelsin, send yok)
**Hedef:** Linda `/staff/email` sayfasında email **yazabilmeli** — compose form (To, Subject, Body) açılır, draft kaydedilebilir. **Gerçek send yapılmaz** (Mail Marketing aktarımı bitene kadar disabled), ama UI iskeleti tam olur. Draft `MailDelivery` tablosuna `status: 'draft'` ile yazılır.
**Bitti =** Linda /staff/email'de "Compose" tıklar → form açılır → draft kaydeder → sayfayı yenileyince draft listede görünür.

### 11. Task Modal'da "Support case oluştur" butonu
**Hedef:** TaskBriefModal'ın altında yeni buton: "Create Support Case". Tıklayınca müşteriye yeni Support case açılır (madde 24 Support sistemiyle entegre). Workflow task ≠ Support case; ikisi ayrı varlık.
**Bitti =** Linda bir kanban task'ı açar → "Create Support Case" tıklar → modal kapanır, customer'a yeni Support case açılır → Support sayfasında görünür.

### 12. Person Training / Announcements / Messages seed temizle, canlı bağla
**Hedef:** Üç sayfada hala seed data var:
- `/staff/training` → seed eğitim kartları
- `/staff/announcements` → seed duyurular
- `/staff/messaging` → seed mesajlar (ayrıca madde 4'teki 403 hatası)

**Tamamen temizle**, canlı API'ye bağla (madde 32'deki Announcement + Notification modelleri kullan). Boşsa "Empty state" UI göster.
**Bitti =** Linda üç sayfayı gezer; her birinde seed isim YOK; gerçek veri varsa görünür, yoksa boş-state.

### 13. 7 günlük rolling backfill (tüm personel)
**Hedef:** Initial Setup wizard sadece bir kez çalışıyor. **Periyodik 7 günlük rolling backfill** olmalı:
- Cron: günde 1 kez (gece) 7 günlük segment evaluation + workflow reprocess + axis assignment delta
- Manuel tetiklenebilir endpoint: `POST /admin/backfill/rolling-7d`
**Bitti =** Cron çalıştığında log düşer, 7 günlük yeni transcript + customer için bulk evaluation yapar; bir gece beklenir, sabah Linda kanban'ı dolu görür.

---

# C · ADMIN ORDERS / CUSTOMERS / SEGMENTS / SUPPORT (UI parity)

### 14. Admin Orders: row click → modal + Shopify history + transfer
**Hedef:** Admin Orders sayfasında bir order satırına tıklanınca **MODAL** açılır:
- O order'ın tüm Shopify detayları (line items, fulfillment, payment status)
- Müşterinin **tüm Shopify sipariş geçmişi** (kronolojik)
- Shopify istatistikleri (LTV, AOV, son N gün)
- "Personele aktar" butonu: açıklama + hedef personel seçer → workflow task üretilir, hedef inbox'ına düşer
**Bitti =** Owner Orders'ta bir satır tıklar → modal açılır → tüm bilgiler dolu → "Personele aktar" ile Linda'ya açıklamalı task gönderir → Linda kanban'ında görür.

### 15. Admin Orders: kolon arama + sıralama + tarih filtre + default sort
**Hedef:** Sütun başlıklarında **arama** + **sıralama** + **tarih filtre** çalışır. Default sort: en son Shopify update'inden eskiye doğru.
**Bitti =** Owner Orders açar → varsayılan en son güncellenen üstte → "Customer name" sütununa "Gary" yazar → filtre uygular → tarih aralığı seçer → sıralama çalışır.

### 16. Admin Customers: "codex" stringi temizle
**Hedef:** Customers sayfasının bazı yerlerinde "codex" placeholder string'i var (büyük olasılıkla i18n key eksiği veya yorum-içi sızma). **TEMİZLE** — grep + replace.
**Bitti =** `grep -r "codex" apps/admin/src/` = 0 sonuç + UI'da hiçbir "codex" yazısı görünmez.

### 17. Admin Customers: "Axis ownership" netleştir
**Hedef:** Sayfada "Axis ownership" başlığı var ama ne olduğu belli değil. UI metni:
- Başlık adı: "Customer Routing" (veya benzeri Türkçe-net)
- Yanına ufak açıklama: "Bu müşteri 3 axis'te kime atanmış: Sales, Support, Account"
- Tıklanabilir help tooltip: axis nedir, primary kimdir
**Bitti =** Owner Customers açar, üst sütunda "Customer Routing" başlığı + açıklama görür; bir müşteriye tıklayınca 3 axis için ayrı primary atanması açıkça anlatılı.

### 18. Admin Customers: CSS düzelt
**Hedef:** Customers tablosunda layout/spacing bozuk (sütunlar dağınık, padding tutarsız, mobile-responsive değil belki). UI parity için CSS gözden geçir.
**Bitti =** Customers sayfası tüm sütunlar düzgün hizalı, padding tutarlı, F12 ile inspect'te console hata yok.

### 19. Admin Customers: default sort recent Shopify
**Hedef:** Default sıralama = en son Shopify customer update'inden eskiye doğru (`shopifyCustomer.updatedAt DESC`).
**Bitti =** Owner Customers açar → varsayılan en yeni güncellenen üstte → sıralama kolonu tıklayınca toggle çalışır.

### 20. Admin Segments: owner görünür (Owner: Linda)
**Hedef:** Segment kart/listede `SegmentOwnership.memberId` set edilmişse "Owner: Linda" rozeti görünür. Boşsa "Unassigned" görünür.
**Bitti =** Owner Segments açar, Champions segment'i için "Owner: Ihsan" görünür; New Customers için "Unassigned" görünür.

### 21. Admin Segments: Preview Customer + Shopify Preview birleştir
**Hedef:** Şu an "Preview Customer" ve "Shopify Preview" iki ayrı tab/bölüm gibi görünüyor AMA AYNI ŞEY. **Birleştir**, tek "Preview" tab'ı kalır; içinde tüm matched customer'lar (hem internal Customer hem Shopify match) listelenir.
**Bitti =** Owner Segments açar, bir segment'e tıklar, "Preview" sekmesi tek tane, içinde tüm eşleşen müşteriler birleşik liste.

### 22. Admin Segments: preview customer click → tarihçe modal
**Hedef:** Preview customer listesinde bir müşteriye tıklanınca POPUP MODAL açılır:
- Profile
- Shopify Orders (tüm geçmiş)
- Aircall Calls (tüm geçmiş)
- Support cases
- Notes
- Tasks

Customer Detail Panel'in compact halini kullanabilir (madde 26 panel'ini popup mode'a sok).
**Bitti =** Owner Segments → Preview → bir müşteri tıklar → tarihçe modal açılır, 6 sekme dolu.

### 23. Admin Segments: preview customers filter + search + sort
**Hedef:** Preview liste içinde filtreleme (LTV aralığı, segment match score), arama (isim/email/telefon), sıralama (kolonlar).
**Bitti =** Owner Segments → bir segment'in preview'ünde "vip" arar → filter sonucu güncellenir → LTV sütununu tıklar → sıralama çalışır.

### 24. Admin Support: ayrı Cases sistemi (madde 5'in admin tarafı)
**Hedef:** Madde 5'in mimari ayrımı (workflow → Support yolu kapalı) admin tarafında doğru yansır. Support sayfası:
- `ServiceRequest` tablosu kalır ama **kaynak enum kısıtlı**: `source IN ('manual', 'customer_self_service', 'admin_created')` (madde 5 sözleşmesi)
- Üç açılış kaynağı:
    1. **Admin manuel** — owner/admin "New case" butonuyla case açar (customer + axis + açıklama)
    2. **Customer self-service** — accounts portal'dan müşteri kendisi case açar (`source: 'customer_self_service'`)
    3. **Personnel manual** — TaskBriefModal'dan madde 11 buton (`source: 'manual'`)
- **AI/workflow KAYNAĞI YOK** — madde 5 enum kısıtıyla zorlanır
- Lifecycle: `open → in_progress → resolved → closed` (basit, manuel transition)
- Assignee = customer'ın `axis: support` primary'si (Linda veya Charlette)
**Bitti =** Owner Support açar — sayfa amacı net (Cases). DB query `SELECT DISTINCT source FROM service_request` → sadece 3 izinli değer. "New case" butonu çalışır, manuel açılış doğrular.

### 25. Admin Support: seed + workflow-source temizliği (migration)
**Hedef:** Şu an Support sayfasında:
1. Eski seed/test service request'ler var (mock kalıntısı)
2. Önceki workflow execution'larından üretilmiş çöp ServiceRequest satırları var (madde 5 öncesi)

**İki katmanlı temizlik** (idempotent migration):
- `DELETE FROM service_request WHERE source IN ('workflow', 'ai_workflow', 'ai_transcript', 'ai_segment')` (madde 5 ile aynı migration olabilir)
- `DELETE FROM service_request WHERE id LIKE 'sr_dtfbank_welcome%'` veya benzeri seed izleri
- `task_participants` ve diğer ilişkili tablolarda da cascade delete
**Bitti =** Owner Support açar — seed satır YOK + workflow-source satır YOK. Boş/empty-state veya sadece manuel oluşturulan case'ler görünür.

---

# D · ADMIN TERMİNOLOJİ + MENÜ

### 26. "Task Management" → "Call Center" rename
**Hedef:** Admin sol nav'da "Task Management" yazan modülün adı "Call Center" olur. i18n + route + sidebar entry + breadcrumb hepsi.
**Bitti =** Owner admin sidebar'da "Call Center" görür; URL `/call-center` veya benzeri; "Task Management" stringi sıfır.

### 27. Sol nav menüden duplicate kaldır (Aircall/AI keys/Shopify/Initial Setup)
**Hedef:** Bunlar zaten Workspace Settings içinde duruyor; sol nav'da AYRICA görünmesin (duplicate menü):
- Aircall (sidebar entry'si sil)
- AI Keys (sidebar entry'si sil)
- Shopify (sidebar entry'si sil)
- Initial Setup (sidebar entry'si sil, Workspace Settings altında kalır)
**Bitti =** Owner admin sidebar'ında 4 duplicate entry YOK; Workspace Settings içinde hepsi bulunur ve çalışır.

### 28. Admin Training sayfası (coming soon iskelet)
**Hedef:** Admin tarafında "Training" sayfası eklenir (sol nav entry'si). İçinde "Coming Soon" yazılı iskelet ekran, içerik yok, canlı bağlı bir şey yok.
**Bitti =** Owner admin'de "Training" sidebar entry'si görür → tıklar → "Coming Soon" placeholder ekran açılır.

---

# E · MAIL AKTARIMI (sığ taşıma düzelt)

### 29. Mail Template + Marketing ULTRA derin envanter raporu
**Hedef:** Eski sistemi (`eagledtfprint/`) iki yerden ULTRA DERİN incele:
- Mail Template modülü (UI + service + DB + template engine + variable resolution + preview)
- Mail Marketing modülü (campaign builder + segment-target + send queue + delivery log + provider abstraction)

Raporu `docs/migration/mail-deep-inventory.md` yaz. Önceki sığ taşımayı düzelt — segments envanteri (304 satır) seviyesinde derin olsun.
**Bitti =** `docs/migration/mail-deep-inventory.md` tamamlanır + patron okur + "tamam, taşı" onayı verir. **Onaysız 30/31'e geçme.**

### 30. Mail Template modülünü birebir taşı
**Hedef:** Madde 29 raporu sonrası: eski Mail Template modülünü FactoryEngine Pro'ya **BİREBİR** aktar (kopya + sinir ucu entegrasyon). Yeniden mimari yasak.
- Tüm UI bileşenleri kopya
- Backend service + repository + worker
- DB modelleri
- Template engine + variable resolution
- Permission key'leri master enum'a (`mail.template.read/write`)
- Customer Detail Panel'in Email sekmesine bağla (template render preview)
**Bitti =** Owner admin'de Mail Templates sayfası açılır, eski sistemde tanımlı template'ler import edilmiş, yeni template oluşturulur, preview Northstar customer üzerinde render edilir.

### 31. Mail Marketing modülünü birebir taşı (eski hatayı düzelt)
**Hedef:** Şu an taşıdığın hali sığ + yanlış (segments'te yaptığın aynı hata). Madde 29 raporu sonrası: **eski Mail Marketing modülünü BİREBİR** taşı. Campaign builder, segment-target seçici, send queue, delivery log, A/B test (varsa), tracking (varsa). Gönderim disabled flag'li (provider askıda).
**Bitti =** Owner admin'de Mail Marketing sayfası açılır, eski sistemdeki tüm UI + features var; bir campaign oluşturulur, segment seçilir (madde 20 owner görüntüsünden), template seçilir (madde 30'dan), "Send" tıklanır → MailDelivery'ye kuyruk satırları düşer (status `queued_disabled`).

---

# F · ADMIN CALL CENTER (G bölümü — hiç yapılmadı)

### 32. Admin yerleşim ilkesi (Call Center 4 sekme + Dashboard preview)
**Hedef:** Admin'in kanban / calendar / notes / messages yüzeyleri **Call Center** modülü altında **4 sekme** olur (sol nav'da tek giriş). Ana Dashboard'a sürekli güncellenen **preview kartları** eklenir:
- Son mesajlar
- Gönderilen mailler
- Son aramalar
- Gün/personel arama istatistikleri
- Son task aktiviteleri
- Aktif kural fire istatistikleri

Refresh: WS push (default); socket koparsa 30sn polling fallback.
**Bitti =** Owner Dashboard açar → 6 preview kartı canlı veriyle yenilenir; Call Center'a girer → 4 sekme (Kanban/Calendar/Notes/Messages) doğru içerikle açılır.

### 33. Admin birleşim yüzeyleri (kanban+pin/calendar/notes/messages tüm personelin birleşimi)
**Hedef:** Call Center altındaki admin kanban+pin / calendar / notes / messages **tüm personelin** ilgili yüzeyinin **birleşimi**:
- Her öğede personel **adı + rolü** etiketi
- Board'lar arası müşteri/arama taşır (cross-axis transfer admin yetkisiyle)
- Personelin notuna **not ekler** (not üstüne not)
- Tüm personel takvim/notlarını tek ekranda görür
- Segment burada **grup-dropdown** olarak görünür → açılınca içindeki personeller/müşteriler listelenir + segmentin hangi personele atandığı yazar
- Customer Detail Panel admin'de axis filtresinden bağımsız (tüm sekmeler açık)
**Bitti =** Owner Call Center kanban'ında 3 personelin (Linda, Charlette, Ihsan) pin/task'ları ad+rol etiketiyle birleşik; bir segment grup'unu açar → atandığı personel görünür; bir personelin notuna not ekler.

### 34. Admin komisyon onayı
**Hedef:** Komisyon tanımlama zaten var. Admin: manuel self-submit + AI öneri taleplerini onaylar/reddeder; mevcut komisyon aracına bağlı.
**Bitti =** Owner komisyon admin sayfasında Ihsan'ın gönderdiği talebi görür → onaylar → Ihsan /staff'ta status `approved` görür.

### 35. Shadow telemetri ekranı
**Hedef:** Shadow kuralların dry-run + backfill raporları admin ekranında: "bu kural canlı olsaydı şu task'ları üretirdi". Active-vs-shadow **side-by-side diff** (örn. `active: create_task(Linda) | shadow v2: create_task(Linda) + add_note`). **Retention: 30 gün.**
**Bitti =** Owner Shadow Telemetry sayfasında bir shadow kuralın sanal-task listesi görünür; diff modunda active vs shadow karşılaştırması yan yana; gerçek task DB'de yok.

### 36. Rule stats + audit ekranı
**Hedef:** Aktif kuralların **fire/match/latency** metrikleri + `rule_versions` audit log (kim ne zaman edit etti, hangi version canlıda).
**Bitti =** Owner Rule Stats sayfasında aktif bir kuralın 7 günlük metrikleri (fire count, match rate, avg latency) + edit geçmişi (kim, ne zaman, comment) tablo halinde görünür.

---

# Z · PROD-READY ÇIKIŞ

### 37. Uçtan uca canlı senaryo (faz-1 bitti tanımı)
**Hedef:** Aşağıdaki zincir dtfbank container'ında uçtan uca canlı çalışır:
- Owner login → Initial Setup wizard çalışır → 3 dakika sonra sistem dolu
- Linda /staff'a girer → günlük + priority kanban dolu (segment grup-dropdown, AI task badge, drag-drop sıralama)
- Bir task kartı tıklar → TaskBriefModal açılır (telefon/Ad header doğru, condition trace, "Support case oluştur" butonu çalışır)
- "Müşteriye git" → Customer Detail Panel açılır (8 sekme dolu)
- Ihsan komisyon gönderir → Owner onaylar → Ihsan görür
- Owner Call Center → 4 sekme birleşik, segment grup-dropdown
- Mail Marketing'den campaign oluşturur → MailDelivery kuyruğa düşer
- Shadow telemetry'de bir shadow kural canlı olsaydı ne yapardı görünür

Hiçbir mock, hiç seed kalıntısı yok; kullanıcı browser'da deneyince **her şey canlı çalışıyor**.
**Bitti =** Owner + Linda + Charlette + Ihsan 4 hesabıyla browser'da bu senaryo uçtan uca denenir, hata yok, evidence + screenshot toplanır.

### 38. Native browser doğrulaması — ROADMAP'in tüm içeriğini ekran görüntüsüyle ispat
**Hedef:** Tüm ekosistem **gerçek bir tarayıcıda** (Chrome, kullanıcı makinesi) `app.dtfbank.com` + `accounts.dtfbank.com` üzerinden açılır ve **bu ROADMAP'te yazan her madde** (1-37) tarayıcı ekran görüntüsüyle ispatlanır. CLI/HTTP cevabı kanıt sayılmaz. `127.0.0.1`, `localhost`, `vite dev` adres çubuğunda görünürse kanıt **geçersizdir**.

Kapsam: her madde için en az 1 screenshot, hepsi `docs/evidence/native/` altında, dosya adı `m{NN}-{kısa-tanım}-20260629.png` paterniyle. `docs/evidence/native/index.md` tablo halinde madde × screenshot eşlemesi (URL + kanıt cümlesi).
**Bitti =** `docs/evidence/native/index.md` 1-37 maddenin hepsini screenshot ile eşler; kullanıcı tek tek doğrulayabilir; eksik madde yok.

---

## KAPATIŞ

**38 madde yeşil olduğunda Faz-1 prod-ready.** Sıra düzenini koru, her 5 commit'te tüm ROADMAP'i tekrar oku, UI'da denenmeden Bitti deme. Belirsizlik bulursan uydurma, sor. Eski sistemden taşımalarda sığlık tekrarlama — Mail aktarımı bu sefer SEGMENTS DERİNLİĞİNDE olacak.
