# ZenithW Optimization Audit

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

* **Implementation progress:** Completed the high-return delivery split. The landing app remains in the content-hashed `app.8333ca441639.js`; the changelog now loads only the latest release plus renderer from `updates-core.63274ffa232d.js` and fetches `updates-archive.479fcc570552.js` only when an older release is requested. Updates CSS, information/status CSS, and comparison-page CSS are route-specific content-hashed assets. About/DMCA/terms/thanks/privacy share one content-hashed language/bootstrap helper, eliminating the repeated legal-page bootstrap while keeping each page's copy in its HTML. `_headers` gives content-addressed assets a one-year immutable lifetime while HTML and `version.js` revalidate. The old changelog payload was 39,750 bytes gzip; the initial changelog core is 4,032 bytes gzip, about 90% smaller before an archive is requested. The three comparison pages now avoid loading the 104 KB general stylesheet and use a dedicated comparison stylesheet instead. Feature-level splitting of the already-small landing JS was intentionally not forced without a browser trace showing a net win.

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

* **Implementation progress:** Twelve offline characterization tests now protect mute format planning, audio behavior, playlist/duration/protocol rejection, request normalization, the single `extract_info(download=True)` invariant, native-token handoff, cancellation cleanup, and token-scoped artifact deletion. Request parsing/validation moved to `parse_download_request()`, cancel-event removal is idempotent, and timeout/cancellation/error paths share a bounded artifact-cleanup helper.

  Attempt execution, media post-processing, and the job finalizer are now extracted into three standalone functions, closing out this finding:
  * `run_download_attempts(url, opts_list, ...)` — the yt-dlp `extract_info(download=True)` retry ladder over `opts_list`, returning a `DownloadAttemptResult` (`success`, `full_path`, `video_title`, `timed_out`, `last_err`, `primary_err`) instead of mutating route-local variables. Cancellation and process-fatal exceptions (`DownloadCancelled`, `MemoryError`, `SystemError`, `KeyboardInterrupt`, `SystemExit`) are still re-raised so the route's existing `except` blocks handle them unchanged.
  * `apply_mute_postprocessing(full_path)` — the fallback `-c copy -an` FFmpeg pass for non-YouTube muxed-only sources (YouTube itself now avoids this entirely via Finding 2's video-only format selection). Mutates the file in place and raises on FFmpeg failure exactly as before.
  * `finalize_prepared_download(full_path, ..., release_slot)` — the size check, `done` progress emit, processing-slot release, and native-transfer token handoff, returning `(response_tuple, reservation_consumed)` so the route knows whether to null out its own spool-reservation bookkeeping. `release_slot` is a callback the route supplies (a closure with `nonlocal slot_acquired`) so the idempotent single-release guarantee stays owned by the route, not duplicated inside the finalizer.

  The route (`download()`) dropped from ~470 lines to ~335 lines and now reads as orchestration: parse request → reserve slot/spool → build format options → `run_download_attempts()` → `apply_mute_postprocessing()` if needed → `finalize_prepared_download()`. Format/postprocessor option construction stayed inline in the route (not called out by this finding, and it was already a fairly linear, low-branching block). Nine new characterization tests (`AttemptExecutionTests`, `MutePostprocessingTests`, `JobFinalizerTests`) exercise the extracted units directly — cookie-retry fallthrough, immediate-stop-on-429, expired-deadline-as-timeout, successful/failed mute strips, and oversized-vs-successful finalization — plus a regression guard asserting the route stays under 350 lines. All are static/offline like the existing suite; **no real yt-dlp/FFmpeg run or staged real-media test was performed in this environment** (no network egress to media providers is available here), so the "Remaining execution plan" real-media validation this finding originally deferred to is still owed before deployment.

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