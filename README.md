# Bali Petrol Map

[Open the map](https://arthur-freedom.github.io/bali-petrol-map/)

Maps 293 fuel locations across Bali with an area selector for Kuta, Legian, Seminyak, Canggu, Pererenan, Denpasar, Ubud, Gianyar and 19 other areas. Locations include full petrol stations and smaller fuel retailers; mapping is not exhaustive or a guarantee of operation. The public site remains on GitHub Pages. Live traffic refreshes are available only to GitHub owner **Arthur-Freedom**, numeric ID **18115558**.

## Use

Choose an area; the count explicitly shows the current area versus all 293 Bali locations. Sign in with GitHub, then press **Refresh area** to check every due station in that area automatically. Requests run back-to-back in batches of up to five; no group arrows or waiting between different stations. Choose **5 oldest checks** for unchecked stations first, followed by the oldest successful readings. A station's popup offers **Refresh this station** and **Open in Google Maps**. The latter opens its known place ID, or its coordinate pin when no Google place ID is available, without requesting directions or sending the user's location.

Ordinary scrolling zooms the map without Ctrl; Ctrl-wheel over the map is prevented from zooming the page. Selecting a row gives the map pin a strong blue outline, foreground stacking and a station-name caption. Optional repeat checks run every 15 minutes while the tab is visible and pause when the area, search or refresh mode changes. Changing area during a refresh stops subsequent batches after the current request finishes. Page loads do not automatically request paid Routes data.

Road congestion is a rough busyness indicator. The wait calculator, manual check forms, manual observation workflow and saved-observation controls have been removed. Missing traffic remains unknown. Google-listed opening hours appear as secondary **Listed closed/open · unverified** notes and never override ranking. Only an explicitly sourced, recent firsthand closure could block a station; there is currently no report-entry UI. Traffic updates never renew opening timestamps. The original five listing observations retain their actual times; imported locations have no assumed opening status.

## Owner protection and spending limits

The Cloudflare Worker validates the opaque device session through the cinema app's existing owner-auth service. That service checks the GitHub numeric identity, including on every refresh. This is enforced before any Google call; hiding a button or checking CORS is not the authorization mechanism. Any other GitHub user is rejected.

The Routes API key is restricted to Routes and held in a Worker secret. It is never sent to browsers, committed, or logged. A separate Maps JavaScript display key is returned after owner authentication and is restricted to Maps JavaScript and `https://arthur-freedom.github.io/*` referrers. Display keys are necessarily visible to the owner's browser; they cannot invoke Routes.

A globally shared SQLite-backed Durable Object enforces a 15-minute cooldown **per station**, **50 station checks per Bali day**, and **900 checks per Bali calendar month**, including concurrent devices. A single-station request uses one check; 15 stations use 15 checks. Daily resets do not reset the monthly balance. Failed Google requests consume both budgets; admission is persisted before calling Google and failures are not automatically retried. Migration preserves the first usage day's existing charges and cooldowns, including when the owner reconnects the next day. Ambiguous older legacy records exhaust the monthly balance until reviewed.

Different stations can be checked immediately. Overlapping or reordered requests cannot bypass a station's cooldown. Each server request accepts at most five allowlisted station IDs and reads at most 2,048 body bytes, including chunked requests. The client fetches current limits before starting a refresh and limits the selection to the remaining daily and monthly budgets, shown beside the button. Invalid, duplicate, unknown or more than five IDs are rejected before Google calls. After Google's free allowance, five Compute Routes Enterprise requests currently cost US$0.075. Google map displays have a separate allowance and price. The 900-check application limit leaves headroom below the published 1,000 monthly free Enterprise requests, but other projects share the billing account's free allowances and diagnostic calls are outside the application's counter.

### Google-side limits

On 15 October 2026, project `chessinbali` was changed from effectively unlimited daily quotas to the following provider-enforced limits. These apply to both services across this project, including requests that bypass the application:

| Feature | Daily limit | Per-minute limit |
| --- | ---: | ---: |
| Compute Routes | 50 | 50 |
| 2D map loads | 100 | 10 |
| Compute Route Matrix elements | 0 | — |
| 3D map loads | 0 | — |
| Maps Grounding Widget | 0 | — |

Inspect the effective values with `python scripts/protect-google-budget.py`; use `--apply` to restore these ceilings. The script uses an authenticated gcloud account, never reads API keys, and refuses to increase an existing stricter quota. Provider quotas can reset at a different time from the application's Bali-day counters, so Google can reject a request even when the app shows a remaining balance. These are request limits, not a promise about unrelated Google services or the whole billing account.

Set `PAID_FEATURES_ENABLED = "false"` in the Worker configuration and redeploy to stop issuing Google display keys and making traffic calls. Missing configuration also fails closed. For an already disclosed display key or urgent complete provider shutdown, reduce the relevant Google quotas to zero or revoke the dedicated key; the application switch cannot revoke a key already in a browser. A spending-guard failure blocks both Routes calls and display-key release. Anonymous visits use the public OpenStreetMap map and make no paid Google requests.

The service uses the existing **Workers Free** account, with no paid plan, observability or upgrades. Budget storage contains only counts, timestamps and catalogue station IDs for cooldown enforcement (plus legacy group IDs for open older clients). Google traffic content is held only in browser memory and is not persisted to GitHub, browser storage, or server storage. All API responses are `no-store`. Google-derived traffic is displayed only on a Google map. The public station catalogue uses an OpenFreeMap / OpenStreetMap basemap.

## Authentication

`dist/owner-session.js` executes before external assets, removes the OAuth fragment immediately, and stores only an opaque session handle. The cinema and petrol apps share the existing remembered owner session on their common Pages origin. Sign-out revokes that device session for both apps. The auth service permits exact return paths for these two apps only; no extra repository permissions are requested.

GitHub credentials remain encrypted in the cinema service's private session object. Google calls accept no user-provided URLs, stations or coordinates. Refresh requests accept only a `stationIds` array of one to five unique allowlisted IDs, a valid session and the expected origin. The old empty-body request remains compatible with the original five stations. Unauthorized failures are sanitized and do not call Google.

## Measurement

`traffic-service/worker.mjs` calls Compute Routes with `TRAFFIC_AWARE_OPTIMAL` and `TRAFFIC_ON_POLYLINE`. It decodes the route geometry, validates interval coverage and the endpoint, and sums geodesic metres within the final kilometre (or the available approach when shorter). It counts interval edges rather than points and clips the boundary segment. The list ranks the proportion of the sample reported SLOW or TRAFFIC_JAM, then the TRAFFIC_JAM proportion. The chosen approach does not cover every entrance/direction or queues inside the forecourt. It reflects car traffic, not a specific motorcycle queue.

Zero reported slowdown is neutral **No slowdown returned**, not evidence of a clear road or short queue. Orange-only readings are **Slow traffic reported**; any reported jam is **Congestion reported**. Equal returned readings show a tie, never a spurious best station. Google traffic readings expire for current ranking after one hour. The queried-at timestamp does not claim that every source signal was observed at that exact instant.

The owner map displays the native Google Maps `TrafficLayer` with `autoRefresh:true`. It has its own coverage/update timing and may disagree with the Routes API. Sampled routes no longer paint solid green over the map: only the selected station's sample appears, as a thin blue dotted line. Road colours are the native layer; station pins summarize the separately queried route. Native layer refreshes do not call the application's paid Routes endpoint.

### Historical data

The standard Google Routes policies restrict caching traffic results; the permitted coordinate/place-ID exceptions do not provide permission for a permanent congestion archive. No traffic archive or GitHub data commits are enabled. A future time-of-day history should use a source licensed for historical storage or independently collected observations, stored in a private database with timestamps, coverage and provenance. GitHub remains appropriate for application source and the public station catalogue. Road congestion metres must not be relabelled as verified fuel-queue metres or converted into uncalibrated waiting minutes.

## Development and deployment

Static source is `dist/`; no build is required. Run `python -m http.server 8794 --directory dist` for public UI checks. Owner login, Google display restrictions and CORS intentionally work only at the production Pages origin. Pushes to `main` test and publish Pages through `.github/workflows/pages.yml`. The owner can also dispatch that workflow to republish the app; it no longer accepts manual observations.

Run `node --test tests/*.test.cjs traffic-service/worker.test.mjs`. Tests cover 15-station refreshes without delays, single-station requests, oldest-first selection, budget migration, concurrent and overlapping cooldowns, exact daily limits, stopping on area changes, place links, identity rejection, Bali-day rollover, data minimization, interval lengths and incomplete coverage, unverified opening reports, catalogue coverage, source alignment and fragment removal.

Worker deployment: from `traffic-service/`, `npx wrangler@4 deploy`. Secrets `GOOGLE_ROUTES_KEY` and `GOOGLE_MAPS_BROWSER_KEY` must be passed through stdin to Wrangler, never placed in files or command arguments. Google project is `chessinbali`; keys are dedicated to this app. The auth service binding is `bali-cinema-owner-refresh`.

## Sources and terms

[Google traffic on polylines](https://developers.google.com/maps/documentation/routes/traffic_on_polylines), [Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [Routes policies](https://developers.google.com/maps/documentation/routes/policies).

Google Maps use is subject to [Google Maps terms](https://www.google.com/help/terms_maps/) and [Google privacy policy](https://policies.google.com/privacy). This independent tool provides indicative traffic comparisons without guaranteeing fuel, opening hours or waiting times.

## Expanded station catalogue

`dist/stations.json` contains the public catalogue and radius-based area presets. Area counts overlap neighbouring districts. `traffic-service/stations.mjs` is the generated server allowlist with the same IDs and coordinates. The original five stations retain their previous approach origins. New entries use a reproducible candidate origin approximately 1.3 km north; Google snaps it to its navigable road network. This is a single approach proxy, not every entrance or a verified driveway. Missing traffic, routes shorter than 500 m, or endpoints more than 150 m from the station fail as unavailable.

Expanded locations come from OpenStreetMap `amenity=fuel` nodes/ways/relations, filtered to Bali province's administrative boundary (relation 1615621), excluding explicitly disused, abandoned and private entries. Nearby mapped duplicates within 65 m are consolidated. The catalogue preserves a source link per location. It includes unnamed fuel retailers; opening, current stock and full SPBU service are not implied. Coordinates and area names should be checked when adding or correcting a location.

To regenerate, fetch the public Overpass fuel data and Nominatim Bali **state** GeoJSON into ignored `.local/osm-fuel.json` and `.local/bali-boundary.json`, then run `node scripts/import-stations.cjs`. Seed metadata is in `scripts/seed-stations.json`; this contains no traffic observations. After a catalogue update, deploy the Worker and publish Pages together. OpenStreetMap-derived catalogue data is available under ODbL; see [DATA-LICENSE.md](DATA-LICENSE.md).
