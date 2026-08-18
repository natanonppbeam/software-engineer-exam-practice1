const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('./js/riderAssignment.js', 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const {
  haversineDistance,
  assignRider,
  isFresh
} = sandbox.window.RiderAssignment;

function approx(actual, expected, tolerance){
  assert(Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`);
}

(function testSameCoordinate(){
  approx(haversineDistance(13.7563, 100.5018, 13.7563, 100.5018), 0, 0.001);
  console.log('✓ Haversine returns zero for identical coordinates');
})();

(function testExactlyTwoMinutesIsFresh(){
  const now = 1_000_000;
  assert.strictEqual(isFresh(now - 120000, now), true);
  console.log('✓ Location exactly 2 minutes old is still fresh');
})();

(function testStaleRiderExcluded(){
  const now = 1_000_000;
  const order = { lat: 13.7563, lng: 100.5018 };

  const result = assignRider(order, [
    { id:1, name:'Stale', lat:13.7564, lng:100.5018, rating:5, lastUpdate:now-121000 },
    { id:2, name:'Fresh', lat:13.7663, lng:100.5018, rating:4.5, lastUpdate:now-30000 }
  ], { now });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.rider.name, 'Fresh');
  console.log('✓ Stale rider is excluded even when nearest');
})();

(function testTieBreaker(){
  const now = 1_000_000;
  const order = { lat:13.7563, lng:100.5018 };

  const result = assignRider(order, [
    { id:1, name:'NearLower', lat:13.7653, lng:100.5018, rating:4.2, lastUpdate:now-10000 },
    { id:2, name:'FarHigher', lat:13.7680, lng:100.5018, rating:4.9, lastUpdate:now-10000 }
  ], { now });

  assert.strictEqual(result.rider.name, 'FarHigher');
  console.log('✓ Higher rating wins within 500m tie threshold');
})();

(function testRadiusExpansion(){
  const now = 1_000_000;
  const order = { lat:13.7563, lng:100.5018 };

  const result = assignRider(order, [{
    id:1, name:'Rider7km', lat:13.8193, lng:100.5018,
    rating:4.7, lastUpdate:now-10000
  }], { now });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.searchRadiusKm, 10);
  console.log('✓ Search radius expands from 5km to 10km');
})();

(function testNoRiderBeyond15km(){
  const now = 1_000_000;
  const order = { lat:13.7563, lng:100.5018 };

  const result = assignRider(order, [{
    id:1, name:'FarRider', lat:13.9363, lng:100.5018,
    rating:5, lastUpdate:now-10000
  }], { now });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'NO_RIDER_AVAILABLE');
  console.log('✓ Returns NO_RIDER_AVAILABLE beyond 15km');
})();

console.log('\\nAll tests passed.');
