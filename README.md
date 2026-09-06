# ZenithW

> A focused, ad-free media workspace for downloading, converting, and remuxing content you are allowed to use.

[Live app](https://zenithw.space) · [Status](https://zenithw.space/status) · [Updates](https://zenithw.space/updates) · [Türkçe](README.tr.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [日本語](README.ja.md)

Current release: **v14.2**

![ZenithW web interface](docs/assets/zenithw-preview.png)

## What it does

- Resolves media from YouTube, TikTok, Instagram, X, Reddit, and other yt-dlp-compatible sources.
- Downloads video, audio, muted video, playlists, and small link batches.
- Converts with FFmpeg and remuxes compatible streams without unnecessary re-encoding.
- Supports subtitles, metadata, thumbnails, SponsorBlock, cancellation, and live progress.
- Keeps download history in the browser rather than in a server-side account.
- Provides a responsive, framework-free interface in Turkish, English, French, and German.

## Architecture

| Layer | Runtime |
|---|---|
| Frontend | Vanilla HTML, CSS, and JavaScript on Cloudflare Pages |
| Edge | Cloudflare DNS, proxy, TLS, and origin verification |
| Backend | Flask, Gunicorn, gevent, and Socket.IO on Amazon EC2 (AWS) |
| Media | yt-dlp, FFmpeg, Deno/EJS, and an optional PO Token provider |
| Service management | Ubuntu, Nginx, and systemd |

The backend intentionally runs as a **single worker**. Job state, Socket.IO rooms, and prepared-file ownership are process-local; adding workers or replicas requires shared coordination and storage first.

## Local development

Requirements: Python 3.10+, FFmpeg, and a modern browser.

```bash
git clone https://github.com/boranseason/zenithw.git
cd zenithw/backend
python -m venv .venv
```

Activate the environment, then run:

```bash
pip install --require-hashes -r requirements.lock
python app.py
```

The API starts on `http://localhost:5000`. Serve `frontend/` with any static file server. Enable development CORS only for local cross-origin work, never in production.

## Production essentials

Production requires strong private values for `SECRET_KEY` and `ORIGIN_SECRET`. Runtime limits, trusted-proxy behavior, temporary-file budgets, and diagnostics access are configured through the environment variables documented with their defaults in `backend/app.py`.

- Keep secrets and exported browser data out of Git.
- Keep the EC2 origin behind Cloudflare and verify the shared origin header.
- Trust visitor headers only through the Cloudflare-to-Nginx proxy chain.
- Keep diagnostics private and public liveness responses minimal.
- Do not scale past one worker until job state, Socket.IO routing, and prepared files are shared safely.

## Main endpoints

| Endpoint | Purpose |
|---|---|
| `POST /info` | Resolve metadata and formats |
| `POST /download` | Start a download or extraction job |
| `POST /convert` | Convert or remux an uploaded file |
| `POST /cancel` | Cancel an active job |
| `GET /files/<token>` | Transfer a short-lived prepared file |
| `GET /health` | Minimal liveness response |
| `GET /ready` | Dependency and capacity readiness |

## Security and responsible use

ZenithW validates remote targets, blocks private and link-local destinations, constrains redirects and media-tool protocols, limits concurrency and disk use, and delivers prepared files through short-lived tokens. No internet service can promise absolute anonymity or uninterrupted availability; the project instead minimizes collected data and bounds temporary processing.

Use ZenithW only for content you own, are permitted to download, or may lawfully use. Source-platform terms and copyright rules remain the user's responsibility. ZenithW is not affiliated with supported platforms.

Report reproducible bugs through [GitHub Issues](https://github.com/boranseason/zenithw/issues). Never include secrets, private links, or personal data in public reports.

## License

- ZenithW: AGPL-3.0-only
- Third-party dependencies: their respective licenses
- Details: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
