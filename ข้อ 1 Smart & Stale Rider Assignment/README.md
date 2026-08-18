# Smart Rider Assignment — Interactive Top View v3

Interactive exam simulator for `assignRider(order, riders)`.

## New simulation features

### High-rating indicator

A Rider with `rating > 4.5` displays a yellow `★` in:
- Top View
- Rider Fleet
- Assignment result

`4.5` itself does not show the star because the requirement is strictly greater than 4.5.

### Realtime freshness timer

Every Rider owns a real `lastUpdate` timestamp.

The UI refreshes every second and derives elapsed time using:

```js
Date.now() - rider.lastUpdate
```

It does **not** increment a JavaScript counter as the source of truth. This avoids accumulated timer drift.

Freshness states:
- `FRESH` — under 90 seconds
- `WARNING` — 90 to 120 seconds
- `STALE` — over 120 seconds

Only `STALE` affects the assignment algorithm. `WARNING` is UI feedback only.

### Reset timer

Each Rider has a `Reset timer` button.

Resetting sets:

```js
rider.lastUpdate = Date.now();
```

This simulates receiving a new GPS/location update.

Dragging a Rider in Top View also represents a new GPS update, so the timer is reset automatically.

## Algorithm requirements

- Haversine distance
- Stale location protection (> 2 minutes excluded)
- 500 meter rating tie-breaker
- Radius fallback: 5 km → 10 km → 15 km
- `NO_RIDER_AVAILABLE` after 15 km
- Draggable Rider simulation
- Realtime freshness state
- Automated tests
- UI / business logic separation

## Run

Open `index.html` using VS Code Live Server.

No Google Maps API is required.

## Test

```bash
npm test
```

## Architecture

- `js/riderAssignment.js` — pure assignment/business logic
- `js/app.js` — simulation, drag interaction, realtime freshness timer and UI
- `css/style.css` — minimal responsive interface
- `tests/riderAssignment.test.js` — automated algorithm tests
