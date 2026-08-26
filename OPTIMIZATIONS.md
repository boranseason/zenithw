# ZenithW Optimization Audit

## 2026-08-25 Backend + Frontend Re-Audit

This section is a fresh review of the current checkout at commit `293a147`.
The older 2026-08-18 findings below remain historical implementation notes;
their `[x]` status does not cover the new findings in this section.

**Scope:** `backend/app.py`, backend tests/deployment configuration, the main
frontend, shared assets, Netlify/Cloudflare Pages configuration, and the
maintenance workflow. No source fix was made during this review.

**2026-08-26 follow-up:** all three critical findings, all eight medium findings,
and four of five low findings below were fixed and verified locally. L-05 is
deliberately left open: its next step requires a deployed performance trace so
that code splitting is based on measured parse/network cost rather than guesswork.

**Checks performed:** Python compilation, JavaScript syntax checks, 38 offline
backend tests, static lifecycle/security/performance tracing, local desktop and
390 x 844 browser interaction checks, and a read-only reachability check of the
published frontend. The main mobile page had no horizontal overflow and the
services modal's background scroll lock worked. Real provider downloads,
FFmpeg conversions, slow native transfers, and load tests were not executed.

### Summary

| Severity | Count | Main risk |
|---|---:|---|
| **CRITICAL** | 3 | Silent output truncation and temporary-disk accounting failures |
| **MEDIUM** | 8 | False success states, incomplete cancellation, timeout/readiness and security regressions |
| **LOW** | 5 | Accessibility, dependency resilience, configuration hardening and initial payload |

**Current unresolved counts:** critical 0, medium 0, low 1.

Recommended order: **C-01 -> C-03 -> C-02 -> M-01/M-02 -> M-04 -> M-05/M-06**.

### CRITICAL

#### [x] C-01 - Converter can return a silently truncated file as success

- **Evidence:** every remux/transcode command receives
  `-t MAX_VIDEO_DURATION_SECONDS` and `-fs MAX_CONVERT_OUTPUT_SIZE_BYTES`
  (`backend/app.py:3139-3147`, `3151-3159`, `3201-3208`). The result is accepted
  using only FFmpeg's return code and final byte size (`3218-3234`); input and
  output durations are never compared.
- **Impact:** an input longer than 90 minutes is deliberately stopped at 90
  minutes and can still be returned with HTTP 200. The `-fs` early-stop guard
  can likewise produce a shortened file before the exact post-check notices
  the limit. This is data-integrity loss, not merely a slow request.
- **Recommendation:** probe duration/streams before conversion and reject an
  over-limit input explicitly. Use a monitored output-byte guard, then validate
  output duration and container with ffprobe before preparing the token. Never
  describe a deliberately cut output as a completed conversion.
- **Fixed (2026-08-26):** removed FFmpeg's success-producing `-t`/`-fs`
  truncation flags. The backend now rejects declared over-limit durations with
  `video_too_long` and monitors the output file while FFmpeg runs, killing the
  process and returning HTTP 413 when the byte ceiling is reached. FFmpeg header
  probing is used when FFprobe is absent; if neither path can establish a finite
  duration, the file is rejected before conversion begins.
- **Verified:** source regression checks plus unit coverage for longest-duration
  selection and live output-limit termination.

#### [x] C-02 - Failed download attempts can leave untracked artifacts during a successful retry

- **Evidence:** `run_download_attempts()` reaps child processes after a failed
  attempt but immediately continues to the next profile without calling
  `cleanup_download_artifacts(filename)` (`backend/app.py:2514-2565`). On a
  later success only `full_path` is registered (`2851-2858`). Scoped artifact
  cleanup is called only on terminal timeout/cancel/error (`2841-2846`,
  `2905-2928`).
- **Impact:** a default-client attempt may leave `.part`, separate video/audio,
  subtitle, or post-processing files; an mweb/cookie retry can then succeed
  while those earlier files remain outside the prepared-file reservation.
  Repeated fallbacks can consume ephemeral disk faster than the logical spool
  counter reports and take the service down before the 30-minute sweep.
- **Confidence:** high-confidence lifecycle gap, but the exact leftover set is
  extractor/failure dependent and needs a staged failed-first/success-second
  media test.
- **Recommendation:** maintain an artifact set per attempt; clean only failed
  attempt outputs before the next profile and clean every non-final sibling
  before committing the successful file reservation.
- **Fixed (2026-08-26):** every cancelled, timed-out, fatal, or retryable attempt
  now performs token-scoped cleanup after child-process reaping. On success,
  every token sibling except the authoritative resolved media path is removed
  before the prepared-file reservation takes ownership.
- **Verified:** retry-then-success, 429, timeout, final-path preservation, and
  token-boundary regression tests.

#### [x] C-03 - Generic file cleanup can release disk accounting while a slow transfer is still active

- **Evidence:** every file older than `FILE_MAX_AGE` (30 minutes) is passed to
  `_force_cleanup()` without checking prepared/transfer state
  (`backend/app.py:988-1004`). A GET removes its prepared token before streaming
  (`1928-1930`), while the authoritative cleanup and transfer-slot release are
  deferred to `response.call_on_close` (`1945-1953`). `_force_cleanup()` also
  releases the file's spool reservation when the path disappears (`904-923`).
- **Impact:** a large download over a slow connection can cross 30 minutes. On
  Linux the pathname may be unlinked while the open file descriptor still
  occupies disk; the spool counter is then lowered and new jobs are admitted
  against space that is not actually free. This can cause disk-full failures
  and cascading job errors. On platforms that reject unlinking an open file,
  behavior differs but the lifecycle is still inconsistent.
- **Recommendation:** exclude active/prepared paths from age cleanup, track an
  explicit transfer lease, and release bytes only from the final close path.
  Add a slow-transfer test that crosses `FILE_MAX_AGE` and checks both physical
  free space and logical reservation counters.
- **Fixed (2026-08-26):** native GET transfers now acquire a path lease before
  the existence/open step and release it only from response-close/error paths.
  Both age-based and stale-pending cleanup atomically skip leased paths, so spool
  accounting remains attached to the physical file during an active transfer.
- **Verified:** lease lifecycle/unit cleanup regression tests and route wiring
  checks. A deployed slow-network test crossing 30 minutes is still recommended
  before production rollout.

### MEDIUM

#### [x] M-01 - Bulk and playlist UI report success before the browser accepts the file transfer

- **Evidence:** `triggerNativeDownload()` clicks an anchor and returns
  immediately (`frontend/app.38a2e2a6b4f9.js:926-931`). Playlist items are then
  added to `doneSet` and persisted (`894-911`). Bulk uses the same native handoff
  and counts `{ok:true}` as success (`577-605`, `1031-1072`).
