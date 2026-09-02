# ZenithW son güvenlik ve optimizasyon denetimi

**Tarih:** 2 Eylül 2026
**İncelenen commit:** `cbd61b5` (`publish v14.1 AWS migration notes`)
**İlk çalışma biçimi:** Denetim ve raporlama. Kullanıcının sonraki açık onayıyla bulgular için düzeltme turu uygulanmıştır.

## 2 Eylül 2026 düzeltme turu

Bu rapordaki Finding 1–5 ve 7–12 kaynak kod/dağıtım şablonlarında giderildi veya uygulanabilir en dar güvenli karşılığıyla kapatıldı:

- `/diagnostics` artık ayrı bir bearer token ister, token yoksa/yetkisizse varlığını gizleyen `404` verir ve her yanıtta `no-store` kullanır.
- Socket.IO kabulü hem uygulamada global/IP başına hem Nginx el sıkışma ve canlı bağlantı katmanında sınırlandı.
- Çalışma anındaki `ejs:npm` indirme fallback'i kaldırıldı; yalnızca sabitlenmiş `yt-dlp-ejs` paketi kullanılıyor.
- Frontend `script-src 'unsafe-inline'` kaldırıldı. Mevcut inline kodlar deterministik SHA-256 CSP hash'leriyle sınırlandı ve hash drift'i CI kontrolüne bağlandı.
- Kullanıcı URL'leri ile upstream/FFmpeg hata metinleri merkezi redaction katmanından geçiriliyor; query/fragment ve yaygın sır parametreleri journal'a yazılmıyor.
- Frontend ve API için HSTS/temel güvenlik başlıkları eklendi; Nginx ve systemd daha dar yetki/zaman aşımı ayarlarıyla sertleştirildi.
- Doğrudan ve dolaylı Python bağımlılıkları `requirements.lock` içinde sürüm + dağıtım hash'leriyle kilitlendi; kurulum `--require-hashes` doğrulamasına geçirildi. Haftalık CI Bandit, `pip-audit`, test ve CSP bütünlüğü kontrolleri eklendi; GitHub Action'lar immutable SHA ile pinlendi.
- Sessiz cleanup hataları journal'ı taşırmayan, dakikada bir sınırlandırılmış uyarılara çevrildi.
- Geist Mono resmi Vercel kaynağından alınan OFL lisanslı fontla self-host edildi; ziyaretçinin Google Fonts bağlantısı kaldırıldı.
- Bakım workflow'unun eski Railway dağıtım metni AWS/Cloudflare gerçeğine göre düzeltildi; GitHub Actions Dependabot kapsamına eklendi.

Finding 6 canlı `/etc/zenithw.env` kapasite kararı olduğu için bu kaynak commit'inde zorla değiştirilmedi: repodaki t3.small profili güvenli `1` indirme / `640 MB` spool değerlerini koruyor. Canlı değeri düşürmek kullanıcı trafiğini doğrudan değiştireceğinden, EC2 sürümü uygulanırken ölçülerek eşitlenmelidir. Finding 13 ise güvenlik yaması değil, ayrı bir davranış-koruyan modülerleştirme projesidir; ana indirme mimarisini bu turda rewrite etmeme sınırı nedeniyle bilinçli olarak ertelendi.

**Düzeltme doğrulaması:** 77/77 test başarılı; CSP hash kontrolü başarılı; Python hash-lock kurulumu `--dry-run --require-hashes` ile başarılı; Bandit orta/yüksek 0 bulgu; kilitli 38 Python paketinde `pip-audit` bilinen açık bulmadı.

## Kısa karar

İncelenen kaynakta doğrulanmış **kritik veya yüksek önem dereceli bir açık bulunmadı**. Özellikle doğrudan komut enjeksiyonu, path traversal ile dosya okuma, repoya sızmış production sırrı, sahte proxy başlığıyla rate-limit atlama veya açık bir DOM-XSS zinciri doğrulanmadı.

Savunma temeli güçlü: URL ve DNS hedefleri private/link-local ağlara karşı denetleniyor, bağlantılar doğrulanan IP'ye sabitleniyor, FFmpeg uzak protokollerden yalıtılıyor, upload/çıktı/süre/spool sınırları var, hazırlanmış dosyalar yüksek entropili tek kullanımlık token ve istemci IP'siyle korunuyor, CORS dar tutuluyor ve production gizli anahtarları eksikse servis fail-closed davranıyor.

