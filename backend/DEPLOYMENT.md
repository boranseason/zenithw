# Backend deployment boundary

ZenithW currently supports **one backend process only**. `Procfile` intentionally
starts Gunicorn with `--workers 1`.

The following coordination state lives in the Python process:

- rate-limit counters and download/transfer semaphores;
- cancellation events and Socket.IO connection identifiers;
- metadata single-flight/cache entries;
- prepared-file tokens and spool-byte reservations;
- temporary media files on the instance-local disk.

Starting a second Gunicorn worker or Railway replica would split that state.
Requests could then reach a process that does not know a cancellation ID or
prepared-file token, while each process would enforce only its own share of the
limits. Instance-local files would also be unavailable from another replica.

## Safe scaling policy

1. Keep `--workers 1` and one Railway replica or EC2 service. Scale the existing instance
   vertically if CPU, memory, or disk measurements require more headroom.
2. Treat authenticated `/diagnostics` values `deployment_mode`, `horizontal_scaling_safe`, and
   `expected_gunicorn_workers` as a deployment guard. Horizontal scaling is not
   safe while `horizontal_scaling_safe` is `false`.
3. Before adding workers or replicas, move shared rate limits, cancellation,
   queue/semaphore state, metadata cache, and prepared-token ownership to Redis
   (or an equivalent shared store); configure the Socket.IO message queue and
   sticky routing; and move prepared media to shared/object storage.
4. Add multi-worker integration tests for cancellation, token handoff, quota
   enforcement, cleanup, and Socket.IO progress before changing `Procfile`.

Production dependency intent is in `backend/requirements.txt`; deploy from the fully
resolved, hash-verified `backend/requirements.lock` with
`pip install --require-hashes -r requirements.lock`. Regenerate the lock with Python
3.12 and `pip-compile --generate-hashes` whenever a direct dependency changes. Local
test-only packages remain in `backend/requirements-dev.txt` and do not belong in the
runtime image.

## Maintenance operations

Maintenance mode is normally coordinated by the manual GitHub Actions workflow. It
commits identical backend/frontend JSON config files. Cloudflare Pages publishes the
frontend state; the EC2 backend update remains an explicit, controlled service release.
No platform API tokens are required by the workflow.

Environment variables remain available as emergency overrides:

- `MAINTENANCE_MODE=workflow` (or unset) reads `maintenance-config.json`.
- `MAINTENANCE_MODE=1` or `0` forces the local service on or off regardless of the
  committed workflow state.
- `MAINTENANCE_MESSAGE` and `MAINTENANCE_UNTIL` describe the maintenance window.
- `MAINTENANCE_RETRY_AFTER` controls the retry hint in seconds (default 900).

After a workflow run, wait for the frontend deployment, update the EC2 checkout, and
verify `/health` plus `/maintenance-status`. Do not scale workers or replicas as part
of maintenance; the single-process boundary still applies.

## AWS EC2 deployment boundary

The checked-in files under `deploy/` are the production templates for a standard
Ubuntu EC2 host:

- `systemd/zenithw-backend.service` keeps exactly one Gunicorn/gevent worker bound to
  loopback, so the application port is never exposed publicly.
- `nginx/cloudflare-real-ip.conf` trusts `CF-Connecting-IP` only when the TCP
  peer belongs to Cloudflare's published proxy networks.
- `nginx/zenithw.conf` replaces forwarded client-IP headers, supports Socket.IO
  upgrades, disables response/request buffering for progress and streaming, and
  terminates TLS with a certificate valid for `api.zenithw.space`.
- `zenithw.env.example` preserves the conservative single-worker limits and runs
  the optional PO Token provider on local loopback.

For EC2, keep the security group limited to SSH from the administrator's current
IP and HTTP/HTTPS from Cloudflare's official IPv4/IPv6 ranges. Production traffic
belongs on EC2 only after the origin passes `/health`, `/ready`, CORS, WebSocket,
real-IP, download, conversion, cancellation, streaming, and cleanup tests through
the public proxied hostname.

Set Cloudflare to **Full (strict)** only after the origin certificate is installed
and direct origin TLS has been verified with the `api.zenithw.space` hostname.
Then point the proxied `api` DNS record to the stable EC2 public IPv4/Elastic IP.

`/diagnostics` is not a public status API. Set a separate long random
`DIAGNOSTICS_TOKEN`, send it only in the `Authorization: Bearer ...` header, and
leave the variable unset when private diagnostics are not needed. Unauthorized
requests intentionally receive `404` and every diagnostics response is `no-store`.