- **Impact:** browser multi-download protection, token expiry, transfer queue
  rejection, network loss, or a failed GET can still produce "completed" UI
  and a resume state that skips the item. Automatic downloads are especially
  likely to be limited after the first asynchronous click.
- **Recommendation:** distinguish `prepared`, `handoff_started`, and
  `transfer_confirmed`. For batch jobs keep an explicit user-driven download
  queue/list, or use a bounded archive/object-storage handoff where completion
  can be observed.
- **Fixed (2026-08-26):** prepared tokens now expose an owner-bound status route;
  streamed bytes drive `transferring/completed/interrupted/failed` state, and
  main, bulk, and playlist flows only persist success after confirmation.

#### [x] M-02 - Stop/cancel does not reliably stop the current backend job

- **Evidence:** playlist requests have no AbortController and the stop flag is
  checked only between items (`frontend/app.38a2e2a6b4f9.js:870-925`,
  `968-983`). Main cancellation aborts the local fetch, then starts a non-awaited
  `/cancel` request (`1082-1085`). `/cancel` shares the general 10/minute rate
  bucket (`backend/app.py:2037-2055`). Bulk has no current-job stop control.
- **Impact:** the UI can say stopped/cancelled while yt-dlp/FFmpeg continues for
  up to the server deadline, consuming the only processing slots and spool
  reservation. The cancel request can also be lost during navigation or
  rejected after other calls consumed the shared quota.
- **Recommendation:** retain the active batch job ID/controller, await a bounded
  cancel acknowledgement, give cancellation a narrow separate quota, and keep
  the UI in "stopping" state until the backend confirms termination.
- **Fixed (2026-08-26):** active batch controllers/job IDs are retained, the
  current request is aborted, `/cancel` is awaited with a bound, and cancellation
  uses a dedicated rate bucket instead of consuming the normal API quota.

#### [x] M-03 - Small prepared-file transfer has no client timeout or abort path

- **Evidence:** the <=32 MiB path calls `fetch(download_url)` without a signal or
  deadline and buffers every chunk before showing the save modal
  (`frontend/app.38a2e2a6b4f9.js:932-967`). The backend discards the job's cancel
  event once the token is prepared (`backend/app.py:2695-2703`), so the existing
  cancel endpoint cannot stop this transfer.
- **Impact:** a stalled transfer can hold a backend transfer slot and leave the
  modal/progress UI waiting indefinitely. Buffer chunks plus the final Blob also
  create a short-lived memory peak above the nominal 32 MiB threshold.
- **Recommendation:** pass an AbortController with an inactivity/total deadline,
  cancel the stream reader on close, and expose transfer cancellation separately
  from processing cancellation.
- **Fixed (2026-08-26):** the buffered transfer now has total and inactivity
  deadlines, an explicit abort controller, and reader cancellation on failure.

#### [x] M-04 - Frontend security headers were removed from the repository configuration

