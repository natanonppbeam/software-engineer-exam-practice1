
(function(global){
  'use strict';

  const EARTH_RADIUS_M = 6371000;
  const STALE_LIMIT_MS = 2 * 60 * 1000;
  const TIE_THRESHOLD_M = 500;
  const SEARCH_RADII_M = [5000, 10000, 15000];

  function toRadians(degree){
    return degree * Math.PI / 180;
  }

  function isValidCoordinate(lat, lng){
    return Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180;
  }

  function haversineDistance(lat1, lon1, lat2, lon2){
    if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
      throw new TypeError('Invalid latitude/longitude.');
    }

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_M * c;
  }

  function isFresh(lastUpdate, now){
    const timestamp = Number(lastUpdate);
    if (!Number.isFinite(timestamp)) return false;

    const age = now - timestamp;
    return age >= 0 && age <= STALE_LIMIT_MS;
  }

  function validateInput(order, riders){
    if (!order || !isValidCoordinate(order.lat, order.lng)) {
      return 'INVALID_ORDER_LOCATION';
    }

    if (!Array.isArray(riders)) {
      return 'INVALID_RIDER_LIST';
    }

    return null;
  }

  function normalizeEligibleRiders(order, riders, now, trace){
    const eligible = [];

    for (const rider of riders) {
      if (!rider || !isValidCoordinate(rider.lat, rider.lng)) {
        trace.push({
          type: 'warn',
          text: `${rider?.name || 'Unknown rider'}: invalid coordinate → excluded`
        });
        continue;
      }

      if (!Number.isFinite(rider.rating) || rider.rating < 0 || rider.rating > 5) {
        trace.push({
          type: 'warn',
          text: `${rider.name || 'Unknown rider'}: invalid rating → excluded`
        });
        continue;
      }

      const ageSec = Math.round((now - rider.lastUpdate) / 1000);

      if (!isFresh(rider.lastUpdate, now)) {
        trace.push({
          type: 'stale',
          text: `${rider.name}: last update ${ageSec}s ago → STALE (excluded)`
        });
        continue;
      }

      const distance = haversineDistance(
        order.lat,
        order.lng,
        rider.lat,
        rider.lng
      );

      trace.push({
        type: 'ok',
        text: `${rider.name}: FRESH • ${(distance / 1000).toFixed(2)} km • rating ${rider.rating.toFixed(1)}`
      });

      eligible.push({
        ...rider,
        distance
      });
    }

    return eligible;
  }

  function chooseBestCandidate(candidates, trace){
    const sorted = [...candidates].sort((a, b) => {
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return b.rating - a.rating;
    });

    const nearestDistance = sorted[0].distance;
    const tieGroup = sorted.filter(
      rider => rider.distance - nearestDistance <= TIE_THRESHOLD_M
    );

    tieGroup.sort((a, b) => {
      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }
      return a.distance - b.distance;
    });

    const winner = tieGroup[0];

    if (tieGroup.length > 1) {
      trace.push({
        type: 'tie',
        text: `Tie-breaker: ${tieGroup.length} riders are within 500m of nearest → ${winner.name} wins with rating ${winner.rating.toFixed(1)}`
      });
    } else {
      trace.push({
        type: 'info',
        text: `${winner.name} is the nearest eligible rider.`
      });
    }

    return winner;
  }

  function assignRider(order, riders, options = {}){
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const trace = [];

    const inputError = validateInput(order, riders);
    if (inputError) {
      return {
        success: false,
        status: inputError,
        rider: null,
        searchRadiusKm: null,
        trace
      };
    }

    const eligible = normalizeEligibleRiders(order, riders, now, trace);

    if (eligible.length === 0) {
      trace.push({
        type: 'warn',
        text: 'No fresh and valid riders are available.'
      });

      return {
        success: false,
        status: 'NO_ELIGIBLE_RIDER',
        rider: null,
        searchRadiusKm: null,
        trace
      };
    }

    for (const radiusM of SEARCH_RADII_M) {
      const inRange = eligible.filter(rider => rider.distance <= radiusM);

      if (inRange.length === 0) {
        trace.push({
          type: 'warn',
          text: `No eligible rider within ${radiusM / 1000} km → expand radius.`
        });
        continue;
      }

      const winner = chooseBestCandidate(inRange, trace);

      trace.push({
        type: 'ok',
        text: `Assignment completed inside ${radiusM / 1000} km search radius.`
      });

      return {
        success: true,
        status: 'ASSIGNED',
        rider: winner,
        searchRadiusKm: radiusM / 1000,
        trace
      };
    }

    trace.push({
      type: 'warn',
      text: 'No eligible rider within 15 km → queue order for retry / manual dispatch / customer delay handling.'
    });

    return {
      success: false,
      status: 'NO_RIDER_AVAILABLE',
      rider: null,
      searchRadiusKm: 15,
      trace
    };
  }

  global.RiderAssignment = Object.freeze({
    EARTH_RADIUS_M,
    STALE_LIMIT_MS,
    TIE_THRESHOLD_M,
    SEARCH_RADII_M: Object.freeze([...SEARCH_RADII_M]),
    haversineDistance,
    isFresh,
    assignRider
  });
})(window);