İlk denetim snapshot'ında production öncesi ele alınması gereken **6 orta**, ardından **7 düşük/iyileştirme** bulgusu vardı. En önemli üçü herkese açık ayrıntılı tanılama rotası, sınırsız WebSocket kabul yüzeyi ve kurulu yerel EJS paketi varken açık bırakılan uzaktan npm bileşeni fallback'iydi. Güncel düzeltme durumu yukarıdaki bölümde kayıtlıdır; aşağıdaki bulgular ilk kanıtı korumak amacıyla değiştirilmemiştir.

## Doğrulama özeti

- Mevcut test paketi: **69/69 başarılı**.
- Bandit 1.9.4: **0 high**, 1 medium, 20 low. Medium kayıt `app.py` içindeki geliştirme amaçlı `0.0.0.0` bind'idir; production systemd birimi Gunicorn'u `127.0.0.1:8000` üzerinde çalıştırdığı için production açığı olarak değerlendirilmedi. Subprocess uyarılarında `shell=True` yoktur ve komut argümanları allowlist/yerel dosya sınırlarıyla kurulmaktadır.
- PyPI'nin resmi JSON kayıtlarına göre `requirements.txt` içindeki doğrudan sabitlenmiş 17 paketin incelenen sürümlerinde bilinen vulnerability kaydı dönmedi. Bu kontrol transitive bağımlılıkları ve gelecekte yayımlanabilecek advisories'i kapsamaz.
- Cloudflare'ın güncel resmi IPv4/IPv6 listeleri; `backend/app.py` ve `backend/deploy/nginx/cloudflare-real-ip.conf` içindeki listelerle eşleşiyor.
- Canlı CORS deneyi: `https://evil.example` için `Access-Control-Allow-Origin` dönmedi; `https://zenithw.space` doğru biçimde kabul edildi.
- Canlı `health`, `ready` ve `status` 200 döndü. Canlı `/diagnostics` de kimlik doğrulaması olmadan 200 döndü ve aşağıdaki Finding 1'i doğruladı.
- Güncel worktree'deki commit dışı `frontend/index.html` değişikliği yalnızca Open Graph başlığındaki yazım hatasını düzeltiyor; güvenlik davranışını değiştirmiyor ve bu denetimde değiştirilmedi.

## Orta öncelikli bulgular

### Finding 1 — `/diagnostics` son kullanıcıya açık ve gereğinden fazla bilgi veriyor

**Kanıt:** `backend/app.py:2338-2389`; 2 Eylül 2026 canlı isteği `https://api.zenithw.space/diagnostics` için 200 döndürdü. Yanıtta çalışma modu, beklenen worker sayısı, FFmpeg yolu, JS solver/PO Token durumu, kimlik materyali dosyasının varlığı ve byte büyüklüğü, boş disk, spool bütçesi, kuyruk, cache ve aktif transfer sayaçları bulunuyor. Yanıtta `Cache-Control: no-store` da yok.

**Neden önemli:** Bu veri tek başına sunucuyu ele geçirmez; ancak kapasite, bileşenler ve çalışma anı hakkında saldırgana ücretsiz keşif sağlar. Cloudflare'ın origin secret eklemesi bir yönetici kimlik doğrulaması değildir; normal ziyaretçilerin bütün proxied isteklerine uygulanır.

**Öneri:** Herkese açık `/status` minimal kalmaya devam etsin. `/diagnostics` Cloudflare Access, ayrı bir admin doğrulaması veya yalnızca loopback/VPN üzerinden erişimle korunsun. Yanıta her durumda `Cache-Control: no-store, max-age=0` eklensin. Hassas olmayan ayrıntılar gerekirse toplulaştırılsın.

### Finding 2 — Socket.IO bağlantı kabulünde IP/global üst sınır yok

**Kanıt:** `backend/app.py:3740-3751` bağlantıları yalnızca `connected_sids` sözlüğüne kaydediyor. HTTP route rate limiter'ları WebSocket `connect` olayını kapsamıyor. `backend/deploy/nginx/zenithw.conf` içinde `/socket.io/` için `limit_conn`, `limit_req` veya ayrı bir bağlantı bölgesi yok. Gunicorn sınırı 1000 worker connection.

