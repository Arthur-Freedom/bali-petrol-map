# Bali Petrol Map

[Open the map](https://arthur-freedom.github.io/bali-petrol-map/) · [Publish an observation](https://github.com/Arthur-Freedom/bali-petrol-map/actions/workflows/pages.yml)

A petrol-station comparison for Nusa Dua and Jimbaran, following the Bali Cinema Map and Australia 462 map. Buildless HTML, CSS and JavaScript, deployed to GitHub Pages from `dist/`.

## Is the traffic live?

The comparison uses **saved observations**, not an automatic Google traffic feed. The initial three measurements were taken on **14 October 2026 at approximately 10:45 WITA**. Each station retains its own observation timestamp. Red traffic may be a petrol queue, a junction or general congestion; it does not confirm fuel stock or a measured waiting time.

**Google live traffic** opens Google's traffic layer. **Reload saved data** downloads the published JSON without changing observation timestamps or remeasuring traffic. Observations older than one hour are labelled as older; this threshold is a reminder, not an accuracy guarantee.

## Update observations

For a personal comparison, open a station's live traffic link, estimate the red stretch against Google's scale, then use **Add your check**. Checks and the chosen starting point stay in that browser, including across page reloads. Checks are not shared or transferred from the original Sites URL.

To publish for everyone, sign into the repository owner's GitHub account:

1. Open **Settings & help → How to update → Publish a shared observation**.
2. Select **Run workflow**, leave branch as `main`, and choose the station.
3. Enter the measured range in metres (or leave both ends blank for a fuel-only check), fuel availability, the actual observation time in Bali as `YYYY-MM-DDTHH:mm`, and a source note.
4. Run the workflow. It validates the data, commits the observation, tests the app and publishes the map. Other stations keep their own measurements and timestamps.
5. Once the workflow is green, use **Reload saved data** on the website.

Choosing `deploy-only` republishes existing data without recording a new observation. Every push to `main` also tests and deploys the site. There is **no scheduled job** that pretends to remeasure traffic. Direct edits to `dist/observations.json` should preserve actual observation times, metres, source notes and the existing station IDs.

Google's [traffic-aware route polylines](https://developers.google.com/maps/documentation/routes/traffic_on_polylines) can support future automatic congestion measurements. That requires a configured, billed Google Maps API integration and suitable road approaches; it is not connected here. No API keys or location histories are included.

## Development

Serve `dist/` with any static HTTP server, for example `python -m http.server 8794 --directory dist`.

Run `node --test tests/*.test.cjs` and `node --check dist/app.js`.

MapLibre with OpenFreeMap / OpenStreetMap supplies the basemap. Google Maps links provide traffic, station listings and directions. Distances are straight-line kilometres. The optional waiting-time calculator is an adjustable motorbike-queue scenario, not a measured wait.