- **Evidence:** current `netlify.toml` contains only the publish directory and
  `frontend/_headers` contains cache rules, not CSP, `X-Frame-Options` /
  `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, or
  `Permissions-Policy`. Git history shows these global headers were removed in
  commit `56221ae`, while the shipped changelog still claims they are enabled
  (`frontend/updates-archive.243ec67d3c2e.js:210-211`).
- **Impact:** defense in depth against injected markup/scripts, clickjacking,
  MIME confusion, referrer leakage, and unnecessary browser capabilities is
  absent at repository level. A Cloudflare dashboard rule may compensate, but
  that was not verified by this source audit.
- **Recommendation:** define one authoritative header policy in deployed source
  and add a post-deploy assertion for the real response headers. Account for the
  current inline handlers/scripts before tightening CSP.
- **Fixed (2026-08-26):** `_headers` again defines CSP, anti-framing, MIME,
  referrer, permissions, and opener policies. The current inline-handler
  allowance is explicit and can be tightened after markup migration.

#### [x] M-05 - `/health` is liveness-only but always advertises HTTP 200 readiness

- **Evidence:** `/health` reports missing FFmpeg, incomplete JS solver, zero free
  disk, and full spool as JSON fields but always returns 200
  (`backend/app.py:1961-2012`).
- **Impact:** Railway/load-balancer health checks can continue routing expensive
  jobs to an instance that cannot convert/download or has no safe disk capacity.
- **Recommendation:** keep a cheap liveness route, add a separate readiness route
  with stable failure criteria, and point deployment health checks at readiness.
- **Fixed (2026-08-26):** `/health` is a cheap liveness probe, `/ready` returns
  503 when required media tooling/disk/spool capacity is unavailable, and the
  Railway source configuration targets `/ready`.

#### [x] M-06 - The documented conversion envelope conflicts with the default FFmpeg deadline

- **Evidence:** inputs may represent up to 90 minutes, but every FFmpeg remux or
  transcode has a 120-second default timeout (`backend/app.py:73`, `86`,
  `3153-3158`, `3203-3208`; `README.md:150-157`). The frontend waits up to 15
  minutes (`frontend/app.38a2e2a6b4f9.js:934-939`).
- **Impact:** valid but incompatible-container transcodes, especially VP9/WebM,
  can predictably time out on the backend long before the client deadline and
  long before a 90-minute encode could finish.
- **Recommendation:** set mode/codec-aware limits, estimate or probe workload,
  reject jobs that cannot fit the service budget, and align frontend, Gunicorn,
  and FFmpeg deadlines.
- **Fixed (2026-08-26):** probed inputs that require CPU-heavy transcoding are
  limited by `MAX_TRANSCODE_DURATION_SECONDS` (10 minutes by default). Compatible
  stream-copy remuxes retain the broader media envelope; the frontend timeout
  remains an upload/job envelope rather than claiming a 90-minute transcode.

#### [x] M-07 - Maintenance-mode test is guaranteed to fail during intentional maintenance

- **Evidence:** both current config files validly contain `"active": true`, but
  `test_frontend_and_backend_workflow_configs_match` unconditionally asserts
  `active is False` (`backend/tests/test_maintenance_mode.py:58-70`). The full
  offline run produced **38 tests, 1 failure**; all 32 download contract tests
  passed.
- **Impact:** planned maintenance creates a red test suite, hides real regressions
  in expected noise, and can block any CI/release gate that runs the suite.
- **Recommendation:** test schema/parity and gate behavior independently from
  the repository's current operational state. If production must be active by
  default, enforce that in a deployment policy check, not a unit invariant.
- **Fixed (2026-08-26):** the test now validates schema and frontend/backend
  parity without requiring the current operational flag to be false.

#### [x] M-08 - Socket progress events are not scoped to a download job

- **Evidence:** progress payloads contain status/percent but no `download_id`
  (`backend/app.py:2299-2358`, queue emits at `676-689`). The frontend has one
  global listener that updates the current modal for every event on the SID
  (`frontend/app.38a2e2a6b4f9.js:444-454`).
- **Impact:** after a delayed/failed cancellation or overlapping playlist/main
  action, an old job can overwrite the progress/error state of a newer job.
- **Recommendation:** include the immutable job ID in every event and ignore
  events that do not match the active UI job.
- **Fixed (2026-08-26):** all progress emits include `download_id`; the client
  ignores events that do not match its active job.

### LOW

#### [x] L-01 - Closed dialogs remain exposed to assistive technology and focus is unmanaged

- **Evidence:** `.overlay` hides with opacity and pointer-events only
  (`frontend/style.0f46294b97e0.css:527-528`); it does not use `visibility`,
  `hidden`, `inert`, or synchronized `aria-hidden`. In the 390 x 844 browser
  check all closed dialogs were present in the accessibility snapshot. Opening
  the services dialog left `document.activeElement` on `BODY`; there is no focus
  trap or focus restoration. The services trigger is a clickable `<div>` rather
  than a keyboard-operable button (`frontend/index.html:54-61`).
- **Impact:** keyboard and screen-reader navigation includes invisible controls
  and users can lose their position when a modal opens/closes.
- **Recommendation:** use real buttons, manage `inert`/`aria-hidden`, move focus
  into the dialog, trap it while open, and restore it on close.
- **Fixed (2026-08-26):** closed overlays use visibility and synchronized ARIA;
  background content is inert/hidden while open, focus is trapped/restored,
  Escape closes the top dialog, and the services trigger is a real button.

#### [x] L-02 - A third-party Socket.IO CDN is a single point of failure for the whole app

- **Evidence:** Socket.IO is synchronously loaded from cdnjs
  (`frontend/index.html:647-650`) and app initialization immediately calls
  `io(...)` (`frontend/app.38a2e2a6b4f9.js:34`).
- **Impact:** CDN blocking/outage/integrity mismatch causes `io is not defined`
  before the remaining application script initializes, disabling unrelated UI.
- **Recommendation:** self-host the pinned asset or guard socket initialization
  and allow non-progress features to continue.
- **Fixed (2026-08-26):** socket initialization is guarded by a no-op fallback,
  so a CDN failure removes live progress only and no longer prevents unrelated
  controls from initializing.

#### [x] L-03 - Numeric environment settings are mostly unbounded and fail inconsistently

- **Evidence:** most concurrency, timeout, quota, TTL, and byte settings use raw
  `int()`/`float()` at import (`backend/app.py:73-101`), although a bounded helper
  exists for maintenance values (`119-124`).
- **Impact:** a typo can crash startup; zero/negative values can permanently
  disable queues or remove progress throttling instead of producing a clear
  configuration error.
- **Recommendation:** parse all operational values through typed bounded helpers
  and validate cross-field invariants at startup.
- **Fixed (2026-08-26):** operational integer/float settings now use bounded
  parsers with safe defaults; spool/reservation/transfer cross-field constraints
  are checked at startup, including the server port.

#### [x] L-04 - Public health response exposes more operational detail than needed

- **Evidence:** `/health` bypasses origin lock (`backend/app.py:484-490`) and
  returns cookie-file presence/size, solver/provider state, worker model, queue,
  transfer, cache, spool, and disk counters (`1961-2012`).
- **Impact:** low-grade reconnaissance and traffic-timing information is public.
- **Recommendation:** expose only status for the public probe and protect a
  detailed diagnostics route with infrastructure authentication.
- **Fixed (2026-08-26):** public `/health` and `/ready` return minimal status;
  detailed counters moved to `/diagnostics`, which remains behind origin lock.

#### [ ] L-05 - Initial frontend still parses a broad feature/translation bundle

- **Evidence:** the landing page loads a 99,381-byte app file, an 81,405-byte
  stylesheet, a 49,810-byte HTML document, five Google Font weights, and the
  external Socket.IO client before any converter/history/settings action.
- **Impact:** acceptable on desktop broadband but avoidable parse/network work on
  low-end mobile. This is lower priority because content-hashed caching and
  route-specific update assets are already implemented.
- **Recommendation:** use deployed performance traces before splitting; the
  likely first wins are font-weight reduction/self-hosting and lazy initialization
  of converter/history/donation code, not many tiny chunks.
- **Partial mitigation (2026-08-26):** Google Font weights were reduced from
  five to four and preconnect hints were added. The app remains a broad 107,441
  byte uncompressed bundle after the reliability/accessibility additions. Keep
  this item open until a deployed trace identifies a worthwhile split boundary.

### Verification record

- 2026-08-26 remaining-fix suite: full backend discovery **49/49 passed**;
  frontend JavaScript syntax, Railway JSON parsing, and `git diff --check`
  passed.
- Local 390 x 844 browser recheck: no horizontal overflow; modal background
  lock, focus entry/trap/restoration, Escape close, and ARIA state passed.

- 2026-08-26 critical-fix suite: `backend/tests/test_download_contracts.py`
  **38/38 passed**; the 20 directly related source/lifecycle/conversion/attempt
  tests also passed independently.
- 2026-08-26 full backend discovery: **44 run, 1 failed**; the sole failure is
  the already documented maintenance-mode state assertion (M-07).
- 2026-08-26 Python compilation, frontend JavaScript syntax, and whitespace
  checks passed.
- `backend/app.py` compiled successfully.
- `frontend/app.38a2e2a6b4f9.js` and `functions/_middleware.js` passed Node syntax checks.
- `backend/tests/test_download_contracts.py`: **32/32 passed**.
- Full backend discovery: **38 run, 1 failed** (M-07 only).
- Local 390 x 844 browser check: no horizontal overflow; services modal opened,
  internal scrolling/background lock worked; L-01 was reproduced.
- Published landing page was reachable on 2026-08-25. Response-header correctness,
  provider downloads, FFmpeg output integrity, cancellation under load, TTL,
  and slow-transfer behavior remain staging requirements.

Audit date: 2026-08-18  
Scope: the supplied `zenithw-main (6).zip` (`backend/app.py`, deployment files, and all `frontend/` files).  
Method: static hot-path review, Python compilation, JavaScript syntax checks, source/payload measurements, and configuration analysis. No production traffic profile, Railway resource limits, disk capacity, CDN response headers, or real download benchmark was supplied. Findings that need runtime proof are explicitly marked **likely**.

Status updated: 2026-08-19  
`[x]` = source implementation and targeted local checks completed. `[ ]` = still open or only partially addressed. Real platform/staging checks listed in the validation plan remain required before deployment.

Implementation status: **all 11 source findings are implemented and locally checked; no audit finding remains open.** The Section 5 real-platform/staging validation plan is still pending because it requires live media providers, production-like resource limits, browser profiling, and load/TTL tests.

## 1) Optimization Summary

Current optimization health is **good for a small single-instance service, but fragile under burst traffic**. The project already has bounded processing semaphores, end-to-end timeouts, progress throttling, bounded in-memory maps, native large-file handoff, cleanup tasks, and SSRF-aware networking. Those are meaningful optimizations, not decoration.

The highest-return improvements are:

1. Repair and simplify bulk mode. It performs `/info` → `/download` double work, can generate 20 operations against a 10-request/minute limit, and currently treats successful downloads as failures because `startDownload()` returns no success value.
2. Make mute downloads select a video-only stream instead of downloading audio, merging it, and then performing a second full-file FFmpeg remux to remove that audio.
3. Add aggregate spool/transfer backpressure. Processing slots are released before native file transfer and `/files/*` GETs have no separate concurrency or byte budget, so completed files can exhaust disk or outbound capacity while new jobs continue.

The biggest risk if nothing changes is **resource exhaustion followed by cascading failures**: large intermediate/prepared files and uncounted concurrent transfers can consume ephemeral disk and network, while new yt-dlp/FFmpeg jobs are still admitted. The current 1.5 GiB per-download ceiling is a per-file guard, not a service-wide capacity guard.

## 2) Findings (Prioritized)

### [x] Finding 1 — Bulk mode repeats metadata extraction and conflicts with its own rate limit

* **Category:** Network / Cost / Reliability
* **Severity:** High
* **Impact:** Lower upstream requests, shorter bulk completion time, fewer YouTube bot/rate-limit responses, fewer local 429 responses.
* **Evidence:** `frontend/index.html:1233-1259` calls `fetchVideo()` and then `startDownload()` for every bulk URL. `fetchVideo()` calls `/info` at `index.html:1340-1377`; `startDownload()` calls `/download` at `index.html:1659-1686`. The backend performs `yt_dlp.extract_info(..., download=False)` in `backend/app.py:1550-1646` and performs extraction again with `download=True` in `backend/app.py:1881-1923`. General rate limiting is 10 accepted requests per 60 seconds (`app.py:87-88`, `255-330`), while bulk accepts up to 10 URLs. There are two additional functional problems: `fetchBulkVideos()` expects a boolean from `startDownload()` (`index.html:1251-1253`), but `startDownload()` has no success return, so completed items are counted as failures; and the unused `{bulk:true}` argument means small outputs enter the single-download Blob/save-modal path (`index.html:1578-1595`), where a following item can replace the pending Blob.
* **Why it’s inefficient:** Bulk mode pays two route round trips and two extractor passes per item merely to obtain a display title before downloading. For short media, 10 items can reach 20 API requests inside one rate-limit window. The second half can be rejected even though the UI advertised 10-link bulk support. It doubles expensive upstream contact, increases egress-IP throttling risk, reports successes incorrectly, and may overwrite the pending save state of small files.
* **Recommended fix:** Give bulk mode its own explicit download/handoff function and return a structured per-item result (`ok`, `download_url`, `filename`, `error_code`). Do not call `/info` per item unless a preview is actually displayed; let `/download` determine and return the title/filename. Always use native handoff for unattended multi-item batches so one Blob modal cannot replace another. If preview is required, issue one bounded batch metadata request and provide a short-lived opaque metadata token that `/download` may consume; do not trust raw client-supplied extraction data. Align the rate-limit budget with documented batch size, preferably with separate cheap metadata and expensive-job quotas.
* **Tradeoffs / Risks:** Skipping previews changes the bulk UI slightly. Browsers may throttle or block many automatic native downloads, so the UX may need an explicit multi-download permission notice or a server-generated archive option with strict size limits. Reusing extraction results requires careful TTLs because signed media URLs expire; cache only sanitized metadata unless a tested yt-dlp continuation mechanism is used.
* **Expected impact estimate:** Approximately 50% fewer application and metadata-extraction requests in bulk mode; up to roughly 2× faster for metadata-dominated short clips; prevents predictable self-429 behavior and corrects false failure accounting.
* **Removal Safety:** Needs Verification
* **Reuse Scope:** Service-wide
* **Classification:** Reuse Opportunity

### [x] Finding 2 — Mute mode downloads and processes audio only to remove it later

* **Category:** Network / I/O / CPU
* **Severity:** High
* **Impact:** Lower source bandwidth, less temporary-disk usage, fewer FFmpeg passes, lower latency and CPU.
* **Evidence:** Normal video format selection requests `bestvideo+bestaudio` in `backend/app.py:1241-1269`. Mute is read only after that selection path and, after the completed media is registered, another FFmpeg command performs `-c copy -an` to a second file (`app.py:1995-2025`). During that step both the full merged file and the muted copy may coexist.
* **Why it’s inefficient:** The service downloads an audio stream, merges it with video, reads the complete merged output again, writes another complete output, deletes the first output, and renames the second. Audio bandwidth is wasted and the full-file disk pass is avoidable for sources with a video-only representation.
* **Recommended fix:** Make `mute` part of format planning. For YouTube, select a video-only format and skip the post-download mute remux. For services that expose only muxed formats, retain the existing `-c copy -an` fallback. Record the chosen path in metrics so compatibility failures are visible.
* **Tradeoffs / Risks:** Some non-YouTube extractors may not expose a video-only stream. A blanket `bestvideo` selector could reduce compatibility, so use platform-aware selection plus a muxed fallback.
* **Expected impact estimate:** Removes one full output read/write and one FFmpeg invocation on the video-only path; typically 5–20% less source data and potentially 10–40% lower end-to-end time for large files, depending on storage and source formats.
* **Removal Safety:** Needs Verification
* **Reuse Scope:** Service-wide
* **Classification:** Reuse Opportunity

### [x] Finding 3 — Processing limits do not bound prepared-file disk usage or native transfers

* **Category:** I/O / Concurrency / Reliability / Cost
* **Severity:** High
* **Impact:** Prevents disk-full crashes, outbound saturation, file-descriptor pressure, and new jobs starting while completed transfers already saturate the instance.
* **Evidence:** A single download may be up to 1536 MiB (`backend/app.py:82`), two downloads run concurrently by default (`app.py:73`), prepared files live for 10 minutes (`app.py:84`, `665-685`), and ordinary cleanup allows files to remain for 30 minutes (`app.py:92`, `688-715`). The download processing slot is released before returning the prepared URL (`app.py:2047-2055`). `/files/<token>` streams the file later (`app.py:1398-1440`), while the per-IP concurrent-request guard explicitly skips GET/HEAD (`app.py:447-456`) and no transfer semaphore or aggregate byte reservation exists.
* **Why it’s inefficient:** Per-job limits do not protect a shared disk or network interface. Multiple completed files can wait or transfer while new jobs create more intermediates. Mute temporarily duplicates a full output; conversions can hold a 230 MiB input and up to a 1 GiB output. A small disk can therefore fail well below the theoretical request limits.
* **Recommended fix:** Introduce a service-wide spool budget: reserve estimated bytes before starting, reject with `503` when free disk or reserved capacity crosses a threshold, release reservations on every cleanup path, and expose reserved/free bytes in health metrics. Add a dedicated transfer semaphore/per-IP transfer limit for `/files/*`. For larger scale, offload prepared artifacts to object storage or a reverse-proxy/CDN sendfile path with lifecycle deletion.
* **Tradeoffs / Risks:** Conservative reservations may reject jobs that would have fit. Object storage adds cost and changes the privacy/retention model. A transfer semaphore must not hold a gevent worker incorrectly during slow clients.
* **Expected impact estimate:** Primarily outage prevention; bounds worst-case disk/network use from “traffic dependent” to a configured ceiling. Can materially improve tail latency during bursts.
* **Removal Safety:** Needs Verification
* **Reuse Scope:** Service-wide
* **Classification:** Reuse Opportunity

### [x] Finding 4 — Converter always re-encodes video; the frontend “remux” tool does not remux

* **Category:** CPU / I/O / Cost / Maintainability
* **Severity:** High
* **Impact:** Much faster compatible container changes, substantially lower CPU time, and removal of a misleading duplicate feature path.
* **Evidence:** `/convert` selects `libx264`, `libvpx-vp9`, and audio encoders for every video output (`backend/app.py:2273-2318`), even when input codecs can be copied into the target container. Conversely, `handleRemuxFile()` in `frontend/index.html:1752-1754` creates an object URL for the original file and downloads it under a `remuxed_` name; no container operation occurs.
* **Why it’s inefficient:** Re-encoding is orders of magnitude more expensive than stream copy. The supposed lightweight remux path currently performs no media transformation, while the actual server converter always takes the expensive path. This is both wasted compute and an over-abstracted UI distinction.
* **Recommended fix:** Implement one real media-job API with explicit modes: `remux` attempts `-map 0 -c copy` for compatible target containers; `transcode` re-encodes intentionally. Use ffprobe or a short FFmpeg compatibility attempt, then fall back to transcode only when the user selected conversion and compatibility requires it. Remove or repair the client-only fake remux action.
* **Tradeoffs / Risks:** Stream copy can fail for incompatible codec/container combinations and may preserve unwanted metadata/streams unless mapping is explicit. Fallback behavior and output validation need tests.
* **Expected impact estimate:** For compatible files, often 10×–100× lower CPU time and near disk-speed completion; no gain when transcoding is genuinely required.
* **Removal Safety:** Needs Verification
* **Reuse Scope:** Service-wide
* **Classification:** Over-Abstracted Code / Reuse Opportunity

### [x] Finding 5 — Duplicate DNS resolution occurs before protected outbound connections

* **Category:** Network / Latency
* **Severity:** Medium
* **Impact:** Lower request setup latency and fewer resolver calls under traffic.
* **Evidence:** Each route first calls `is_safe_url()`, which performs `socket.getaddrinfo(hostname, None)` (`backend/app.py:842-869`). The actual guarded connection later calls `_resolve_safe_host_cached(host, port)`, which performs another `getaddrinfo` keyed by host and port (`app.py:871-943`). The first result is not inserted into the second cache.
* **Why it’s inefficient:** A valid request normally resolves the same hostname once for URL validation and again for the real connection. The security goal can be preserved while sharing the already validated address set.
* **Recommended fix:** Make URL validation call the same host+effective-port resolver used by the socket guard, returning the validated IP tuple or a small immutable resolution object. Keep the current short TTL and mixed public/private rejection policy. Do not revert to a boolean-only cache.
* **Tradeoffs / Risks:** Security-sensitive refactor. Scheme default ports, IPv6 scope identifiers, redirects, and the private PO-token provider exception must remain covered by regression tests.
* **Expected impact estimate:** Removes one DNS lookup per accepted route call; usually a few milliseconds, but potentially tens or hundreds of milliseconds on cold/slow resolution.
* **Removal Safety:** Needs Verification
* **Reuse Scope:** Service-wide
* **Classification:** Reuse Opportunity

### [x] Finding 6 — Metadata requests have no client deduplication, cancellation, or short response cache

* **Category:** Frontend / Network / Caching / Reliability
* **Severity:** Medium
* **Impact:** Fewer duplicate extractor jobs, less stale UI, lower upstream pressure.
* **Evidence:** `fetchVideo()` starts a new `/info` request without an AbortController, request sequence, in-flight map, or disabled state (`frontend/index.html:1340-1377`). Paste, clipboard, Enter, and click paths can all trigger it (`index.html:1286`, `1320-1325`, `1612-1615`). The backend has concurrency limiting but no metadata response cache or single-flight map (`backend/app.py:1527-1646`).
* **Why it’s inefficient:** Repeated actions for the same URL can occupy more than one metadata slot and contact the upstream service repeatedly. If the URL changes while an older request is running, the older response can overwrite newer UI state.
* **Recommended fix:** On the client, abort the previous metadata fetch and ignore responses whose request ID or URL is no longer current. On the server, add a small bounded 30–60 second cache and single-flight coalescing for sanitized `/info` responses keyed by canonical URL and extraction policy. Do not cache private/error responses broadly.
* **Tradeoffs / Risks:** Canonicalization must not merge semantically different URLs. Cache keys must account for cookies/access context if those can change results. Negative caching should be very short or omitted.
* **Expected impact estimate:** 50–90% fewer duplicate `/info` calls during repeated clicks/pastes for the same URL; near-instant repeated lookup inside the TTL.
* **Removal Safety:** Likely Safe
* **Reuse Scope:** Service-wide
* **Classification:** Reuse Opportunity

### [x] Finding 7 — Frontend delivery is monolithic and important assets lack an explicit cache strategy

* **Implementation progress:** Completed the high-return delivery split. The landing app is content-addressed as `app.7d59108252be.js`; the changelog loads only the latest release plus renderer from `updates-core.63274ffa232d.js` and fetches `updates-archive.479fcc570552.js` only when an older release is requested. Updates CSS, information/status CSS, and comparison-page CSS are route-specific content-hashed assets. Their duplicated blocks were removed from the landing stylesheet, reducing it from 105,714 to 80,662 bytes (`style.0f46294b97e0.css`). About/DMCA/terms/thanks/privacy share one content-hashed language/bootstrap helper. `_headers` gives content-addressed assets a one-year immutable lifetime while HTML and `version.js` revalidate. The old changelog payload was 39,750 bytes gzip; the initial changelog core is 4,032 bytes gzip, about 90% smaller before an archive is requested. Feature-level splitting of the already-small landing JS was intentionally not forced without a browser trace showing a net win.

* **Category:** Frontend / Build / Caching / Network
* **Severity:** Medium
* **Impact:** Faster parsing and repeat visits, smaller route payloads, reusable browser cache.
* **Evidence:** `index.html` is 142,616 bytes with about 91,525 bytes of inline JavaScript; `style.css` is 103,883 bytes. Gzip-9 measurements are 38,737 and 22,321 bytes respectively. `updates.html` is 128,272 bytes (44,955 bytes gzip) although it renders one selected release at a time. `netlify.toml` defines security headers but no hashed-asset/cache policy. Six informational pages repeat the same language/page shell; a normalized-line comparison found about 9 KiB of repeated source across those files. `updates.html:22` appends `Date.now()` to `version.js`, forcing a unique URL on every visit.
* **Why it’s inefficient:** Inline application code cannot be cached independently from the HTML. All translations, modal tools, history, playlist logic, converter logic, and decorative interactions are parsed on the landing route. The changelog ships every release body before displaying one release. Cache-busting with the current timestamp guarantees avoidable revalidation/download behavior.
* **Recommended fix:** Extract hashed `app.[hash].js`, common legal-page JavaScript, and route-specific CSS; load noncritical tools/translations on first use. Convert updates to static per-version content or a small version index plus lazily loaded release JSON. Add long-lived immutable caching only to content-hashed assets; keep HTML short-lived. Replace `Date.now()` with the build/version hash.
* **Tradeoffs / Risks:** More build tooling and files. Excessive splitting can add request overhead, so keep a small core chunk and lazy-load only substantial, rarely used features.
* **Expected impact estimate:** Current same-origin landing payload is about 61 KiB gzip before external font/Socket.IO resources. A focused split can plausibly reduce initial parsed JavaScript by 30–60% and make most code cacheable on repeat visits; confirm with Lighthouse/WebPageTest.
* **Removal Safety:** Likely Safe
* **Reuse Scope:** Service-wide
* **Classification:** Reuse Opportunity

### [x] Finding 8 — Playlist thumbnails are loaded eagerly

* **Category:** Frontend / Network / Memory
* **Severity:** Medium
* **Impact:** Lower initial network usage and memory on playlists, especially mobile.
* **Evidence:** `/info` can return up to 50 playlist entries (`backend/app.py:93`, `1550-1606`). `renderPlaylist()` creates all items immediately (`frontend/index.html:1380-1403`), and `safeThumbHtml()` returns plain `<img src="...">` without `loading="lazy"` or `decoding="async"` (`index.html:682`).
* **Why it’s inefficient:** Opening a large playlist can immediately request dozens of off-origin images even though most are below the fold. This competes with API traffic and increases mobile memory/decoding work.
* **Recommended fix:** Add `loading="lazy"`, `decoding="async"`, fixed dimensions/aspect ratio, and a referrer policy. If real-device profiling still shows jank, render entries in pages or virtualize the list.
* **Tradeoffs / Risks:** Lazy images can appear slightly later during fast scrolling. Virtualization complicates selection and accessibility; try native lazy loading first.
* **Expected impact estimate:** For a 50-item playlist, avoids most of the initial 50 thumbnail fetches; exact byte savings depend on upstream image sizes and viewport.
* **Removal Safety:** Safe
* **Reuse Scope:** Local file
* **Classification:** Reuse Opportunity

### [x] Finding 9 — In-memory coordination prevents safe horizontal scaling

* **Implementation progress:** `backend/DEPLOYMENT.md` now makes the one-worker/one-replica boundary explicit, lists every process-local state category, and defines the Redis/Socket.IO/shared-storage prerequisites for future horizontal scaling. `/health` now reports `deployment_mode`, `horizontal_scaling_safe: false`, and `expected_gunicorn_workers: 1`. Redis was intentionally not added without load evidence; the current safe operating mode remains one worker.

* **Category:** Concurrency / Scalability / Reliability
* **Severity:** Medium
* **Impact:** Correct limits, cancellation, token handoff, and Socket.IO behavior when adding workers or replicas.
* **Evidence:** Rate limits, semaphores, queue counts, cancel events, connected Socket.IO IDs, cleanup registrations, and prepared-file tokens are process-local dictionaries/locks (`backend/app.py:255-330`, `443-539`, `620-739`, `788-813`). The current `Procfile` intentionally runs one Gunicorn worker. A prepared token or cancel request routed to another process would not find its state.
* **Why it’s inefficient:** The service can scale only by making the single process larger. Adding workers/replicas appears easy but silently multiplies limits and fragments state. A previous changelog claim that the server runs two workers also conflicts with the current one-worker configuration.
* **Recommended fix:** Do not add workers blindly. When horizontal scaling is actually needed, move quotas, job state, cancellation, and prepared-token metadata to Redis or another shared store; use a Socket.IO message queue/sticky routing; place files in shared/object storage. Until then, document the deliberate single-worker constraint and scale based on measured CPU/disk/network saturation.
* **Tradeoffs / Risks:** Redis adds latency, cost, failure modes, and operational complexity. It is not justified solely for the current one-worker instance; trigger the migration from load data.
* **Expected impact estimate:** Little immediate speed gain on one instance; removes the correctness barrier to N-worker/N-replica throughput scaling.
* **Removal Safety:** Needs Verification
* **Reuse Scope:** Service-wide
* **Classification:** Over-Abstracted Code risk if added prematurely; Reuse Opportunity when scaling

### [x] Finding 10 — Noisy origin logging and dead production dependencies add avoidable operational cost

* **Implementation progress:** Informational origin-range logging now uses DEBUG, and `pytest` moved to `backend/requirements-dev.txt`. Package metadata and a clean `pip --dry-run` confirmed the production set resolves. `python-dotenv` was removed because neither the application nor required runtime packages need it. `requests` remains intentionally pinned because yt-dlp's default HTTP support depends on it even though `app.py` does not import it directly.

* **Category:** I/O / Build / Cost / Maintainability
* **Severity:** Low
* **Impact:** Cleaner logs, smaller/faster production installation, less dependency update surface.
* **Evidence:** `_enforce_cloudflare_origin()` states Railway proxying may make the Cloudflare-range check informational, yet logs every nonmatching request at INFO (`backend/app.py:399-438`). `backend/requirements.txt` includes `requests`, `python-dotenv`, and `pytest`; no executable project code imports them. `pytest` is explicitly labeled test-only but remains in production requirements. The README references `backend/test_security.py`, but that file is absent from the supplied ZIP. Code comments reference a prior `OPTIMIZATIONS.md`, also absent before this audit.
* **Why it’s inefficient:** Per-request informational logging adds I/O and obscures actionable events. Unused/test-only packages increase install time, image size, vulnerability noise, and maintenance work. Stale documentation makes optimization validation less reliable.
* **Recommended fix:** Demote the informational origin-range line to DEBUG or sample/count it as a metric. Split runtime and development/test requirements; remove dependencies only after import and deployment verification. Restore the documented security tests or correct the README.
* **Tradeoffs / Risks:** `requests` or `python-dotenv` may be intentionally retained for local tooling not included in the ZIP. Confirm the deployment/build environment before removal.
* **Expected impact estimate:** Low runtime impact under normal traffic; meaningful log-noise reduction under bursts and modest build/image reduction.
* **Removal Safety:** Needs Verification
* **Reuse Scope:** Service-wide
* **Classification:** Dead Code / Dead Dependency

### [x] Finding 11 — The 470-line download handler concentrates hot-path complexity

* **Implementation progress:** Twenty-four offline characterization tests now protect format and postprocessor planning, request/limit handling, retry and cancellation behavior, mute processing, native-token handoff, and token-scoped cleanup. The test discovery path was corrected so the suite runs normally from the repository root. Request parsing/validation is isolated, cancel-event removal is idempotent, and timeout/cancellation/error paths share bounded cleanup helpers.

  Progress reporting, option planning, attempt execution, media post-processing, and the job finalizer are extracted into focused functions, closing out this finding:
  * `make_download_progress_hook(...)` — throttled progress, cancellation, size-limit, and disk-watermark handling.
  * `build_download_options(...)` — yt-dlp format, metadata, SponsorBlock, and subtitle option planning without route-local branching.
  * `run_download_attempts(url, opts_list, ...)` — the yt-dlp `extract_info(download=True)` retry ladder over `opts_list`, returning a `DownloadAttemptResult` (`success`, `full_path`, `video_title`, `timed_out`, `last_err`, `primary_err`) instead of mutating route-local variables. Cancellation and process-fatal exceptions (`DownloadCancelled`, `MemoryError`, `SystemError`, `KeyboardInterrupt`, `SystemExit`) are still re-raised so the route's existing `except` blocks handle them unchanged.
  * `apply_mute_postprocessing(full_path)` — the fallback `-c copy -an` FFmpeg pass for non-YouTube muxed-only sources (YouTube itself now avoids this entirely via Finding 2's video-only format selection). Mutates the file in place and raises on FFmpeg failure exactly as before.
  * `finalize_prepared_download(full_path, ..., release_slot, state)` — the size check, `done` emit, processing-slot release, and native-transfer handoff. Its guarded state caches a completed result and prevents the slot from being released twice even when token preparation fails and the finalizer is retried.

  The route (`download()`) dropped from ~470 lines/~133 branch nodes to 219 lines/~34 branch nodes and now reads as orchestration. The regression guard requires it to stay under 250 lines, and the finalizer tests cover both normal repeated calls and retry after a handoff failure. The suite remains deterministic and offline; staged real-provider/FFmpeg/native-transfer validation is still owed before deployment.

* **Category:** Maintainability / Reliability / Algorithm
* **Severity:** Medium
* **Impact:** Safer future optimization, fewer cleanup regressions, easier profiling and testing.
* **Evidence:** Static AST measurement shows `download()` spans `backend/app.py:1650-2119` (470 lines) and contains roughly 133 branch/loop/try/with nodes. It owns validation, job reservation, progress, option construction, retries, subprocess cleanup, file discovery, mute processing, quota handling, response creation, and repeated error cleanup. Several exception branches repeat directory-prefix cleanup and cancel-event removal (`app.py:1972-1983`, `2079-2115`).
* **Why it’s inefficient:** This is primarily optimization debt: hot-path changes require reasoning about many coupled states, so safe improvements are harder to implement and benchmark. Repeated cleanup logic can drift and already relies on broad `except` blocks.
* **Recommended fix:** Extract cohesive, low-overhead units: immutable request parsing, download-plan construction, attempt runner, artifact registry, and one idempotent job-finalizer. Keep orchestration visible; do not create a deep class hierarchy. Use a job context object so token, paths, slot state, and cancellation are released once.
* **Tradeoffs / Risks:** Refactoring without characterization tests can introduce regressions. This does not directly make downloads faster, so do it after Findings 1–3 and alongside tests.
* **Expected impact estimate:** Low immediate latency impact; high reduction in change risk and duplicated maintenance paths.
* **Removal Safety:** Needs Verification
* **Reuse Scope:** Module
* **Classification:** Reuse Opportunity

## 3) Quick Wins (Do First)

| Status | Order | Change | Effort | Expected value |
|:---:|---:|---|---:|---|
| [x] | 1 | Stop calling `/info` before every bulk `/download`; align quotas with batch semantics | 0.5–1 day | Very high |
| [x] | 2 | Add client-side `/info` AbortController + stale-response guard | 1–2 hours | High for very low risk |
| [x] | 3 | Add lazy/async playlist thumbnail loading | <1 hour | Medium on mobile playlists |
| [x] | 4 | Demote/suppress per-request non-Cloudflare INFO logging | <1 hour | Medium operational cleanup |
| [x] | 5 | Separate runtime and dev/test dependencies after verification | 1–2 hours | Low/medium build cleanup |
| [x] | 6 | Replace `Date.now()` version-script cache busting with a build/version hash | <1 hour | Low but straightforward |

Mute-aware format selection is also high ROI, but it should follow a small extractor compatibility test matrix rather than being treated as a blind one-line change.

## 4) Deeper Optimizations (Do Next)

1. [x] Add spool-byte reservation, disk-watermark admission control, and a separate native-transfer concurrency budget.
2. [x] Implement video-only mute planning with a muxed-format fallback.
3. [x] Replace the fake client remux with a real server media-job mode and fast stream-copy path.
4. [x] Unify SSRF URL validation and guarded-connection DNS resolution without weakening rebinding protection.
5. [x] Add bounded metadata single-flight/cache behavior using sanitized responses.
6. [x] Content-hashed/cacheable app and route assets are complete; historical update data is lazy-loaded, while smaller landing feature chunks remain measurement-dependent.
7. [x] Document and health-check the single-worker boundary; add Redis/shared artifacts only when measured load justifies multiple workers or replicas.
8. [x] Characterization tests, request/cleanup extraction, attempt execution, media post-processing, and the job finalizer are all extracted and covered by offline tests. Staged real-media validation remains open (see Finding 11 and the Validation Plan below).

### Remaining execution plan

1. **[done locally] Frontend delivery (Finding 7):** hashed assets, route-specific CSS, shared info-page bootstrap, immutable cache headers, and lazy historical update data are complete. Use a deployed browser trace only to decide whether further landing-feature splitting is worthwhile.
2. **[x] Single-worker boundary (Finding 9):** the intentional one-worker model is documented and health-checked. Redis, sticky Socket.IO routing, and shared/object storage remain conditional on measured load.
3. **[x] Dependency cleanup (Finding 10):** runtime metadata and a clean resolver dry-run were checked; only the unused package was removed and yt-dlp's HTTP dependency was retained.
4. **[x] Download orchestration (Finding 11):** characterization tests, request parsing, idempotent scoped cleanup, and the attempt-execution/media-post-processing/job-finalizer extraction are all complete and covered by offline unit tests. Staged real-media tests (real yt-dlp extraction, real FFmpeg mute pass, real native-transfer handoff against the acceptance targets below) still need to run in an environment with provider network access before this is deploy-verified.

## 5) Validation Plan

### Benchmarks

Build a repeatable corpus with at least:

* YouTube short progressive video, 1080p separate audio/video, 4K AV1/VP9, subtitles, SponsorBlock, and unavailable/private cases.
* TikTok/Instagram and one generic extractor with muxed-only media.
* 10 very short bulk URLs and a 50-entry playlist.
* Converter samples covering compatible remux, incompatible container, audio extraction, corrupt input, 230 MiB upload boundary, duration boundary, and output-size boundary.

For each scenario, run at least 10 warm and 10 cold iterations. Record median, p95, and failure count. Use a controlled test instance and media you are authorized to download.

### Profiling strategy

* Wrap phases with monotonic timers: queue wait, DNS/validation, extractor metadata, media transfer, yt-dlp post-processing, mute/remux, prepared wait, and native transfer.
* Sample process CPU/RSS and child-process CPU/RSS with `psutil`; record bytes read/written and free disk before/after every job.
* Use `py-spy` or Scalene for Python overhead only after separating external wait and FFmpeg time.
* Use FFmpeg `-benchmark` on converter/remux test inputs.
* Use browser Performance/Network panels, Lighthouse, and a throttled mid-range Android profile for the landing page and 50-item playlist.
* Count upstream extractor attempts, DNS lookups, `/info` cache hits, progress emits, active transfers, reserved spool bytes, cleanup failures, and 429/503/504 rates.

### Before/after metrics

* Bulk: API calls/item, extractor calls/item, total completion time, 429 rate, upstream restriction rate.
* Mute: source bytes, FFmpeg invocations, disk write bytes, peak spool bytes, completion time.
* Capacity: active processors vs active transfers, minimum free disk, rejected admissions, p95 API latency during 1/2/5 concurrent clients.
* Converter: CPU-seconds and wall time per output minute, stream-copy success/fallback rate.
* Frontend: transferred/compressed bytes, parse/evaluate time, LCP, INP, JS heap, thumbnail requests before scroll.

### Correctness and regression tests

* Verify output duration, dimensions, codec/container, audio presence/absence, subtitles, metadata, and SponsorBlock result with `ffprobe`.
* Verify cancel during queue, extraction, media transfer, merge, and conversion; assert no child process or artifact remains.
* Verify token expiry, one-use behavior, HEAD behavior, IP ownership, interrupted transfer cleanup, and disk-watermark rejection.
* Keep SSRF tests for direct IP, DNS rebinding/mixed answers, redirects, IPv4/IPv6, low-level `connect`/`connect_ex`, FFmpeg protocol allowlist, and the private PO-token exception.
* Run load tests long enough to cross every cleanup TTL and assert dictionaries, open descriptors, files, and reserved-byte counters return to baseline.

### Acceptance targets

* Bulk uses at most one application job request per item after the initial batch action and completes 10 short items without self-generated 429s.
* Video-only mute produces no audio stream and does not run the second mute FFmpeg pass on supported extractors.
* Service-wide reserved + present artifact bytes never exceed the configured spool budget.
* Active native transfers never exceed the configured transfer semaphore.
* No stale `/info` response can replace the result for a newer URL.
* Compatible remux uses stream copy; incompatible inputs fall back or fail with a stable, tested error.

## 6) Optimized Code / Patch (when possible)

The audit findings above have now been implemented in the supplied source and protected by targeted local checks where practical. The snippets below are retained as compact design notes that explain the intended shape of several fixes; they are not the authoritative current source. The remaining work is the real platform/staging validation in Section 5, which cannot be proven by static/offline checks alone.

### A. Mute-aware plan

```python
def build_download_plan(url, quality, fmt, codec, mute):
    if mute and is_youtube(url):
        # Prefer video-only; retain a tested muxed fallback for compatibility.
        format_selector = build_video_only_selector(quality, codec)
        post_download_strip_audio = False
    else:
        format_selector = build_format_str(url, quality, fmt, codec)
        post_download_strip_audio = mute
    return format_selector, post_download_strip_audio
```

Change summary: make mute a format-selection concern; run the current `-c copy -an` step only for fallback sources that delivered muxed media.

### B. Spool and transfer admission

```python
with spool_budget.reserve(estimated_peak_bytes) as reservation:
    with download_slot():
        artifact = run_download(job)
    reservation.commit_actual(artifact.size)
    token = prepared_files.register(artifact, reservation)

with transfer_slots.acquire(owner_ip):
    return stream_prepared_file(token)  # cleanup releases stored-byte reservation
```

Change summary: track both processing concurrency and byte/transfer capacity; cleanup becomes responsible for releasing the artifact’s byte reservation exactly once.

### C. Client metadata deduplication

```javascript
let infoController = null;
let infoSequence = 0;

async function fetchVideo() {
  infoController?.abort();
  infoController = new AbortController();
  const sequence = ++infoSequence;
  const url = urlInput.value.trim();
  const response = await fetch(`${API}/info`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({url}),
    signal: infoController.signal,
  });
  if (sequence !== infoSequence || url !== urlInput.value.trim()) return false;
  // Render only the current response.
}
```

Change summary: cancel obsolete work where possible and guarantee that an older response cannot overwrite the latest URL state.

### D. Real remux-first conversion

```text
probe input streams
if requested mode == remux and codecs are valid for target container:
    ffmpeg -i INPUT -map 0 -c copy OUTPUT
else if requested mode == transcode:
    run the explicit encoder profile
else:
    return a stable incompatible-container error
```

Change summary: separate lossless container copy from intentional transcoding and remove the current client-side rename-only behavior.