**Neden önemli:** Raw WebSocket istemcisi browser CORS davranışına bağlı değildir ve izin verilen `Origin` değerini taklit edebilir. Tek worker kullanan serviste uzun süre açık tutulan çok sayıda bağlantı dosya indirme kapasitesini ve belleği tüketebilir.

**Öneri:** Gerçek Cloudflare IP zinciri korunarak Nginx `limit_conn`/`limit_req`, Cloudflare rate limiting/WAF ve uygulama düzeyinde toplam + IP başına Socket.IO kabul sınırı birlikte tasarlansın. Normal indirme progress bağlantıları ve yeniden bağlanma davranışı yük testiyle doğrulanmadan agresif eşik konmasın.

### Finding 3 — Kurulu yerel EJS paketine rağmen uzaktan npm bileşeni çalıştırılabiliyor

**Kanıt:** `backend/app.py:1796-1799`, `yt-dlp-ejs==0.8.0` kurulu olsa da `remote_components = {"ejs:npm"}` fallback'ini açıyor. yt-dlp'nin resmi README'si bu seçeneğin gerektiğinde npm'den dış JavaScript bileşenleri getirmesine izin verdiğini ve uygun `yt-dlp-ejs` paketi kuruluysa normalde gerekmediğini söylüyor.

**Neden önemli:** Production'da çalışabilecek kodun yalnızca sabitlenmiş requirements kümesinden gelmesi yerine çalışma anında uzak kaynağa genişlemesi supply-chain ve tekrarlanabilirlik yüzeyini büyütür.

**Öneri:** Önce EC2 üzerinde sabitlenmiş `yt-dlp-ejs` paketiyle gerçek YouTube testleri yapılmalı. Yerel paket yeterliyse remote fallback kapatılmalı. Mecburen tutulacaksa indirilen bileşen sürümü/integrity politikası, ağ hedefi ve değişiklik alarmı belgelenmeli.

### Finding 4 — CSP mevcut fakat `unsafe-inline` XSS etkisini sınırlama gücünü azaltıyor

**Kanıt:** `frontend/_headers:2` hem `script-src` hem `style-src` için `'unsafe-inline'` içeriyor. Frontend'de çok sayıda inline `<script>`, event attribute ve `innerHTML` kullanımı var.

**Değerlendirme:** İncelenen dinamik medya başlığı, thumbnail URL'si, playlist ve geçmiş alanlarında `escapeHtml`, protokol kontrolü veya `textContent` kullanıldığı görüldü; çalışan bir DOM-XSS payload'ı doğrulanmadı. Ancak gelecekte tek bir kaçış hatası eklendiğinde mevcut CSP inline script çalışmasını engelleyemez.

**Öneri:** Inline event handler'lar `addEventListener` kullanımına, inline scriptler versioned dosyalara taşınsın. Sonra `script-src` içinden `unsafe-inline` kaldırılıp hash/nonce tabanlı politika kullanılabilsin. `innerHTML` yalnızca açıkça statik template noktalarında kalsın; remote/localStorage verisi için ortak güvenli DOM oluşturucular kullanılsın.

### Finding 5 — Kullanıcı URL'leri ve upstream hata metinleri journal'a hassas parametre taşıyabilir

**Kanıt:** `backend/app.py:2671` ilk 60 karakteriyle ham kullanıcı URL'sini; `backend/app.py:3320` ve başka hata yolları upstream hata metninin ilk bölümünü logluyor. İmzalı/private medya bağlantılarının token veya query parametreleri bu alanlarda bulunabilir.

**Neden önemli:** Loglar uygulama cevabından daha uzun saklanabilir ve operasyon erişimi olan kişiler/araçlar tarafından görülebilir. URL ilk 60 karakterle kesilse bile kısa token'lar veya query başlangıcı kayda girebilir; upstream hata metni signed medya URL'si içerebilir.

**Öneri:** Loglarda URL yalnızca normalize edilmiş hostname + path özeti veya keyed hash olarak tutulmalı; query/fragment tamamen atılmalı. Bilinen `token`, `sig`, `signature`, `auth`, `key` alanları merkezi redaction filtresinden geçirilmeli. Kullanıcıya dönen mevcut sabit hata kodları korunmalı.

