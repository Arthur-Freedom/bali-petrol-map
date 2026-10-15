# Bali Petrol Map

[Open the map](https://arthur-freedom.github.io/bali-petrol-map/)

293 mapped fuel locations across Bali with automatic comparison of nearby road congestion. Live refresh is restricted to GitHub owner **Arthur-Freedom**, numeric ID **18115558**. Road traffic is a proxy: the app does not claim to measure petrol queues, waiting minutes, stock or actual opening.

## Use

Choose an area and refresh all due stations, the five oldest checks (unchecked first), or one selected station. Requests run immediately in batches of five. The 15-minute cooldown applies only to the same station. Counts distinguish the area from all 293 locations.

Ordinary scrolling zooms the map. A selected pin has a blue outline and name caption. On phones, selecting a list row scrolls to the map; details appear immediately below it. Google Maps links open the place without directions or the user's location. Listed opening hours remain unverified and never exclude a station from comparison.

## Measurement

The Worker uses **TomTom Orbis v2 vector flow tiles**, decoded with pinned `@mapbox/vector-tile` and `pbf`. Google Routes returned all-NORMAL intervals despite visible congestion and is no longer called. No paid Google basemap is loaded.

Each allowlisted station uses at most four zoom-15 tiles covering a 250-metre radius. A batch shares duplicate requests in memory. Geometry is clipped first to tile bounds (removing margins), then to the station circle. Exact duplicate directed edges are removed; opposite directions count separately. Motorways, motorway ramps and tracks are excluded. Results require at least 150 metres of covered road directions and a covered road within 100 metres of the station; otherwise coverage is unavailable.

- Red: relative speed at or below 35% of free-flow speed.
- Orange: above 35% but below 70%.
- Green: 70–100%.
- Dark: reported **road** closure, also counted in congested metres.

Rankings compare the percentage of covered road-direction metres that are slow or congested, rounded to whole percentages, then the congested percentage. Equal scores show ties. Coverage varies; nearby through traffic and junctions affect the score. This does not identify forecourt entrances or distinguish motorcycles from cars.

Colours and rankings use the **same response**, updated together on refresh. After 15 minutes, readings leave current recommendations and the coloured overlay; details retain their original timestamp. Zero says “No slowdown detected”, not that a petrol queue is absent. Checked-at is query time, not a guaranteed observation time for every road signal.

Live tests on 15 October 2026 returned different congestion levels at the original five stations, including congested sections near Bypass 54.803.27. This establishes functioning local coverage, not independently measured queue accuracy.

## Access and spending protection

The Worker verifies the opaque device session through the existing Bali Cinema auth service before each session/refresh response, enforcing the GitHub numeric identity server-side. CORS and hidden buttons are additional controls, not authentication. The TomTom key stays in a Worker secret and never reaches browsers, logs, the repository or a URL.

A globally named SQLite-backed Durable Object serializes **50 station checks per Bali day, 900 per month and a 15-minute per-station cooldown** across devices. Existing Google-era charges remain counted. Admission is persisted before provider calls; failed attempts count. Overlapping/reordered requests cannot bypass cooldowns. Corrupt counters and unavailable budget storage fail closed.

At most four tiles per station means **at most 200 provider calls/day and 3,600/month through this app**, usually fewer through batch sharing. Provider concurrency is capped at four; the batch has a 20-second timeout, bounded bytes/geometry and no retries. Provider 429 responses stop queued calls and subsequent client batches. These limits do not cover calls made with the key outside the app.

Requests accept one to five unique catalogue IDs and at most 2,048 body bytes, never arbitrary coordinates, URLs or tiles. An empty object still selects the original five. Responses are `no-store`. Page views, signing in and map movement make **no TomTom or Google Maps API calls**.

TomTom publishes 200,000 free monthly traffic vector tiles; actual account/evaluation eligibility and expiry depend on the user's plan. No paid plan, card, top-up or automatic upgrade is configured by this app. Set `PAID_FEATURES_ENABLED = "false"` and redeploy to stop traffic; missing configuration also fails closed.

Previous Google project protections remain separate: Routes 50/day and 50/min; 2D map loads 100/day and 10/min; matrix, 3D and grounding-widget daily quotas zero. `python scripts/protect-google-budget.py` inspects them; `--apply` restores ceilings without raising stricter limits. The current app no longer consumes these APIs. Other account/project charges are outside these counters.

## Authentication and recovery

`owner-session.js` runs before external assets, immediately removes the OAuth fragment and retains only an opaque session handle. Cinema and petrol maps share the Pages origin; signing out revokes this device session for both. GitHub credentials remain encrypted in the cinema service.

Browser requests time out after 35 seconds. Missing, duplicate, unrequested, malformed, remote or implausibly dated readings cannot become successful results. A failed refresh retains old timestamps and leaves current recommendations. Incomplete responses and provider limits stop remaining batches and repeats. Sign-out cancels requests; old-session responses cannot restore data or revoke a newer session.

Optional repeats run every 15 minutes while visible and pause after scope changes or errors. Reloading does not request traffic. The public station finder works without authentication or traffic coverage.

## Privacy and history

Traffic stays in request/browser memory. No raw tiles, traffic observations or derived history are archived to GitHub, browser storage or a database. The server stores only refresh counts/times. Long-term history needs storage rights confirmed for the selected TomTom plan. Your location is requested only by “Show stations near me” and stays in the browser; TomTom receives fixed station-area tile coordinates.

Traffic attribution: © TomTom. Basemap: OpenFreeMap/OpenStreetMap. Expanded stations: © OpenStreetMap contributors, ODbL. Original five listing observations came from Google Maps and keep their original timestamps.

## Development and deployment

Static source is `dist/`; no build is required. Install dependencies with `npm ci --prefix traffic-service --ignore-scripts`. Run `node --test tests/*.test.cjs traffic-service/*.test.mjs`. Public preview: `python -m http.server 8794 --directory dist`. Auth and CORS intentionally accept only the production origin.

Tests cover auth, concurrent budgets, rollovers, preserved charges, cooldowns, geographic clipping, tile seams, direction counting, MVT decoding, missing coverage, provider failures, call bounds, single/area/oldest refresh, expiry and session races. Test fixtures are synthetic, not retained provider data.

The complete refresh handler also runs under Cloudflare's workerd runtime in CI. This catches runtime differences that Node-only tests miss: workerd rejects `redirect: 'error'`, so provider requests use `manual` and reject non-success statuses without following redirects or forwarding the secret. Systemic provider failures stop further area batches and are distinguished from genuine missing coverage.

The first TomTom deployment on 15 October 2026 failed before any provider request because of that redirect option. A one-time budget migration credits only recorded admissions during that broken deployment and clears their cooldowns. Earlier spending, successful later checks and the 50/day, 900/month limits remain unchanged.

Pushes to `main` test and publish Pages. From `traffic-service/`, deploy using `npx wrangler@4 deploy`. Supply `TOMTOM_API_KEY` through Wrangler secret stdin, never command arguments or plaintext files. Keep the `OWNER_AUTH` binding, budget object and migration IDs unchanged. Deploy client and Worker together for schema changes; legacy clients fail closed because no Google display key is returned.

## Catalogue

`dist/stations.json` contains public locations and overlapping area presets; `traffic-service/stations.mjs` is the matching server allowlist. Legacy approach-start coordinates are unused. Entries include smaller retailers; hours, stock and full SPBU service are not implied.

OSM `amenity=fuel` nodes/ways/relations are filtered to Bali province boundary 1615621, excluding disused, abandoned and private entries. Nearby duplicates within 65 m are consolidated. Every entry retains a source. To regenerate, obtain Overpass fuel data and Nominatim Bali **state** GeoJSON into ignored `.local/osm-fuel.json` and `.local/bali-boundary.json`, then run `node scripts/import-stations.cjs`. Deploy both Worker and Pages after catalogue changes. See [DATA-LICENSE.md](DATA-LICENSE.md).

## References

[Orbis flow tiles](https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/traffic-flow/vector-flow-tiles), [TomTom pricing](https://docs.tomtom.com/pricing), [key guidance](https://docs.tomtom.com/platform/documentation/api-best-practices/api-key-management-best-practices), [terms](https://docs.tomtom.com/legal/terms-and-conditions).
