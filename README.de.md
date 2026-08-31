<p align="center">
  <a href="./README.md">English</a> •
  <a href="./README.tr.md">Türkçe</a> •
  <a href="./README.fr.md">Français</a> •
  <a href="./README.ja.md">日本語</a> •
  <a href="./README.de.md">Deutsch</a>
</p>

---

# ZenithW

**Kostenloser, werbefreier und wasserzeichenfreier Medien-Downloader.** Laden Sie Videos und Audiodateien von YouTube, TikTok, Instagram, X/Twitter, Reddit und mehr mit einem einzigen Klick herunter.

🔗 **Live-Website:** [zenithw.space](https://zenithw.space)

🏷️ **Aktuelle Version:** `v14.0` — Überarbeitete Benutzeroberfläche, dedizierte Tool-Seiten, responsive Navigation und ein noch flüssigeres Nutzererlebnis.

---

## Inhaltsverzeichnis

- [Funktionen](#funktionen)
- [Technologie-Stack](#technologie-stack)
- [Projektstruktur](#projektstruktur)
- [Erste Schritte](#erste-schritte)
- [Umgebungsvariablen](#umgebungsvariablen)
- [API-Referenz](#api-referenz)
- [Sicherheit](#sicherheit)
- [Lizenz](#lizenz)
- [Kontakt](#kontakt)

---

## Funktionen

- 🎬 **Multi-Plattform-Unterstützung** — YouTube, TikTok, Instagram, X/Twitter, Reddit und viele andere Quellen (powered by yt-dlp)
- 🎵 **Video oder Audio** — Videoformate wie mp4/webm/mkv, Audioformate wie mp3/flac/wav/ogg/opus/m4a
- 🔇 **Stumm-Modus** — Video ohne Tonspur herunterladen
- 📃 **Batch- / Playlist-Downloads** — Bis zu 10 eingefügte Links verarbeiten oder Playlists mit bis zu 50 Elementen analysieren
- ⏭️ **SponsorBlock-Integration** — Sponsor-Segmente, Intros, Outros und mehr automatisch überspringen oder entfernen
- 🖼️ **Thumbnail-Downloads** — Cover-Bilder zusammen mit den Medien oder separat herunterladen
- 📝 **Untertitel- und Metadaten-Unterstützung** — Verfügbare Untertitel herunterladen und Metadaten einbetten
- 🌍 **4 Sprachen unterstützt** — Türkisch, Englisch, Französisch, Deutsch
- 🎨 **Anpassbare Benutzeroberfläche** — Hell-/Dunkel-Themes, Akzentfarben, flüssige Animationen
- 🔒 **Kein serverseitiger Verlauf** — Der Download-Verlauf wird nur lokal auf dem Gerät (localStorage) gespeichert
- ⚡ **Echtzeit-Fortschritt** — Live-Download-Status über Socket.IO

---

## Technologie-Stack

| Schicht | Technologie |
|---|---|
| Backend | Python, Flask, Flask-SocketIO (gevent) |
| Download-Engine | [yt-dlp](https://github.com/yt-dlp/yt-dlp) |
| Medienverarbeitung | FFmpeg |
| Frontend | Vanilla HTML/CSS/JS (ohne Framework) |
| Frontend-Hosting | [Cloudflare Pages](https://pages.cloudflare.com) |
| Backend-Hosting | [Railway](https://railway.app) |

---

## Erste Schritte

### Voraussetzungen

- Python 3.10+
- FFmpeg installiert und im `PATH` verfügbar

### Installation

```bash
git clone https://github.com/kakangeldi82-netizen/zenithw.git
cd zenithw/backend

python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

### Lokal ausführen

```bash
python app.py
```

Der Server startet standardmäßig unter `http://localhost:5000`.

---

## Lizenz

[MIT](./LICENSE)

---

## Kontakt

- Entwickler: [@boranseason](https://www.instagram.com/boranseason)
- E-Mail: [info@zenithw.space](mailto:info@zenithw.space)
