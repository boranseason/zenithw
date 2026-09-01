<p align="center">
  <a href="./README.md">English</a> •
  <a href="./README.tr.md">Türkçe</a> •
  <a href="./README.fr.md">Français</a> •
  <a href="./README.ja.md">日本語</a> •
  <a href="./README.de.md">Deutsch</a>
</p>

---

# ZenithW

**Ücretsiz, reklamsız ve filigransız medya indirici.** YouTube, TikTok, Instagram, X/Twitter, Reddit ve daha fazlasından tek tıkla video ve ses indirin.

🔗 **Canlı Site:** [zenithw.space](https://zenithw.space)

🏷️ **Mevcut Sürüm:** `v14.0` — Zamana duyarlı daha sıcak bir ana sayfa, özel araç sayfaları, duyarlı ortak navigasyon, daha sakin bir ortam ve daha temiz bir sürüm deneyimi.

---

## İçindekiler

- [Özellikler](#özellikler)
- [Teknoloji Yığını](#teknoloji-yığını)
- [Proje Yapısı](#proje-yapısı)
- [Başlarken](#başlarken)
- [Ortam Değişkenleri](#ortam-değişkenleri)
- [API Referansı](#api-referansı)
- [Dağıtım Modeli](#dağıtım-modeli)
- [Güvenlik](#güvenlik)
- [Sürüm Geçmişi](#sürüm-geçmişi)
- [Yasal](#yasal)
- [Lisans](#lisans)
- [İletişim](#iletişim)

---

## Özellikler

- 🎬 **Çoklu platform desteği** — YouTube, TikTok, Instagram, X/Twitter, Reddit ve diğer birçok kaynak (yt-dlp altyapısıyla)
- 🎵 **Video veya Ses** — mp4/webm/mkv gibi video formatları; mp3/flac/wav/ogg/opus/m4a gibi ses formatları
- 🔇 **Sessiz Mod** — Ses izi olmadan video indirme
- 📃 **Toplu / Oynatma Listesi İndirmeleri** — Yapıştırılan 10 bağlantıya kadar işleme veya 50 öğeye kadar oynatma listelerini inceleme
- ⏭️ **SponsorBlock Entegrasyonu** — Sponsor bölümlerini, introları, outroları ve daha fazlasını otomatik olarak atlama veya kaldırma
- 🖼️ **Kapak Resmi İndirme** — Medya ile birlikte veya bağımsız olarak kapak resmi indirme
- 📝 **Alt Yazı ve Meta Veri Desteği** — Mevcut alt yazıları indirme ve video meta verilerini gömme
- 🔄 **Dönüştürücü** — Önce uyumlu akışları yeniden kapsüller (remux), yalnızca istenen çıktı gerektirdiğinde yeniden kodlar (re-encode)
- 🎞️ **Gerçek Remux** — Orijinal dosyayı değiştirmeden döndürmek yerine FFmpeg akış kopyalaması (stream copy) ile uyumlu kapsayıcıyı değiştirir
- 🌍 **4 Dil Desteği** — Türkçe, İngilizce, Fransızca, Almanca
- 🎨 **Özelleştirilebilir Arayüz** — Açık/koyu temalar, vurgu renkleri, akıcı animasyonlar
- 🔒 **Sunucu Tarafında Geçmiş Tutulmaz** — İndirme geçmişi yalnızca cihaz üzerinde yerel olarak (localStorage) saklanır
- ⚡ **Gerçek Zamanlı İlerleme** — Socket.IO ile canlı indirme durumu
- 💾 **Sınırlı Geçici Depolama** — Toplam depolama alanı, minimum boş disk alanı, hazırlanan dosya ömrü ve eşzamanlı aktarım sınırları sunucuyu korur
- 🚀 **Yerel Tarayıcı Aktarımı** — Tamamlanan medya, büyük bir JavaScript Blob'una kopyalanmak yerine kısa ömürlü, tek kullanımlık bir indirme URL'si üzerinden sunulur

> **Not:** aria2 çoklu bağlantı hızlandırması, güvenlik nedenleriyle (SSRF koruması) şu anda devre dışıdır. Gelecekte uygun ağ izolasyonu sağlandığında tekrar etkinleştirilebilir.

---

## Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Backend | Python, Flask, Flask-SocketIO (gevent) |
| İndirme Motoru | [yt-dlp](https://github.com/yt-dlp/yt-dlp) |
| Bölüm Atlama | [SponsorBlock API](https://sponsor.ajay.app/) |
| Medya İşleme | FFmpeg |
| Frontend | Pure HTML/CSS/JS (Framework yok) |
| Frontend Barındırma | [Cloudflare Pages](https://pages.cloudflare.com) |
| Backend Barındırma | [Amazon EC2](https://aws.amazon.com/tr/ec2/) — Ubuntu, Nginx, systemd |
| Uç Ağ, DNS ve TLS | [Cloudflare](https://www.cloudflare.com/) |

---

## Proje Yapısı

```
zenithw/
├── .gitignore                   # Yerel/çalışma zamanı kalıntılarını Git dışında tutar
├── .github/
│   └── dependabot.yml
├── backend/
│   ├── downloads/               # Geçici indirme/işleme dosyaları (çalışma zamanı)
│   ├── app.py                   # Flask API — meta veri, medya görevleri, yerel dosya aktarımı, sağlık, iptal
│   ├── requirements.txt
│   ├── requirements-dev.txt     # İsteğe bağlı yerel/CI araçları; canlı ortam kurulumlarından hariç tutulur
│   ├── nixpacks.toml            # İsteğe bağlı PaaS derleme konfigürasyonu (ffmpeg dahil)
│   ├── Procfile                 # Gunicorn + geventwebsocket çalıştırıcısı
│   └── .gitignore
├── frontend/
│   ├── index.html               # Ana uygulama (SPA tarzı)
│   ├── app.html                 # Android uygulama indirme sayfası
│   ├── about.html
│   ├── privacy.html
│   ├── terms.html
│   ├── dmca.html
│   ├── status.html              # Canlı sunucu durumu
│   ├── thanks.html
│   ├── updates.html             # Değişiklik günlüğü (Changelog)
│   ├── vs-cobalt-tools.html
│   ├── vs-savefrom.html
│   ├── vs-y2mate.html
│   ├── app.[content-hash].js    # Önizleme sayfası uygulama kodu
│   ├── updates-core.[content-hash].js
│   ├── updates-archive.[content-hash].js
│   ├── style.[content-hash].css
│   ├── version.js               # Sürüm bilgisi için tek doğruluk kaynağı
│   ├── zenithw.png
│   ├── robots.txt
│   └── sitemap.xml
├── functions/
│   └── _middleware.js           # Cloudflare Pages bakım modu ara yazılımı
├── LICENSE
└── README.md
```

---

## Başlarken

### Önkoşullar

- Python 3.10+
- FFmpeg kurulmuş ve `PATH` ortam değişkenine eklenmiş olmalıdır

### Kurulum

```bash
git clone https://github.com/kakangeldi82-netizen/zenithw.git
cd zenithw/backend

python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

### Yerel Olarak Çalıştırma

```bash
python app.py
```

Sunucu varsayılan olarak `http://localhost:5000` adresinde başlar.

Yerel frontend geliştirmesi için `frontend/` dizinindeki dosyaları açın veya herhangi bir statik dosya sunucusu ile çalıştırın. Backend'in `localhost` isteklerini kabul etmesi için `FLASK_ENV=development` veya `ALLOW_DEV_CORS=1` olarak ayarlayın.

---

## Ortam Değişkenleri

| Değişken | Zorunlu mu? | Açıklama |
|---|---|---|
| `PORT` | Hayır (varsayılan `5000`) | Sunucunun dinleyeceği port |
| `SECRET_KEY` | **Evet** (Canlı ortamda) | Flask gizli anahtarı. Rastgele bir değer yalnızca geliştirme modunda oluşturulur |
| `YOUTUBE_COOKIES` | Hayır | YouTube bot korumasını geçmek için kullanılan tarayıcıdan dışa aktarılmış `cookies.txt` içeriği |
| `YOUTUBE_POT_PROVIDER_URL` | Hayır | EC2/Linux kurulumunda YouTube PO Token sağlayıcısının yerel loopback temel URL'si |
| `FLASK_ENV` / `ALLOW_DEV_CORS` | Hayır | CORS üzerinden yerel kaynaklara izin vermek için `development` veya `1` yapın |
| `ORIGIN_SECRET` | Kaynak kilidi etkinken **Evet** | Cloudflare tarafından `X-Origin-Verify` başlığında gönderilen ortak gizli anahtar |
| `ENABLE_ORIGIN_LOCK` | Hayır (varsayılan etkin) | Yalnızca kaynak anahtarı kontrolü kasıtlı olarak devre dışı bırakıldığında `0` yapın |
| `TRUST_PROXY` | Hayır (varsayılan etkin) | Cloudflare/proxy istemci IP başlıklarına güvenin; backend doğrudan sunulduğunda devre dışı bırakın |
| `ARIA2_ENABLED` | Hayır | Şu anda yoksayılıyor — SSRF koruması için aria2 devre dışı bırakılmıştır |
| `DOWNLOAD_TIMEOUT_SECONDS` | Hayır (varsayılan `600`) | Tek bir indirme için izin verilen maksimum süre |
| `FFMPEG_TIMEOUT_SECONDS` | Hayır (varsayılan `120`) | Tek bir FFmpeg dönüştürme veya sessize alma işlemi için maksimum çalışma süresi |
| `FFMPEG_THREADS` | Hayır (varsayılan `2`) | yt-dlp sonrası işleme ve yüklenen dosya dönüştürme tarafından paylaşılan FFmpeg iş parçacığı üst sınırı; production t3.small üzerinde `1` kullanılır |
| `MAX_CONCURRENT_DOWNLOADS` | Hayır (varsayılan `2`) | Genel eşzamanlı indirme sınırı |
| `MAX_CONCURRENT_CONVERSIONS` | Hayır (varsayılan `1`) | Genel eşzamanlı dönüştürme sınırı |
| `MAX_CONCURRENT_PER_IP` | Hayır (varsayılan `5`) | IP başına eşzamanlı istek sınırı |
| `MAX_DOWNLOAD_QUEUE` | Hayır (varsayılan `12`) | Bir çalıştırıcı yuvası bekleyen maksimum indirme sayısı |
| `MAX_QUEUE_WAIT_SECONDS` | Hayır (varsayılan `120`) | Bir indirmenin kuyrukta bekleyebileceği maksimum süre |
| `MAX_VIDEO_DURATION_SECONDS` | Hayır (varsayılan `5400`) | İzin verilen maksimum video uzunluğu (90 dakika) |
| `MAX_TRANSCODE_DURATION_SECONDS` | Hayır (varsayılan `600`) | Yüksek CPU kullanan kodek dönüştürme için maksimum süre; daha uzun uyumlu dosyalar yine de remux kullanabilir |
| `MAX_DOWNLOAD_SIZE_MB` | Hayır (varsayılan `1536`) | MB cinsinden izin verilen maksimum dosya boyutu |
| `MAX_CONVERT_OUTPUT_SIZE_MB` | Hayır (varsayılan `1024`) | MB cinsinden maksimum dönüştürülmüş çıktı boyutu |
| `MAX_SPOOL_SIZE_MB` | Hayır (varsayılan `4096`) | MB cinsinden toplam geçici/hazırlanmış dosya depolama bütçesi |
| `MIN_FREE_DISK_MB` | Hayır (varsayılan `512`) | Görevleri kabul ederken ve çalıştırırken korunan minimum boş disk alanı |
| `DOWNLOAD_SPOOL_RESERVATION_MB` | Hayır (varsayılan `2048`) | Kabul edilen her indirme görevi için ayrılan kapasite |
| `MAX_CONCURRENT_TRANSFERS` | Hayır (varsayılan `2`) | Maksimum eşzamanlı hazırlanmış dosya aktarımı |
| `MAX_CONCURRENT_TRANSFERS_PER_IP` | Hayır (varsayılan `2`) | IP başına izin verilen eşzamanlı hazırlanmış dosya aktarımı |
| `TRANSFER_QUEUE_WAIT_SECONDS` | Hayır (varsayılan `120`) | Yerel aktarım yuvası için maksimum bekleme süresi |
| `PREPARED_FILE_TTL` | Hayır (varsayılan `600`) | Saniye cinsinden kullanılmayan bir hazırlanmış indirme belirtecinin ömrü |
| `INFO_CACHE_TTL_SECONDS` | Hayır (varsayılan `45`) | Kısa meta veri yanıt önbelleği ömrü |
| `INFO_CACHE_MAX_SIZE` | Hayır (varsayılan `256`) | Bellekte tutulan maksimum temizlenmiş meta veri yanıtı sayısı |
| `CONVERSION_RATE_LIMIT_WINDOW` | Hayır (varsayılan `600`) | Saniye cinsinden IP başına dönüştürme kotası penceresi |
| `CONVERSION_RATE_LIMIT_MAX_REQUESTS` | Hayır (varsayılan `2`) | Dönüştürme kotası penceresi sırasında IP başına izin verilen dönüştürme sayısı |
| `CANCEL_RATE_LIMIT_WINDOW` | Hayır (varsayılan `60`) | Saniye cinsinden ayrı iptal kotası penceresi |
| `CANCEL_RATE_LIMIT_MAX_REQUESTS` | Hayır (varsayılan `30`) | Normal API kotasını tüketmeden IP başına izin verilen iptal isteği sayısı |
| `MAINTENANCE_MODE` | Hayır (varsayılan `workflow`) | `workflow` committed yapılandırmayı okur; `1`/`0` acil durum ortam geçersiz kılmasıdır |
| `MAINTENANCE_TITLE` | Hayır (Yalnızca Cloudflare) | Bakım sayfasında gösterilen isteğe bağlı başlık |
| `MAINTENANCE_MESSAGE` | Hayır | 240 karakterle sınırlı isteğe bağlı kamuya açık bakım açıklaması |
| `MAINTENANCE_UNTIL` | Hayır | İsteğe bağlı ISO 8601 hedef zamanı, örneğin `2026-08-25T23:30:00+03:00` |
| `MAINTENANCE_RETRY_AFTER` | Hayır (varsayılan `900`) | 60 ile 86400 arasında sınırlanmış saniye cinsinden yeniden deneme ipucu |

---

## Bakım Modu

`functions/_middleware.js` dosyasındaki Cloudflare Pages ara yazılımı, gerçek bir HTTP `503 Service Unavailable`, `Retry-After`, `no-store` ve `noindex` başlıkları ile kedi temalı `frontend/maintenance.html` sayfasını sunar. `robots.txt`, `sitemap.xml` ve `/.well-known/` erişilebilir kalır. `/maintenance-status`, açık sayfanın bakımın ne zaman bittiğini algılamasını ve otomatik olarak yeniden yüklenmesini sağlar.

Normal kontrol akışı **GitHub → Actions → Bakım modu → Run workflow** şeklindedir. `enable` veya `disable` seçeneğini belirleyin, isteğe bağlı olarak metni/bitiş zamanını düzenleyin ve çalıştırın. İş akışı, eşleşen `backend/maintenance-config.json` ve `frontend/maintenance-config.json` dosyalarını tek bir commit ile günceller. 

Backend, yeni `/info`, `/download`, `/thumbnail` ve `/convert` isteklerini JSON `503` ile reddederken; `/cancel`, `/files/<token>` ve `/health` kullanılabilir kalır.

---

## API Referansı

| Uç Nokta (Endpoint) | Metot | Açıklama |
|---|---|---|
| `/info` | POST | Verilen URL için video/oynatma listesi meta verilerini döndürür |
| `/download` | POST | Tek bir indirme/çıkarma görevi çalıştırır ve kısa ömürlü bir yerel indirme URL'si döndürür |
| `/files/<token>` | GET / HEAD | Hazırlanan bir dosyayı tek kullanımlık, IP'ye bağlı bir belirteç üzerinden aktarır |
| `/files/<token>/status` | GET | Dosya ayrıntılarını ifşa etmeden istemciye hazırlanmış/aktarılıyor/tamamlandı durumunu bildirir |
| `/thumbnail` | POST | Verilen URL için kapak resmini indirir |
| `/convert` | POST | Yüklenen bir dosyayı yeniden kapsüller (remux) veya dönüştürür ve yerel bir indirme URL'si döndürür |
| `/cancel` | POST | Devam eden bir indirmeyi iptal eder |
| `/health` | GET | Minimum canlılık kontrol yanıtı |
| `/ready` | GET | Backend hazırlık yanıtı; gerekli medya bağımlılıkları veya disk bütçesi uygun olmadığında 503 döndürür |
| `/diagnostics` | GET | Kaynak korumalı bağımlılık, kuyruk, önbellek, aktarım ve tek çalıştırıcı teşhis verileri |

Normal API uç noktaları **IP başına dakikada 10 istek** ile sınırlandırılmıştır. `/health` ve `/ready` durum kontrol noktalarıdır, `/cancel` ayrı bir varsayılan **dakikada 30 istek** kotasına sahiptir ve `/convert` ek olarak **IP başına 10 dakikada 2 dönüştürme** olarak varsayılana ayarlanmıştır.

---

## Dağıtım Modeli

Backend kasıtlı olarak **Amazon EC2 üzerindeki tek bir Gunicorn çalıştırıcısıyla** çalışır. Hız sınırları, semaforlar, iptal olayları, Socket.IO tanımlayıcıları, meta veri önbellek girdileri, hazırlanan dosya belirteçleri ve geçici dosyalar şu anda işlem içi (process-local) olarak tutulur.

Paylaşılan koordinasyonu Redis'e taşımadan `--workers` sayısını artırmayın veya kopya eklemeyin. Kaynak korumalı `/diagnostics` yanıtı `horizontal_scaling_safe: false` ve `expected_gunicorn_workers: 1` olarak rapor verir.

Dikey ölçeklendirme (RAM/CPU artırma) güvenlidir.

---

## Güvenlik

- CORS, `zenithw.space` (ve geliştirme aşamasında localhost) ile sınırlandırılmıştır
- Cloudflare kaynak kilidi, üretimde zamanlamaya dayanıklı bir `X-Origin-Verify` ortak gizli anahtar eşleşmesi gerektirir
- Yüklenen dosyalar ayıklanır ve izin verilen uzantı listesiyle sınırlandırılır
- Canlı ortamda `SECRET_KEY` zorunludur
- İndirilen/dönüştürülen dosyalar işlendikten kısa bir süre sonra otomatik olarak silinir
- SSRF koruması, URL doğrulama ve alt seviye soket bağlantıları sırasında özel/ayrılmış hedefleri engeller
- yt-dlp ağ aktarımları kendi yerel indiricisine zorlanır, böylece soket korumaları etkin kalır
- FFmpeg; indirme sonrası işleme, sessize alma ve yüklenen dosya dönüştürme sırasında yerel protokollerle sınırlandırılmıştır
- Kullanıcı denetimindeki dosya adları, DOM XSS'i önlemek için işlenmeden önce HTML kaçış karakterlerine dönüştürülür
- Uygulama Google Analytics, reklam pikselleri veya davranışsal takip komut dosyaları yüklemez

Bir güvenlik açığı mı buldunuz? Lütfen [info@zenithw.space](mailto:info@zenithw.space) adresine bildirin.

---

## Sürüm Geçmişi

İki dilli tam değişiklik günlüğüne [zenithw.space/updates.html](https://zenithw.space/updates.html) adresinden ulaşılabilir. v11 serisi güvenlik sıkılaştırmasını, v12 sunum ve işleme iyileştirmelerini, v13 uçtan uca doğrulanmış teslimatı kapsar. v14.0 ise özel araç sayfaları ve ortak duyarlı navigasyon ile daha sakin bir arayüz sunar.

---

## Yasal

ZenithW'nin desteklenen platformların hiçbiriyle resmi bir bağı yoktur ve hiçbir içeriği barındırmaz. Yalnızca kullanıcının sahip olduğu veya kullanma iznine sahip olduğu içerikler içindir:

- [Kullanım Koşulları](https://zenithw.space/terms.html)
- [Gizlilik Politikası](https://zenithw.space/privacy.html)
- [DMCA Bildirimi](https://zenithw.space/dmca.html)

---

## Lisans

[MIT](./LICENSE)

---

## İletişim

- Geliştirici: [@boranseason](https://www.instagram.com/boranseason)
- E-posta: [info@zenithw.space](mailto:info@zenithw.space)
