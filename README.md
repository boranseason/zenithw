# ZenithW

Repository layout:

- `backend/` — Flask / Socket.IO API and Python dependencies
- `frontend/` — Netlify-served HTML, JavaScript, CSS, sitemap, robots, and headers
- `tests/` — backend regression / contract tests
- `docs/` — deployment and optimization audit notes
- `Procfile`, `nixpacks.toml` — Railway backend deployment
- `netlify.toml` — Netlify frontend publish configuration

## Local backend tests

```bash
python -m pytest tests
```

## Deployment

- Railway runs the backend from `backend/app.py` through the root `Procfile`.
- Netlify publishes the `frontend/` directory through `netlify.toml`.