### Finding 6 — Canlı kaynak limitleri repodaki EC2 örneğiyle drift etmiş

**Kanıt:** `backend/deploy/zenithw.env.example` `MAX_CONCURRENT_DOWNLOADS=1` ve `MAX_SPOOL_SIZE_MB=640` öneriyor. Canlı `/status` `max_concurrent_downloads: 2`; canlı `/diagnostics` `max_spool_bytes: 4294967296` (4 GiB) gösterdi. Canlı boş disk denetim anında yaklaşık 15.4 GB idi.

**Neden önemli:** Bu değerler tek başına güvensiz değildir; fakat source-controlled deployment profili production gerçeğini temsil etmiyorsa yeniden kurulum, olay müdahalesi ve kapasite hesabı güvenilmez olur. t3.small üzerinde iki eşzamanlı ağır post-process CPU/RAM gecikmesini büyütebilir.

**Öneri:** Önce bu farkın bilinçli olup olmadığı netleştirilsin. Gerçek medya ile iki paralel indirme + bir transfer senaryosunda RAM, CPU credit, disk ve latency ölçülsün. Onaylanan production değerleri sırsız bir deployment profile dosyasında sürümlensin; gizli değerler yalnızca `/etc/zenithw.env` içinde kalsın.

## Düşük öncelikli güvenlik ve sağlamlık iyileştirmeleri

### Finding 7 — HSTS ve API güvenlik başlıkları canlı yanıtlarda yok

Canlı frontend ve API yanıtlarında `Strict-Transport-Security` görülmedi. API yanıtlarında ayrıca `X-Content-Type-Options`, `Referrer-Policy` ve `Permissions-Policy` yok; frontend bunların çoğunu `_headers` üzerinden veriyor. HTTP zaten HTTPS'e yönlendiriliyor ve Cloudflare aktif olduğu için risk düşüktür. Bütün alt alanların HTTPS garantisi doğrulandıktan sonra Cloudflare/Nginx üzerinden kontrollü HSTS (`includeSubDomains` kararı ayrıca değerlendirilerek) ve API için uygun temel başlıklar eklenebilir.

### Finding 8 — Transitive bağımlılıklar hash'li, tekrarlanabilir bir lock ile sabit değil

Doğrudan paketler `==` ile pinli ve günlük Dependabot yapılandırması var; bu iyi. Fakat transitive sürümler/hashes sabitlenmediği için aynı requirements dosyası farklı tarihte farklı alt bağımlılıklar kurabilir. `pip-compile --generate-hashes` benzeri bir lock, CI'da `pip-audit` ve mümkünse SBOM üretimi eklenmeli. Dependabot'un açtığı PR'lar gerçek indirme testleri olmadan otomatik merge edilmemeli.

### Finding 9 — Nginx ve systemd savunması daha dar yetkilerle güçlendirilebilir

Mevcut systemd biriminde `PrivateTmp`, `ProtectSystem=full`, `ProtectHome=read-only` ve `NoNewPrivileges` bulunması olumlu. İhtiyaca göre `PrivateDevices`, `ProtectKernelTunables`, `ProtectKernelModules`, `ProtectControlGroups`, capability bounding ve sınırlı address family seçenekleri değerlendirilebilir. Nginx için `server_tokens off`, body/header timeout'larının açıkça sürümlenmesi ve güvenlik başlıklarının tek yerde yönetilmesi faydalı olur. Her hardening seçeneği FFmpeg/Deno/yt-dlp gerçek testiyle ilerlemeli.

### Finding 10 — Temizlik hatalarının bir kısmı sessizce yutuluyor

Bandit, birden fazla geniş `except Exception: pass` yolu raporladı. Çoğu best-effort cleanup olduğu için request'in başarısını bozmak istememek mantıklı; ancak silinemeyen dosya veya kapanmayan child process görünmez kalabilir. Hassas veri/log gürültüsü oluşturmadan rate-limited warning ve sayaç eklenmesi, `/diagnostics` admin arkasına alındıktan sonra cleanup failure metriğinin orada tutulması önerilir.

### Finding 11 — Google Fonts üçüncü taraf bağlantısı gizlilik yüzeyini büyütüyor

