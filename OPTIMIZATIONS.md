# ZenithW Full Optimization Audit

Audit date: 2026-08-17  
Scope: current working tree, including the uncommitted changes in `backend/app.py`. This is a static audit; no production traffic profile, Railway resource limits, or live-site traces were available. Findings marked **likely** should be confirmed with the validation plan below.

Implementation update (2026-08-17): the first remediation pass now uses short-lived, single-use native download URLs for large downloads and conversions; limits the optional Blob save/share flow to 32 MB; bounds the download queue and metadata/thumbnail concurrency with deadlines; rejects conversions before multipart parsing when the conversion slot is occupied; and lazy-connects/throttles Socket.IO progress. The findings below remain the original audit baseline; deeper items and validation work are still open.

### 1) Optimization Summary

Current optimization health is **mixed**. The backend already has useful safeguards: bounded download and conversion execution, per-IP request tracking, file cleanup, output-size limits, SSRF checks, and a single-extraction download path. The remaining risks are mostly at system boundaries: the browser buffers entire media responses, expensive routes do not share a complete admission-control policy, realtime progress is eager and noisy, and all coordination remains local to one process.

Top 3 highest-impact improvements:

1. Replace `fetch(...).blob()` media delivery with a native browser download stream (preferably a short-lived job/token followed by a normal `GET`). This removes file-size-proportional browser buffering and fixes retained Blob/object-URL memory.
2. Put `/download`, `/info`, `/thumbnail`, and `/convert` behind bounded, endpoint-specific admission control with queue limits and end-to-end deadlines. Reject early before accepting large uploads when capacity is unavailable.
3. Connect Socket.IO only for active work and throttle/coalesce progress events to a small fixed rate (for example 4-5 updates/second and only when percentage/status changes).

Biggest risk if no changes are made: a burst of distributed requests or a few large files can exhaust browser memory/temp storage, backend connections, worker capacity, or ephemeral disk. The resulting failure mode is not graceful degradation; it is stalled queues, failed cancellations, timeouts, and potentially a restarted/unavailable service.

### 2) Findings (Prioritized)

#### Finding 1

* **Title**: Full media responses are buffered in the browser and retained after use
* **Category**: Memory / Network / Frontend
* **Severity**: Critical
* **Impact**: Browser memory/temp-storage use, time-to-save, crash rate, mobile reliability, and perceived latency
* **Evidence**: `frontend/index.html:1515-1517`, `frontend/index.html:1622-1630`, and `frontend/index.html:1720-1724` call `res.blob()` for downloads and conversions. The configured server limits permit downloads up to 1,536 MB and conversion output up to 1,024 MB (`backend/app.py:73-74`). `pendingBlob` remains globally referenced (`frontend/index.html:658`, `frontend/index.html:1664-1677`). Object URLs created by thumbnail, save/share/copy, remux, conversion, and the dynamic manifest are not consistently revoked (`frontend/index.html:634`, `frontend/index.html:1667`, `frontend/index.html:1689`, `frontend/index.html:1702`, `frontend/index.html:1724`).
* **Why it’s inefficient**: `Response.blob()` must finish buffering the response before the save UI can use it. A large download therefore exists simultaneously on backend disk and in browser-managed memory or temporary storage. The global Blob reference prevents reclamation after the modal closes, and unreleased object URLs extend lifetimes further. The current “remux” path also creates an object URL for the unchanged input file; it does not remux media.
* **Recommended fix**: Convert downloads to a two-step flow: `POST /jobs` validates and starts work, then returns a short-lived opaque token; a normal `<a href="https://api.../jobs/{token}/file">` or top-level navigation performs a streaming `GET` with `Content-Disposition`. Keep Blob-based share/copy only below a conservative size threshold. Always revoke object URLs and clear `pendingBlob`/`pendingFilename` on completion, cancellation, replacement, and modal close. Either implement real client/server remuxing or remove/rename the current pass-through feature.
* **Tradeoffs / Risks**: A job/token flow adds short-lived server state and requires one-time token expiry, ownership checks, cleanup, and CORS/origin-lock review. Native download progress is less directly observable; Socket.IO can continue to report server-side preparation, while the browser owns transfer progress.
* **Expected impact estimate**: Changes browser-side buffering from **O(file size)** to approximately **O(stream buffer)** for normal downloads. For a 1.5 GB file, this avoids retaining up to roughly the file size in browser memory/temp storage and allows the browser download to begin without waiting for `blob()` completion.
* **Removal Safety**: Needs Verification
* **Reuse Scope**: Service-wide
* **Code reuse/dead-code classification**: Runtime bottleneck; the current “remux” implementation is **Dead Code / stale feature behavior** because it only renames the same bytes.

