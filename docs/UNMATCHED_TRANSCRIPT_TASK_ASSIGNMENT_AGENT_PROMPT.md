# Unmatched Transcript Task Assignment - Implementation Prompt

Asagidaki promptu diger gelistiricinin agentine eksiksiz ver.

---

## Rol

Sen Factory Engine Pro projesinde senior full-stack urun muhendisisin.

Bu bir greenfield proje degildir. Yeni bir mimari, ikinci bir task sistemi veya
paralel bir inbox tasarlamayacaksin. Calisan production sistemindeki tek bir
eksik operasyon akisini, mevcut kod kulturu ve veri modeli icinde tamamlayacaksin.

Basari olcusu backend endpointinin varligi degil, yetkili bir kullanicinin canli
UI'da akisi hatasiz tamamlamasidir.

## Repo ve Handoff

- Repo: `git@github.com:jesuisfatih/factory-engine-pro.git`
- Branch: `main`
- Once `git pull --ff-only origin main` ile guncel kodu al.
- `ugurkeskin53` GitHub write erisimine sahiptir.
- Onceki kritik duzeltme: `a9cc412` - kurala uyan transcriptlerden uretilen
  tasklarin personele teslim akisini onarir.
- Operasyonel handoff: `docs/DEVELOPER_HANDOFF.md`

Repo kirliyse kullanicinin veya baska agentin degisikliklerini silme, resetleme
veya geri alma. Yalnizca bu gorevin dosyalarini stage et.

## Zorunlu Okuma Sirasi

Kod yazmadan once asagidakileri oku:

1. Repo kokundeki tum `AGENTS.md`, `CLAUDE.md` ve esdeger agent talimatlari
2. `docs/DEVELOPER_HANDOFF.md`
3. `docs/ROADMAP.md` dosyasinin tamami
4. `docs/TASK_MANAGEMENT.md` dosyasinin tamami; bu dokumandaki ayri task
   management kapsamini bu ise tasima
5. `docs/RULE_ENGINE_MVP_AGENT_GUIDE.md`
6. `docs/FRONTEND_MCP_AGENT_GUIDE.md`
7. Prisma modelleri:
   - `StaffWorkItem`
   - `StaffWorkOccurrence`
   - `TranscriptWorkflowEvaluation`
   - `AircallCallEvent`
   - `Member`
8. Backend:
   - `services/backend/src/modules/rules/rules.service.ts`
   - `services/backend/src/modules/rules/workflow-executor.service.ts`
   - `services/backend/src/modules/person-workspace/*`
   - `services/backend/src/modules/aircall/*`
   - mevcut merkezi staff-work/task olusturma servisi ve repository'si
9. Contracts ve API client:
   - `packages/contracts/*`
   - `packages/api-client/src/index.ts`
10. Frontend:
   - `apps/person/src/views/CallQueue.tsx`
   - `apps/person/src/components/TaskBriefModal.tsx`
   - `apps/person/src/components/TransferTaskModal.tsx`
   - person Daily/archive route ve API dosyalari
   - admin Call Center/Daily ekranlari, modal ve API dosyalari

Okuma bitmeden kod yazma. Mevcut endpoint, model ve helper adlarini kesfetmeden
yenisini uydurma. Once kisa bir etki haritasi cikar; sonra implementasyona gec.

## Mevcut Durum

Calisan zincir:

```text
Aircall call
  -> transcript
  -> AI resolver ve structured resolverOutput/person_brief
  -> TranscriptWorkflowEvaluation
  -> aktif rule eslesmesi
  -> StaffWorkItem
  -> atanmis personelin Daily follow-up listesi
```

Kurala uyan transcriptlerin task teslim akisi onarildi. Bu davranisi bozma ve
yeniden tasarlama.

Eksik zincir:

```text
resolver basarili
  -> workflow evaluation tamamlandi
  -> hicbir aktif rule task uretmedi
  -> transcript operasyonda gorunmeden bosta kaliyor
```

Mevcut kodda unmatched sonuc siniflari bulunuyor. Ozellikle
`isUnmatchedTranscriptWorkflowStatus` su durumlari taniyor:

- `no_matching_rule`
- `no_action_unmatched`

