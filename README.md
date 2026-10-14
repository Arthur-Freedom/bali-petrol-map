# Bali Petrol Map

[Open the map](https://arthur-freedom.github.io/bali-petrol-map/)

Maps 293 fuel locations across Bali with an area selector for Kuta, Legian, Seminyak, Canggu, Pererenan, Denpasar, Ubud, Gianyar and 19 other areas. Locations include full petrol stations and smaller fuel retailers; mapping is not exhaustive or a guarantee of operation. The public site remains on GitHub Pages. Live traffic refreshes are available only to GitHub owner **Arthur-Freedom**, numeric ID **18115558**.

## Use

Choose an area, sign in with GitHub, then press **Refresh traffic**. Each request checks the highlighted group of up to five stations and draws the measured approach traffic on a Google map. Use the group arrows for additional stations. Ordinary scrolling zooms the map without Ctrl; Ctrl-wheel over the map is prevented from zooming the page. The list ranks shorter congested road lengths first. Optional auto-refresh repeats the current group every 15 minutes while the tab is visible and pauses when the area, search or group changes. Page loads do not automatically request paid Routes data.

Road congestion is a rough busyness indicator. The wait calculator, manual check forms, manual observation workflow and saved-observation controls have been removed. Missing traffic remains unknown. Google-listed opening hours appear as secondary **Listed closed/open · unverified** notes and never override ranking. Only an explicitly sourced, recent firsthand closure could block a station; there is currently no report-entry UI. Traffic updates never renew opening timestamps. The original five listing observations retain their actual times; imported locations have no assumed opening status.

## Owner protection and spending limits

The Cloudflare Worker validates the opaque device session through the cinema app's existing owner-auth service. That service checks the GitHub numeric identity, including on every refresh. This is enforced before any Google call; hiding a button or checking CORS is not the authorization mechanism. Any other GitHub user is rejected.

The Routes API key is restricted to Routes and held in a Worker secret. It is never sent to browsers, committed, or logged. A separate Maps JavaScript display key is returned after owner authentication and is restricted to Maps JavaScript and `https://arthur-freedom.github.io/*` referrers. Display keys are necessarily visible to the owner's browser; they cannot invoke Routes.

A globally shared SQLite-backed Durable Object enforces a 15-minute cooldown for the same group and ten refresh attempts per Bali day, including concurrent devices. Different groups can be checked immediately; permutations of the same group share a cooldown. One attempt makes at most five traffic requests from the fixed catalogue. Invalid, duplicate, unknown or more than five IDs are rejected before Google calls. The daily count is shared across every group and device. After Google's free allowance, five Compute Routes Enterprise requests currently cost US$0.075; ten are US$0.75/day. Google map displays have a separate free allowance and price. These application limits do not change Google project-wide quotas or account billing. Failed attempts count toward the cap to avoid repeated accidental charges.

The service uses the existing **Workers Free** account, with no paid plan, observability or upgrades. Budget storage contains only counts, timestamps and catalogue IDs identifying each refresh group. Google traffic content is held only in browser memory and is not persisted to GitHub, browser storage, or server storage. All API responses are `no-store`. Google-derived traffic is displayed only on a Google map. The public station catalogue uses an OpenFreeMap / OpenStreetMap basemap.

## Authentication

`dist/owner-session.js` executes before external assets, removes the OAuth fragment immediately, and stores only an opaque session handle. The cinema and petrol apps share the existing remembered owner session on their common Pages origin. Sign-out revokes that device session for both apps. The auth service permits exact return paths for these two apps only; no extra repository permissions are requested.

GitHub credentials remain encrypted in the cinema service's private session object. Google calls accept no user-provided URLs, stations or coordinates. Refresh requests accept only a `stationIds` array of one to five unique allowlisted IDs, a valid session and the expected origin. The old empty-body request remains compatible with the original five stations. Unauthorized failures are sanitized and do not call Google.

## Measurement

`traffic-service/worker.mjs` calls Compute Routes with `TRAFFIC_AWARE_OPTIMAL` and `TRAFFIC_ON_POLYLINE`. It decodes the route geometry, validates interval coverage and the endpoint, and sums geodesic metres within the final kilometre (or the available approach when shorter). It counts interval edges rather than points and clips the boundary segment. Google marks these as NORMAL, SLOW and TRAFFIC_JAM; TRAFFIC_JAM length drives ranking. The chosen approach is a proxy and does not cover every entrance/direction or queues inside the forecourt. It reflects car traffic, not a specific motorcycle queue.

Traffic bands: less busy below 250 m; busy from 250–899 m; very busy from 900 m. They are comparison bands, not calibrated waits. Google traffic readings expire for current ranking after one hour. The queried-at timestamp does not claim that every source signal was observed at that exact instant.

## Development and deployment

Static source is `dist/`; no build is required. Run `python -m http.server 8794 --directory dist` for public UI checks. Owner login, Google display restrictions and CORS intentionally work only at the production Pages origin. Pushes to `main` test and publish Pages through `.github/workflows/pages.yml`. The owner can also dispatch that workflow to republish the app; it no longer accepts manual observations.

Run `node --test tests/*.test.cjs traffic-service/worker.test.mjs`. Tests cover identity rejection, concurrent limits, Bali-day rollover, data minimization, interval lengths and incomplete coverage, unverified opening reports, catalogue coverage, source alignment and fragment removal.

Worker deployment: from `traffic-service/`, `npx wrangler@4 deploy`. Secrets `GOOGLE_ROUTES_KEY` and `GOOGLE_MAPS_BROWSER_KEY` must be passed through stdin to Wrangler, never placed in files or command arguments. Google project is `chessinbali`; keys are dedicated to this app. The auth service binding is `bali-cinema-owner-refresh`.

## Sources and terms

[Google traffic on polylines](https://developers.google.com/maps/documentation/routes/traffic_on_polylines), [Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [Routes policies](https://developers.google.com/maps/documentation/routes/policies).

Google Maps use is subject to [Google Maps terms](https://www.google.com/help/terms_maps/) and [Google privacy policy](https://policies.google.com/privacy). This independent tool provides indicative traffic comparisons without guaranteeing fuel, opening hours or waiting times.

## Expanded station catalogue

`dist/stations.json` contains the public catalogue and radius-based area presets. Area counts overlap neighbouring districts. `traffic-service/stations.mjs` is the generated server allowlist with the same IDs and coordinates. The original five stations retain their previous approach origins. New entries use a reproducible candidate origin approximately 1.3 km north; Google snaps it to its navigable road network. This is a single approach proxy, not every entrance or a verified driveway. Missing traffic, routes shorter than 500 m, or endpoints more than 150 m from the station fail as unavailable.

Expanded locations come from OpenStreetMap `amenity=fuel` nodes/ways/relations, filtered to Bali province's administrative boundary (relation 1615621), excluding explicitly disused, abandoned and private entries. Nearby mapped duplicates within 65 m are consolidated. The catalogue preserves a source link per location. It includes unnamed fuel retailers; opening, current stock and full SPBU service are not implied. Coordinates and area names should be checked when adding or correcting a location.

To regenerate, fetch the public Overpass fuel data and Nominatim Bali **state** GeoJSON into ignored `.local/osm-fuel.json` and `.local/bali-boundary.json`, then run `node scripts/import-stations.cjs`. Seed metadata is in `scripts/seed-stations.json`; this contains no traffic observations. After a catalogue update, deploy the Worker and publish Pages together. OpenStreetMap-derived catalogue data is available under ODbL; see [DATA-LICENSE.md](DATA-LICENSE.md).