Birçok sayfa `fonts.googleapis.com` ve `fonts.gstatic.com` üzerinden font yüklüyor. Analytics veya reklam betiği bulunmadığı doğrulandı; yine de ziyaretçi tarayıcısı Google'a IP/User-Agent seviyesinde bağlantı kuruyor. Gizlilik metni bunu özel olarak adlandırmıyor. Geist fontunun lisansı uygunsa Cloudflare Pages üzerinden self-host etmek hem bu bağlantıyı kaldırır hem CSP'yi daraltır.

### Finding 12 — GitHub Actions supply-chain ve metin drift'i

Bakım workflow'u `actions/checkout@v4` major tag'ine bağlı; immutable commit SHA değil. Actions ekosistemi Dependabot yapılandırmasına dahil değil. Ayrıca workflow özeti hâlâ “Railway ve Cloudflare ... dağıtacak” diyor; v14.1 AWS modelinde bu operasyon mesajı eskimiş durumda. Action SHA pinleme, GitHub Actions Dependabot kaydı ve AWS deploy gerçeğiyle uyumlu metin önerilir.

### Finding 13 — Büyük tek dosyalar değişiklik riskini ve gereksiz sayfa yükünü artırıyor

`backend/app.py` yaklaşık 3.756 satır/158 KB, ana frontend JS yaklaşık 1.552 satır/120 KB. Tek worker mimarisi değiştirilmeden; request parsing, güvenli ağ, prepared-file lifecycle, conversion ve observability ayrı modüllere çıkarılabilir. Frontend'de ortak shell/settings/history/tool kodu ayrılırsa her özel araç sayfası ana indirme uygulamasının tamamını yüklemek zorunda kalmaz. Bu performans çalışması davranış değişikliği olmadan, mevcut contract testleri korunarak yapılmalı.

## Korunması gereken güvenlik kararları

- **Worker sayısını artırmayın.** Rate limit, kuyruk, iptal olayları, Socket.IO kimlikleri, cache ve dosya token'ları process-local. Redis/message queue/shared storage olmadan ikinci worker veya replica güvenli değildir.
- Nginx gerçek IP yapılandırması Cloudflare'ın resmi listesiyle güncel; `X-Forwarded-For`, `X-Real-IP` veya `CF-Connecting-IP` doğrudan istemciden kabul edilmemeli.
- `ENABLE_ORIGIN_LOCK=1`, güçlü `ORIGIN_SECRET`, Cloudflare Transform Rule ve Security Group'un yalnız Cloudflare HTTP(S) aralıklarını kabul etmesi birlikte korunmalı. Ortak sır tek başına admin authentication sayılmamalı.
- FFmpeg `protocol_whitelist`, native yt-dlp downloader ve aria2'nin kapalı olması SSRF savunmasının parçasıdır; performans gerekçesiyle gevşetilmemeli.
- Hazırlanmış dosya token'larının tek kullanımlı, kısa ömürlü ve owner-IP bağlı yapısı korunmalı.
- Kullanıcı dosya adları `textContent`/sanitize akışından çıkarılmamalı; metadata/thumbnail/title verisi doğrudan `innerHTML` içine alınmamalı.

## Önerilen uygulama sırası

1. `/diagnostics` erişimini kapat veya gerçek admin katmanına al; `no-store` ekle.
2. Socket.IO için ölçülü global/IP bağlantı sınırı ve yük testi ekle.
3. Yerel EJS testi sonrası `ejs:npm` remote fallback kararını kapat veya bütünlük politikasıyla sınırla.
4. URL ve upstream hata loglarına merkezi redaction uygula.
5. Production limit drift'ini doğrula; t3.small üzerinde paralel gerçek medya yük testi yap.
6. CSP inline kullanımını kademeli kaldır; ardından HSTS/API header ve servis hardening turuna geç.
7. Hash'li dependency lock + audit CI; sonrasında modülerleştirme ve frontend bundle ayrıştırması.

## Resmî doğrulama kaynakları

- Cloudflare IP listeleri: `https://www.cloudflare.com/ips-v4` ve `https://www.cloudflare.com/ips-v6`
- yt-dlp remote component açıklaması: `https://github.com/yt-dlp/yt-dlp/blob/master/README.md`
- Paket vulnerability kayıtları: `https://pypi.org/pypi/<paket>/<sürüm>/json`
