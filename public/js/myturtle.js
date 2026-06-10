/* My Turtle telemetry page.
 * Ported from the AirBuddy SPA dashboard (airbuddy-spa/app/pages/dashboard.vue,
 * AirTrendChart.vue, LocationMap.vue) to vanilla JS. ECharts (SVG renderer)
 * renders the trend charts; Leaflet renders the location/route map.
 */
(function () {
  const main = document.querySelector('main[data-turtle-id]');
  if (!main || typeof echarts === 'undefined') {
    return;
  }

  const turtleId = main.dataset.turtleId;
  const turtleName = main.dataset.turtleName || 'Turtle';

  // ── Constants (mirrors dashboard.vue) ────────────────────────────────────

  const TREND_RANGE_KEYS = ['15m', '30m', '1h', '3h', '6h', '12h', '24h', '36h', '50h', '72h', '5d', '7d', '30d'];

  // Hours of data fetched per range — slightly more than displayed.
  const RANGE_FETCH_HOURS = {
    '15m': 1, '30m': 1, '1h': 2, '3h': 4, '6h': 7, '12h': 13, '24h': 25,
    '36h': 37, '50h': 51, '72h': 73, '5d': 121, '7d': 169, '30d': 721
  };

  // Hours of data displayed (chart window).
  const RANGE_HOURS = {
    '15m': 0.25, '30m': 0.5, '1h': 1, '3h': 3, '6h': 6, '12h': 12, '24h': 24,
    '36h': 36, '50h': 50, '72h': 72, '5d': 120, '7d': 168, '30d': 720
  };

  const ROUTE_SLIDER_STEPS = [
    { label: '15m', hours: 0.25 }, { label: '30m', hours: 0.5 }, { label: '1h', hours: 1 },
    { label: '2h', hours: 2 }, { label: '3h', hours: 3 }, { label: '6h', hours: 6 },
    { label: '9h', hours: 9 }, { label: '12h', hours: 12 }, { label: '18h', hours: 18 },
    { label: '24h', hours: 24 }, { label: '36h', hours: 36 }, { label: '48h', hours: 48 },
    { label: '50h', hours: 50 }, { label: '72h', hours: 72 }, { label: '5d', hours: 120 }
  ];

  const PACKET_RANGE_KEYS = ['1h', '3h', '6h', '12h', '24h', '50h', '5d', '7d', '30d'];
  const PACKET_RANGE_HOURS = {
    '1h': 1, '3h': 3, '6h': 6, '12h': 12, '24h': 24, '50h': 50, '5d': 120, '7d': 168, '30d': 720
  };

  const ECO2_BANDS = [
    { label: 'Good', from: 0, to: 800, color: 'rgba(34,197,94,0.10)' },
    { label: 'OK', from: 800, to: 1000, color: 'rgba(234,179,8,0.12)' },
    { label: 'Poor', from: 1000, to: 1400, color: 'rgba(249,115,22,0.13)' },
    { label: 'Bad', from: 1400, to: 2000, color: 'rgba(239,68,68,0.13)' },
    { label: 'Dangerous', from: 2000, to: Infinity, color: 'rgba(185,28,28,0.16)' }
  ];
  const TEMP_BANDS = [
    { label: 'Cold', from: -Infinity, to: 16, color: 'rgba(99,179,237,0.13)' },
    { label: 'Cool', from: 16, to: 20, color: 'rgba(56,189,248,0.10)' },
    { label: 'Comfortable', from: 20, to: 25, color: 'rgba(34,197,94,0.10)' },
    { label: 'Warm', from: 25, to: 28, color: 'rgba(251,191,36,0.12)' },
    { label: 'Hot', from: 28, to: Infinity, color: 'rgba(239,68,68,0.13)' }
  ];
  const HUMIDITY_BANDS = [
    { label: 'Very Dry', from: 0, to: 25, color: 'rgba(210,180,140,0.18)' },
    { label: 'Dry', from: 25, to: 40, color: 'rgba(230,210,170,0.13)' },
    { label: 'Comfortable', from: 40, to: 60, color: 'rgba(34,197,94,0.10)' },
    { label: 'Humid', from: 60, to: 70, color: 'rgba(56,189,248,0.11)' },
    { label: 'Very Humid', from: 70, to: Infinity, color: 'rgba(37,99,235,0.14)' }
  ];
  const TVOC_BANDS = [
    { label: 'Clean', from: 0, to: 220, color: 'rgba(34,197,94,0.10)' },
    { label: 'Low', from: 220, to: 660, color: 'rgba(234,179,8,0.12)' },
    { label: 'Moderate', from: 660, to: 2200, color: 'rgba(249,115,22,0.13)' },
    { label: 'High', from: 2200, to: 5500, color: 'rgba(239,68,68,0.14)' },
    { label: 'Danger', from: 5500, to: Infinity, color: 'rgba(127,0,0,0.18)' }
  ];
  const BATT_BANDS = [
    { label: 'Critical', from: 0, to: 20, color: 'rgba(239,68,68,0.14)' },
    { label: 'Low', from: 20, to: 40, color: 'rgba(249,115,22,0.12)' },
    { label: 'Good', from: 40, to: 80, color: 'rgba(234,179,8,0.10)' },
    { label: 'Full', from: 80, to: 100, color: 'rgba(34,197,94,0.09)' }
  ];

  const SERIES_COLORS = {
    ensEco2: '#6a1b9a',
    ahtTemp: '#c62828',
    rtcTemp: '#2e7d32',
    bmeTemp: '#1565c0',
    ahtHumidity: '#1565c0',
    bmeHumidity: '#00838f',
    tvoc: '#ef6c00',
    battPct: '#f59e0b',
    battBusV: '#fbbf24',
    battCurrent: '#3b82f6'
  };

  const scaleBusV = (v) =>
    v == null ? null : +Math.max(0, Math.min(100, ((v - 3.30) / (4.20 - 3.30)) * 100)).toFixed(1);

  // ── Theme ────────────────────────────────────────────────────────────────

  const currentTheme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

  const themeColors = () => {
    const dark = currentTheme() === 'dark';
    return {
      axisLine: dark ? 'rgba(238,242,247,0.18)' : 'rgba(17,24,39,0.15)',
      axisLabel: dark ? 'rgba(238,242,247,0.72)' : 'rgba(17,24,39,0.55)',
      splitLine: dark ? 'rgba(238,242,247,0.07)' : 'rgba(17,24,39,0.07)',
      legendText: dark ? '#c8d4e3' : '#374151',
      legendInactive: dark ? 'rgba(200,212,227,0.30)' : 'rgba(55,65,81,0.30)',
      tooltipBg: dark ? '#13301a' : '#ffffff',
      tooltipBorder: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
      tooltipText: dark ? '#eef2f7' : '#1F3B22'
    };
  };

  // ── Formatting helpers ───────────────────────────────────────────────────

  const formatMetric = (value, decimals = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(decimals) : '--';
  };

  const timeFmt = (opts) => new Intl.DateTimeFormat('en-GB', { hour12: false, ...opts });
  const fmtTimeFull = timeFmt({ day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const fmtTimeShort = timeFmt({ hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const fmtAxisTime = timeFmt({ hour: '2-digit', minute: '2-digit' });
  const fmtAxisDay = timeFmt({ month: 'short', day: 'numeric' });
  const fmtAxisDayTime = timeFmt({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const formatPacketTime = (ts) => Number.isFinite(Number(ts)) ? fmtTimeFull.format(new Date(Number(ts) * 1000)) : '—';
  const formatPacketTimeShort = (ts) => Number.isFinite(Number(ts)) ? fmtTimeShort.format(new Date(Number(ts) * 1000)) : '—';
  const formatPacketValue = (value, decimals = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(decimals) : '—';
  };

  const AQI_RATINGS = [
    { max: 1, emoji: '😄', label: 'Excellent' },
    { max: 2, emoji: '🙂', label: 'Good' },
    { max: 3, emoji: '😐', label: 'Moderate' },
    { max: 4, emoji: '😟', label: 'Poor' },
    { max: Infinity, emoji: '😰', label: 'Very Poor' }
  ];
  const aqiRating = (aqi) => {
    const n = Number(aqi);
    if (!Number.isFinite(n)) return null;
    return AQI_RATINGS.find((r) => n <= r.max);
  };

  const hasData = (arr) => Array.isArray(arr) && arr.some((v) => v !== null && Number.isFinite(Number(v)));

  // ── Data fetching ────────────────────────────────────────────────────────

  const trendsCache = new Map();

  async function fetchTrends(hours) {
    const key = String(hours);
    if (trendsCache.has(key)) {
      return trendsCache.get(key);
    }
    const promise = fetch(`/api/telemetry/${turtleId}/trends?hours=${hours}`, {
      credentials: 'same-origin',
      headers: { 'Cache-Control': 'no-cache' }
    }).then((res) => {
      if (res.status === 401) {
        throw new Error('session-expired');
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res.json();
    }).then((body) => body?.data ?? null);
    trendsCache.set(key, promise);
    promise.catch(() => trendsCache.delete(key));
    return promise;
  }

  const clearTrendsCache = () => trendsCache.clear();

  const errorMessage = (err) =>
    err?.message === 'session-expired'
      ? 'Session expired — please log in again.'
      : 'Could not load telemetry data.';

  // ── Trend chart factory (port of AirTrendChart.vue) ─────────────────────

  function makeTrendChart(el, cfg) {
    const chart = echarts.init(el, null, { renderer: 'svg' });
    let lastTimestamps = [];
    let lastSeries = [];
    let range = cfg.range || '1h';

    function prepareData(values, timestamps) {
      const hours = RANGE_HOURS[range] ?? 1;
      let maxTs = 0;
      for (const ts of timestamps) {
        if (ts != null && ts > maxTs) maxTs = ts;
      }
      const ref = maxTs > 0 ? maxTs : Date.now() / 1000;
      const cutoff = ref - hours * 3600;

      const out = [];
      let lastTs = null;
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        if (ts == null || ts < cutoff) continue;
        // Insert a null break for gaps > 5 minutes — connectNulls is false,
        // so the line shows a visible gap instead of bridging dropouts.
        if (lastTs !== null && ts - lastTs > 300) {
          out.push([((lastTs + ts) / 2) * 1000, null]);
        }
        const v = values[i];
        out.push([ts * 1000, v != null && Number.isFinite(Number(v)) ? Number(v) : null]);
        lastTs = ts;
      }
      return out;
    }

    function yAxisBounds(preparedSeries) {
      if (cfg.yPad !== undefined) {
        let lo = Infinity;
        let hi = -Infinity;
        for (const s of preparedSeries) {
          for (const [, v] of s.data) {
            if (v != null && Number.isFinite(v)) {
              if (v < lo) lo = v;
              if (v > hi) hi = v;
            }
          }
        }
        if (!Number.isFinite(lo)) return {};
        return { min: lo - cfg.yPad, max: hi + cfg.yPad };
      }
      const out = {};
      if (cfg.yMin !== undefined) out.min = cfg.yMin;
      if (cfg.yMax !== undefined) out.max = cfg.yMax;
      return out;
    }

    function render() {
      const c = themeColors();
      const unit = cfg.unit ? ` ${cfg.unit}` : '';
      const showLegend = cfg.showLegend ?? lastSeries.length > 1;

      const markAreaData = (cfg.thresholdBands || []).map((band) => [
        {
          name: band.label,
          yAxis: band.from === -Infinity ? 'min' : band.from,
          itemStyle: { color: band.color }
        },
        { yAxis: band.to === Infinity ? 'max' : band.to }
      ]);

      const prepared = lastSeries.map((s) => ({
        name: s.name,
        color: s.color,
        data: prepareData(s.values, lastTimestamps)
      }));

      const echartsSeries = prepared.map((s, idx) => ({
        name: s.name,
        type: 'line',
        data: s.data,
        smooth: false,
        showSymbol: false,
        lineStyle: { color: s.color, width: 2 },
        itemStyle: { color: s.color },
        connectNulls: false,
        ...(idx === 0 && markAreaData.length > 0
          ? { markArea: { silent: true, data: markAreaData, label: { show: false } } }
          : {})
      }));

      chart.setOption({
        animation: false,
        backgroundColor: 'transparent',
        ...(showLegend
          ? {
              legend: {
                top: 4,
                left: 'center',
                itemWidth: 18,
                itemHeight: 3,
                textStyle: { color: c.legendText, fontSize: 11 },
                inactiveColor: c.legendInactive
              }
            }
          : { legend: { show: false } }),
        grid: { top: showLegend ? 28 : 12, right: 12, bottom: 28, left: 52, containLabel: false },
        xAxis: {
          type: 'time',
          axisLine: { lineStyle: { color: c.axisLine } },
          axisTick: { lineStyle: { color: c.axisLine } },
          axisLabel: {
            color: c.axisLabel,
            fontSize: 11,
            formatter: (val) => {
              const hours = RANGE_HOURS[range] ?? 1;
              if (hours >= 168) return fmtAxisDay.format(new Date(val));
              if (hours >= 24) return fmtAxisDayTime.format(new Date(val));
              return fmtAxisTime.format(new Date(val));
            }
          },
          splitLine: { show: false }
        },
        yAxis: {
          type: 'value',
          ...yAxisBounds(prepared),
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            color: c.axisLabel,
            fontSize: 11,
            formatter: (v) => `${v.toFixed(cfg.decimals ?? 0)}${unit}`
          },
          splitLine: { lineStyle: { color: c.splitLine } }
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: c.tooltipBg,
          borderColor: c.tooltipBorder,
          textStyle: { color: c.tooltipText, fontSize: 12 },
          axisPointer: { type: 'line', lineStyle: { color: c.axisLine, width: 1, type: 'dashed' } },
          formatter(params) {
            if (!params || !params.length) return '';
            const timeLabel = fmtTimeShort.format(new Date(params[0].axisValue));
            const rows = params
              .map((p) => {
                const val = p.value && p.value[1];
                const display = val != null && Number.isFinite(val)
                  ? `${Number(val).toFixed(cfg.decimals ?? 0)}${unit}`
                  : '—';
                return `<span style="color:${p.color}">●</span> ${p.seriesName}: <strong>${display}</strong>`;
              })
              .join('<br/>');
            return `<div style="font-size:11px;margin-bottom:4px;opacity:0.7">${timeLabel}</div>${rows}`;
          }
        },
        series: echartsSeries
      }, { notMerge: true });
    }

    return {
      update(timestamps, series, newRange) {
        lastTimestamps = timestamps || [];
        lastSeries = series || [];
        if (newRange) range = newRange;
        render();
      },
      rerender: render,
      resize: () => chart.resize(),
      setHeight(px) {
        el.style.height = `${px}px`;
        chart.resize();
      }
    };
  }

  // ── Chart definitions & series mapping ───────────────────────────────────

  const COLLAPSED_HEIGHT = { eco2: 200, temp: 220, humidity: 200, tvoc: 200, battery: 200, current: 200 };
  const EXPANDED_HEIGHT = { eco2: 400, temp: 440, humidity: 400, tvoc: 400, battery: 400, current: 400 };

  const CHART_CONFIGS = {
    eco2: { unit: 'ppm', decimals: 0, yMin: 350, thresholdBands: ECO2_BANDS },
    temp: { unit: '°C', decimals: 1, yPad: 5, thresholdBands: TEMP_BANDS },
    humidity: { unit: '%', decimals: 1, thresholdBands: HUMIDITY_BANDS },
    tvoc: { unit: 'ppb', decimals: 0, yMin: 0, thresholdBands: TVOC_BANDS },
    battery: { unit: '%', decimals: 0, yMin: 0, yMax: 100, thresholdBands: BATT_BANDS, showLegend: true },
    current: { unit: 'mA', decimals: 0, yPad: 50 }
  };

  function seriesFor(key, trends) {
    const series = [];
    if (!trends) return series;
    const push = (name, colorKey, values) => {
      if (hasData(values)) series.push({ name, color: SERIES_COLORS[colorKey], values });
    };
    switch (key) {
      case 'eco2':
        push('ENS eCO₂', 'ensEco2', trends.ensEco2s);
        break;
      case 'temp':
        push('AHT Temp', 'ahtTemp', trends.ahtTemps);
        push('RTC Temp', 'rtcTemp', trends.rtcTemps);
        push('BME Temp', 'bmeTemp', trends.bmeTemps);
        break;
      case 'humidity':
        push('AHT RH', 'ahtHumidity', trends.ahtHumidities);
        push('BME RH', 'bmeHumidity', trends.bmeHumidities);
        break;
      case 'tvoc':
        push('TVOC', 'tvoc', trends.ensTvocs);
        break;
      case 'battery':
        push('Battery %', 'battPct', trends.inaBattPcts);
        if (hasData(trends.inaBusVs)) {
          series.push({ name: 'Bus V (scaled)', color: SERIES_COLORS.battBusV, values: trends.inaBusVs.map(scaleBusV) });
        }
        break;
      case 'current':
        push('Current (mA)', 'battCurrent', trends.inaCurrentMas);
        break;
    }
    return series;
  }

  // ── Universal range + trend/battery panels ───────────────────────────────

  const charts = {};
  const chartExpanded = {};
  let universalRange = '1h';
  let latestTrends = null;

  const universalRangeBars = Array.from(main.querySelectorAll('[data-universal-range-bar]'));

  function buildRangeBar(container, keys, activeKey, onSelect) {
    container.innerHTML = '';
    keys.forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'range-btn' + (key === activeKey ? ' active' : '');
      btn.dataset.rangeKey = key;
      btn.textContent = key;
      btn.addEventListener('click', () => onSelect(key));
      container.appendChild(btn);
    });
  }

  function setActiveRange(containers, key) {
    containers.forEach((bar) => {
      bar.querySelectorAll('.range-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.rangeKey === key);
      });
    });
  }

  function setChartEmpty(key, message) {
    const emptyEl = main.querySelector(`[data-chart-empty="${key}"]`);
    const chartEl = main.querySelector(`[data-chart="${key}"]`);
    if (!emptyEl || !chartEl) return;
    if (message) {
      emptyEl.textContent = message;
      emptyEl.hidden = false;
      chartEl.style.display = 'none';
    } else {
      emptyEl.hidden = true;
      chartEl.style.display = '';
    }
  }

  function renderTrendCharts() {
    Object.keys(CHART_CONFIGS).forEach((key) => {
      const series = seriesFor(key, latestTrends);
      if (!latestTrends || !latestTrends.timestamps || !latestTrends.timestamps.length || !series.length) {
        setChartEmpty(key, 'No data yet for this time range.');
        return;
      }
      setChartEmpty(key, null);
      charts[key].update(latestTrends.timestamps, series, universalRange);
      charts[key].resize();
    });
  }

  async function refreshTrends() {
    const hours = RANGE_FETCH_HOURS[universalRange] ?? 25;
    try {
      latestTrends = await fetchTrends(hours);
      renderTrendCharts();
    } catch (err) {
      latestTrends = null;
      Object.keys(CHART_CONFIGS).forEach((key) => setChartEmpty(key, errorMessage(err)));
    }
  }

  function selectUniversalRange(key) {
    universalRange = key;
    setActiveRange(universalRangeBars, key);
    refreshTrends();
  }

  universalRangeBars.forEach((bar) =>
    buildRangeBar(bar, TREND_RANGE_KEYS, universalRange, selectUniversalRange)
  );

  Object.keys(CHART_CONFIGS).forEach((key) => {
    const el = main.querySelector(`[data-chart="${key}"]`);
    el.style.height = `${COLLAPSED_HEIGHT[key]}px`;
    charts[key] = makeTrendChart(el, { ...CHART_CONFIGS[key], range: universalRange });
    chartExpanded[key] = false;
  });

  main.querySelectorAll('[data-expand]').forEach((btn) => {
    const key = btn.dataset.expand;
    if (key === 'map') return; // handled by the map section
    btn.addEventListener('click', () => {
      chartExpanded[key] = !chartExpanded[key];
      btn.textContent = chartExpanded[key] ? '⊟' : '⊞';
      btn.setAttribute('aria-pressed', String(chartExpanded[key]));
      charts[key].setHeight(chartExpanded[key] ? EXPANDED_HEIGHT[key] : COLLAPSED_HEIGHT[key]);
    });
  });

  window.addEventListener('resize', () => {
    Object.values(charts).forEach((chart) => chart.resize());
  });

  // ── Location / Route map (port of LocationMap.vue) ───────────────────────

  const mapSection = main.querySelector('#location');
  const mapTitleEl = mapSection.querySelector('[data-map-title]');
  const mapOuter = mapSection.querySelector('.map-outer');
  const mapEl = document.getElementById('turtleRouteMap');
  const mapEmptyEl = mapSection.querySelector('[data-map-empty]');
  const mapLoadingEl = mapSection.querySelector('[data-map-loading]');
  const mapMetaEl = mapSection.querySelector('[data-map-meta]');
  const routeSliderWrap = mapSection.querySelector('[data-route-slider-wrap]');
  const routeSlider = mapSection.querySelector('[data-route-slider]');
  const routeSliderValue = mapSection.querySelector('[data-route-slider-value]');
  const mapExpandBtn = mapSection.querySelector('[data-expand="map"]');

  let gpsMode = 'location';
  let mapExpanded = true;
  let mapObj = null;
  let locationMarker = null;
  let routeLine = null;
  let routeMarkers = [];
  let lastLocation = parseLocation(main.dataset.lastLat, main.dataset.lastLng);
  let lastLocationAt = null;
  let routeDebounceTimer = null;
  let routeHours = ROUTE_SLIDER_STEPS[Number(routeSlider.value)].hours;

  function parseLocation(lat, lng) {
    const la = Number(lat);
    const lo = Number(lng);
    if (Number.isFinite(la) && Number.isFinite(lo) && (la !== 0 || lo !== 0)) {
      return [la, lo];
    }
    return null;
  }

  function ensureMap(center) {
    if (mapObj) return;
    mapObj = L.map(mapEl, { zoomControl: true, scrollWheelZoom: false }).setView(center, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(mapObj);
  }

  function clearRouteLayers() {
    if (routeLine) { routeLine.remove(); routeLine = null; }
    routeMarkers.forEach((m) => m.remove());
    routeMarkers = [];
  }

  function clearLocationLayer() {
    if (locationMarker) { locationMarker.remove(); locationMarker = null; }
  }

  function setMapEmpty(message) {
    if (message) {
      mapEmptyEl.textContent = message;
      mapEmptyEl.hidden = false;
      mapEl.style.display = 'none';
    } else {
      mapEmptyEl.hidden = true;
      mapEl.style.display = '';
    }
  }

  function renderLocationMode() {
    if (!lastLocation) {
      setMapEmpty('No GPS location received yet.');
      mapMetaEl.textContent = '';
      return;
    }
    setMapEmpty(null);
    ensureMap(lastLocation);
    clearRouteLayers();
    clearLocationLayer();
    mapObj.invalidateSize();
    mapObj.setView(lastLocation, mapObj.getZoom() || 15);
    locationMarker = L.marker(lastLocation)
      .addTo(mapObj)
      .bindPopup(`<b>${turtleName}</b><br>${lastLocation[0].toFixed(6)}, ${lastLocation[1].toFixed(6)}`);
    const asOf = lastLocationAt ? ` · As of: ${lastLocationAt}` : '';
    mapMetaEl.innerHTML =
      `<span class="location-coord"><strong>Lat:</strong> ${lastLocation[0].toFixed(6)}°</span> ` +
      `<span class="location-coord"><strong>Lon:</strong> ${lastLocation[1].toFixed(6)}°</span>${asOf}`;
  }

  function routeCoordsFrom(trends) {
    const lats = (trends && trends.lats) || [];
    const lons = (trends && trends.lons) || [];
    const timestamps = (trends && trends.timestamps) || [];
    const pairs = [];
    for (let i = 0; i < Math.min(lats.length, lons.length); i++) {
      const lat = Number(lats[i]);
      const lon = Number(lons[i]);
      if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
        pairs.push([lat, lon, timestamps[i] != null ? timestamps[i] : null]);
      }
    }
    return pairs;
  }

  async function renderRouteMode() {
    mapLoadingEl.hidden = false;
    let coords = [];
    try {
      const trends = await fetchTrends(routeHours);
      coords = routeCoordsFrom(trends);
    } catch (err) {
      mapLoadingEl.hidden = true;
      setMapEmpty(errorMessage(err));
      mapMetaEl.textContent = '';
      return;
    }
    mapLoadingEl.hidden = true;
    if (gpsMode !== 'route') return;

    if (!coords.length) {
      setMapEmpty('No GPS route data in this time range.');
      mapMetaEl.textContent = '';
      return;
    }
    setMapEmpty(null);
    ensureMap(coords[coords.length - 1]);
    clearRouteLayers();
    clearLocationLayer();
    mapObj.invalidateSize();

    const latLons = coords.map((c) => [c[0], c[1]]);
    routeLine = L.polyline(latLons, { color: '#3b82f6', weight: 3, opacity: 0.85 }).addTo(mapObj);

    coords.forEach((coord, i) => {
      const lat = coord[0];
      const lon = coord[1];
      const ts = coord[2];
      const isFirst = i === 0 && coords.length > 1;
      const isLast = i === coords.length - 1;
      const label = isFirst ? 'Start' : isLast ? 'Latest' : `Waypoint ${i + 1}`;
      const timeStr = ts != null ? fmtTimeFull.format(new Date(Number(ts) * 1000)) : '—';
      const popup = `<div style="font-size:12px;line-height:1.6"><b>${label}</b><br>${timeStr}<br>${lat.toFixed(6)}°, ${lon.toFixed(6)}°</div>`;
      const marker = L.circleMarker([lat, lon], {
        radius: isFirst ? 6 : isLast ? 7 : 4,
        fillColor: isFirst ? '#22c55e' : isLast ? '#3b82f6' : '#94a3b8',
        fillOpacity: isFirst || isLast ? 1 : 0.75,
        color: '#fff',
        weight: 2
      }).addTo(mapObj).bindPopup(popup);
      routeMarkers.push(marker);
    });

    mapObj.fitBounds(routeLine.getBounds(), { padding: [24, 24] });
    mapMetaEl.innerHTML =
      `<strong>${coords.length}</strong> GPS point${coords.length !== 1 ? 's' : ''} · green = start, blue = latest`;
  }

  function renderMap() {
    if (gpsMode === 'route') {
      renderRouteMode();
    } else {
      renderLocationMode();
    }
  }

  mapSection.querySelectorAll('[data-gps-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      gpsMode = btn.dataset.gpsMode;
      mapSection.querySelectorAll('[data-gps-mode]').forEach((b) =>
        b.classList.toggle('active', b === btn)
      );
      mapTitleEl.textContent = gpsMode === 'route' ? 'GPS Route' : mapTitleEl.dataset.locationLabel || 'Current Location';
      routeSliderWrap.classList.toggle('route-slider-active', gpsMode === 'route');
      renderMap();
    });
  });

  routeSlider.addEventListener('input', () => {
    const step = ROUTE_SLIDER_STEPS[Number(routeSlider.value)];
    routeSliderValue.textContent = step.label;
    clearTimeout(routeDebounceTimer);
    routeDebounceTimer = setTimeout(() => {
      routeHours = step.hours;
      if (gpsMode === 'route') renderRouteMode();
    }, 400);
  });

  mapExpandBtn.addEventListener('click', () => {
    mapExpanded = !mapExpanded;
    mapExpandBtn.textContent = mapExpanded ? '⊟' : '⊞';
    mapExpandBtn.setAttribute('aria-pressed', String(mapExpanded));
    mapOuter.classList.toggle('map-outer--expanded', mapExpanded);
    setTimeout(() => mapObj && mapObj.invalidateSize(), 260);
  });

  // ── Latest Telemetry refresher ───────────────────────────────────────────

  const aqiBanner = main.querySelector('[data-aqi-banner]');
  const aqiEmojiEl = main.querySelector('[data-aqi-emoji]');
  const aqiLabelEl = main.querySelector('[data-aqi-label]');
  const latestMetaEl = main.querySelector('[data-latest-meta]');

  function updateAqiBanner(aqi) {
    const rating = aqiRating(aqi);
    if (!rating) {
      aqiBanner.hidden = true;
      return;
    }
    aqiBanner.hidden = false;
    aqiEmojiEl.textContent = rating.emoji;
    aqiLabelEl.textContent = `AQI ${Number(aqi)} — ${rating.label}`;
  }

  function setMetric(key, value, decimals) {
    const el = main.querySelector(`[data-metric="${key}"]`);
    if (el) el.textContent = formatMetric(value, decimals);
  }

  async function refreshLive() {
    let body;
    try {
      const res = await fetch(`/api/turtles/${turtleId}/live`, {
        credentials: 'same-origin',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      body = await res.json();
    } catch (err) {
      return; // keep last-known values on transient failures
    }

    const data = body && body.data;
    if (!data) return;
    const reading = data.reading;
    const values = (reading && reading.values) || {};

    setMetric('eco2', values.ens_eco2, 0);
    setMetric('temp', values.aht_temp != null ? values.aht_temp : values.bme_temp, 1);
    setMetric('humidity', values.aht_humidity != null ? values.aht_humidity : values.bme_humidity, 1);
    setMetric('aqi', values.ens_aqi, 0);
    setMetric('batt', values.ina_batt_pct, 0);
    setMetric('busv', values.ina_bus_v, 2);
    updateAqiBanner(values.ens_aqi);

    if (reading) {
      latestMetaEl.innerHTML =
        `<span><strong>Recorded:</strong> ${reading.timestamp || '—'}</span> ` +
        `<span><strong>Connection:</strong> ${reading.connection || '—'}</span>`;
      const coords = parseLocation(reading.latitude, reading.longitude) ||
        parseLocation(data.turtle && data.turtle.last_lat, data.turtle && data.turtle.last_lng);
      if (coords) {
        lastLocation = coords;
        lastLocationAt = reading.timestamp || null;
        if (gpsMode === 'location') renderLocationMode();
      }
    }
  }

  setInterval(refreshLive, 60000);

  // ── Latest Packets panel ─────────────────────────────────────────────────

  const packetsSection = main.querySelector('#packets');
  const packetRangeBar = packetsSection.querySelector('[data-packet-range-bar]');
  const packetsStatus = packetsSection.querySelector('[data-packets-status]');
  const packetsContent = packetsSection.querySelector('[data-packets-content]');
  const packetsBody = packetsSection.querySelector('[data-packets-body]');
  const packetSummary = packetsSection.querySelector('[data-packet-summary]');
  const selectAllBox = packetsSection.querySelector('[data-select-all]');
  const bulkActions = packetsSection.querySelector('[data-bulk-actions]');
  const selectedCountEl = packetsSection.querySelector('[data-selected-count]');
  const deleteBtn = packetsSection.querySelector('[data-delete-selected]');
  const clearSelectionBtn = packetsSection.querySelector('[data-clear-selection]');
  const deleteErrorEl = packetsSection.querySelector('[data-delete-error]');
  const pagePrevBtn = packetsSection.querySelector('[data-page-prev]');
  const pageNextBtn = packetsSection.querySelector('[data-page-next]');
  const pageInfoEl = packetsSection.querySelector('[data-page-info]');

  let packetRange = '24h';
  let packetPage = 0;
  let packetPerPage = 10;
  let allPackets = [];
  const selectedPacketIds = new Set();

  buildRangeBar(packetRangeBar, PACKET_RANGE_KEYS, packetRange, (key) => {
    packetRange = key;
    packetPage = 0;
    setActiveRange([packetRangeBar], key);
    refreshPackets();
  });

  function packetsFromTrends(trends) {
    if (!trends || !Array.isArray(trends.timestamps)) return [];
    const packets = [];
    for (let i = 0; i < trends.timestamps.length; i++) {
      packets.push({
        id: trends.ids ? trends.ids[i] : null,
        ts: trends.timestamps[i],
        ensEco2: trends.ensEco2s && trends.ensEco2s[i],
        ahtTemp: trends.ahtTemps && trends.ahtTemps[i],
        rtcTemp: trends.rtcTemps && trends.rtcTemps[i],
        bmeTemp: trends.bmeTemps && trends.bmeTemps[i],
        humidity: trends.ahtHumidities && trends.ahtHumidities[i] != null
          ? trends.ahtHumidities[i]
          : trends.bmeHumidities && trends.bmeHumidities[i],
        tvoc: trends.ensTvocs && trends.ensTvocs[i],
        battPct: trends.inaBattPcts && trends.inaBattPcts[i],
        lat: trends.lats && trends.lats[i],
        lon: trends.lons && trends.lons[i]
      });
    }
    packets.reverse(); // newest first
    return packets;
  }

  const totalPacketPages = () => Math.max(1, Math.ceil(allPackets.length / packetPerPage));

  function updateBulkUi() {
    const count = selectedPacketIds.size;
    bulkActions.hidden = count === 0;
    selectedCountEl.textContent = `${count} selected`;
    deleteErrorEl.hidden = true;
  }

  function renderPackets() {
    const pages = totalPacketPages();
    if (packetPage >= pages) packetPage = pages - 1;
    const start = packetPage * packetPerPage;
    const pageRows = allPackets.slice(start, start + packetPerPage);

    packetsBody.innerHTML = '';
    pageRows.forEach((pkt) => {
      const tr = document.createElement('tr');
      if (pkt.id != null && selectedPacketIds.has(pkt.id)) tr.classList.add('selected-row');

      const checkTd = document.createElement('td');
      checkTd.className = 'check-cell';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.disabled = pkt.id == null;
      box.checked = pkt.id != null && selectedPacketIds.has(pkt.id);
      box.addEventListener('change', () => {
        if (box.checked) selectedPacketIds.add(pkt.id);
        else selectedPacketIds.delete(pkt.id);
        tr.classList.toggle('selected-row', box.checked);
        syncSelectAllBox(pageRows);
        updateBulkUi();
      });
      checkTd.appendChild(box);
      tr.appendChild(checkTd);

      const cells = [
        { text: formatPacketTimeShort(pkt.ts), cls: 'packet-time', title: formatPacketTime(pkt.ts) },
        { text: formatPacketValue(pkt.ensEco2, 0) },
        { text: formatPacketValue(pkt.ahtTemp, 1) },
        { text: formatPacketValue(pkt.rtcTemp, 1) },
        { text: formatPacketValue(pkt.bmeTemp, 1) },
        { text: formatPacketValue(pkt.humidity, 1) },
        { text: formatPacketValue(pkt.tvoc, 0) },
        { text: formatPacketValue(pkt.battPct, 0) },
        { text: pkt.lat != null ? Number(pkt.lat).toFixed(4) : '—', cls: 'packet-coord' },
        { text: pkt.lon != null ? Number(pkt.lon).toFixed(4) : '—', cls: 'packet-coord' }
      ];
      cells.forEach((cell) => {
        const td = document.createElement('td');
        td.textContent = cell.text;
        if (cell.cls) td.className = cell.cls;
        if (cell.title) td.title = cell.title;
        tr.appendChild(td);
      });
      packetsBody.appendChild(tr);
    });

    packetSummary.textContent = `${allPackets.length} total · page ${packetPage + 1} of ${pages}`;
    pageInfoEl.textContent = `${packetPage + 1} / ${pages}`;
    pagePrevBtn.disabled = packetPage === 0;
    pageNextBtn.disabled = packetPage >= pages - 1;
    syncSelectAllBox(pageRows);
    updateBulkUi();
  }

  function syncSelectAllBox(pageRows) {
    const selectable = pageRows.filter((p) => p.id != null);
    selectAllBox.checked =
      selectable.length > 0 && selectable.every((p) => selectedPacketIds.has(p.id));
  }

  selectAllBox.addEventListener('change', () => {
    const start = packetPage * packetPerPage;
    const pageRows = allPackets.slice(start, start + packetPerPage);
    pageRows.forEach((pkt) => {
      if (pkt.id == null) return;
      if (selectAllBox.checked) selectedPacketIds.add(pkt.id);
      else selectedPacketIds.delete(pkt.id);
    });
    renderPackets();
  });

  clearSelectionBtn.addEventListener('click', () => {
    selectedPacketIds.clear();
    renderPackets();
  });

  deleteBtn.addEventListener('click', async () => {
    const ids = Array.from(selectedPacketIds);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} telemetry packet${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) {
      return;
    }
    deleteBtn.disabled = true;
    try {
      const res = await fetch(`/api/telemetry/${turtleId}/readings`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || body.success !== true) {
        throw new Error((body && body.message) || `HTTP ${res.status}`);
      }
      selectedPacketIds.clear();
      clearTrendsCache();
      await Promise.all([refreshPackets(), refreshTrends()]);
      if (gpsMode === 'route') renderRouteMode();
    } catch (err) {
      deleteErrorEl.textContent = `Delete failed: ${err.message}`;
      deleteErrorEl.hidden = false;
    } finally {
      deleteBtn.disabled = false;
    }
  });

  pagePrevBtn.addEventListener('click', () => {
    if (packetPage > 0) {
      packetPage--;
      renderPackets();
    }
  });

  pageNextBtn.addEventListener('click', () => {
    if (packetPage < totalPacketPages() - 1) {
      packetPage++;
      renderPackets();
    }
  });

  packetsSection.querySelectorAll('[data-per-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      packetPerPage = Number(btn.dataset.perPage);
      packetPage = 0;
      packetsSection.querySelectorAll('[data-per-page]').forEach((b) =>
        b.classList.toggle('active', b === btn)
      );
      renderPackets();
    });
  });

  async function refreshPackets() {
    packetsStatus.hidden = false;
    packetsStatus.textContent = 'Loading…';
    try {
      const trends = await fetchTrends(PACKET_RANGE_HOURS[packetRange] ?? 24);
      allPackets = packetsFromTrends(trends);
    } catch (err) {
      packetsStatus.textContent = errorMessage(err);
      packetsContent.hidden = true;
      return;
    }
    if (!allPackets.length) {
      packetsStatus.textContent = 'No packets in this time range.';
      packetsContent.hidden = true;
      return;
    }
    packetsStatus.hidden = true;
    packetsContent.hidden = false;
    renderPackets();
  }

  // ── Theme change → restyle charts ────────────────────────────────────────

  new MutationObserver(() => {
    Object.values(charts).forEach((chart) => chart.rerender());
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ── Init ─────────────────────────────────────────────────────────────────

  mapTitleEl.dataset.locationLabel = mapTitleEl.textContent.trim();
  refreshTrends();
  renderMap();
  refreshLive();
  refreshPackets();
})();