#### Finding 2

* **Title**: Expensive work has incomplete and unbounded admission control
* **Category**: Concurrency / Reliability / Cost
* **Severity**: High
* **Impact**: Tail latency, open connections, upstream calls, FFmpeg processes, memory, and availability under load
* **Evidence**: `acquire_download_slot()` waits in an unbounded loop with no queue-size or queue-wait deadline (`backend/app.py:431-456`). The download timeout starts only after a slot is acquired (`backend/app.py:1373-1385`). `/info` performs unrestricted yt-dlp extraction (`backend/app.py:1074-1152`), and `/thumbnail` performs yt-dlp plus FFmpeg work without a global slot or endpoint timeout (`backend/app.py:1570-1621`). Gunicorn allows up to 1,000 worker connections while only two downloads execute (`backend/Procfile`). Per-IP limits reduce single-source abuse but do not bound distributed traffic.
* **Why it’s inefficient**: Excess requests remain alive while holding sockets and application state, and metadata/thumbnail traffic can bypass the download/conversion capacity controls entirely. Under overload, work accumulates instead of being shed. A waiting request can outlive the useful client session because its actual download deadline has not started.
* **Recommended fix**: Add a global bounded workload budget with separate pools for metadata, thumbnails, downloads, and conversions. Define `MAX_QUEUE_WAITING`, per-route queue timeouts, and an end-to-end request deadline that includes queue time. Return `429` or `503` with `Retry-After` when saturated. Give `/info` a short extraction timeout and bounded concurrency; give `/thumbnail` both a slot and timeout. Enforce upstream proxy body/header/idle timeouts as a second layer.
* **Tradeoffs / Risks**: Early rejection reduces nominal acceptance during bursts, but preserves successful throughput and predictable latency. Pool sizes must be tuned against actual Railway CPU, RAM, disk, and outbound bandwidth.
* **Expected impact estimate**: Qualitatively high. It caps memory and open-request growth at configured bounds and prevents overload from turning into service-wide queueing. P95/P99 latency should remain bounded during bursts rather than increasing with queue length.
* **Removal Safety**: Needs Verification
* **Reuse Scope**: Service-wide
* **Code reuse/dead-code classification**: Runtime bottleneck

#### Finding 3

* **Title**: Realtime progress is connected eagerly and emitted at source-event frequency
* **Category**: Network / CPU / Frontend / Scalability
* **Severity**: High
* **Impact**: Connection capacity, Socket.IO heartbeat traffic, backend CPU, DOM work, and horizontal-scaling complexity
* **Evidence**: Every main-page visitor immediately runs `io(API)` (`frontend/index.html:657`), regardless of whether they ever download. The backend stores every connected SID (`backend/app.py:629-648`, `backend/app.py:1780-1791`). Every yt-dlp progress-hook invocation can emit a Socket.IO event (`backend/app.py:1241-1274`), and the client performs several DOM writes for each event (`frontend/index.html:1089-1096`, `frontend/index.html:1588-1594`). Queued downloads also emit roughly once per second (`backend/app.py:437-453`).
* **Why it’s inefficient**: Persistent connections are paid for by all visitors while benefiting only active downloads. yt-dlp hooks may fire far more frequently than humans can perceive, so network frames, JSON encoding, room dispatch, and layout/style updates are redundant. This also consumes the same 1,000-connection worker budget used by active requests.
* **Recommended fix**: Load/connect Socket.IO lazily when a download starts or its modal opens, then disconnect after completion/cancel plus a short idle grace period. On the server, emit only when status changes, integer percentage changes, or at most every 200-250 ms. Coalesce client DOM updates through one `requestAnimationFrame` callback. Emit queue messages only when position changes or on a slower heartbeat.
* **Tradeoffs / Risks**: The first active download may pay one connection-handshake delay. Connect before submitting the job and wait briefly for a SID, or allow the job response to return its own progress channel/token.
* **Expected impact estimate**: Likely **80-99% fewer progress events** on chatty/fragmented downloads with a 4-5 Hz cap. Idle Socket.IO connections fall from all page visitors to active/recent users only.
* **Removal Safety**: Likely Safe
* **Reuse Scope**: Service-wide
* **Code reuse/dead-code classification**: Runtime bottleneck

