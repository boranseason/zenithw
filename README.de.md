# ZenithW

> Ein ruhiger, werbefreier Medien-Arbeitsbereich zum Herunterladen, Konvertieren und Remuxen erlaubter Inhalte.

[Web-App](https://zenithw.space) · [Genshin Advisor](https://zenithw.space/genshin) · [Status](https://zenithw.space/status) · [Updates](https://zenithw.space/updates) · [English](README.md) · [Türkçe](README.tr.md) · [Français](README.fr.md) · [日本語](README.ja.md)

Aktuelle Version: **v14.2**

## Funktionen

- YouTube, TikTok, Instagram, X, Reddit und weitere yt-dlp-kompatible Quellen.
- Video, Audio, stummes Video, Playlists und kleine Link-Stapel.
- FFmpeg-Konvertierung und Remuxen kompatibler Streams ohne unnötiges Neucodieren.
- Untertitel, Metadaten, Vorschaubilder, SponsorBlock, Abbruch und Live-Fortschritt.
- Lokaler Browserverlauf statt serverseitigem Benutzerkonto.

## Genshin Advisor

[Genshin Advisor öffnen](https://zenithw.space/genshin)

ZenithW enthält außerdem eine separate statische Oberfläche für Genshin-Impact-Builds. Sie bietet Teamvorlagen, Artefakt- und Stat-Ziele, Talentprioritäten, verifizierte Kit-Texte sowie Waffenbilder für den vollständigen verfügbaren Charakterkader.

- Pro Community-Profil werden vier F2P-/zugängliche und vier Premium-Waffen getrennt angezeigt und vom besten Treffer bis zur nächsten Alternative sortiert.
- Für geprüfte Charaktere gibt es rollenbezogene Hinweise, DPS-Annahmen und den Vergleich zwischen C1 und Signaturwaffe, sofern diese Entscheidung sinnvoll ist.
- Der Traveler wird als kostenloser Fortschrittscharakter behandelt; seine Formen und Konstellationen verwenden keinen normalen C1/R1-Ziehvergleich.
- Die Seite ist statisch und teilt weder Download-Jobs noch den Backend-Worker. Quellen und Aktualisierungsgrenzen stehen in [docs/genshin-advisor.md](docs/genshin-advisor.md).

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

Reproduzierbare Fehler bitte ohne private Daten oder Geheimnisse über [GitHub Issues](https://github.com/boranseason/zenithw/issues) melden.

## Lizenz

- ZenithW: AGPL-3.0-only
- Drittanbieter-Abhängigkeiten: ihre jeweiligen Lizenzen
- Details: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
