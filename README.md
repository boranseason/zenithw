<p align="center">
  <a href="./README.tr.md">Turkish</a> •
  <a href="./README.fr.md">Française</a> •
  <a href="./README.ja.md">日本語版</a> •
  <a href="./README.de.md">Deutsche</a>
</p>

---
# ZenithW

**Free, ad-free, watermark-free media downloader.** Download video and audio from YouTube, TikTok, Instagram, X/Twitter, Reddit, and more with a single click.

🔗 **Live:** [zenithw.space](https://zenithw.space)

🏷️ **Current release:** `v14.0` — a warmer time-aware home, dedicated tool pages, responsive shared navigation, calmer ambience, and a cleaner release experience

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Deployment Model](#deployment-model)
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
- 📃 **Batch / playlist downloads** — process up to 10 pasted links or inspect playlists containing up to 50 items
- ⏭️ **SponsorBlock integration** — automatically skip or strip sponsor segments, intros, outros, and more
- 🖼️ **Thumbnail downloads** — fetch cover art alongside media or on its own
- 📝 **Subtitle and metadata support** — download available subtitles and embed video metadata
- 🔄 **Converter** — remux compatible streams first and re-encode only when the requested output requires it
- 🎞️ **Real remux** — change a compatible container with FFmpeg stream copy instead of returning the original file unchanged
- 🌍 **4 languages supported** — Turkish, English, French, German
- 🎨 **Customizable UI** — light/dark themes, accent colors, smooth animations
- 🔒 **No server-side history** — download history is stored locally on-device (localStorage) only
- ⚡ **Real-time progress** — live download status via Socket.IO
- 💾 **Bounded temporary storage** — aggregate spool, minimum-free-disk, prepared-file lifetime, and transfer concurrency limits protect the server
- 🚀 **Native browser handoff** — completed media is exposed through a short-lived, single-use download URL instead of being copied into a large JavaScript Blob

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
| Frontend hosting | [Cloudflare Pages](https://pages.cloudflare.com) |
| Backend hosting | [Amazon EC2](https://aws.amazon.com/ec2/) — Ubuntu, Nginx, systemd |
| Edge, DNS and TLS | [Cloudflare](https://www.cloudflare.com/) |

---

## Project Structure

```
zenithw/
├── .gitignore                   # Keeps local/runtime artifacts out of Git
├── .github/
│   └── dependabot.yml
├── backend/
│   ├── downloads/               # Temporary download/processing files (runtime)
│   ├── app.py                   # Flask API — metadata, media jobs, native file handoff, health, cancellation
│   ├── requirements.txt
│   ├── requirements-dev.txt     # Optional local/CI tooling; excluded from production installs
│   ├── nixpacks.toml            # Optional PaaS build config (includes ffmpeg)
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
│   ├── app.[content-hash].js    # Cacheable landing-page application code
│   ├── updates-core.[content-hash].js
│   ├── updates-archive.[content-hash].js
│   ├── style.[content-hash].css
│   ├── version.js               # Single source of truth for version info
│   ├── zenithw.png
│   ├── robots.txt
│   └── sitemap.xml
├── functions/
│   └── _middleware.js           # Cloudflare Pages maintenance middleware
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
| `YOUTUBE_POT_PROVIDER_URL` | No | Local loopback base URL for the YouTube PO Token provider on EC2/Linux deployments |
| `FLASK_ENV` / `ALLOW_DEV_CORS` | No | Set to `development` or `1` to allow local origins via CORS |
| `ORIGIN_SECRET` | **Yes** when origin lock is enabled | Shared secret injected by Cloudflare in the `X-Origin-Verify` header |
| `ENABLE_ORIGIN_LOCK` | No (default enabled) | Set to `0` only when intentionally disabling the origin-secret check |
| `TRUST_PROXY` | No (default enabled) | Trust Cloudflare/proxy client-IP headers; disable when serving the backend directly |
| `PROXY_HOPS` | No (default `1`) | Number of explicitly trusted reverse-proxy hops used by `ProxyFix`; keep `1` for the supplied EC2 Nginx config |
| `ARIA2_ENABLED` | No | Currently ignored — aria2 is disabled for SSRF protection |
| `DOWNLOAD_TIMEOUT_SECONDS` | No (default `600`) | Maximum time allowed for a single download |
| `FFMPEG_TIMEOUT_SECONDS` | No (default `120`) | Maximum runtime for a single FFmpeg conversion or mute operation |
| `FFMPEG_THREADS` | No (default `2`) | FFmpeg encoder thread ceiling shared by yt-dlp post-processing and uploaded-file conversion; the production t3.small uses `1` |
| `MAX_CONCURRENT_DOWNLOADS` | No (default `2`) | Global concurrent download limit |
| `MAX_CONCURRENT_CONVERSIONS` | No (default `1`) | Global concurrent conversion limit |
| `MAX_CONCURRENT_PER_IP` | No (default `5`) | Concurrent request limit per IP |
| `MAX_DOWNLOAD_QUEUE` | No (default `12`) | Maximum number of downloads waiting for a worker slot |
| `MAX_QUEUE_WAIT_SECONDS` | No (default `120`) | Maximum time a download may wait in the queue |
| `MAX_VIDEO_DURATION_SECONDS` | No (default `5400`) | Maximum allowed video length (90 minutes) |
| `MAX_TRANSCODE_DURATION_SECONDS` | No (default `600`) | Maximum duration for CPU-heavy codec transcoding; longer compatible files may still use remux |
| `MAX_DOWNLOAD_SIZE_MB` | No (default `1536`) | Maximum allowed file size in MB |
| `MAX_CONVERT_OUTPUT_SIZE_MB` | No (default `1024`) | Maximum converted output size in MB |
| `MAX_SPOOL_SIZE_MB` | No (default `4096`) | Aggregate temporary/prepared-file storage budget in MB |
| `MIN_FREE_DISK_MB` | No (default `512`) | Minimum free disk space preserved while accepting and running jobs |
| `DOWNLOAD_SPOOL_RESERVATION_MB` | No (default `2048`) | Capacity reserved for each accepted download job |
| `MAX_CONCURRENT_TRANSFERS` | No (default `2`) | Maximum simultaneous prepared-file transfers |
| `MAX_CONCURRENT_TRANSFERS_PER_IP` | No (default `2`) | Simultaneous prepared-file transfers allowed per IP |
| `TRANSFER_QUEUE_WAIT_SECONDS` | No (default `120`) | Maximum wait for a native transfer slot |
| `PREPARED_FILE_TTL` | No (default `600`) | Lifetime of an unused prepared download token, in seconds |
| `INFO_CACHE_TTL_SECONDS` | No (default `45`) | Short metadata response-cache lifetime |
| `INFO_CACHE_MAX_SIZE` | No (default `256`) | Maximum number of sanitized metadata responses retained in memory |
| `CONVERSION_RATE_LIMIT_WINDOW` | No (default `600`) | Per-IP conversion quota window in seconds |
| `CONVERSION_RATE_LIMIT_MAX_REQUESTS` | No (default `2`) | Conversions allowed per IP during the conversion quota window |
| `CANCEL_RATE_LIMIT_WINDOW` | No (default `60`) | Separate cancellation quota window in seconds |
| `CANCEL_RATE_LIMIT_MAX_REQUESTS` | No (default `30`) | Cancellation requests allowed per IP without consuming the normal API quota |
| `MAINTENANCE_MODE` | No (default `workflow`) | `workflow` reads the committed config; `1`/`0` is an emergency environment override |
| `MAINTENANCE_TITLE` | No (Cloudflare only) | Optional heading shown on the maintenance page |
| `MAINTENANCE_MESSAGE` | No | Optional public maintenance explanation, limited to 240 characters |
| `MAINTENANCE_UNTIL` | No | Optional ISO 8601 target time, for example `2026-08-25T23:30:00+03:00` |
| `MAINTENANCE_RETRY_AFTER` | No (default `900`) | Retry hint in seconds, clamped between 60 and 86400 |

---

## Maintenance Mode

The Cloudflare Pages middleware in `functions/_middleware.js` serves the cat-themed
`frontend/maintenance.html` page with a real HTTP `503 Service Unavailable`,
`Retry-After`, `no-store`, and `noindex` headers. `robots.txt`, `sitemap.xml`, and
`/.well-known/` remain reachable. `/maintenance-status` lets the open page detect
when maintenance ends and reload automatically. The inactive design can be safely
previewed at `/maintenance`.

The normal control surface is **GitHub → Actions → Bakım modu → Run workflow**.
Choose `enable` or `disable`, optionally edit the public text/end time, and run it.
The workflow updates the matching `backend/maintenance-config.json` and
`frontend/maintenance-config.json` files in one commit. Existing GitHub integrations
Cloudflare Pages publishes the frontend state from GitHub. The backend release
process pulls the matching commit to Amazon EC2 and restarts the systemd service;
no AWS or Cloudflare API tokens are stored in the repository.

The backend rejects new `/info`, `/download`, `/thumbnail`, and `/convert` work with JSON
`503`, while `/cancel`, `/files/<token>`, and `/health` remain available so in-flight
cleanup and prepared transfers are not stranded. `MAINTENANCE_MODE=1` or `0` may
still be used as an emergency platform-specific override; use `workflow` (or leave it
unset) for the one-button GitHub flow.

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/info` | POST | Returns video/playlist metadata for a given URL |
| `/download` | POST | Runs one download/extraction job and returns a short-lived native download URL |
| `/files/<token>` | GET / HEAD | Transfers a prepared file through a single-use, IP-bound token |
| `/files/<token>/status` | GET | Reports prepared/transferring/completed state to the owning client without exposing file details |
| `/thumbnail` | POST | Downloads the cover image for a given URL |
| `/convert` | POST | Remuxes or converts an uploaded file and returns a native download URL |
| `/cancel` | POST | Cancels an in-progress download |
| `/health` | GET | Minimal liveness response |
| `/ready` | GET | Backend readiness response; returns 503 when required media dependencies or disk budget are unavailable |
| `/diagnostics` | GET | Origin-protected dependency, queue, cache, transfer, and single-worker diagnostics |

Normal API endpoints are rate-limited to **10 requests per minute per IP**. `/health` and `/ready` are probe endpoints, `/cancel` has a separate default **30 requests per minute** quota, and `/convert` additionally defaults to **2 conversions per 10 minutes per IP**.

---

## Deployment Model

The backend intentionally runs as **one Gunicorn worker on one Amazon EC2 instance**. Rate limits, semaphores, cancellation events, Socket.IO identifiers, metadata cache entries, prepared-file tokens, and temporary files are currently process-local.

Do not increase `--workers` or add replicas without first moving shared coordination to Redis (or an equivalent shared store), configuring a Socket.IO message queue and sticky routing, and placing prepared files in shared/object storage. The origin-protected `/diagnostics` response reports `horizontal_scaling_safe: false` and `expected_gunicorn_workers: 1` so deployment checks can detect this boundary.

Vertical scaling is safe when measurements show the current instance needs more CPU, memory, or disk headroom.

---

## Security

- CORS is restricted to `zenithw.space` (and localhost in development)
- Cloudflare origin lock requires a timing-safe `X-Origin-Verify` shared-secret match in production
- Uploaded files are sanitized and restricted to an allow-list of extensions
- `SECRET_KEY` is required in production; no insecure hardcoded fallback
- Downloaded/converted files are automatically deleted shortly after processing
- Prepared files use short-lived, single-use, IP-bound tokens and separate transfer concurrency limits
- Aggregate spool reservations and a minimum-free-disk watermark prevent unbounded temporary-file growth
- All file path inputs are validated against path traversal attacks
- `ffmpeg` subprocesses run with fixed argument lists; user input is never passed to a shell
- SSRF protection blocks private/reserved destinations during URL validation, high-level connections, and low-level socket connections
- yt-dlp network transfers are forced through its native downloader so socket protections remain active
- FFmpeg is restricted to local protocols during download post-processing, mute operations, and uploaded-file conversion
- Conversion work has separate concurrency, time, duration, output-size, and per-IP quota limits
- User-controlled filenames are HTML-escaped before rendering to prevent DOM XSS
- The frontend uses Content Security Policy and Subresource Integrity for its pinned Socket.IO dependency
- The application does not load Google Analytics, advertising pixels, or behavioral-tracking scripts
- Media URLs are not sent to a third-party QR service
- Rate-limiting state is periodically cleaned up to prevent memory leaks
- Concurrent download and per-IP request limits protect the server from overload

Found a vulnerability? Please report it to [info@zenithw.space](mailto:info@zenithw.space).

---

## Release History

The full bilingual changelog is available at [zenithw.space/updates.html](https://zenithw.space/updates.html). The v11 series covers security hardening, v12 focuses on presentation and rendering improvements, and v13 follows the complete media lifecycle through verified end-to-end delivery. v14.0 gives that foundation a calmer, friendlier interface with dedicated tool pages and shared responsive navigation.

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