#### Finding 4

* **Title**: Conversion accepts large bodies before capacity rejection and always re-encodes video
* **Category**: CPU / I/O / Cost / Reliability
* **Severity**: High
* **Impact**: Upload bandwidth, temporary disk, conversion latency, FFmpeg CPU, and timeout rate
* **Evidence**: Accessing `request.files` and validating the multipart body occurs before `conversion_slots.acquire(blocking=False)` (`backend/app.py:1648-1664`); the request body may therefore already have been received/spooled before the server returns “busy.” The route then saves the full upload (`backend/app.py:1670-1674`). Every video target selects an encoder (`libx264` or `libvpx-vp9`) even when streams are container-compatible and could be copied (`backend/app.py:1698-1708`). No ffprobe-based duration, resolution, stream-count, or codec admission check is present.
* **Why it’s inefficient**: Saturated clients can still spend network and temp-storage resources uploading as much as 230 MB before rejection. Re-encoding compatible streams is orders of magnitude more CPU-intensive than remuxing. Malformed or extreme media reaches FFmpeg without a cheap resource profile.
* **Recommended fix**: Reserve conversion capacity in a `before_request` path guard before parsing multipart data, then hold it through upload and FFmpeg execution; pair this with reverse-proxy upload time/size limits. Run a short, bounded `ffprobe` first. Use `-c copy` when input codecs are legal for the requested container; otherwise select explicit presets/quality and cap duration, resolution, frame rate, and stream count. Consider direct object-storage upload if conversion traffic grows.
* **Tradeoffs / Risks**: Stream-copy compatibility rules need a tested codec/container matrix. Holding a slot during upload protects the server but lets a slow uploader occupy capacity, so upload deadlines and minimum transfer rates are important.
* **Expected impact estimate**: Compatible remux operations can use **over 90% less CPU** and complete near disk/network speed; practical latency improvement is often **10x or more**. Early busy rejection avoids up to 230 MB of unnecessary accepted upload per rejected request.
* **Removal Safety**: Needs Verification
* **Reuse Scope**: Service-wide
* **Code reuse/dead-code classification**: Runtime bottleneck; the frontend remux path is a stale duplicate of ordinary file download behavior.

#### Finding 5

* **Title**: Process-local queues, rate limits, cancellation, and Socket.IO state prevent safe scaling
* **Category**: Scalability / Concurrency / Reliability
* **Severity**: High
* **Impact**: Horizontal scaling, cancellation correctness, global capacity enforcement, and deploy/restart behavior
* **Evidence**: Rate-limit data, per-IP counts, semaphores, queue counters, pending cleanups, cancellation events, SSRF cache, and connected SIDs are all in process memory (`backend/app.py:212-274`, `backend/app.py:389-456`, `backend/app.py:498-511`, `backend/app.py:581-648`, `backend/app.py:713-721`). The deployment intentionally runs one worker (`backend/Procfile`). With multiple workers or instances, limits multiply and `/cancel` or Socket.IO traffic can land on a process that does not own the job.
* **Why it’s inefficient**: The service can scale only by making one process larger. Adding workers appears to increase capacity but silently breaks global limits and routing assumptions, while restart loses all coordination state.
* **Recommended fix**: Keep one worker only as a documented short-term constraint. For scaling, move job ownership, rate limits, queueing, and cancellation flags to Redis or a real task queue; configure Flask-SocketIO with a message queue and either sticky routing or token-addressed progress. Keep actual media files in shared/object storage or route file retrieval to the owning worker.
* **Tradeoffs / Risks**: Distributed coordination adds infrastructure cost and failure modes. It is a deeper optimization and should follow measurement that proves one instance is insufficient.
* **Expected impact estimate**: Enables near-linear scale-out until outbound bandwidth/upstream limits dominate, while keeping concurrency caps and cancellations correct. No honest percentage is available without a load profile.
* **Removal Safety**: Needs Verification
* **Reuse Scope**: Service-wide
* **Code reuse/dead-code classification**: Over-Abstracted Code at multi-instance scale: process-local abstractions present global-looking APIs but do not provide global semantics.