`resolverStatus = failed`, eksik transcript, hala queued/processing olan resolver
ve evaluation `failed` kayitlari ayni sey degildir. Bunlari unmatched insan
inceleme listesine karistirma. Bunlar teknik hata/retry/operasyonel saglik
yuzeyinde kalmalidir.

Acik bir `no_action` rule'u tarafindan bilincli kapatilan transcript de manuel
task adayi degildir. Yalnizca mevcut kodun gercekten unmatched olarak
siniflandirdigi, resolver'i basarili kayitlari bu akis icine al.

## Urun Karari

Kurala uymayan transcript otomatik task olmayacak. Once yetkili insan tarafindan
incelenecek.

Bu kayitlar:

- admin panelindeki mevcut Daily/Call Center operasyon yuzeyinde gorunecek,
- personel panelindeki mevcut Daily yuzeyinde `Needs review` bolumunde gorunecek,
- task degil, `unmatched transcript review item` olarak davranacak,
- modal acildiginda en ustte sade bir manuel atama alani gosterecek,
- aktif personel secilip insan aciklamasi yazildiginda gercek bir `StaffWorkItem`
  olusturacak,
- olusan task secilen personelin normal Daily follow-up listesine tam bir kez
  dusecek,
- atama basarili oldugunda unmatched listesinden cikacak.

Bu akis otomatik support case veya `ServiceRequest` olusturmaz. Support tamamen
personel kontrollu ayri bir sistemdir.

## Kullanici Deneyimi

### 1. Daily icinde Needs Review

Yeni bir sayfa veya karmasik dashboard yaratma. Admin ve person ekranlarindaki
mevcut Daily kompozisyonuna dogal bir `Needs review` bolumu ekle.

Her review kartinda en az su bilgiler gercek API'den gelmeli:

- musteri eslesmisse ad soyad/sirket, eslesmemisse normalize telefon
- arama tarihi ve saati
- inbound/outbound bilgisi
- resolver'in person-safe call reason/summary bilgisi
- mood/concern ve operational intent varsa person-safe etiketleri
- Shopify match durumu
- son siparis ve son arama ozeti varsa
- neden rule ile task olusmadigini anlatan kisa person-safe durum

Personel UI'da su internal kelimeleri gosterme:

- AI
- workflow
- rule
- axis
- resolver
- debug
- matchedRule
- source metadata
- support case
- commission

UI metni ornegi: `Needs review`, `No follow-up was assigned yet`,
`Review call and assign follow-up`.

Frontend resolverOutput veya raw metadata'dan cumle uydurmasin. Backend staff-safe
bir DTO donsun. Mevcut `person_brief` varsa onu kullan; yoksa sistemdeki mevcut
staff brief fallback servisini kullan. Yeni regex/grep/string heuristic yazma.

### 2. Modal Ust Atama Alani

Unmatched karta tiklandiginda mevcut task/call brief modal kompozisyonunu yeniden
kullan veya onun semantik kardesini olustur. Sag drawer kullanma.

Modalin ilk viewport'unda, en ustte su alanlar gorunmeli:

1. `Assign follow-up` basligi
2. tenant icindeki aktif ve uygun personel secimi
3. zorunlu `What should they do?` aciklama alani
4. tek ana aksiyon: `Assign follow-up`
5. ikincil aksiyon: `No follow-up needed`

Form sade olmali. Kullaniciya outcome, due date, cooldown, rule, event, priority
formulleri veya teknik routing parametreleri doldurtma. Kullanici yalnizca kime
gidecegini ve ne yapilacagini belirtir.

Aciklama taskin insan tarafindan verilen net direktifidir. Resolver'in
`person_brief` verisini ezme; task description/manual assignment note alaninda
audit edilebilir bicimde sakla. Modal altinda transcript ozeti, call excerpt,
musteri/Shopify baglami ve gecmis yine okunabilir kalmali.

Atama sirasinda:

- loading/submitting durumu goster,
- cift tiklamayi engelle,
- hata olursa modal kapanmasin ve anlamli hata mesaji goster,
- basarida toast/confirmation goster,
- review ve Daily query'lerini invalidate et,
- yeni taski secilen personelin listesinde sayfa yenilense de goster.

### 3. Yetki Davranisi

Admin:

- tenant icindeki uygun aktif personele atayabilir,
- tum tenant unmatched kayitlarini gorebilir.

Personel:

