
(function(){
  'use strict';

  const RESTAURANT = Object.freeze({
    lat: 13.7563,
    lng: 100.5018
  });

  const KM_TO_LAT = 1 / 110.54;
  const KM_TO_LNG =
    1 / (111.32 * Math.cos(RESTAURANT.lat * Math.PI / 180));

  const SVG_SIZE = 640;
  const CENTER = SVG_SIZE / 2;
  const PADDING = 52;
  const MAX_PX = CENTER - PADDING;

  // UI updates once per second, but elapsed time always comes from Date.now()
  // instead of incrementing a counter. This avoids timer drift.
  const TIMER_REFRESH_MS = 1000;
  const WARNING_AFTER_SEC = 90;
  const HIGH_RATING_THRESHOLD = 4.5;

  let riders = [];
  let lastWinnerId = null;
  let lastRadiusKm = null;
  let manualScaleKm = null;
  let dragState = null;
  let timerIntervalId = null;

  const els = {
    riderBody: document.getElementById('riderBody'),
    radar: document.getElementById('radar'),
    resultBanner: document.getElementById('resultBanner'),
    trace: document.getElementById('trace'),
    metrics: document.getElementById('metrics'),
    metricRider: document.getElementById('metricRider'),
    metricDistance: document.getElementById('metricDistance'),
    metricRating: document.getElementById('metricRating'),
    metricRadius: document.getElementById('metricRadius'),
    radiusBadge: document.getElementById('radiusBadge'),
    codeBlock: document.getElementById('codeBlock'),
    codeText: document.getElementById('codeText')
  };

  function toLatLng(xKm, yKm){
    return {
      lat: RESTAURANT.lat + yKm * KM_TO_LAT,
      lng: RESTAURANT.lng + xKm * KM_TO_LNG
    };
  }

  function createRider(id, name, x, y, rating, agoSec = 0){
    const lastUpdate = Date.now() - agoSec * 1000;

    return {
      id,
      name,
      x,
      y,
      rating,
      lastUpdate,
      ...toLatLng(x, y)
    };
  }

  function seedNormal(){
    riders = [
      createRider(1, 'สมชาย', 0.8, 1.0, 4.8, 30),
      createRider(2, 'วีระ', -0.3, 1.3, 4.9, 45),
      createRider(3, 'ปรีชา', 3.5, -2.0, 4.6, 90),
      createRider(4, 'มานะ', 0.5, 0.3, 5.0, 150),
      createRider(5, 'ทวี', -4.8, -2.5, 4.4, 20)
    ];
  }

  function seedTie(){
    riders = [
      createRider(1, 'Rider A', 0.9, 0.0, 4.4, 20),
      createRider(2, 'Rider B', 1.2, 0.0, 4.9, 30),
      createRider(3, 'Rider C', 3.0, 0.0, 5.0, 25)
    ];
  }

  function seedStale(){
    riders = [
      createRider(1, 'Nearest Stale', 0.2, 0.0, 5.0, 180),
      createRider(2, 'Fresh Rider', 1.4, 0.2, 4.7, 30),
      createRider(3, 'Backup Rider', 2.5, -0.3, 4.8, 45)
    ];
  }

  function seedEdge(){
    riders = [
      createRider(1, 'Rider 7km', 7.0, 0.0, 4.8, 20),
      createRider(2, 'Rider 12km', -12.0, 0.0, 4.9, 35),
      createRider(3, 'Rider 18km', 18.0, 0.0, 5.0, 15)
    ];
  }

  function elapsedSeconds(rider, now = Date.now()){
    return Math.max(0, Math.floor((now - rider.lastUpdate) / 1000));
  }

  function isStale(rider, now = Date.now()){
    return now - rider.lastUpdate > RiderAssignment.STALE_LIMIT_MS;
  }

  function getFreshnessState(rider, now = Date.now()){
    const seconds = elapsedSeconds(rider, now);

    if (seconds > RiderAssignment.STALE_LIMIT_MS / 1000) {
      return 'stale';
    }

    if (seconds >= WARNING_AFTER_SEC) {
      return 'warning';
    }

    return 'fresh';
  }

  function hasHighRating(rider){
    return Number(rider.rating) > HIGH_RATING_THRESHOLD;
  }

  function formatElapsed(seconds){
    const minutes = Math.floor(seconds / 60);
    const remain = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
  }

  function clearResult(){
    lastWinnerId = null;
    lastRadiusKm = null;
    els.resultBanner.hidden = true;
    els.metrics.hidden = true;
    els.radiusBadge.textContent = 'Idle';
    els.radiusBadge.className = 'pill';
  }

  function getScale(){
    const farthest = Math.max(
      5,
      ...riders.map(r => Math.hypot(r.x, r.y)),
      lastRadiusKm || 0
    );

    const maxKm = manualScaleKm || Math.max(6, Math.ceil(farthest) + 1);

    return {
      maxKm,
      pxPerKm: MAX_PX / maxKm
    };
  }

  function createField(label, field, rider, options = {}){
    const wrap = document.createElement('label');
    wrap.className = 'input-wrap';

    const caption = document.createElement('span');
    caption.className = 'input-label';
    caption.textContent = label;

    const input = document.createElement('input');
    input.dataset.field = field;
    input.value = rider[field];

    if (options.type) input.type = options.type;
    if (options.step !== undefined) input.step = String(options.step);
    if (options.min !== undefined) input.min = String(options.min);
    if (options.max !== undefined) input.max = String(options.max);
    if (field === 'name') input.className = 'name-input';

    input.addEventListener('input', () => {
      if (field === 'name') {
        rider.name = input.value;
      } else {
        const value = Number(input.value);
        if (!Number.isFinite(value)) return;
        rider[field] = value;
      }

      if (field === 'x' || field === 'y') {
        Object.assign(rider, toLatLng(rider.x, rider.y));
      }

      clearResult();
      refreshFleetWithoutLosingFocus();
      drawRadar();
    });

    wrap.append(caption, input);
    return wrap;
  }

  function createRatingField(rider){
    const wrap = document.createElement('div');
    wrap.className = 'input-wrap';

    const caption = document.createElement('span');
    caption.className = 'input-label';
    caption.textContent = 'Rating';

    const ratingWrap = document.createElement('div');
    ratingWrap.className = 'rating-wrap';

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.1';
    input.min = '0';
    input.max = '5';
    input.value = rider.rating;
    input.dataset.field = 'rating';

    const star = document.createElement('span');
    star.className = 'rating-star';
    star.textContent = '★';
    star.title = 'High rating (> 4.5)';
    star.hidden = !hasHighRating(rider);

    input.addEventListener('input', () => {
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;

      rider.rating = value;
      star.hidden = !hasHighRating(rider);

      clearResult();
      drawRadar();
    });

    ratingWrap.append(input, star);
    wrap.append(caption, ratingWrap);

    return wrap;
  }

  function createFreshnessPanel(rider){
    const now = Date.now();
    const seconds = elapsedSeconds(rider, now);
    const state = getFreshnessState(rider, now);

    const panel = document.createElement('div');
    panel.className = 'freshness-panel';
    panel.dataset.freshnessId = String(rider.id);

    const info = document.createElement('div');
    info.className = 'freshness-info';

    const label = document.createElement('span');
    label.className = 'freshness-label';
    label.textContent = 'Last location update';

    const time = document.createElement('span');
    time.className = `freshness-time ${state}`;
    time.dataset.timerId = String(rider.id);
    time.textContent = `${formatElapsed(seconds)} / 02:00`;

    info.append(label, time);

    const status = document.createElement('span');
    status.className = `freshness-status ${state}`;
    status.dataset.statusId = String(rider.id);
    status.textContent = state.toUpperCase();

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'reset-time-btn';
    resetButton.textContent = '↻ Reset timer';
    resetButton.title = 'จำลองการอัปเดตพิกัด Rider ล่าสุด';

    resetButton.addEventListener('click', () => {
      rider.lastUpdate = Date.now();

      // Input changed, so any previous assignment is no longer authoritative.
      clearResult();

      updateFreshnessUI();
      drawRadar();
    });

    panel.append(info, status, resetButton);
    return panel;
  }

  function renderFleet(){
    els.riderBody.replaceChildren();
    const now = Date.now();

    riders.forEach(rider => {
      const row = document.createElement('div');
      row.className = `rider-row${isStale(rider, now) ? ' is-stale' : ''}`;
      row.dataset.riderId = String(rider.id);

      row.append(
        createField('Name', 'name', rider),
        createField('X km', 'x', rider, { type:'number', step:0.1 }),
        createField('Y km', 'y', rider, { type:'number', step:0.1 }),
        createRatingField(rider)
      );

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', `Remove ${rider.name}`);

      removeBtn.addEventListener('click', () => {
        riders = riders.filter(item => item.id !== rider.id);
        clearResult();
        renderFleet();
        drawRadar();
      });

      row.appendChild(removeBtn);

      const state = document.createElement('div');
      state.className = 'row-state';

      const position = document.createElement('span');
      position.className = 'row-position';
      position.dataset.positionId = String(rider.id);
      position.textContent =
        `Lat ${rider.lat.toFixed(5)} • Lng ${rider.lng.toFixed(5)}`;

      const star = document.createElement('span');
      star.className = 'rating-star';
      star.textContent = '★';
      star.title = 'Rating > 4.5';
      star.hidden = !hasHighRating(rider);
      star.dataset.rowStarId = String(rider.id);

      position.appendChild(star);

      state.append(position);
      row.appendChild(state);
      row.appendChild(createFreshnessPanel(rider));

      els.riderBody.appendChild(row);
    });

    updateFreshnessUI();
  }

  // Used when a normal field changes. Rendering the complete fleet is okay here,
  // but this function preserves the focused field where possible.
  function refreshFleetWithoutLosingFocus(){
    const active = document.activeElement;
    const riderRow = active?.closest?.('.rider-row');
    const riderId = riderRow?.dataset?.riderId;
    const field = active?.dataset?.field;
    const selectionStart = active?.selectionStart;

    renderFleet();

    if (!riderId || !field) return;

    const row = els.riderBody.querySelector(
      `.rider-row[data-rider-id="${riderId}"]`
    );
    const replacement = row?.querySelector(`[data-field="${field}"]`);

    if (replacement) {
      replacement.focus();
      if (
        typeof selectionStart === 'number' &&
        typeof replacement.setSelectionRange === 'function'
      ) {
        try {
          replacement.setSelectionRange(selectionStart, selectionStart);
        } catch (_) {}
      }
    }
  }

  function updateFreshnessUI(){
    const now = Date.now();
    let radarNeedsRefresh = false;

    riders.forEach(rider => {
      const seconds = elapsedSeconds(rider, now);
      const state = getFreshnessState(rider, now);
      const stale = state === 'stale';

      const row = els.riderBody.querySelector(
        `.rider-row[data-rider-id="${rider.id}"]`
      );

      if (!row) return;

      const wasStale = row.classList.contains('is-stale');
      row.classList.toggle('is-stale', stale);

      if (wasStale !== stale) {
        radarNeedsRefresh = true;

        // If a selected rider becomes stale in real time,
        // the previous assignment must no longer be treated as valid.
        if (stale && lastWinnerId === rider.id) {
          clearResult();
        }
      }

      const time = row.querySelector(`[data-timer-id="${rider.id}"]`);
      if (time) {
        time.textContent = `${formatElapsed(seconds)} / 02:00`;
        time.className = `freshness-time ${state}`;
      }

      const status = row.querySelector(`[data-status-id="${rider.id}"]`);
      if (status) {
        status.textContent = state.toUpperCase();
        status.className = `freshness-status ${state}`;
      }
    });

    // Color changes when freshness crosses a threshold, so redraw the map.
    // Redrawing every second is still cheap for this small simulator and keeps
    // the visual state fully synchronized.
    drawRadar();
  }

  function startRealtimeTimer(){
    if (timerIntervalId !== null) {
      clearInterval(timerIntervalId);
    }

    timerIntervalId = window.setInterval(
      updateFreshnessUI,
      TIMER_REFRESH_MS
    );
  }

  function svgEl(name, attrs = {}, text = null){
    const el = document.createElementNS(
      'http://www.w3.org/2000/svg',
      name
    );

    Object.entries(attrs).forEach(([key, value]) => {
      el.setAttribute(key, String(value));
    });

    if (text !== null) el.textContent = text;
    return el;
  }

  function cssVar(name){
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }

  function appendGrid(pxPerKm, maxKm){
    const step = maxKm > 15 ? 5 : maxKm > 8 ? 2 : 1;

    for (let km = step; km <= maxKm; km += step) {
      const r = km * pxPerKm;

      els.radar.appendChild(svgEl('circle', {
        cx:CENTER,
        cy:CENTER,
        r,
        fill:'none',
        stroke:cssVar('--ring'),
        'stroke-width':1
      }));

      els.radar.appendChild(svgEl('text', {
        x:CENTER + 7,
        y:CENTER - r + 12,
        class:'ring-label'
      }, `${km} km`));
    }

    els.radar.append(
      svgEl('line', {
        x1:PADDING, y1:CENTER, x2:SVG_SIZE-PADDING, y2:CENTER,
        stroke:cssVar('--ring'), 'stroke-width':1
      }),
      svgEl('line', {
        x1:CENTER, y1:PADDING, x2:CENTER, y2:SVG_SIZE-PADDING,
        stroke:cssVar('--ring'), 'stroke-width':1
      }),
      svgEl('text', {
        x:SVG_SIZE-PADDING-18, y:CENTER-8, class:'axis-label'
      }, 'E'),
      svgEl('text', {
        x:PADDING+7, y:CENTER-8, class:'axis-label'
      }, 'W'),
      svgEl('text', {
        x:CENTER+8, y:PADDING+12, class:'axis-label'
      }, 'N'),
      svgEl('text', {
        x:CENTER+8, y:SVG_SIZE-PADDING-8, class:'axis-label'
      }, 'S')
    );

    [5,10,15].forEach(km => {
      if (km > maxKm) return;

      const active = km === lastRadiusKm;

      els.radar.appendChild(svgEl('circle', {
        cx:CENTER,
        cy:CENTER,
        r:km * pxPerKm,
        fill:'none',
        stroke:active ? cssVar('--accent') : cssVar('--rose'),
        'stroke-width':active ? 2 : 1,
        'stroke-dasharray':'6 6',
        opacity:active ? .95 : .28
      }));
    });
  }

  function appendRestaurant(){
    const group = svgEl('g');

    group.append(
      svgEl('circle', {
        cx:CENTER, cy:CENTER, r:18,
        fill:cssVar('--rose'), opacity:.10
      }),
      svgEl('circle', {
        cx:CENTER, cy:CENTER, r:7,
        fill:cssVar('--rose')
      }),
      svgEl('text', {
        x:CENTER+14, y:CENTER+4, class:'rider-label'
      }, 'Restaurant')
    );

    els.radar.appendChild(group);
  }

  function appendRider(rider, pxPerKm){
    const now = Date.now();
    const x = CENTER + rider.x * pxPerKm;
    const y = CENTER - rider.y * pxPerKm;
    const stale = isStale(rider, now);
    const selected = rider.id === lastWinnerId;

    const color = stale
      ? cssVar('--stale')
      : selected
        ? cssVar('--accent')
        : cssVar('--green');

    if (selected) {
      els.radar.appendChild(svgEl('line', {
        x1:CENTER,
        y1:CENTER,
        x2:x,
        y2:y,
        stroke:cssVar('--accent'),
        'stroke-width':1.5,
        'stroke-dasharray':'5 5'
      }));
    }

    const group = svgEl('g', {
      class:`rider-group${selected ? ' selected' : ''}`,
      'data-rider-id':rider.id,
      transform:`translate(${x} ${y})`
    });

    const elapsed = elapsedSeconds(rider, now);
    const progress = Math.min(
      elapsed / (RiderAssignment.STALE_LIMIT_MS / 1000),
      1
    );
    const circumference = 2 * Math.PI * 13;
    const freshnessState = getFreshnessState(rider, now);

    group.append(
      svgEl('circle', {
        class:'rider-halo',
        cx:0, cy:0, r:selected ? 21 : 18,
        fill:color,
        opacity:selected ? .22 : 0
      }),
      svgEl('circle', {
        class:'timer-ring-bg',
        cx:0, cy:0, r:13
      }),
      svgEl('circle', {
        class:`timer-ring ${freshnessState}`,
        cx:0,
        cy:0,
        r:13,
        'stroke-dasharray':circumference,
        'stroke-dashoffset':circumference * (1 - progress)
      }),
      svgEl('circle', {
        class:'rider-hit',
        cx:0, cy:0, r:21,
        'data-rider-id':rider.id
      }),
      svgEl('circle', {
        cx:0, cy:0, r:selected ? 9 : 8,
        fill:color,
        stroke:'#fff',
        'stroke-width':3
      }),
      svgEl('text', {
        x:15, y:-3, class:'rider-label'
      }, rider.name),
      svgEl('text', {
        x:15, y:11, class:'rider-meta'
      }, `${Math.hypot(rider.x,rider.y).toFixed(2)} km • ${formatElapsed(elapsed)}`)
    );

    if (hasHighRating(rider)) {
      group.appendChild(svgEl('text', {
        x:15,
        y:-17,
        class:'rider-star-svg'
      }, '★'));
    }

    if (stale) {
      group.append(
        svgEl('line', {
          x1:-5,y1:-5,x2:5,y2:5,
          stroke:'#fff','stroke-width':1.5
        }),
        svgEl('line', {
          x1:-5,y1:5,x2:5,y2:-5,
          stroke:'#fff','stroke-width':1.5
        })
      );
    }

    els.radar.appendChild(group);
  }

  function drawRadar(){
    const {maxKm, pxPerKm} = getScale();
    els.radar.replaceChildren();

    appendGrid(pxPerKm, maxKm);
    appendRestaurant();
    riders.forEach(rider => appendRider(rider, pxPerKm));
  }

  function svgPointFromEvent(event){
    const point = els.radar.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;

    const matrix = els.radar.getScreenCTM();
    if (!matrix) return null;

    return point.matrixTransform(matrix.inverse());
  }

  function clamp(value, min, max){
    return Math.min(max, Math.max(min, value));
  }

  function beginDrag(event){
    const hit = event.target.closest('.rider-hit');
    if (!hit) return;

    const riderId = Number(hit.dataset.riderId);
    const rider = riders.find(item => item.id === riderId);
    if (!rider) return;

    event.preventDefault();

    dragState = {
      riderId,
      pointerId:event.pointerId
    };

    els.radar.setPointerCapture(event.pointerId);
    clearResult();
  }

  function moveDrag(event){
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const point = svgPointFromEvent(event);
    if (!point) return;

    const rider = riders.find(item => item.id === dragState.riderId);
    if (!rider) return;

    const {maxKm, pxPerKm} = getScale();

    const xKm = (point.x - CENTER) / pxPerKm;
    const yKm = (CENTER - point.y) / pxPerKm;

    rider.x = Number(clamp(xKm, -maxKm, maxKm).toFixed(2));
    rider.y = Number(clamp(yKm, -maxKm, maxKm).toFixed(2));
    Object.assign(rider, toLatLng(rider.x, rider.y));

    // Dragging represents a new GPS position, so it also refreshes the
    // location timestamp. This mirrors a real rider location update.
    rider.lastUpdate = Date.now();

    drawRadar();
    updateFleetRow(rider);
    updateFreshnessUI();
  }

  function endDrag(event){
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    if (els.radar.hasPointerCapture(event.pointerId)) {
      els.radar.releasePointerCapture(event.pointerId);
    }

    dragState = null;
    renderFleet();
    drawRadar();
  }

  function updateFleetRow(rider){
    const row = els.riderBody.querySelector(
      `.rider-row[data-rider-id="${rider.id}"]`
    );

    if (!row) return;

    const xInput = row.querySelector('[data-field="x"]');
    const yInput = row.querySelector('[data-field="y"]');
    const position = row.querySelector(
      `[data-position-id="${rider.id}"]`
    );

    if (xInput) xInput.value = rider.x;
    if (yInput) yInput.value = rider.y;

    if (position) {
      // Keep high rating star.
      position.firstChild.textContent =
        `Lat ${rider.lat.toFixed(5)} • Lng ${rider.lng.toFixed(5)}`;
    }
  }

  function showResult(result){
    els.resultBanner.hidden = false;
    els.trace.replaceChildren();

    result.trace.forEach(item => {
      const line = document.createElement('div');
      line.className = `trace-line ${item.type}`;
      line.textContent = `› ${item.text}`;
      els.trace.appendChild(line);
    });

    if (result.success) {
      const rider = result.rider;
      lastWinnerId = rider.id;
      lastRadiusKm = result.searchRadiusKm;

      els.resultBanner.className = 'result-banner win';
      els.resultBanner.replaceChildren();

      const name = document.createElement('span');
      name.className = 'result-name';
      name.textContent = rider.name;

      const starText = hasHighRating(rider) ? ' ★' : '';

      els.resultBanner.append(
        document.createTextNode('Assigned to '),
        name,
        document.createTextNode(starText),
        document.createElement('br'),
        document.createTextNode(
          `${(rider.distance/1000).toFixed(2)} km • Rating ${rider.rating.toFixed(1)}`
        )
      );

      els.metrics.hidden = false;
      els.metricRider.textContent =
        rider.name + (hasHighRating(rider) ? ' ★' : '');
      els.metricDistance.textContent =
        `${(rider.distance/1000).toFixed(2)} km`;
      els.metricRating.textContent =
        rider.rating.toFixed(1) + (hasHighRating(rider) ? ' ★' : '');
      els.metricRadius.textContent =
        `${result.searchRadiusKm} km`;

      els.radiusBadge.textContent = `${result.searchRadiusKm} km`;
      els.radiusBadge.className = 'pill active';
    } else {
      lastWinnerId = null;
      lastRadiusKm =
        result.status === 'NO_RIDER_AVAILABLE'
          ? result.searchRadiusKm
          : null;

      els.resultBanner.className = 'result-banner fail';
      els.resultBanner.replaceChildren();

      const name = document.createElement('span');
      name.className = 'result-name';
      name.textContent = result.status;

      els.resultBanner.append(
        name,
        document.createElement('br'),
        document.createTextNode(
          result.status === 'NO_RIDER_AVAILABLE'
            ? 'No eligible rider within 15 km — queue / retry / manual dispatch'
            : 'No fresh and valid rider available'
        )
      );

      els.metrics.hidden = true;
      els.radiusBadge.textContent = result.status;
      els.radiusBadge.className = 'pill fail';
    }

    drawRadar();
  }

  function runAssignment(){
    const now = Date.now();

    // lastUpdate is the real timestamp. We do not synthesize it from an input.
    const candidates = riders.map(rider => ({ ...rider }));

    const result = RiderAssignment.assignRider(
      RESTAURANT,
      candidates,
      {now}
    );

    showResult(result);
  }

  function loadScenario(seedFn){
    seedFn();
    manualScaleKm = null;
    clearResult();
    renderFleet();
    drawRadar();
  }

  els.radar.addEventListener('pointerdown', beginDrag);
  els.radar.addEventListener('pointermove', moveDrag);
  els.radar.addEventListener('pointerup', endDrag);
  els.radar.addEventListener('pointercancel', endDrag);

  document.getElementById('fitView').addEventListener('click', () => {
    manualScaleKm = null;
    drawRadar();
  });

  document.getElementById('addRider').addEventListener('click', () => {
    const id = Math.max(0, ...riders.map(r => r.id)) + 1;
    riders.push(
      createRider(id, `Rider ${id}`, 1, 1, 4.5, 0)
    );

    clearResult();
    renderFleet();
    drawRadar();
  });

  document.getElementById('runAssign')
    .addEventListener('click', runAssignment);

  document.getElementById('scenNormal')
    .addEventListener('click', () => loadScenario(seedNormal));

  document.getElementById('scenTie')
    .addEventListener('click', () => loadScenario(seedTie));

  document.getElementById('scenStale')
    .addEventListener('click', () => loadScenario(seedStale));

  document.getElementById('scenEdge')
    .addEventListener('click', () => loadScenario(seedEdge));

  document.getElementById('toggleCode').addEventListener('click', () => {
    els.codeBlock.hidden = !els.codeBlock.hidden;

    if (!els.codeBlock.hidden) {
      els.codeText.textContent =
`assignRider(order, riders)
  1. Validate input
  2. Exclude stale rider (> 120 sec)
  3. Haversine distance
  4. Search 5 km → 10 km → 15 km
  5. Tie group = within +500m from nearest
  6. Highest rating wins
  7. If no rider ≤ 15 km → NO_RIDER_AVAILABLE

Simulation:
  • Rider.lastUpdate is a timestamp
  • UI derives elapsed time from Date.now() - lastUpdate
  • Timer refreshes every 1 second
  • Reset timer = simulate new location update
  • Dragging a Rider = new GPS update + reset timestamp
  • Rating > 4.5 = yellow ★`;
    }
  });

  seedNormal();
  renderFleet();
  drawRadar();
  startRealtimeTimer();

  window.addEventListener('beforeunload', () => {
    if (timerIntervalId !== null) {
      clearInterval(timerIntervalId);
    }
  });
})();