#### Finding 6

* **Title**: One shared rate-limit bucket penalizes cancellation and conflicts with playlist behavior
* **Category**: Reliability / Concurrency
* **Severity**: Medium
* **Impact**: Cancellation success, bulk-download completion, shared-NAT users, and unnecessary in-flight work
* **Evidence**: `/info`, `/download`, `/thumbnail`, `/convert`, and `/cancel` all consume the same 10-requests/minute/IP bucket (`backend/app.py:75-77`, `backend/app.py:1038-1042`, `backend/app.py:1074-1078`, `backend/app.py:1162-1166`, `backend/app.py:1570-1574`, `backend/app.py:1647-1651`). The frontend supports up to 50 sequential playlist items (`frontend/index.html:1488-1528`). A user who has exhausted the bucket may be unable to cancel an active expensive job.
* **Why it’s inefficient**: Control-plane requests and expensive work are priced identically. Blocking cancellation can make the server continue work the user explicitly tried to stop. Shared NATs also concentrate unrelated users into one bucket.
* **Recommended fix**: Use route-weighted buckets: cheap metadata, expensive download/convert, and a separate tightly validated cancel policy. Allow cancellation of an active ID owned by the same client even when the ordinary bucket is exhausted, with its own small abuse limit. Return `Retry-After`, and make the playlist UI pause/retry rather than marking all 429 responses as permanent item failures.
* **Tradeoffs / Risks**: More policies require more tests and observability. Never make `/cancel` unlimited for arbitrary IDs.
* **Expected impact estimate**: Primarily reliability: cancellation remains available under load and playlist completion is predictable. It can also save up to the remaining duration/bytes of a job that otherwise continues after a failed cancel.
* **Removal Safety**: Needs Verification
* **Reuse Scope**: Service-wide
* **Code reuse/dead-code classification**: Reuse Opportunity: centralize route-cost policy instead of repeating identical `check_rate_limit()` blocks.

#### Finding 7

* **Title**: DNS validation, metadata extraction, and fallback retries duplicate upstream work
* **Category**: Network / Caching / Cost / Reliability
* **Severity**: Medium
* **Impact**: `/info` latency, DNS traffic, upstream rate limits, and failure-path latency
* **Evidence**: `is_safe_url()` resolves the hostname (`backend/app.py:686-707`), then the guarded connection resolves it again through `_resolve_safe_host_cached()` (`backend/app.py:724-784`). `/info` has no short-lived result cache (`backend/app.py:1074-1159`). When a cookie file exists, every route receives a cookie and no-cookie option; broad exception handlers generally continue to the second full extraction even for errors unlikely to improve without cookies (`backend/app.py:850-864`, `backend/app.py:1096-1152`, `backend/app.py:1373-1428`, `backend/app.py:1598-1617`).
* **Why it’s inefficient**: The safety preflight and the actual connection repeat DNS work. Duplicate user actions and bulk workflows repeat expensive metadata extraction. Non-retryable failures may pay for two complete upstream attempts, increasing latency and the chance of upstream throttling.
* **Recommended fix**: Consolidate URL validation and pinned-public-IP resolution through one bounded TTL cache while preserving DNS-rebinding protection on redirects and each new host. Add a small (for example 30-120 second), size-bounded metadata cache keyed by normalized URL plus relevant auth/cookie mode. Classify errors into retryable-cookie, retryable-network, and terminal; apply bounded exponential backoff with jitter only to retryable cases.
* **Tradeoffs / Risks**: Cached metadata can become stale and must not leak cookie-specific/private results between security contexts. DNS optimization must keep the current “validate the exact IP actually connected to” invariant.
* **Expected impact estimate**: Removes one DNS lookup from the common request path. On cache hits, `/info` upstream work can approach zero. Terminal failures that currently take two attempts can see latency and upstream calls reduced by roughly **50%**.
* **Removal Safety**: Needs Verification
* **Reuse Scope**: Service-wide
* **Code reuse/dead-code classification**: Reuse Opportunity: unify safe host resolution and retry classification.