- yalnizca mevcut RBAC sozlesmesinin izin verdigi review kapsaminda gorur,
- baskasina task atama yetkisi varsa uygun personeli secebilir,
- baskasina atama yetkisi yoksa sadece kendine alabilir; personel secimi sabit
  veya gizli olur,
- frontend yetkiyi tahmin etmez; backend nihai kontrolu yapar.

Mevcut permission katalogunu incele. Uygun permission zaten varsa onu kullan.
Yeni permission gerekiyorsa master enum, role grant, guard, contract ve testleri
birlikte ekle. `admin` ismine bakip guardsiz gecis yapma.

### 4. No Follow-up Needed

Unmatched inbox sonsuza kadar buyumemeli. `No follow-up needed` aksiyonu:

- gerekceyi zorunlu veya mevcut person-safe reason ile acik tutar,
- task olusturmaz,
- kaydi review listesinden cikarir,
- kim/ne zaman/neden kapatti bilgisini tenant-scoped audit olarak saklar,
- resolverOutput ve transcript kanitini silmez.

Bu aksiyon rule engine'in orijinal evaluation kaydini gecmisten silmemeli veya
gercegi yeniden yazmamalidir. Insan review sonucunu ayri ve audit edilebilir
durum olarak sakla.

## Backend Mimarisi

### Degismez Sinirlar

- Multi-tenant model degismez.
- Her persisted satirda `tenantId` zorunludur ve merkezi Prisma tenant extension
  devrededir.
- Moduller tabloya disaridan dogrudan sahiplenme mantigiyla konusmaz; mevcut
  servis sinirlarini kullanir.
- Managed PostgreSQL ve managed Redis kullanilir. Sunucuya Postgres/Redis
  container'i kurulmaz.
- `StaffWorkItem` personel isinin tek kaynagidir.
- `ServiceRequest`/support bu akista kullanilmaz.
- AI resolver davranisi korunur. Resolver'i text grep/keyword parser'a cevirme.
- Raw transcript her asamada yeniden modele okutulmaz; kayitli resolver output ve
  `person_brief` yeniden kullanilir.

### Kaynak ve Durum Modeli

Oncelikle mevcut modellerin bu review lifecycle'ini kayipsiz tasiyip
tasiyamadigini incele. Yeterliyse yeni tablo ekleme. Yetersizse sadece dar,
tenant-scoped ve migration'li bir review state modeli ekle.

Gerekli semantik durumlar:

```text
pending_review -> assigned
pending_review -> dismissed
```

Kayit asgari olarak sunlari kanitlayabilmeli:

- tenantId
- callEventId
- evaluation id/signal baglantisi
- review status
- assigned staffWorkItemId
- reviewedByMemberId
- reviewedAt
- human description veya dismissal reason

Bir call event birden fazla operational signal evaluation uretebilir. UI'da ayni
call gereksiz sekilde birden fazla kart olmamali. Mevcut signal semantigini
kaybetmeden call-level review item birlestirmesi yap. Atama sonucu tek task mi
yoksa sinyal basina task mi gerektigini mevcut `StaffWorkOccurrence` ve
idempotency kulturune gore belirle; kullaniciya duplicate kart/task gosterme.

### Task Uretimi

Manuel atama endpointi su isi tek transaction/idempotent command olarak yapmali:

1. Tenant ve yetkiyi dogrula.
2. Review item hala `pending_review` mi kontrol et.
3. Hedef member aktif mi, ayni tenantta mi ve staff work almaya uygun mu kontrol et.
4. Bagli Aircall event/resolver output/evaluation verisini tekrar tenant scope ile oku.
5. Mevcut merkezi staff-work olusturma servisiyle `StaffWorkItem` olustur.
6. `sourceCallId`, `sourceEventId`, `sourceOccurredAt`, customer/contact identity,
   operational intent ve staff-safe brief baglarini koru.
7. Insan aciklamasini task description/manual assignment audit alanina yaz.
8. Idempotency key ile tekrar POST/cift tiklama/retry durumunda ikinci task
   olusmasini engelle.
9. Review kaydini `assigned` yap ve `staffWorkItemId` ile bagla.
10. Realtime event/query invalidation icin mevcut event mekanizmasini besle.

`matchedRuleId` uydurma. Manuel atama bir rule eslesmesi degildir. Source ve
metadata degerlerini mevcut kapali enum/contract kulturune uygun, acik ve
person-safe olmayan internal audit alani olarak belirle.

