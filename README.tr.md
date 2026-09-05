# ZenithW

> Kullanım hakkınız bulunan medyaları indirmek, dönüştürmek ve remux etmek için sade, reklamsız bir çalışma alanı.

[Canlı uygulama](https://zenithw.space) · [Durum](https://zenithw.space/status) · [Güncellemeler](https://zenithw.space/updates) · [English](README.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [日本語](README.ja.md)

Güncel sürüm: **v14.2**

## Neler yapar?

- YouTube, TikTok, Instagram, X, Reddit ve yt-dlp uyumlu diğer kaynakları çözümler.
- Video, ses, sessiz video, oynatma listesi ve küçük bağlantı gruplarını işler.
- FFmpeg ile dönüştürür; uyumlu akışları gereksiz kalite kaybı olmadan remux eder.
- Altyazı, metadata, kapak görseli, SponsorBlock, iptal ve canlı ilerleme desteği sunar.
- İndirme geçmişini sunucu hesabında değil, kullanıcının tarayıcısında tutar.
- Türkçe, İngilizce, Fransızca ve Almanca duyarlı arayüz sağlar.

## Mimari

| Katman | Çalışma ortamı |
|---|---|
| Frontend | Cloudflare Pages üzerinde Vanilla HTML, CSS ve JavaScript |
| Edge | Cloudflare DNS, proxy, TLS ve origin doğrulaması |
| Backend | AWS EC2 üzerinde Flask, Gunicorn, gevent ve Socket.IO |
| Medya | yt-dlp, FFmpeg, Deno/EJS ve isteğe bağlı PO Token sağlayıcısı |
| Servis yönetimi | Ubuntu, Nginx ve systemd |

Backend bilinçli olarak **tek worker** ile çalışır. İş durumu, Socket.IO odaları ve hazırlanmış dosyaların sahipliği process içinde tutulur; ortak koordinasyon ve depolama eklenmeden worker veya replica sayısı artırılmamalıdır.

## Yerel geliştirme

Gereksinimler: Python 3.10+, FFmpeg ve güncel bir tarayıcı.

```bash
git clone https://github.com/boranseason/zenithw.git
cd zenithw/backend
python -m venv .venv
```

Sanal ortamı etkinleştirdikten sonra:

```bash
pip install --require-hashes -r requirements.lock
python app.py
```

API `http://localhost:5000` adresinde açılır. `frontend/` dizinini herhangi bir statik dosya sunucusuyla çalıştırabilirsiniz. Geliştirme CORS seçeneğini yalnızca yerel çalışma için kullanın.

## Production için önemli noktalar

Production ortamında güçlü ve gizli `SECRET_KEY` ile `ORIGIN_SECRET` değerleri gerekir. Kaynak sınırları, proxy güveni, geçici disk bütçeleri ve diagnostics erişimi `backend/app.py` içindeki ortam değişkenleriyle yönetilir.

- Gizli değerleri ve tarayıcıdan dışa aktarılan verileri Git'e eklemeyin.
- EC2 origin'i Cloudflare arkasında tutun ve ortak origin başlığını doğrulayın.
- Ziyaretçi IP başlıklarına yalnızca Cloudflare → Nginx güven zincirinde güvenin.
- Diagnostics'i özel, halka açık canlılık yanıtını minimum tutun.
- Ortak iş durumu, Socket.IO yönlendirmesi ve dosya depolaması olmadan çoklu worker kullanmayın.

## Temel uç noktalar

| Uç nokta | Amaç |
|---|---|
| `POST /info` | Medya bilgisini ve biçimleri çözümler |
| `POST /download` | İndirme veya çıkarma işini başlatır |
| `POST /convert` | Yüklenen dosyayı dönüştürür ya da remux eder |
| `POST /cancel` | Aktif işi iptal eder |
| `GET /files/<token>` | Kısa ömürlü hazırlanmış dosyayı aktarır |
| `GET /health` | Minimum canlılık yanıtı verir |
| `GET /ready` | Bağımlılık ve kapasite hazırlığını bildirir |

## Güvenlik ve sorumlu kullanım

ZenithW uzak hedefleri doğrular; özel ve link-local ağları engeller; yönlendirmeleri, medya aracı protokollerini, eşzamanlı işleri ve disk kullanımını sınırlar. Hazırlanan dosyalar kısa ömürlü belirteçlerle teslim edilir. Mutlak anonimlik veya kesintisiz hizmet sözü vermek yerine veri toplamayı ve geçici işlemleri sınırlarız.

ZenithW'yi yalnızca sahibi olduğunuz, indirme izniniz bulunan veya hukuken kullanabileceğiniz içerikler için kullanın. Kaynak platform kurallarına ve telif mevzuatına uyma sorumluluğu kullanıcıya aittir. ZenithW desteklenen platformlarla bağlantılı değildir.

Tekrarlanabilir hataları [GitHub Issues](https://github.com/boranseason/zenithw/issues) üzerinden bildirin. Herkese açık bildirime gizli değer, özel bağlantı veya kişisel veri eklemeyin.

## Lisans

[LICENSE](LICENSE) dosyasına bakın.
