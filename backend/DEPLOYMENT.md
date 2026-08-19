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