Concurrent iki kullanici ayni kaydi atamaya calisirsa yalnizca biri kazanir.
Digerine `This call was already reviewed` benzeri anlamli 409 hatasi don.

### API ve DTO

Endpoint adlarini mevcut controller naming kulturune gore belirle. En az su
capability'ler bulunmali:

- admin unmatched review listesi
- person Daily unmatched review listesi veya mevcut `daily-operations` DTO'suna
  permission-scoped alan
- review detail/brief
- assign review item
- dismiss review item
- aktif ve uygun assignment targets

Tum input/output Zod contract ile tanimli olmali. `any`, raw Prisma row veya raw
resolver JSON frontend'e sizmamali.

Liste:

- server-side pagination veya bounded limit kullanir,
- son 7 gun/today davranisini mevcut Daily range semantigiyle hizalar,
- en yeni once siralar,
- teknik hatalari unmatched listesine sokmaz,
- assigned/dismissed kayitlari default listede gostermez.

## Frontend Entegrasyonu

### Person

Mevcut TanStack Query akisini kullan:

- query key'leri semantik tut,
- 15 saniyelik mevcut realtime/polling davranisiyla uyumlu ol,
- assign/dismiss sonrasi review, Daily summary ve task list query'lerini invalidate et,
- modal kapat/ac state'inde stale veya duplicate kart birakma.

Uc UI durumu zorunlu:

- loading
- dolu
- bos
- ayrica hata + retry

Bos metin kullaniciya sistemin bozuk oldugunu dusundurmemeli:
`No calls need manual review.`

### Admin

Admin icin yeni bagimsiz ve uyumsuz bir UI yazma. Mevcut Call Center/Daily
kompozisyonu, modal dili, renk tokenlari ve popup davranisini kullan. Admin
review karti person kartiyla ayni backend semantics'e sahip olmali; admin daha
genis tenant scope ve hedef personel yetkisi gorur.

### Staff-safe Metin

Internal statuslar UI'ya aynen basilmaz:

- `no_matching_rule` -> `No follow-up was assigned yet`
- `no_action_unmatched` -> `Review whether a follow-up is needed`
- `resolver_failed` kesinlikle bu listeye girmez

## Test Zorunlulugu

Agent implementasyonu bitirdikten sonra kendisi test eder. Kullaniciya test
ettirme veya sadece build sonucu ile tamamlandi deme.

### Backend Testleri

En az su senaryolari otomatik test et:

1. Basarili resolver + `no_matching_rule` listede gorunur.
2. Basarili resolver + `no_action_unmatched` listede gorunur.
3. Acik rule ile tamamlanmis `no_action` listede gorunmez.
4. `resolverStatus=failed` listede gorunmez.
5. queued/processing resolver listede gorunmez.
6. Farkli tenant kaydi gorunmez ve atanamaz.
7. Pasif veya baska tenant member'a atama 400/404 olur.
8. Yetkisiz personel baskasina atayamaz.
9. Atama tam bir `StaffWorkItem` olusturur ve tum kaynak baglarini korur.
10. Ayni request retry edilince ikinci task olusmaz.
11. Concurrent atamada bir task olusur, diger istek 409 alir.
12. Dismiss task olusturmaz ve audit bilgisini saklar.
13. Atama support `ServiceRequest` olusturmaz.
14. Mevcut rule-matched task delivery testleri hala gecer.

### Frontend Testleri

En az su davranislari test et:

1. Needs review loading/dolu/bos/hata durumlari.
2. Modal ilk viewport'ta assignment alani gorunur.
3. Aciklama bosken submit disabled veya anlamli validation verir.
4. Permission'a gore hedef personel secimi dogru davranir.
5. Submit sirasinda cift tiklama duplicate request uretmez.
6. Basarili atamada kart kaybolur ve Daily task listesi yenilenir.
7. Hata halinde modal acik kalir ve kullanici girdisi kaybolmaz.
8. Internal terimler staff UI'da gorunmez.
9. Light, dark ve mobile gorunumde metinler tasmaz/ust uste binmez.

## Canli Kabul Senaryosu

DTFBank tenantinda gercek veri ve gercek hesaplarla su zinciri kanitla:

