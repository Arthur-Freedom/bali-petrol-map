# Station data attribution

The expanded petrol-location catalogue is derived from © OpenStreetMap contributors and distributed under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/). See [OpenStreetMap copyright and licensing](https://www.openstreetmap.org/copyright). Each imported record links to its source node, way or relation.

Bali's administrative boundary was obtained from OpenStreetMap through Nominatim (relation 1615621). The public catalogue contains no Google traffic content. Its original five seed records identify Google Maps as their source separately. Google traffic responses are used transiently and are not committed or stored here.

The candidate access and incoming-road geometries in `dist/stations.json` and `traffic-service/stations.mjs` are also derived from © OpenStreetMap contributors and distributed under ODbL. Each mapped access records source fuel geometry, service-road and public-road way IDs. `scripts/import-access.cjs` provides the derivation procedure. These static geometries contain no TomTom traffic observations.
