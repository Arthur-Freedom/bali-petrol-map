# Bali Petrol Map

[Open the map](https://arthur-freedom.github.io/bali-petrol-map/)

Compares five petrol stations around Nusa Dua and Jimbaran using Google traffic on fixed approach roads. The public site remains on GitHub Pages. Live traffic refreshes are available only to GitHub owner **Arthur-Freedom**, numeric ID **18115558**.

## Use

Sign in with GitHub, then press **Refresh traffic**. One request checks all five stations and draws the measured approach traffic on a Google map. The list ranks shorter congested road lengths first. Optional auto-refresh runs every 15 minutes while the tab is visible. Page loads do not automatically request paid Routes data.

Road congestion is a rough queue indicator. Wait minutes are shown only when actually reported. Fuel availability and station opening status are independent observations; a traffic update never renews their timestamps. Old/failed readings retain their original times. No traffic data is available means unknown, not clear roads.

## Owner protection and spending limits

The Cloudflare Worker validates the opaque device session through the cinema app's existing owner-auth service. That service checks the GitHub numeric identity, including on every refresh. This is enforced before any Google call; hiding a button or checking CORS is not the authorization mechanism. Any other GitHub user is rejected.

The Routes API key is restricted to Routes and held in a Worker secret. It is never sent to browsers, committed, or logged. A separate Maps JavaScript display key is returned after owner authentication and is restricted to Maps JavaScript and `https://arthur-freedom.github.io/*` referrers. Display keys are necessarily visible to the owner's browser; they cannot invoke Routes.

A globally shared SQLite-backed Durable Object enforces a 15-minute cooldown and ten refresh attempts per Bali day, including concurrent devices. One attempt makes at most five fixed traffic requests. After Google's free allowance, five Compute Routes Enterprise requests currently cost US$0.075; ten are US$0.75/day. Google map displays have a separate free allowance and price. These application limits do not change Google project-wide quotas or account billing. Failed attempts count toward the cap to avoid repeated accidental charges.

The service uses the existing **Workers Free** account, with no paid plan, observability or upgrades. Budget storage contains only counts and timestamps. Google traffic content is held only in browser memory and is not persisted to GitHub, browser storage, or server storage. All API responses are `no-store`. Google-derived traffic is displayed only on a Google map. Public manual observations use OpenFreeMap / OpenStreetMap.

## Authentication

`dist/owner-session.js` executes before external assets, removes the OAuth fragment immediately, and stores only an opaque session handle. The cinema and petrol apps share the existing remembered owner session on their common Pages origin. Sign-out revokes that device session for both apps. The auth service permits exact return paths for these two apps only; no extra repository permissions are requested.

GitHub credentials remain encrypted in the cinema service's private session object. Google calls accept no user-provided URLs, stations or coordinates. Refresh requests require an exact JSON body, valid session and expected origin. Unauthorized failures are sanitized and do not call Google.

## Measurement

`traffic-service/worker.mjs` calls Compute Routes with `TRAFFIC_AWARE_OPTIMAL` and `TRAFFIC_ON_POLYLINE`. It decodes the route geometry, validates interval coverage and the endpoint, and sums geodesic metres within the final kilometre (or the available approach when shorter). It counts interval edges rather than points and clips the boundary segment. Google marks these as NORMAL, SLOW and TRAFFIC_JAM; TRAFFIC_JAM length drives ranking. The chosen approach is a proxy and does not cover every entrance/direction or queues inside the forecourt. It reflects car traffic, not a specific motorcycle queue.

Traffic bands: less busy below 250 m; busy from 250–899 m; very busy from 900 m. They are comparison bands, not calibrated waits. Manual queue reports use their midpoint: up to 15 minutes, 16–45, over 45. Reports expire for current ranking after one hour. The queried-at timestamp does not claim that every source signal was observed at that exact instant.

## Development and deployment

Static source is `dist/`; no build is required. Run `python -m http.server 8794 --directory dist` for public UI checks. Owner login, Google display restrictions and CORS intentionally work only at the production Pages origin. Pushes to `main` test and publish Pages through `.github/workflows/pages.yml`. The owner can also dispatch that workflow to publish actual manual observations.

Run `node --test tests/*.test.cjs traffic-service/worker.test.mjs`. Tests cover identity rejection, concurrent limits, Bali-day rollover, data minimization, interval lengths and incomplete coverage, stale metadata, fragment removal and existing observation validation.

Worker deployment: from `traffic-service/`, `npx wrangler@4 deploy`. Secrets `GOOGLE_ROUTES_KEY` and `GOOGLE_MAPS_BROWSER_KEY` must be passed through stdin to Wrangler, never placed in files or command arguments. Google project is `chessinbali`; keys are dedicated to this app. The auth service binding is `bali-cinema-owner-refresh`.

## Sources and terms

[Google traffic on polylines](https://developers.google.com/maps/documentation/routes/traffic_on_polylines), [Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [Routes policies](https://developers.google.com/maps/documentation/routes/policies).

Google Maps use is subject to [Google Maps terms](https://www.google.com/help/terms_maps/) and [Google privacy policy](https://policies.google.com/privacy). This independent tool provides indicative traffic comparisons without guaranteeing fuel, opening hours or waiting times.