#### Finding 8

* **Title**: Disk budgets and health metrics do not describe actual disk pressure
* **Category**: I/O / Reliability / Cost
* **Severity**: Medium
* **Impact**: Disk-full prevention, incident detection, and cleanup confidence
* **Evidence**: `/health` labels `len(_pending_cleanups)` as `disk_files` (`backend/app.py:998-1013`), but partial yt-dlp files and failed-attempt artifacts are not registered there. Actual directory scanning happens only every 15 minutes, and files are eligible after 30 minutes (`backend/app.py:78-79`, `backend/app.py:541-579`). Two configured downloads can each target 1.5 GB, while one conversion can have a 230 MB input plus up to 1 GB output; partial/retry artifacts add more. No free-space check or byte-based disk budget is present.
* **Why it’s inefficient**: A cheap counter was substituted for a materially different metric. Health can report few or zero files while unregistered partials consume disk. Static per-file caps do not ensure aggregate disk safety.
* **Recommended fix**: Maintain counters for registered bytes and active reservations, and refresh an actual directory file/byte snapshot in the periodic cleanup thread rather than on every health request. Report free bytes, used temp bytes, partial-file count, active reservations, and cleanup failures. Reserve estimated bytes before work, reject when free-space headroom is insufficient, and clean a job’s known prefix on every terminal path through one helper.
* **Tradeoffs / Risks**: Reservations are estimates because upstream size can be unknown. Keep a conservative headroom margin and reconcile counters periodically with the filesystem.
* **Expected impact estimate**: Prevents aggregate workloads from exceeding a configured disk envelope and materially improves detection time. Runtime overhead remains low because scanning stays off the hot request path.
* **Removal Safety**: Needs Verification
* **Reuse Scope**: Service-wide
* **Code reuse/dead-code classification**: Reuse Opportunity: consolidate repeated prefix cleanup loops at `backend/app.py:1436-1441`, `backend/app.py:1527-1533`, and `backend/app.py:1549-1557`.

#### Finding 9

* **Title**: Pointer and canvas effects spend work continuously and force layout reads
* **Category**: Frontend / CPU
* **Severity**: Medium
* **Impact**: Main-thread time, battery use, frame stability, and interaction latency
* **Evidence**: The background canvas animates 130 desktop stars on every frame (`frontend/index.html:1018-1085`). The magnetic-hover handler runs for every `mousemove`, re-queries the DOM, and calls `getBoundingClientRect()` for every magnetic element before writing transforms (`frontend/index.html:1807-1824`). CSS also contains multiple infinite animations and backdrop filters (`frontend/style.css`, notably lines 390-398, 480, 507-516, 927-932).
* **Why it’s inefficient**: Repeated layout reads followed by style writes at pointer-event frequency can cause layout/style work much faster than the display refresh rate. The canvas and decorative animations continue even when no user-visible state changes. The issue is **likely** on mid-range laptops and battery-constrained devices; it needs a trace.
* **Recommended fix**: Cache the magnetic node list and bounding boxes, refresh boxes on resize/scroll, coalesce pointer input into one `requestAnimationFrame`, and update only the nearest/in-range elements. Pause canvas work on `visibilitychange`, modal-heavy states, and low-power/reduced-motion preferences; consider 30 FPS desktop as well as mobile. Prefer transform/opacity-only CSS and avoid animating backdrop filters.
* **Tradeoffs / Risks**: Visual motion becomes slightly less fluid on high-refresh displays. Keep a quality mode if the effect is a product requirement.
* **Expected impact estimate**: Likely **50-90% less script/layout time during pointer movement** after rAF coalescing and cached geometry; canvas savings depend on device and chosen frame cap.
* **Removal Safety**: Likely Safe
* **Reuse Scope**: Local file
* **Code reuse/dead-code classification**: Runtime bottleneck

