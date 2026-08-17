# ZenithW

**Free, ad-free, watermark-free media downloader.** Download video and audio from YouTube, TikTok, Instagram, X/Twitter, Reddit, and more with a single click.

🔗 **Live:** [zenithw.space](https://zenithw.space)

🏷️ **Current release:** `v12.9` — streamlined tool modals, lighter rendering, and a more consistent interface

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Security](#security)
- [Release History](#release-history)
- [Legal](#legal)
- [License](#license)
- [Contact](#contact)

---

## Features

- 🎬 **Multi-platform support** — YouTube, TikTok, Instagram, X/Twitter, Reddit, and many other sources (powered by yt-dlp)
- 🎵 **Video or audio** — video formats such as mp4/webm/mkv, audio formats such as mp3/flac/wav/ogg/opus/m4a
- 🔇 **Mute mode** — download video without an audio track
- 📃 **Batch / playlist downloads** — process multiple links in a single request (up to 50 items)
- ⏭️ **SponsorBlock integration** — automatically skip or strip sponsor segments, intros, outros, and more
- 🖼️ **Thumbnail downloads** — fetch cover art alongside media or on its own
- 📝 **Subtitle and metadata support** — download available subtitles and embed video metadata
- 🔄 **Converter** — convert existing files between formats (powered by FFmpeg)
- 🎞️ **Remux** — change container format without re-encoding
- 🌍 **4 languages supported** — Turkish, English, French, German
- 🎨 **Customizable UI** — light/dark themes, accent colors, smooth animations
- 📱 **PWA support** — installable to the home screen and usable like a native app
- 🔒 **No server-side history** — download history is stored locally on-device (localStorage) only
- ⚡ **Real-time progress** — live download status via Socket.IO

> **Note:** aria2 multi-connection acceleration is currently disabled for security reasons (SSRF protection). It may be re-enabled in the future with proper network isolation.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, Flask, Flask-SocketIO (gevent) |
| Download engine | [yt-dlp](https://github.com/yt-dlp/yt-dlp) |
| Segment skipping | [SponsorBlock API](https://sponsor.ajay.app/) |
| Media processing | FFmpeg |
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Frontend hosting | [Netlify](https://netlify.com) |
| Backend hosting | [Railway](https://railway.app) |

---

## Project Structure

```
zenithw/
├── .github/
│   └── dependabot.yml
├── .vscode/
├── backend/
│   ├── downloads/               # Temporary download/processing files (runtime)
│   ├── app.py                   # Flask API — /info, /download, /convert, /thumbnail, /health, /cancel
│   ├── test_security.py         # SSRF, rate-limit, and downloader security regression tests
│   ├── requirements.txt
│   ├── nixpacks.toml            # Railway build config (includes ffmpeg)
│   ├── Procfile                 # Gunicorn + geventwebsocket worker
│   └── .gitignore
├── frontend/
│   ├── index.html               # Main application (SPA-style)
│   ├── app.html                 # Android app download page
│   ├── about.html
│   ├── privacy.html
│   ├── terms.html
│   ├── dmca.html
│   ├── status.html              # Live server status
│   ├── thanks.html
│   ├── updates.html             # Changelog
│   ├── vs-cobalt-tools.html
│   ├── vs-savefrom.html
│   ├── vs-y2mate.html
│   ├── style.css
│   ├── version.js               # Single source of truth for version info
│   ├── zenithw.png
│   ├── robots.txt
│   └── sitemap.xml
├── netlify.toml                 # Frontend deployment config
├── LICENSE
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.10+
- FFmpeg installed and available on your `PATH`

### Installation

```bash
git clone https://github.com/kakangeldi82-netizen/zenithw.git
cd zenithw/backend

python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

### Running locally

```bash
python app.py
```

The server starts at `http://localhost:5000` by default.

For local frontend development, open the files in the `frontend/` directory or serve them with any static file server. Set `FLASK_ENV=development` or `ALLOW_DEV_CORS=1` so the backend accepts requests from `localhost`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No (default `5000`) | Port the server listens on |
| `SECRET_KEY` | **Yes** (production) | Flask secret key. A random value is generated only in development mode |
| `YOUTUBE_COOKIES` | No | Browser-exported `cookies.txt` content used to bypass YouTube bot protection |
| `FLASK_ENV` / `ALLOW_DEV_CORS` | No | Set to `development` or `1` to allow local origins via CORS |
| `ORIGIN_SECRET` | **Yes** when origin lock is enabled | Shared secret injected by Cloudflare in the `X-Origin-Verify` header |
| `ENABLE_ORIGIN_LOCK` | No (default enabled) | Set to `0` only when intentionally disabling the origin-secret check |
| `TRUST_PROXY` | No (default enabled) | Trust Cloudflare/proxy client-IP headers; disable when serving the backend directly |
| `ARIA2_ENABLED` | No | Currently ignored — aria2 is disabled for SSRF protection |
| `SPONSORBLOCK_ENABLED` | No | Set to `1` to enable SponsorBlock processing by default |
| `DOWNLOAD_TIMEOUT_SECONDS` | No (default `600`) | Maximum time allowed for a single download |
| `FFMPEG_TIMEOUT_SECONDS` | No (default `120`) | Maximum runtime for a single FFmpeg conversion or mute operation |
| `MAX_CONCURRENT_DOWNLOADS` | No (default `2`) | Global concurrent download limit |
| `MAX_CONCURRENT_CONVERSIONS` | No (default `1`) | Global concurrent conversion limit |
| `MAX_CONCURRENT_PER_IP` | No (default `5`) | Concurrent request limit per IP |
| `MAX_DOWNLOAD_QUEUE` | No (default `12`) | Maximum number of downloads waiting for a worker slot |
| `MAX_QUEUE_WAIT_SECONDS` | No (default `120`) | Maximum time a download may wait in the queue |
| `MAX_VIDEO_DURATION_SECONDS` | No (default `5400`) | Maximum allowed video length (90 minutes) |
| `MAX_DOWNLOAD_SIZE_MB` | No (default `1536`) | Maximum allowed file size in MB |
| `MAX_CONVERT_OUTPUT_SIZE_MB` | No (default `1024`) | Maximum converted output size in MB |
| `CONVERSION_RATE_LIMIT_WINDOW` | No (default `600`) | Per-IP conversion quota window in seconds |
| `CONVERSION_RATE_LIMIT_MAX_REQUESTS` | No (default `2`) | Conversions allowed per IP during the conversion quota window |

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/info` | POST | Returns video/playlist metadata for a given URL |
| `/download` | POST | Downloads and streams the requested video/audio |
| `/thumbnail` | POST | Downloads the cover image for a given URL |
| `/convert` | POST | Converts an uploaded file to the target format |
| `/cancel` | POST | Cancels an in-progress download |
| `/health` | GET | Reports server, FFmpeg, cookie status, and queue info |

All endpoints (except `/health`) are rate-limited to **10 requests per minute per IP**. `/convert` additionally defaults to **2 conversions per 10 minutes per IP**.

---

## Security

- CORS is restricted to `zenithw.space` (and localhost in development)
- Cloudflare origin lock requires a timing-safe `X-Origin-Verify` shared-secret match in production
- Uploaded files are sanitized and restricted to an allow-list of extensions
- `SECRET_KEY` is required in production; no insecure hardcoded fallback
- Downloaded/converted files are automatically deleted shortly after processing
- All file path inputs are validated against path traversal attacks
- `ffmpeg` subprocesses run with fixed argument lists; user input is never passed to a shell
- SSRF protection blocks private/reserved destinations during URL validation, high-level connections, and low-level socket connections
- yt-dlp network transfers are forced through its native downloader so socket protections remain active
- FFmpeg is restricted to local protocols during download post-processing, mute operations, and uploaded-file conversion
- Conversion work has separate concurrency, time, duration, output-size, and per-IP quota limits
- User-controlled filenames are HTML-escaped before rendering to prevent DOM XSS
- The frontend uses Content Security Policy and Subresource Integrity for its pinned Socket.IO dependency
- Media URLs are not sent to a third-party QR service
- Rate-limiting state is periodically cleaned up to prevent memory leaks
- Concurrent download and per-IP request limits protect the server from overload

Found a vulnerability? Please report it to [info@zenithw.space](mailto:info@zenithw.space).

Security regression tests cover private-network socket blocking, unsafe media protocols, downloader configuration, and independent rate-limit quotas:

```bash
cd backend
pytest -q
```

---

## Release History

The full bilingual changelog is available at [zenithw.space/updates.html](https://zenithw.space/updates.html). The v11 series covers the security hardening work from socket-level SSRF protection in v11.0 through the documented and regression-tested v11.7 release. The v12 series follows with comparison and legal-page redesigns, complete theme profiles, settings and performance improvements, and streamlined convert, remux, and support tools through v12.9.

---

## Legal

ZenithW is not officially affiliated with any of the supported platforms and does not host any content. It is intended solely for content the user owns or has permission to use. See:

- [Terms of Service](https://zenithw.space/terms.html)
- [Privacy Policy](https://zenithw.space/privacy.html)
- [DMCA Notice](https://zenithw.space/dmca.html)

---

## License

[MIT](./LICENSE)

---

## Contact

- Developer: [@boranseason](https://www.instagram.com/boranseason)
- Email: [info@zenithw.space](mailto:info@zenithw.space)
