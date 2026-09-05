# Genshin Advisor

`/genshin` is a static ZenithW product surface for Genshin Impact build and account guidance. It intentionally does not share the downloader's Flask/Gunicorn worker or its process-local job state.

## Data boundary

The page loads two checked-in JSON files:

- `frontend/data/genshin-catalog.json` — an automatically generated game-data snapshot: characters, talents, constellations, weapons, and artifact sets.
- `frontend/data/genshin-meta.json` — ZenithW's patch-stamped editorial layer: teams, artifact targets, DPS assumptions, and C1-versus-R1 decisions.
- `frontend/data/genshin-research.json` — an automatically generated community build snapshot with four F2P/accessible and four premium weapon rows, artifact set, stat targets, talent order, and best-team reference for the full roster. Each lane is ordered from the strongest fit to the closest alternative; source-ranked entries take priority, while guide gaps are explicitly marked as compatible alternatives.

The browser does not call a third-party game-data API at runtime. `scripts/sync-genshin-catalog.mjs` downloads a fresh snapshot from the `genshin-db` v5 API, while `scripts/sync-genshin-advisor.mjs` captures the current community reference pages. Both scripts validate their source response and write reviewable static files. The scheduled GitHub workflow runs every Monday and commits only changed snapshots.

## Recommendation policy

Raw game data can tell us what a constellation or weapon does. It cannot safely decide where a player should spend Primogems. Investment verdicts must therefore be patch-specific editorial data and must include:

- the comparison target (`C1`, `R1`, or saving for a later breakpoint);
- the reason and trade-off, not just a score;
- the team, rotation, weapon, artifact, talent, level, and target assumptions behind each DPS range;
- an explicit review date and patch baseline.

If a character lacks a reviewed entry in `genshin-meta.json`, the UI shows its community build snapshot, six ranked weapon images, best-team reference, verified kit and C1 text but withholds a C1/R1 pull recommendation. Do not replace that state with a generic tier-list guess.

Traveler is a special case: its forms and constellations are progression rewards from quests, Statues of The Seven, and related account progression. The UI therefore omits the C1-versus-R1 pull card for Traveler instead of presenting a Primogem decision that does not apply.

## Language policy

The interface and ZenithW-authored explanations are available in English and Turkish. Character names, artifact names, weapon names, and raw game text remain in the verified English source because Genshin Impact has no official Turkish localization we can cite. Do not use automated translations for ability text when it changes a mechanical condition, cooldown, multiplier, or constellation effect.

## Future service boundary

The static version needs no new backend. Keep it static until an opt-in account import or a per-account optimizer is added. At that point, deploy it as a separate `genshin-api` service with its own rate limits, privacy notice, and storage policy; never add it to the downloader's single process-local worker.

## Attribution

Game facts are generated from [genshin-db](https://github.com/theBowja/genshin-db), which packages data sourced from GenshinData. The visual and textual game materials remain the property of HoYoverse and their respective owners. The Advisor links to community research but does not copy external guide prose into its catalog.