#### Finding 10

* **Title**: Static assets are monolithic, cache-hostile, and duplicate page infrastructure
* **Category**: Build / Frontend / Caching / Maintainability
* **Severity**: Medium
* **Impact**: Repeat-visit transfer, HTML parse/JS compile time, deployment cache efficiency, and change cost
* **Evidence**: Measured current sizes are: `frontend/index.html` 133,414 bytes raw / 36,713 bytes gzip; `frontend/style.css` 72,654 / 16,111; `frontend/updates.html` 61,465 / 22,403. The main application script and four-language dictionary are inline in the 1,841-line HTML file. `updates.html:22` uses `Date.now()` to force a fresh `version.js` request on every visit. `netlify.toml` defines security headers but no explicit fingerprinted-asset caching policy. Legal navigation, language toggle CSS, translation rendering, and storage logic are copied across `about.html`, `privacy.html`, `terms.html`, `dmca.html`, and `status.html`.
* **Why it’s inefficient**: Any application-script change invalidates the entire HTML response, and inline code cannot be cached independently. Forced cache busting guarantees a network request even when the version is unchanged. Copy-paste page infrastructure increases drift and makes optimization/security changes repetitive.
* **Recommended fix**: Extract the main app logic and translations into fingerprinted external modules, minify them, and lazy-load settings/queue/conversion/animation features. Generate legal pages from a shared template or at least use one shared `legal.js` and shared CSS. Give fingerprinted assets `Cache-Control: public, max-age=31536000, immutable`; keep HTML and the small version pointer revalidated. Remove `Date.now()` cache busting and use a deploy/version hash. Bundle or self-host the font and Socket.IO assets with an explicit loading strategy.
* **Tradeoffs / Risks**: A build step adds tooling and source-map management. Avoid a large framework; a small esbuild/Rollup pipeline is sufficient.
* **Expected impact estimate**: Minification alone is modest after gzip, likely **5-15%** for these text assets; the larger win is that repeat navigations can reuse shared JS/CSS with near-zero transfer and avoid recompiling unchanged inline code.
* **Removal Safety**: Likely Safe
* **Reuse Scope**: Service-wide
* **Code reuse/dead-code classification**: Reuse Opportunity

#### Finding 11

* **Title**: Production dependencies and stale/dead paths add avoidable build and maintenance cost
* **Category**: Build / Maintainability / Cost
* **Severity**: Low
* **Impact**: Image/build size, install time, audit noise, and future regression risk
* **Evidence**: `pytest` is pinned in the production `backend/requirements.txt`, and `gcc` is included in the Nixpacks setup (`backend/nixpacks.toml`) even though runtime code does not use either directly. `ARIA2_PATH` is assigned but never consumed (`backend/app.py:493-496`). `updateConvBtn` and `toggleAccordion` have no references beyond their declarations in `frontend/index.html`; the former is explicitly a legacy alias. Several pages begin `<head>` with an unmatched `</script>` (`frontend/index.html:4`, `frontend/privacy.html:4`, `frontend/terms.html:4`, `frontend/dmca.html:4`, `frontend/status.html:4`, `frontend/app.html:4`).
* **Why it’s inefficient**: Test/build tools in production increase dependency resolution, download, image surface, and security-scanner noise. Dead names and malformed markup complicate static analysis and make real defects easier to miss.
* **Recommended fix**: Split runtime and development requirements; use a multi-stage image/build configuration so compiler tools are absent from runtime when wheels permit. Remove verified dead aliases/constants and unmatched tags. Add lightweight linting (`ruff`/Pyflakes for Python and HTML/JS validation) to CI.
* **Tradeoffs / Risks**: Confirm that every production platform has compatible binary wheels before removing the compiler. Search inline handlers and external consumers before deleting public/global JavaScript functions.
* **Expected impact estimate**: Low runtime impact; modest build/image reduction and faster, cleaner dependency auditing.
* **Removal Safety**: Needs Verification
* **Reuse Scope**: Service-wide
* **Code reuse/dead-code classification**: Dead Code

