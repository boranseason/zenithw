# ZenithW

> Ein ruhiger, werbefreier Medien-Arbeitsbereich zum Herunterladen, Konvertieren und Remuxen erlaubter Inhalte.

[Web-App](https://zenithw.space) · [Status](https://zenithw.space/status) · [Updates](https://zenithw.space/updates) · [English](README.md) · [Türkçe](README.tr.md) · [Français](README.fr.md) · [日本語](README.ja.md)

Aktuelle Version: **v14.2**

## Funktionen

- YouTube, TikTok, Instagram, X, Reddit und weitere yt-dlp-kompatible Quellen.
- Video, Audio, stummes Video, Playlists und kleine Link-Stapel.
- FFmpeg-Konvertierung und Remuxen kompatibler Streams ohne unnötiges Neucodieren.
- Untertitel, Metadaten, Vorschaubilder, SponsorBlock, Abbruch und Live-Fortschritt.
- Lokaler Browserverlauf statt serverseitigem Benutzerkonto.

## Architektur

| Ebene | Technik |
|---|---|
| Frontend | HTML, CSS und JavaScript auf Cloudflare Pages |
| Backend | Flask, Gunicorn, gevent und Socket.IO auf AWS EC2 |
| Medien | yt-dlp, FFmpeg und Deno/EJS |
| Netzwerk | Cloudflare, Nginx, striktes TLS und Origin-Prüfung |

Das Backend läuft bewusst mit **einem Worker**. Mehrere Worker benötigen zuerst gemeinsamen Status, Socket.IO-Routing und gemeinsamen Speicher.

## Lokale Entwicklung

```bash
git clone https://github.com/boranseason/zenithw.git
cd zenithw/backend
python -m venv .venv
pip install --require-hashes -r requirements.lock
python app.py
```

Benötigt werden Python 3.10+ und FFmpeg. Geheimnisse gehören nicht in Git; gelockerte CORS-Regeln sind nur für lokale Entwicklung gedacht.

## Sicherheit und Nutzung

ZenithW blockiert private Netzwerkziele, begrenzt Jobs und temporären Speicher und liefert Dateien über kurzlebige Token aus. Nutze den Dienst nur für Inhalte, die dir gehören oder die du herunterladen darfst. ZenithW ist mit keiner unterstützten Plattform verbunden.

Reproduzierbare Fehler bitte ohne private Daten oder Geheimnisse über [GitHub Issues](https://github.com/boranseason/zenithw/issues) melden. Lizenz: [LICENSE](LICENSE).
