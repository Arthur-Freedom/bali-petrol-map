# Bali petrol traffic history

Timestamped observations from owner-requested station checks in the [Bali Petrol Map](https://arthur-freedom.github.io/bali-petrol-map/).

Each new check is saved durably on the server before it is returned to the owner. A GitHub Actions job copies pending observations here approximately every 15 minutes; GitHub scheduling can be delayed. The backup job never requests traffic or spends station checks.

- `history/YYYY-MM-DD/`: immutable JSON observations and a daily `readings.csv`, grouped by the Bali request date.
- `latest/`: the last successful reading for each checked station.
- `index.json`: last attempts and last successful measurement times.

Timestamps include UTC and Bali time (WITA, UTC+08:00). Failed checks are recorded separately and do not erase previous successful measurements. No observations from before archiving was enabled can be recovered. This branch starts empty; the first new check creates its first observation.

These are road traffic observations, not measured petrol queues or motorcycle waiting times. Traffic data: TomTom. No API keys, owner sessions, home addresses, or visitor locations are stored here.