### 3) Quick Wins (Do First)

1. Clear `pendingBlob` and revoke every object URL on all completion/close/error paths; add client-side size guards for Blob-only share/copy. **Effort: hours; impact: high memory reliability.**
2. Throttle progress emission to 4-5 Hz and only on changed percent/status; coalesce client updates with rAF. **Effort: hours; impact: high network/CPU reduction.**
3. Add queue length and queue-wait limits to downloads; add bounded slots/timeouts to `/info` and `/thumbnail`. **Effort: 0.5-1 day; impact: high overload reliability.**
4. Preserve cancellation even when the ordinary request bucket is exhausted; return `Retry-After` for all saturation/rate responses. **Effort: hours; impact: medium-high reliability.**
5. Move conversion admission before multipart parsing and add proxy upload timeouts. **Effort: 0.5 day; impact: high wasted-upload reduction.**
6. Cache the magnetic element list and process pointer updates once per animation frame. **Effort: hours; impact: medium UI smoothness/battery.**
7. Remove `Date.now()` version cache busting, unmatched `</script>` tags, verified dead aliases, and production `pytest`. **Effort: hours; impact: low-medium build/cache hygiene.**
8. Replace `disk_files` with a periodically refreshed real file/byte/free-space snapshot. **Effort: 0.5 day; impact: medium operational reliability.**

### 4) Deeper Optimizations (Do Next)

1. Introduce the job/token + native streaming-download architecture. This is the most important structural change because it removes browser file-size-proportional buffering without sacrificing backend preparation progress.
2. Create a unified workload controller: weighted endpoint pools, bounded queues, end-to-end deadlines, disk reservations, and explicit overload responses.
3. Add ffprobe-driven conversion planning and stream copy for compatible codec/container pairs; tune real transcodes with presets and media limits.
4. Move job, limiter, cancellation, and Socket.IO coordination to Redis/a task queue only when horizontal scaling is needed.
5. Extract and fingerprint frontend modules/translations and generate duplicated static page shells from a shared template.
6. Add a bounded, privacy-aware metadata cache and unified retry/error classifier for yt-dlp operations.

### 5) Validation Plan

#### Benchmarks

* Build a fixed legal test-media matrix: 10 MB, 100 MB, 500 MB, and near-limit media; progressive and fragmented/HLS sources; audio extraction; subtitle/SponsorBlock cases; thumbnail; and each conversion container.
* Load-test `/info`, `/thumbnail`, `/download`, and `/convert` separately and as a realistic mix. Use 1, 10, 50, and 200 simulated clients, including distributed IP headers in a controlled staging environment.
* Run overload tests with queue capacity + 1, slow uploads, slow downloads, cancelled jobs, invalid URLs, upstream timeouts, and malformed media.
* Compare conversion of compatible MP4-to-MKV/MP4 and incompatible formats with re-encode versus stream copy.

#### Profiling strategy

* Backend: sample process RSS/CPU, gevent hub lag, open connections, active/waiting/rejected work by route, yt-dlp extraction time, DNS time, retry count/reason, Socket.IO events/second, child-process CPU/RSS, temp bytes, free disk, and cleanup failures.
* Browser: record Chrome Performance and Memory traces for 100 MB, 500 MB, and 1.5 GB downloads. Track JS heap, browser temp/storage growth, time until native save begins, long tasks, layout time during mouse movement, and frames/second.
* Network: count Socket.IO handshakes, heartbeat bytes, progress messages, `/info` upstream attempts, DNS lookups, and repeat-visit asset bytes.
* Build: record raw/gzip/Brotli asset size, parsed/compiled JS size, and Lighthouse/WebPageTest FCP, LCP, TBT, and repeat-view results.

#### Metrics to compare before/after

