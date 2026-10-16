# Bali Petrol Map

[Open the map](https://arthur-freedom.github.io/bali-petrol-map/)

293 mapped fuel locations across Bali with automatic comparison of nearby road congestion. Live refresh is restricted to GitHub owner **Arthur-Freedom**, numeric ID **18115558**. Road traffic is a proxy: the app does not claim to measure petrol queues, waiting minutes, stock or actual opening.

## Use

Choose an area and refresh all due stations, the five oldest checks (unchecked first), or one selected station. Requests run immediately in batches of five. The 15-minute cooldown applies only to the same station. Counts distinguish the area from all 293 locations.

“All saved traffic” selects every station across Bali with a successful saved measurement, including outdated or retained readings after a failed check. The saved-only filter also works in preset areas and drawn rectangles. “Draw area” accepts dragging, two taps, or arrow keys + Enter; Escape cancels. Inclusive geographic bounds filter station locations, not individual road segments. Browsing only downloads existing saved readings and never requests paid traffic.

Ordinary scrolling zooms the map. A selected pin has a blue outline and name caption. On phones, the music player sits below the map in normal page flow. Selecting a list row scrolls to the map; details appear immediately below it. Google Maps links open the place without directions or the user's location. Listed opening hours remain unverified and never exclude a station from comparison.

“Near me” requests a fresh, high-accuracy location fix and focuses on a labelled blue position dot with the browser's accuracy circle. Estimates wider than 250 m are labelled “Approximate location”. The sidebar confirms accuracy and fix time; tap the button again to update. On phones it brings the map into view. The station list still covers 8 km, and “Fit this area” shows those stations plus the position. Location stays in page memory and is never added to the URL or traffic archive. Permission failures preserve an existing fix with an explicit warning.

## Background music

An optional compact music player offers the same four background tracks as Live
Lane, with an audio-reactive visualizer. Music tries to start automatically in a
shuffled rotation, subject to browser autoplay permission; if blocked, a normal
Play button and tap-to-play hint remain. Choose a song or adjust volume in
Settings → Relaxing music. Volume and an explicit Play/Pause choice are remembered
locally, so pausing prevents autoplay on the next visit. Pausing,
reduced-motion preferences and background tabs stop the visualizer's animation.
Music is served as static Pages assets without traffic API calls. Credits and
the separate soundtrack licences are in `dist/music/CREDITS.md`.

## Measurement

The Worker uses **TomTom Orbis v2 vector flow tiles**, decoded with pinned `@mapbox/vector-tile` and `pbf`. Google Routes returned all-NORMAL intervals despite visible congestion and is no longer called. No paid Google basemap is loaded.

Each allowlisted station uses at most four zoom-15 tiles covering a 250-metre radius. A batch shares duplicate requests in memory. Geometry is clipped first to tile bounds (removing margins), then to the station circle. Exact duplicate directed edges are removed; opposite directions count separately. Motorways, motorway ramps and tracks are excluded. Results require at least 150 metres of covered road directions and a covered road within 100 metres of the station; otherwise coverage is unavailable.

- Red: relative speed at or below 35% of free-flow speed.
- Orange: above 35% but below 70%.
- Green: 70–100%.
- Dark: reported **road** closure, also counted in congested metres.

The primary display and comparison use the **total slow and congested road-direction metres within 250 m**. This is road slowdown near a petrol station, not a measured petrol queue or motorcycle waiting time. Parked motorcycles and people waiting for a fuel tanker may be invisible to the moving-traffic feed. The list also shows sampled road length because traffic coverage differs between stations.

An optional detail section retains the **continuous slow stretch on each mapped incoming approach**, up to 200 m. The initial catalogue has 49 locations with candidate accesses (47 have a full 200 m on every approach), out of 293 locations. Approach data no longer controls the primary metric, marker colour or ordering.

`scripts/import-access.cjs` finds OSM fuel geometry or a nearby matching fuel point, follows incoming service roads to a public-road connection, respects mapped one-way directions, and traces up to 200 m upstream. It rejects ambiguous station matches, private/prohibited roads and ambiguous continuations. Each published path retains its fuel source, driveway way IDs, road way IDs and direction. The blue A marker and dashed guide expose the selected station's inferred access/path for inspection. Map-derived access is **not field verified**; the importer does not resolve every turn restriction, divider, temporary closure or unmapped entrance.

`traffic-service/approach.mjs` samples that fixed path every 5 m. A sample requires a TomTom edge within 12 m pointing in the same direction (cosine at least 0.82). Service-road flow is excluded from matching the public-road approach. Feature endpoints allow 1 m quantisation tolerance. Conflicting near-equal matches stay unknown. These are engineering matching tolerances, not calibrated confidence scores; map misalignment and parallel roads can still cause errors. The same 250 m tile footprint and four-tile ceiling apply.

Starting at the access, consecutive samples below 70% of free-flow speed are counted until faster traffic or an unknown sample. Missing coverage is never bridged. **200+ m** is a lower bound when congestion reaches the observation limit; an interrupted stretch says **At least ... m**. Upstream slow pockets separated from the access are reported separately. If several incoming paths exist, the main value is the longest observed connected slowdown, with every direction available in details.

Recent, successful nearby readings with at least 150 m of sampled roads qualify for road-traffic comparison. Fewer slow/congested metres rank first, then fewer congested metres, rounded to 10 m; reported nearby road closures rank last. This orders observed road slowdown rather than predicted petrol waits. Missing or stale measurements never become zero. An unmapped or partial entrance does not invalidate a valid nearby-road measurement, but remains explicitly incomplete in approach details.

Map lines use the original nearby segments from the **same response** as the headline total. Slow/congested roads are emphasised; the synthetic resampled approach is not drawn over them. After 15 minutes readings leave current recommendations but remain visible with original dates and dashed lines. Limits and connection failures do not clear saved readings. “No slow roads reported” only describes the provider data and does not imply an empty petrol queue.

The server compares consecutive fully covered readings only when the method, set of approaches and selected direction match, both requests succeeded, and queries are 14–45 minutes apart. Changes under 20 m are labelled similar. Two capped observations cannot establish growth. The comparison survives reloads and device changes; seeing traffic in both checks does not establish continuous congestion between checks. No motorcycle/car-specific wait, pump throughput, petrol availability or forecourt-queue estimate is produced.

A live workerd probe on 15 October 2026 returned 195/200 m matched coverage at Bypass 54.803.27 with a coverage gap interrupting a congested stretch. It correctly produced a partial lower-bound result rather than a ranked zero. This verifies real provider decoding and matching behaviour, **not independently measured queue accuracy**.

## Access and spending protection

The Worker verifies the opaque device session through the existing Bali Cinema auth service before each session/refresh response, enforcing the GitHub numeric identity server-side. CORS and hidden buttons are additional controls, not authentication. The TomTom key stays in a Worker secret and never reaches browsers, logs, the repository or a URL.

A globally named SQLite-backed Durable Object serializes **1,000 station checks per Bali day, 20,000 per month and a 15-minute per-station cooldown** across devices. Existing Google-era charges remain counted. Admission is persisted before provider calls; failed attempts count. Overlapping/reordered requests cannot bypass cooldowns. Corrupt counters and unavailable budget storage fail closed.

At most four tiles per station means **at most 4,000 provider calls/day and 80,000/month through this app**, usually fewer through batch sharing. Provider concurrency is capped at four; the batch has a 20-second timeout, bounded bytes/geometry and no retries. Provider 429 responses stop queued calls and subsequent client batches. These limits do not cover calls made with the key outside the app.

Requests accept one to five unique catalogue IDs and at most 2,048 body bytes, never arbitrary coordinates, URLs or tiles. An empty object still selects the original five. Responses are `no-store`. Page views, signing in and map movement make **no TomTom or Google Maps API calls**.

TomTom publishes 200,000 free monthly traffic vector tiles; actual account/evaluation eligibility and expiry depend on the user's plan. No paid plan, card, top-up or automatic upgrade is configured by this app. Set `PAID_FEATURES_ENABLED = "false"` and redeploy to stop traffic; missing configuration also fails closed.

Previous Google project protections remain separate: Routes 50/day and 50/min; 2D map loads 100/day and 10/min; matrix, 3D and grounding-widget daily quotas zero. `python scripts/protect-google-budget.py` inspects them; `--apply` restores ceilings without raising stricter limits. The current app no longer consumes these APIs. Other account/project charges are outside these counters.

## Authentication and recovery

`owner-session.js` runs before external assets, immediately removes the OAuth fragment and retains only an opaque session handle. Cinema and petrol maps share the Pages origin; signing out revokes this device session for both. GitHub credentials remain encrypted in the cinema service.

Browser requests time out after 35 seconds. Missing, duplicate, unrequested, malformed, remote or implausibly dated readings cannot become successful results. A failed refresh retains old timestamps and leaves current recommendations. Incomplete responses and provider limits stop remaining batches and repeats. Sign-out cancels requests; old-session responses cannot restore data or revoke a newer session.

Optional repeats run every 15 minutes while visible and pause after scope changes or errors. Reloading does not request traffic. The public map loads the latest GitHub-backed measurements without authentication or provider requests. The signed-in owner also loads the more recent durable server results, including snapshots not yet backed up to GitHub.

## Privacy and history

The owner confirmed on 15 October 2026 that their agreement permits archiving these measurements. Every admitted station check receives a unique ID and UTC/Bali request timestamps, atomically with budget admission. Its completed result is saved before the response returns. Successes retain the measured road geometry, coverage, approach signal and original checked-at time. Failures retain a dated outcome/error code and never overwrite the previous successful reading. Requests interrupted before saving become explicit interrupted events after five minutes, with no fabricated traffic values.

The existing SQLite Durable Object stores the latest successful measurement and latest attempt per station, plus pending backup records. Owner-only `GET /api/saved` loads these in bounded pages; it works at zero budget and while new traffic is paused. Reading saved results never calls the provider, reserves budget or changes checked-at timestamps. Old readings remain visible as outdated and cannot enter current recommendations.

A GitHub Actions job (`archive-traffic.yml`) is scheduled every 15 minutes and can also be run manually by the owner. GitHub may delay schedules. It copies immutable per-check JSON to **[the traffic-history branch](https://github.com/Arthur-Freedom/bali-petrol-map/tree/traffic-history)** under `history/YYYY-MM-DD/`, generates a daily `readings.csv`, and maintains `latest/<station-id>.json` plus an index. The date folders use Bali time. CSVs preserve missing values rather than converting failed checks to zero; raw JSON retains all mapped approach directions and decoded geometry. The main application branch and Pages deployment are not rewritten by data backups.

The job uses its short-lived, repository-scoped GitHub token. The Worker receives no GitHub write credential. `ARCHIVE_EXPORT_KEY`, stored only in Worker and repository secrets, permits export and acknowledgement, never provider refreshes. Pending records are removed only after a confirmed remote commit and matching SHA-256 acknowledgement. Failed jobs leave records queued; a retry is idempotent. The queue is capped at 2,000 checks and 256 MiB of reserved/result data, with each record capped at 900 KB. A full or unavailable archive blocks new provider requests before spending. Latest readings remain available after acknowledged events leave the queue. No background traffic sampling is added.

The signed-out map reads public GitHub archive files with four downloads at a time. Signing out clears this tab's owner readings and returns to the public backup; durable records remain. The public archive contains fixed petrol station locations and traffic measurements, never API keys, sessions, private home details or the rider’s live location. Raw TomTom tiles are not retained. Checks discarded before this release cannot be recovered from the old budget counters.

Your location is requested only by “Show stations near me” and stays in the browser; TomTom receives fixed station-area tile coordinates.

Traffic attribution: © TomTom. Basemap: OpenFreeMap/OpenStreetMap. Expanded stations and candidate access paths: © OpenStreetMap contributors, ODbL. Original five listing observations came from Google Maps and keep their original timestamps.

## Development and deployment

The default map view shows traffic from all stations in the current scope, including when one station is selected. The Show traffic control can isolate the selected station's snapshot. All-station readings can have different query times; outdated data stays dashed. The list and detail headline show nearby slow/congested road directions within 250 m. The narrower approach check is collapsed into details. The archived Jimbaran 54.803.02 check at 14:27 WITA on 16 October 2026 provides a regression case: 319 m of northbound slowdown must remain visible and affect ranking even though the sampled southbound approach reports zero continuous slow metres.

If GitHub verification is temporarily unavailable, the owner can retry or use “Reconnect with GitHub” directly without signing out first. Transient failures retain the session and displayed measurements. The shared sign-in service renews expiring tokens in its native Worker runtime; invalid refresh credentials ask for sign-in and never unlock traffic without verification.

Static source is `dist/`; no build is required. Install dependencies with `npm ci --prefix traffic-service --ignore-scripts`. Run `node --test tests/*.test.cjs traffic-service/*.test.mjs` and `python -m unittest discover -s scripts -p 'test_archive_traffic.py'`. Public preview: `python -m http.server 8794 --directory dist`. Auth and CORS intentionally accept only the production origin.

Tests cover auth, concurrent budgets, rollovers, preserved charges, cooldowns, geographic clipping, tile seams, direction counting, MVT decoding, missing coverage, provider failures, call bounds, single/area/oldest refresh, expiry and session races. Test fixtures are synthetic, not retained provider data.

The complete refresh handler also runs under Cloudflare's workerd runtime in CI. This catches runtime differences that Node-only tests miss: workerd rejects `redirect: 'error'`, so provider requests use `manual` and reject non-success statuses without following redirects or forwarding the secret. Systemic provider failures stop further area batches and are distinguished from genuine missing coverage.

The first TomTom deployment on 15 October 2026 failed before any provider request because of that redirect option. A one-time budget migration credits only recorded admissions during that broken deployment and clears their cooldowns. That migration preserves earlier spending and successful later checks. A subsequent limit increase to 1,000/day and 20,000/month retains all counters; it does not reset usage.

Pushes to `main` test and publish Pages. From `traffic-service/`, deploy using `npx wrangler@4 deploy`. Supply `TOMTOM_API_KEY` and `ARCHIVE_EXPORT_KEY` through secure stdin/API calls, never command arguments or plaintext files. Set the same export key as a repository Actions secret. Initialize `traffic-history` with an empty index before enabling the backup workflow. Archive reads remain available when `PAID_FEATURES_ENABLED` is false. Keep the `OWNER_AUTH` binding, budget object and migration IDs unchanged. Deploy client and Worker together for schema changes; legacy clients fail closed because no Google display key is returned.

## Catalogue

`dist/stations.json` contains public locations and overlapping area presets; `traffic-service/stations.mjs` is the matching server allowlist. Legacy approach-start coordinates are unused; `access` contains the new traceable OSM-derived approach definitions. Entries include smaller retailers; hours, stock and full SPBU service are not implied.

OSM `amenity=fuel` nodes/ways/relations are filtered to Bali province boundary 1615621, excluding disused, abandoned and private entries. Nearby duplicates within 65 m are consolidated. Every entry retains a source. To regenerate, obtain Overpass fuel data and Nominatim Bali **state** GeoJSON into ignored `.local/osm-fuel.json` and `.local/bali-boundary.json`, then run `node scripts/import-stations.cjs`. Deploy both Worker and Pages after catalogue changes. Then import access geometry with `node scripts/import-access.cjs .local/osm-access.json`. The access input is an Overpass JSON extract containing fuel nodes/ways plus road ways with node IDs, tags and `geometry` (`out geom`). A typical small-area query is `[out:json][timeout:60];(way[highway](south,west,north,east);nwr[amenity=fuel](south,west,north,east););out geom;`. Keep downloaded raw extracts in ignored `.local/`; commit the reproducible derived catalogue and server allowlist. The first import is geographically incomplete because several larger public queries timed out; absence of an imported access does not establish absence of an entrance in OSM or on the ground. See [DATA-LICENSE.md](DATA-LICENSE.md).

## References

[Orbis flow tiles](https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/traffic-flow/vector-flow-tiles), [TomTom pricing](https://docs.tomtom.com/pricing), [key guidance](https://docs.tomtom.com/platform/documentation/api-best-practices/api-key-management-best-practices), [terms](https://docs.tomtom.com/legal/terms-and-conditions).