1. Resolver'i basarili, rule eslesmesi olmayan bir Aircall call event belirle.
2. DB/API kanitiyla statusun gercekten unmatched oldugunu goster.
3. Admin Daily/Call Center'da `Needs review` kartini goster.
4. Person Daily'de yetki kapsaminda ayni review item'i goster.
5. Modal ac; en ustte personel secimi ve aciklama alanini goster.
6. Ornek olarak aktif bir personele gercek, anlamli aciklamayla ata.
7. API response'ta olusan `staffWorkItemId`yi kanitla.
8. DB'de ayni source event/idempotency key icin tam bir task oldugunu kanitla.
9. Atanan personelin Daily listesinde taski goster.
10. Sayfayi yenile; task kalmali, review karti geri gelmemeli.
11. Ayni assign istegini tekrar dene; duplicate task olmamali.
12. Ayri bir unmatched kaydi `No follow-up needed` ile kapat; task olusmadigini kanitla.
13. Support/ServiceRequest sayisinin bu islemler nedeniyle artmadigini kanitla.

## Kanit Paketi

Tamamlandi raporunda sunlari ver:

- degisen dosyalar ve nedenleri
- migration adi ve uygulama sonucu; migration gerekiyorsa
- backend test sonucu
- frontend typecheck/build sonucu
- gercek API request/response ornekleri
- tenant-safe DB sorgu sonuclari
- structured log ornegi: `request_id`, `tenant_id`, `module`, `action`
- admin Needs Review screenshot
- person Needs Review screenshot
- modal ust assignment alani screenshot
- atama sonrasi hedef personelin Daily task screenshot'i
- dismiss sonrasi bos/yenilenmis review screenshot'i
- light/dark/mobile screenshot
- commit hash ve origin/main push kaniti
- canli container health ve hedef URL kaniti

Screenshot sadece sayfanin acildigini degil, kabul kriterinin gercekten
calistigini gostermeli.

## Deploy Kurali

- Once test, sonra commit, sonra push, sonra production kaniti.
- Repo kulturundeki mevcut Mutagen/tenant deploy kayitlarini oku ve ayni guvenli
  akisla ilerle.
- Yalnizca `factoryengine-*` hedef tenant containerlari kapsamindasin.
- Caddy, Gang Sheet uygulamalari, Shopify uygulamalari, baska containerlar veya
  ilgisiz sunucu servislerine dokunma.
- Tenant `.env`, upload, compose ve managed service ayarlarini koru.
- DNS degisikligi yapma.
- Production migration geri donulemez risk tasiyorsa once acik onay al.
- Prod UI ve gercek hesap kaniti olmadan `bitti` deme.

## Yasaklar

- Mock, seed, fixture veya statik operasyon verisi birakma.
- Resolver'i keyword/grep tabanli sisteme cevirme.
- Her UI render/sync'te transcripti tekrar modele okutma.
- Yeni bir paralel task tablosu veya ikinci task motoru kurma.
- `ServiceRequest` veya otomatik support case olusturma.
- Frontendde raw resolver/rule metadata yorumlama.
- Staff UI'da internal teknik terminoloji gosterme.
- Mevcut matched transcript task delivery akisini bozma.
- Ilgisiz refactor yapma.
- Test edilmemis kodu deploy etme.
- Build basarili diye UX'i tamamlanmis sayma.
- Gorevin bir bolumunu `sonra doneriz` diye birakma.

## Bitis Kapisi

Bu is yalnizca su cumle gercek oldugunda tamamdir:

> Kurala uymayan fakat basariyla cozumlenmis bir arama admin ve yetkili personel
> Daily alaninda inceleme kaydi olarak gorunuyor; modalin en ustunden aktif bir
> personele insan aciklamasiyla atanabiliyor; tam bir kez gercek StaffWorkItem
> olusuyor; secilen personelin normal Daily listesine dusuyor; refresh sonrasi
> kaliyor; review inbox'tan cikiyor; tenant/RBAC/support sinirlari korunuyor ve
> bu zincir agent tarafindan canli UI, API, DB, log ve screenshot ile kanitlaniyor.

Herhangi bir mimari celiski fark edersen kod uydurma. Ilgili dosya ve satirlarla
celiskiyi raporla ve kullanicidan karar iste. Celiski yoksa plan sunup bekleme;
implementasyon, test, commit, push ve canli kanit zincirini tamamla.
