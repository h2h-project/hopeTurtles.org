(function initTurtleLiveRows() {
  const panel = document.querySelector('.my-turtles-panel');
  if (!panel || typeof L === 'undefined') {
    return;
  }

  const mapboxToken = panel.dataset.mapToken || '';
  const POLL_MS = 10000;

  // Per-turtle state: { map, marker, pollTimer, loaded }
  const liveState = new Map();

  const createTileLayer = () => {
    if (mapboxToken) {
      return L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`,
        {
          attribution: '© Mapbox © OpenStreetMap',
          tileSize: 512,
          zoomOffset: -1
        }
      );
    }
    return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    });
  };

  const toFinite = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const formatRelativeTime = (value) => {
    if (!value) {
      return null;
    }
    const then = new Date(value).getTime();
    if (!Number.isFinite(then)) {
      return null;
    }
    const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
    return `${Math.round(seconds / 86400)}d ago`;
  };

  const READOUT_FIELDS = [
    { label: 'Battery', keys: ['ina_bus_v'], unit: ' V' },
    { label: 'Battery %', keys: ['ina_batt_pct'], unit: '%' },
    { label: 'Current', keys: ['ina_current_ma'], unit: ' mA' },
    { label: 'Power', keys: ['ina_power_mw'], unit: ' mW' },
    { label: 'Temp', keys: ['aht_temp', 'scd_temp', 'bme_temp'], unit: ' °C', decimals: 1 },
    { label: 'RTC temp', keys: ['rtc_temp'], unit: ' °C', decimals: 1 },
    { label: 'Humidity', keys: ['aht_humidity', 'scd_humidity', 'bme_humidity'], unit: '%', decimals: 1 },
    { label: 'eCO₂', keys: ['ens_eco2', 'scd_co2'], unit: ' ppm' },
    { label: 'TVOC', keys: ['ens_tvoc'], unit: ' ppb' },
    { label: 'AQI', keys: ['ens_aqi'], unit: '' },
    { label: 'Pressure', keys: ['bme_pressure'], unit: ' hPa' }
  ];

  const renderReadout = (readoutEl, data) => {
    const reading = data.reading;
    const values = reading?.values || {};
    const entries = [];

    READOUT_FIELDS.forEach((field) => {
      for (const key of field.keys) {
        const n = toFinite(values[key]);
        if (n !== null) {
          const display = field.decimals != null ? n.toFixed(field.decimals) : n;
          entries.push([field.label, `${display}${field.unit}`]);
          return;
        }
      }
    });

    const machineState = reading?.machine_state || data.turtle?.last_machine_state;
    if (machineState) {
      entries.push(['State', String(machineState).replace(/_/g, '-')]);
    }

    const lastSeen = formatRelativeTime(reading?.timestamp || data.turtle?.last_update);
    if (lastSeen) {
      entries.push(['Last seen', lastSeen]);
    }

    readoutEl.innerHTML = entries
      .map(
        ([label, value]) =>
          `<div class="turtle-live__metric"><dt>${label}</dt><dd>${value}</dd></div>`
      )
      .join('');

    return entries.length > 0;
  };

  const updateMap = (state, mapEl, data) => {
    const reading = data.reading;
    const lat = toFinite(reading?.latitude) ?? toFinite(data.turtle?.last_lat);
    const lng = toFinite(reading?.longitude) ?? toFinite(data.turtle?.last_lng);

    if (!state.map) {
      state.map = L.map(mapEl, { zoomControl: true });
      createTileLayer().addTo(state.map);
      state.map.setView([lat ?? 0, lng ?? 0], lat !== null ? 8 : 2);
    }
    state.map.invalidateSize();

    if (lat === null || lng === null) {
      return;
    }
    if (!state.marker) {
      state.marker = L.marker([lat, lng]).addTo(state.map);
    } else {
      state.marker.setLatLng([lat, lng]);
    }
    state.map.setView([lat, lng], Math.max(state.map.getZoom(), 8));
  };

  const refreshLiveRow = async (turtleId, row, state) => {
    const statusEl = row.querySelector('[data-live-status]');
    const readoutEl = row.querySelector('[data-live-readout]');
    const mapEl = row.querySelector('[data-live-map]');

    try {
      const response = await fetch(`/api/turtles/${encodeURIComponent(turtleId)}/live`);
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json?.message || 'Unable to load telemetry.');
      }

      const data = json.data || {};
      const hasMetrics = renderReadout(readoutEl, data);
      updateMap(state, mapEl, data);

      if (statusEl) {
        if (!data.reading && !hasMetrics) {
          statusEl.textContent = 'No telemetry yet. Waiting for this turtle to phone home…';
        } else {
          statusEl.textContent = '';
        }
      }
      state.loaded = true;
    } catch (error) {
      if (statusEl) {
        statusEl.textContent = error.message || 'Unable to load telemetry.';
      }
    }
  };

  const stopPolling = (state) => {
    if (state.pollTimer) {
      window.clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  };

  const collapseRow = (button, row, state) => {
    row.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    stopPolling(state);
  };

  const expandRow = (button, row, turtleId, state) => {
    row.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    // Leaflet measures its container, so the row must be visible first.
    refreshLiveRow(turtleId, row, state);
    stopPolling(state);
    state.pollTimer = window.setInterval(() => refreshLiveRow(turtleId, row, state), POLL_MS);
  };

  panel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-toggle-turtle-live]');
    if (!button) {
      return;
    }
    // The parent <tr> is itself a click target that opens the manage dialog.
    event.preventDefault();
    event.stopPropagation();

    const turtleId = button.dataset.turtleId;
    const row = panel.querySelector(`[data-turtle-live-row][data-turtle-id="${turtleId}"]`);
    if (!turtleId || !row) {
      return;
    }

    let state = liveState.get(turtleId);
    if (!state) {
      state = { map: null, marker: null, pollTimer: null, loaded: false };
      liveState.set(turtleId, state);
    }

    if (row.hidden) {
      expandRow(button, row, turtleId, state);
    } else {
      collapseRow(button, row, state);
    }
  });
})();