* Request p50/p95/p99 latency and success/rejection/timeout rates per route
* Maximum and steady-state process RSS, browser JS heap/temp use, CPU, and disk bytes
* Queue wait time, queue depth, overload rejections, cancellation latency/success
* yt-dlp calls per user action, retry rate, cache hit rate, DNS resolutions per job
* Socket connections per active download and progress events per second
* Conversion wall time, FFmpeg CPU-seconds, and output correctness
* Cleanup lag, orphan/partial file count, and minimum free disk during tests

#### Correctness test cases

* Native downloads preserve filename, MIME type, exact byte count/hash, cancellation, and one-time token expiry.
* Cancellation works before queue admission, while queued, during yt-dlp, during FFmpeg, and during client transfer.
* Private, loopback, link-local, mixed public/private DNS, redirects, IPv4, and IPv6 remain blocked or allowed correctly after DNS consolidation.
* Cookie/private metadata never crosses cache keys or clients; stale cache expires as configured.
* Route-weighted limits remain safe behind shared NAT and cannot be bypassed with spoofed headers.
* Stream-copy conversion outputs play correctly and contain the expected audio/video/subtitle streams for every supported container.
* Multiple workers/instances preserve global limits, job ownership, cancellation, cleanup, and progress delivery before scale-out is enabled.

Acceptance targets should be set from a staging baseline. Recommended initial targets: bounded queue memory at all tested loads; no unbounded browser Blob retention; cancellation success above 99%; no orphan files after the cleanup SLA; progress events at or below 5/second/job; and stable P95 latency up to the declared capacity.

### 6) Optimized Code / Patch (when possible)

The following are implementation sketches only. Application code was intentionally not modified.

#### A. Native streaming job flow

```text
POST /jobs
  validate request
  reserve bounded capacity + disk budget
  return { job_id, progress_token }

Socket.IO / polling
  report queued / downloading / processing / ready

GET /jobs/{job_id}/file?token={one_time_token}
  verify owner, expiry, readiness, and one-time use
  stream with Content-Disposition
  clean file after stream close or expiry
```

Frontend handoff when ready:

```js
const a = document.createElement('a');
a.href = `${API}/jobs/${job.id}/file?token=${encodeURIComponent(job.fileToken)}`;
a.click(); // browser streams directly; no res.blob()
```

#### B. Progress coalescing

```python
last_progress = {"time": 0.0, "percent": None, "status": None}

def maybe_emit_progress(percent, status, payload):
    now = time.monotonic()
    changed = percent != last_progress["percent"] or status != last_progress["status"]
    if not changed or (status == "downloading" and now - last_progress["time"] < 0.2):
        return
    last_progress.update(time=now, percent=percent, status=status)
    safe_emit("progress", payload, room=sid)
```

#### C. Bounded admission outline

```python
if not queue_budget.acquire(blocking=False):
    return jsonify(error="Server queue is full"), 503, {"Retry-After": "10"}

deadline = time.monotonic() + MAX_END_TO_END_SECONDS
try:
    remaining = max(0, deadline - time.monotonic())
    if not execution_slot.acquire(timeout=min(MAX_QUEUE_WAIT_SECONDS, remaining)):
        return jsonify(error="Server is busy"), 503, {"Retry-After": "10"}
    # Run work with the remaining end-to-end budget.
finally:
    queue_budget.release()
```

For `/convert`, reserve its slot in a route-specific `before_request` hook before reading `request.files`, and release it in teardown/finally. Add reverse-proxy upload deadlines so a slow client cannot hold the slot indefinitely.

#### D. Safe temporary Blob fallback

```js
function releasePendingBlob() {
  if (pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl);
  pendingObjectUrl = null;
  pendingBlob = null;
  pendingFilename = null;
}

// Use only for deliberately small share/copy payloads.
pendingObjectUrl = URL.createObjectURL(pendingBlob);
try {
  // share/copy/download fallback
} finally {
  // For a download click, keep the URL alive long enough for the browser to
  // consume it. Await share/copy operations and release immediately afterward.
  setTimeout(releasePendingBlob, 60_000);
}
```

#### E. Cache and asset policy

```toml
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*.html"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"
```

Use content-hashed names such as `assets/app.<hash>.js`; do not combine `immutable` with stable, unhashed filenames like the current `version.js`.
