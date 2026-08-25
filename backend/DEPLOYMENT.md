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

1. Keep `--workers 1` and one Railway replica. Scale the existing instance
   vertically if CPU, memory, or disk measurements require more headroom.
2. Treat `/health` values `deployment_mode`, `horizontal_scaling_safe`, and
   `expected_gunicorn_workers` as a deployment guard. Horizontal scaling is not
   safe while `horizontal_scaling_safe` is `false`.
3. Before adding workers or replicas, move shared rate limits, cancellation,
   queue/semaphore state, metadata cache, and prepared-token ownership to Redis
   (or an equivalent shared store); configure the Socket.IO message queue and
   sticky routing; and move prepared media to shared/object storage.
4. Add multi-worker integration tests for cancellation, token handoff, quota
   enforcement, cleanup, and Socket.IO progress before changing `Procfile`.

Production dependencies are in `backend/requirements.txt`. Local and CI tests should
install `backend/requirements-dev.txt`; test-only packages do not belong in the runtime
image.

## Maintenance operations

Maintenance mode is coordinated with the Cloudflare Pages project through the same
environment variables:

- `MAINTENANCE_MODE=1` rejects new `/info`, `/download`, `/thumbnail`, and `/convert`
  work with HTTP 503.
- `MAINTENANCE_MESSAGE` and `MAINTENANCE_UNTIL` describe the maintenance window.
- `MAINTENANCE_RETRY_AFTER` controls the retry hint in seconds (default 900).

Enable the Cloudflare and Railway flags together. When returning to service, disable
Railway maintenance first and verify `/health`, then disable the Cloudflare flag. Do
not scale workers or replicas as part of maintenance; the single-process boundary
still applies.
