import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MapLibreMap, Marker, Popup, NavigationControl, ScaleControl, addProtocol, setWorkerUrl } from 'maplibre-gl';
import './style.css';
import { registerProtocols, getElevation, getProfile, distanceMeters } from './dem.js';
import { setReliefSettings, PALETTES, cssColorAt } from './palette.js';
import { SPOTS, ERAS, KINDS, WARDS } from './data/spots.js';
import { TERRAIN_LABELS } from './data/terrain.js';
import { renderProfile } from './profile.js';

setWorkerUrl(new URL('vendor/maplibre/maplibre-gl-worker.mjs', document.baseURI).href);
registerProtocols({ addProtocol });

const GSI = 'https://cyberjapandata.gsi.go.jp/xyz';
const GSI_ATTR = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>';
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------------------------------------------------------------- 設定

const BASES = {
  pale: { label: '淡色', url: `${GSI}/pale/{z}/{x}/{y}.png`, minzoom: 5, maxzoom: 18 },
  std: { label: '標準', url: `${GSI}/std/{z}/{x}/{y}.png`, minzoom: 5, maxzoom: 18 },
  photo: { label: '写真', url: `${GSI}/seamlessphoto/{z}/{x}/{y}.jpg`, minzoom: 2, maxzoom: 18 },
  none: { label: 'なし' },
};

const HISTORY = {
  none: { label: 'なし' },
  riku: {
    label: '1936〜42年 空中写真', url: `${GSI}/ort_riku10/{z}/{x}/{y}.png`, maxzoom: 17,
    note: '戦前に陸軍が撮影した空中写真。震災復興を終えた戦前の東京の姿。',
  },
  usa: {
    label: '1945〜50年 米軍撮影', url: `${GSI}/ort_USA10/{z}/{x}/{y}.png`, maxzoom: 17,
    note: '終戦直後に米軍が撮影。空襲で焼け野原になった街や、まだ残る川・堀がわかる。',
  },
  old: {
    label: '1961〜69年 空中写真', url: `${GSI}/ort_old10/{z}/{x}/{y}.png`, maxzoom: 17,
    note: '高度成長期。東京オリンピック前後で、川の暗渠化や埋立・首都高建設が進む時代。',
  },
  gazo1: {
    label: '1974〜78年 空中写真', url: `${GSI}/gazo1/{z}/{x}/{y}.jpg`, maxzoom: 17,
    note: 'カラーの空中写真。湾岸の埋立地が広がっていく様子が見える。',
  },
  swale: {
    label: '明治期の低湿地', url: `${GSI}/swale/{z}/{x}/{y}.png`, maxzoom: 16,
    note: '明治期の地図から読み取った湿地・水田などの低湿地。昔の地形や水害リスクを考える手がかりに。',
  },
  lcm: {
    label: '土地条件図（台地・低地の分類）', url: `${GSI}/lcm25k_2012/{z}/{x}/{y}.png`, maxzoom: 16,
    note: '台地・段丘・低地・盛土地・埋立地などを色分けした国土地理院の地図。凡例は地理院地図で確認できます。',
  },
};

const DEFAULTS = {
  palette: 'vivid', max: 40, sea: 0, step: 0,
  reliefOpacity: 0.8, hillshade: true, shade: 0.75,
  terrain: false, exag: 3,
  base: 'pale', hist: 'none', histOpacity: 0.85,
  spots: true, labels: true, outside: false,
  eras: Object.fromEntries(Object.keys(ERAS).map((k) => [k, true])),
};
const STORE_KEY = 'tokyo-relief-walk:v1';

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { ...DEFAULTS, ...saved, eras: { ...DEFAULTS.eras, ...(saved.eras || {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}
const S = loadSettings();
function saveSettings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch { /* 保存できない環境では無視 */ }
}

// ---------------------------------------------------------------- 地図スタイル

let reliefVersion = 0;
setReliefSettings(S);

function buildStyle() {
  const sources = {
    relief: { type: 'raster', tiles: [`relief://{z}/{x}/{y}?v=0`], tileSize: 256, minzoom: 2, maxzoom: 15, attribution: `標高: ${GSI_ATTR}` },
    'dem-hs': { type: 'raster-dem', tiles: ['gsidem://{z}/{x}/{y}'], tileSize: 256, maxzoom: 15, encoding: 'terrarium' },
    'dem-3d': { type: 'raster-dem', tiles: ['gsidem://{z}/{x}/{y}'], tileSize: 256, maxzoom: 14, encoding: 'terrarium' },
    profile: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  };
  const layers = [{ id: 'bg', type: 'background', paint: { 'background-color': '#dfe6ee' } }];

  for (const [id, b] of Object.entries(BASES)) {
    if (!b.url) continue;
    sources[`base-${id}`] = { type: 'raster', tiles: [b.url], tileSize: 256, minzoom: b.minzoom, maxzoom: b.maxzoom, attribution: GSI_ATTR };
    layers.push({ id: `base-${id}`, type: 'raster', source: `base-${id}`, layout: { visibility: S.base === id ? 'visible' : 'none' } });
  }
  layers.push({ id: 'relief', type: 'raster', source: 'relief', paint: { 'raster-opacity': S.reliefOpacity, 'raster-fade-duration': 0 } });
  for (const [id, h] of Object.entries(HISTORY)) {
    if (!h.url) continue;
    sources[`hist-${id}`] = { type: 'raster', tiles: [h.url], tileSize: 256, minzoom: 10, maxzoom: h.maxzoom, attribution: GSI_ATTR };
    layers.push({ id: `hist-${id}`, type: 'raster', source: `hist-${id}`, layout: { visibility: S.hist === id ? 'visible' : 'none' }, paint: { 'raster-opacity': S.histOpacity } });
  }
  layers.push({
    id: 'hillshade', type: 'hillshade', source: 'dem-hs',
    layout: { visibility: S.hillshade ? 'visible' : 'none' },
    paint: {
      'hillshade-exaggeration': S.shade,
      'hillshade-shadow-color': '#24163a',
      'hillshade-highlight-color': 'rgba(255,255,255,0.55)',
      'hillshade-accent-color': '#3b2a52',
      'hillshade-illumination-direction': 315,
    },
  });
  layers.push(
    { id: 'profile-line-casing', type: 'line', source: 'profile', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 } },
    { id: 'profile-line', type: 'line', source: 'profile', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#111827', 'line-width': 3, 'line-dasharray': [2, 1] } },
    { id: 'profile-pts', type: 'circle', source: 'profile', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#111827', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } },
  );
  return {
    version: 8,
    sources,
    layers,
    sky: {
      'sky-color': '#86b6ea',
      'horizon-color': '#f4dcc8',
      'fog-color': '#eef2f7',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.7,
      'fog-ground-blend': 0.85,
    },
  };
}

const isWide = () => window.matchMedia('(min-width: 820px)').matches;

const map = new MapLibreMap({
  container: 'map',
  style: buildStyle(),
  center: [139.745, 35.69],
  zoom: isWide() ? 13 : 12.4,
  minZoom: 9.5,
  maxZoom: 18,
  maxPitch: 80,
  maxBounds: [[139.3, 35.42], [140.15, 35.95]],
  hash: 'map',
  attributionControl: { compact: true },
});
if (import.meta.env.DEV) window.__map = map;
map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');
map.addControl(new ScaleControl({ maxWidth: 110 }), 'bottom-right');
map.on('error', (e) => {
  if (e?.error?.status === 404) return; // 範囲外のタイルは無視
  console.warn(e?.error || e);
});

// ---------------------------------------------------------------- 起伏表現の更新

let reliefTimer = 0;
function refreshRelief() {
  setReliefSettings(S);
  updateLegend();
  clearTimeout(reliefTimer);
  reliefTimer = setTimeout(() => {
    reliefVersion++;
    map.getSource('relief')?.setTiles([`relief://{z}/{x}/{y}?v=${reliefVersion}`]);
  }, 120);
}

function applyLayerSettings() {
  if (!map.isStyleLoaded()) return;
  for (const id of Object.keys(BASES)) {
    if (BASES[id].url) map.setLayoutProperty(`base-${id}`, 'visibility', S.base === id ? 'visible' : 'none');
  }
  for (const id of Object.keys(HISTORY)) {
    if (!HISTORY[id].url) continue;
    map.setLayoutProperty(`hist-${id}`, 'visibility', S.hist === id ? 'visible' : 'none');
    map.setPaintProperty(`hist-${id}`, 'raster-opacity', S.histOpacity);
  }
  map.setPaintProperty('relief', 'raster-opacity', S.reliefOpacity);
  map.setLayoutProperty('hillshade', 'visibility', S.hillshade ? 'visible' : 'none');
  map.setPaintProperty('hillshade', 'hillshade-exaggeration', S.shade);
  map.setPaintProperty('bg', 'background-color', S.palette === 'night' ? '#05060f' : '#dfe6ee');
  document.body.classList.toggle('night', S.palette === 'night');
}

function applyTerrain(animate = true) {
  $('#btn-3d').classList.toggle('on', S.terrain);
  if (S.terrain) {
    map.setTerrain({ source: 'dem-3d', exaggeration: S.exag });
    if (animate && map.getPitch() < 30) map.easeTo({ pitch: 62, duration: 900 });
  } else {
    map.setTerrain(null);
    if (animate) map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
  }
}

// ---------------------------------------------------------------- 凡例

function updateLegend() {
  const el = $('#legend');
  const n = 14;
  const stops = [];
  for (let i = 0; i <= n; i++) stops.push(`${cssColorAt(S.palette, (S.max * i) / n, S.max)} ${(i / n) * 100}%`);
  const below = cssColorAt(S.palette, -2, S.max);
  el.innerHTML = `
    <div class="legend-title">標高（m）${S.sea > 0 ? `<span class="legend-sea">海面 +${S.sea}m</span>` : ''}</div>
    <div class="legend-bar">
      <span class="legend-below" style="background:${below}" title="0m未満"></span>
      <span class="legend-grad" style="background:linear-gradient(90deg, ${stops.join(',')})"></span>
    </div>
    <div class="legend-ticks"><span>&lt;0</span><span>0</span><span>${Math.round(S.max / 2)}</span><span>${S.max}+</span></div>`;
}
$('#legend').addEventListener('click', () => openLayersPanel());

// ---------------------------------------------------------------- トースト

let toastTimer = 0;
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.innerHTML = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  if (ms > 0) toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
function hideToast() { $('#toast').hidden = true; }

// ---------------------------------------------------------------- シート（下から出るパネル / PCでは左パネル）

const sheet = $('#sheet');
const sheetBody = $('#sheet-body');
let sheetMode = null;

function openSheet(mode, html) {
  sheetMode = mode;
  sheet.dataset.mode = mode;
  if (mode !== 'spot') setActiveSpot(null);
  sheetBody.innerHTML = html;
  sheetBody.scrollTop = 0;
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('sheet-open');
  return sheetBody;
}
function closeSheet() {
  sheet.classList.remove('open', 'expanded');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('sheet-open');
  if (sheetMode === 'profile') clearProfile();
  sheetMode = null;
  setActiveSpot(null);
}
$('#sheet-close').addEventListener('click', closeSheet);
$('#sheet-grip').addEventListener('click', () => sheet.classList.toggle('expanded'));

function mapPadding() {
  if (!sheet.classList.contains('open')) return { top: 0, bottom: 0, left: 0, right: 0 };
  if (isWide()) return { left: sheet.offsetWidth + 16, top: 0, bottom: 0, right: 0 };
  return { bottom: sheet.offsetHeight, top: 0, left: 0, right: 0 };
}

// ---------------------------------------------------------------- スポットのマーカー

const spotMarkers = new Map();
let activeSpotId = null;

function spotVisible(s) {
  return S.spots && S.eras[s.era] && (S.outside || s.ward !== '23区外');
}

for (const s of SPOTS) {
  const el = document.createElement('button');
  el.className = 'spot';
  el.type = 'button';
  el.style.setProperty('--c', ERAS[s.era].color);
  el.innerHTML = `<span class="spot-dot">${KINDS[s.kind].icon}</span><span class="spot-name">${esc(s.name)}</span>`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    openSpot(s);
  });
  const m = new Marker({ element: el, anchor: 'left', offset: [-14, 0] }).setLngLat([s.lng, s.lat]).addTo(map);
  spotMarkers.set(s.id, m);
}

function refreshSpotMarkers() {
  for (const s of SPOTS) spotMarkers.get(s.id).getElement().hidden = !spotVisible(s);
}

function setActiveSpot(id) {
  if (activeSpotId) spotMarkers.get(activeSpotId)?.getElement().classList.remove('active');
  activeSpotId = id;
  if (id) spotMarkers.get(id)?.getElement().classList.add('active');
}

// ---------------------------------------------------------------- 地形ラベル

const terrainMarkers = TERRAIN_LABELS.map((t) => {
  const el = document.createElement('div');
  el.className = `tl tl-${t.type}`;
  el.textContent = t.name;
  return { t, m: new Marker({ element: el }).setLngLat([t.lng, t.lat]).addTo(map) };
});

function refreshTerrainLabels() {
  const z = map.getZoom();
  for (const { t, m } of terrainMarkers) {
    m.getElement().hidden = !S.labels || z < t.minZoom || (t.maxZoom != null && z > t.maxZoom);
  }
}

function onZoom() {
  const z = map.getZoom();
  const c = map.getContainer();
  c.classList.toggle('z-names', z >= 14.6);
  c.classList.toggle('z-far', z < 11.8);
  refreshTerrainLabels();
}
map.on('zoom', onZoom);

// ---------------------------------------------------------------- 現在地

let userPos = null;
let userMarker = null;
let watchId = null;

function startLocate() {
  if (!('geolocation' in navigator)) {
    toast('この端末では現在地を取得できません');
    return;
  }
  if (watchId != null && userPos) {
    map.flyTo({ center: userPos, zoom: Math.max(map.getZoom(), 16), padding: mapPadding() });
    showUserElevation();
    return;
  }
  toast('現在地を取得しています…', 0);
  let first = true;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      userPos = [pos.coords.longitude, pos.coords.latitude];
      if (!userMarker) {
        const el = document.createElement('div');
        el.className = 'me';
        userMarker = new Marker({ element: el }).setLngLat(userPos).addTo(map);
      } else {
        userMarker.setLngLat(userPos);
      }
      $('#btn-locate').classList.add('on');
      if (first) {
        first = false;
        map.flyTo({ center: userPos, zoom: Math.max(map.getZoom(), 16), padding: mapPadding() });
        showUserElevation();
      }
    },
    (err) => {
      watchId = null;
      toast(err.code === 1 ? '位置情報の利用が許可されていません' : '現在地を取得できませんでした');
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
  );
}

async function showUserElevation() {
  if (!userPos) return;
  const h = await getElevation(userPos[0], userPos[1]).catch(() => null);
  const near = nearestSpots(userPos, 1)[0];
  toast(`現在地の標高 <b>${h == null ? '—' : h.toFixed(1)}m</b>${near ? `<br>近くのスポット：${esc(near.s.name)}（${fmtDist(near.d)}）` : ''}`, 5000);
}

// ---------------------------------------------------------------- 距離・近傍

function fmtDist(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;
}

function nearestSpots(lngLat, n, exceptId) {
  return SPOTS.filter((s) => s.id !== exceptId && spotVisible(s))
    .map((s) => ({ s, d: distanceMeters(lngLat, [s.lng, s.lat]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
}

// ---------------------------------------------------------------- 地点の標高（タップ）

function describeElevation(h) {
  if (h == null) return '水域（川・海・池）';
  if (h < 0) return '海面より低い土地（ゼロメートル地帯）';
  if (h < 5) return '低地（下町・川沿い・埋立地など）';
  if (h < 15) return '低地〜台地の斜面・谷筋';
  if (h < 60) return '台地の上';
  return '台地・丘陵';
}

const probePopup = new Popup({ closeButton: false, className: 'probe', maxWidth: '260px', offset: 10 });

map.on('click', async (e) => {
  const target = e.originalEvent?.target;
  if (target?.closest?.('.spot, .tl')) return;
  if (profile.active) {
    addProfilePoint([e.lngLat.lng, e.lngLat.lat]);
    return;
  }
  const { lng, lat } = e.lngLat;
  probePopup.setLngLat(e.lngLat).setHTML('<div class="probe-body">標高を取得中…</div>').addTo(map);
  const h = await getElevation(lng, lat).catch(() => null);
  const near = nearestSpots([lng, lat], 1)[0];
  const sw = h == null ? 'var(--water)' : cssColorAt(S.palette, h, S.max);
  probePopup.setHTML(`
    <div class="probe-body">
      <div class="probe-h"><span class="probe-sw" style="background:${sw}"></span>
        <b>${h == null ? '—' : `${h.toFixed(1)}<small>m</small>`}</b></div>
      <div class="probe-desc">${describeElevation(h)}<span class="muted">（目安）</span></div>
      ${near && near.d < 800 ? `<button class="probe-near" data-id="${near.s.id}">近く：${esc(near.s.name)} <span class="muted">${fmtDist(near.d)}</span></button>` : ''}
    </div>`);
  probePopup.getElement()?.querySelector('.probe-near')?.addEventListener('click', (ev) => {
    const s = SPOTS.find((x) => x.id === ev.currentTarget.dataset.id);
    probePopup.remove();
    openSpot(s);
  });
});

// ---------------------------------------------------------------- スポット詳細

async function openSpot(s, { fly = true } = {}) {
  probePopup.remove();
  setActiveSpot(s.id);
  const era = ERAS[s.era];
  const kind = KINDS[s.kind];
  const near = nearestSpots([s.lng, s.lat], 4, s.id);
  const body = openSheet('spot', `
    <article class="spot-detail">
      <div class="chips">
        <span class="chip era" style="--c:${era.color}">${era.label}</span>
        <span class="chip">${kind.icon} ${kind.label}</span>
        <span class="chip ghost">${s.ward === '23区外' ? '23区外' : `${s.ward}区`}</span>
      </div>
      <h2>${esc(s.name)}</h2>
      <div class="meta">
        <span class="year">${esc(s.year)}</span>
        <span class="elev" id="spot-elev"><span class="probe-sw"></span>標高 …</span>
      </div>
      <p class="story">${esc(s.text)}</p>
      <div class="terrain-note">
        <h3>地形の見どころ</h3>
        <p>${esc(s.terrain)}</p>
      </div>
      <div class="actions">
        <button class="btn" data-act="profile">ここから断面を測る</button>
        <a class="btn ghost" href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}" target="_blank" rel="noopener">Googleマップで開く</a>
      </div>
      ${near.length ? `<h3 class="near-title">近くのスポット</h3>
      <ul class="spot-list compact">${near.map(({ s: n, d }) => spotRow(n, fmtDist(d))).join('')}</ul>` : ''}
      <p class="fine">※ 位置はおおよその地点です。内容は一般的な通説・伝承を含みます。</p>
    </article>`);
  bindSpotRows(body);
  body.querySelector('[data-act="profile"]').addEventListener('click', () => {
    startProfile([s.lng, s.lat]);
  });
  if (fly) {
    map.flyTo({ center: [s.lng, s.lat], zoom: Math.max(map.getZoom(), 15.4), padding: mapPadding(), duration: 1200, essential: true });
  }
  const h = await getElevation(s.lng, s.lat).catch(() => null);
  const el = body.querySelector('#spot-elev');
  if (el && activeSpotId === s.id) {
    el.innerHTML = `<span class="probe-sw" style="background:${h == null ? 'var(--water)' : cssColorAt(S.palette, h, S.max)}"></span>標高 <b>${h == null ? '—' : h.toFixed(1)}</b>m`;
  }
}

function spotRow(s, right = '') {
  const era = ERAS[s.era];
  return `<li><button class="spot-row" data-id="${s.id}">
    <span class="row-dot" style="--c:${era.color}">${KINDS[s.kind].icon}</span>
    <span class="row-main"><span class="row-name">${esc(s.name)}</span>
      <span class="row-sub">${era.label}・${s.ward === '23区外' ? '23区外' : `${s.ward}区`}・${esc(s.year)}</span></span>
    <span class="row-right">${right}</span></button></li>`;
}

function bindSpotRows(root) {
  root.querySelectorAll('.spot-row').forEach((b) => b.addEventListener('click', () => {
    openSpot(SPOTS.find((x) => x.id === b.dataset.id));
  }));
}

// ---------------------------------------------------------------- スポット一覧

const listState = { q: '', sort: 'near' };

function eraChips() {
  return Object.entries(ERAS).map(([k, e]) =>
    `<button class="chip toggle ${S.eras[k] ? 'on' : ''}" data-era="${k}" style="--c:${e.color}">${e.label}</button>`).join('');
}

function openList() {
  const body = openSheet('list', `
    <div class="list-head">
      <h2>スポット <span class="muted" id="list-count"></span></h2>
      <input type="search" id="list-q" placeholder="名前・区・キーワード（例：暗渠、坂、江戸川）" value="${esc(listState.q)}" />
      <div class="seg" id="list-sort">
        <button data-sort="near">近い順</button>
        <button data-sort="ward">区ごと</button>
        <button data-sort="era">時代順</button>
      </div>
      <div class="chip-row" id="list-eras">${eraChips()}</div>
    </div>
    <div id="list-body"></div>`);
  body.querySelector('#list-q').addEventListener('input', (e) => { listState.q = e.target.value; renderList(); });
  body.querySelectorAll('#list-sort button').forEach((b) => b.addEventListener('click', () => { listState.sort = b.dataset.sort; renderList(); }));
  bindEraChips(body.querySelector('#list-eras'), renderList);
  renderList();
}

function bindEraChips(root, after) {
  root.querySelectorAll('[data-era]').forEach((b) => b.addEventListener('click', () => {
    S.eras[b.dataset.era] = !S.eras[b.dataset.era];
    b.classList.toggle('on', S.eras[b.dataset.era]);
    saveSettings();
    refreshSpotMarkers();
    after?.();
  }));
}

function renderList() {
  const root = $('#list-body');
  if (!root) return;
  sheetBody.querySelectorAll('#list-sort button').forEach((b) => b.classList.toggle('on', b.dataset.sort === listState.sort));
  const q = listState.q.trim().toLowerCase();
  const origin = userPos || map.getCenter().toArray();
  let items = SPOTS.filter(spotVisible).filter((s) => !q
    || [s.name, s.ward, `${s.ward}区`, s.text, s.terrain, s.year, ERAS[s.era].label, KINDS[s.kind].label]
      .some((v) => v.toLowerCase().includes(q)))
    .map((s) => ({ s, d: distanceMeters(origin, [s.lng, s.lat]) }));
  $('#list-count').textContent = `${items.length}件`;

  let html = '';
  if (listState.sort === 'near') {
    items.sort((a, b) => a.d - b.d);
    html = `<p class="list-note">${userPos ? '現在地' : '地図の中心'}から近い順</p>
      <ul class="spot-list">${items.map(({ s, d }) => spotRow(s, fmtDist(d))).join('')}</ul>`;
  } else if (listState.sort === 'ward') {
    const order = [...WARDS, '23区外'];
    for (const w of order) {
      const group = items.filter((x) => x.s.ward === w);
      if (!group.length) continue;
      html += `<h3 class="group-title">${w === '23区外' ? '23区外' : `${w}区`} <span class="muted">${group.length}</span></h3>
        <ul class="spot-list">${group.map(({ s, d }) => spotRow(s, fmtDist(d))).join('')}</ul>`;
    }
  } else {
    for (const [k, e] of Object.entries(ERAS)) {
      const group = items.filter((x) => x.s.era === k);
      if (!group.length) continue;
      html += `<h3 class="group-title" style="--c:${e.color}"><span class="era-bar"></span>${e.label} <span class="muted">${group.length}</span></h3>
        <ul class="spot-list">${group.map(({ s, d }) => spotRow(s, fmtDist(d))).join('')}</ul>`;
    }
  }
  root.innerHTML = html || '<p class="empty">該当するスポットがありません</p>';
  bindSpotRows(root);
}

$('#btn-list').addEventListener('click', openList);

// ---------------------------------------------------------------- 表現パネル

function seg(name, options, current) {
  return `<div class="seg" data-name="${name}">${Object.entries(options)
    .map(([v, label]) => `<button data-v="${v}" class="${String(current) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
}

function openLayersPanel() {
  const body = openSheet('layers', `
    <div class="panel">
      <h2>地図の表現</h2>

      <section>
        <h3>色の付け方</h3>
        ${seg('palette', Object.fromEntries(Object.entries(PALETTES).map(([k, p]) => [k, p.label])), S.palette)}
        <label class="range"><span>色分けする高さ <b id="v-max">0〜${S.max}m</b></span>
          <input type="range" name="max" min="10" max="100" step="5" value="${S.max}" /></label>
        <p class="hint">23区の台地はおおむね20〜40m。範囲を狭めるほど、わずかな高低差がくっきり見えます。</p>
        <div class="field"><span>等高段彩（段々に塗る）</span>
          ${seg('step', { 0: 'なめらか', 1: '1m', 2: '2m', 5: '5m' }, S.step)}</div>
        <label class="range"><span>色の濃さ <b id="v-op">${Math.round(S.reliefOpacity * 100)}%</b></span>
          <input type="range" name="reliefOpacity" min="0" max="1" step="0.05" value="${S.reliefOpacity}" /></label>
      </section>

      <section>
        <h3>陰影（立体感）</h3>
        <label class="switch"><input type="checkbox" name="hillshade" ${S.hillshade ? 'checked' : ''}/><span>陰影を表示</span></label>
        <label class="range"><span>陰影の強さ <b id="v-shade">${Math.round(S.shade * 100)}%</b></span>
          <input type="range" name="shade" min="0" max="1" step="0.05" value="${S.shade}" /></label>
        <label class="range"><span>3D表示の高さ強調 <b id="v-exag">×${S.exag}</b></span>
          <input type="range" name="exag" min="1" max="8" step="0.5" value="${S.exag}" /></label>
      </section>

      <section>
        <h3>背景の地図</h3>
        ${seg('base', Object.fromEntries(Object.entries(BASES).map(([k, b]) => [k, b.label])), S.base)}
      </section>

      <section>
        <h3>昔の東京を重ねる</h3>
        <div class="radio-list">
          ${Object.entries(HISTORY).map(([k, h]) => `
            <label class="radio"><input type="radio" name="hist" value="${k}" ${S.hist === k ? 'checked' : ''}/><span>${h.label}</span></label>`).join('')}
        </div>
        <p class="hint" id="hist-note">${HISTORY[S.hist].note || '空中写真や古い地形の情報を重ねて、今の地形と見比べられます。'}</p>
        <label class="range"><span>重ねる濃さ <b id="v-hop">${Math.round(S.histOpacity * 100)}%</b></span>
          <input type="range" name="histOpacity" min="0.1" max="1" step="0.05" value="${S.histOpacity}" /></label>
      </section>

      <section>
        <h3>表示するもの</h3>
        <label class="switch"><input type="checkbox" name="spots" ${S.spots ? 'checked' : ''}/><span>歴史スポット</span></label>
        <div class="chip-row" id="layer-eras">${eraChips()}</div>
        <label class="switch"><input type="checkbox" name="labels" ${S.labels ? 'checked' : ''}/><span>台地・川の名前</span></label>
        <label class="switch"><input type="checkbox" name="outside" ${S.outside ? 'checked' : ''}/><span>23区外のスポットも表示</span></label>
      </section>

      <p class="fine">地図・標高・空中写真：${GSI_ATTR}（地理院タイル）。標高は5mメッシュ（一部10m）で、建物を除いた地表の高さです。</p>
    </div>`);

  body.querySelectorAll('.seg[data-name]').forEach((g) => g.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const name = g.dataset.name;
    S[name] = name === 'step' ? Number(b.dataset.v) : b.dataset.v;
    g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    if (name === 'palette' || name === 'step') refreshRelief();
    applyLayerSettings();
    saveSettings();
  })));

  body.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => {
    const v = Number(r.value);
    S[r.name] = v;
    if (r.name === 'max') { $('#v-max').textContent = `0〜${v}m`; refreshRelief(); }
    if (r.name === 'reliefOpacity') $('#v-op').textContent = `${Math.round(v * 100)}%`;
    if (r.name === 'shade') $('#v-shade').textContent = `${Math.round(v * 100)}%`;
    if (r.name === 'histOpacity') $('#v-hop').textContent = `${Math.round(v * 100)}%`;
    if (r.name === 'exag') { $('#v-exag').textContent = `×${v}`; if (S.terrain) map.setTerrain({ source: 'dem-3d', exaggeration: v }); }
    applyLayerSettings();
    saveSettings();
  }));

  body.querySelectorAll('input[type=checkbox]').forEach((c) => c.addEventListener('change', () => {
    S[c.name] = c.checked;
    applyLayerSettings();
    refreshSpotMarkers();
    refreshTerrainLabels();
    saveSettings();
  }));

  body.querySelectorAll('input[name=hist]').forEach((r) => r.addEventListener('change', () => {
    S.hist = r.value;
    $('#hist-note').textContent = HISTORY[S.hist].note || '空中写真や古い地形の情報を重ねて、今の地形と見比べられます。';
    applyLayerSettings();
    saveSettings();
    if (S.hist !== 'none' && map.getZoom() < 12) toast('ズームインすると表示されます（ズーム12以上）');
  }));

  bindEraChips(body.querySelector('#layer-eras'));
}

$('#btn-layers').addEventListener('click', () => (sheetMode === 'layers' ? closeSheet() : openLayersPanel()));

// ---------------------------------------------------------------- 海面シミュレーション

function openSeaPanel() {
  const body = openSheet('sea', `
    <div class="panel">
      <h2>海面シミュレーション</h2>
      <p class="lead">海面が今より高かったら、どこまで海になる？　低地と台地の境目が、くっきり浮かび上がります。</p>
      <div class="sea-readout"><span>海面</span><b id="v-sea">+${S.sea}</b><span>m</span></div>
      <input type="range" class="sea-range" name="sea" min="0" max="20" step="0.5" value="${S.sea}" />
      <div class="preset-row">
        <button data-sea="0">いま</button>
        <button data-sea="3">縄文海進 +3m</button>
        <button data-sea="5">+5m</button>
        <button data-sea="10">+10m</button>
      </div>
      <div class="note-card">
        <h3>縄文海進とは</h3>
        <p>約7,000〜6,000年前、温暖化で海面が今より2〜3mほど高くなり、東京の低地の奥深くまで海（奥東京湾）が入り込んでいました。上野の不忍池や、台地の縁に残る貝塚は、そのころの海の名残です。</p>
        <p class="fine">※ 現在の地形をそのまま塗り分けた単純な表現です。当時の海岸線そのものではありません（その後の川の堆積や埋立で、低地の地形は大きく変わっています）。堤防の効果も考慮していないため、水害の予測でもありません。</p>
      </div>
    </div>`);
  const range = body.querySelector('.sea-range');
  const setSea = (v) => {
    S.sea = v;
    range.value = v;
    $('#v-sea').textContent = `+${v}`;
    $('#btn-sea').classList.toggle('on', v > 0);
    refreshRelief();
    saveSettings();
  };
  range.addEventListener('input', () => setSea(Number(range.value)));
  body.querySelectorAll('[data-sea]').forEach((b) => b.addEventListener('click', () => {
    setSea(Number(b.dataset.sea));
    if (Number(b.dataset.sea) === 3 && map.getZoom() > 12.5) {
      map.flyTo({ center: [139.78, 35.71], zoom: 11.6, padding: mapPadding(), duration: 1400 });
    }
  }));
}
$('#btn-sea').addEventListener('click', () => (sheetMode === 'sea' ? closeSheet() : openSeaPanel()));

// ---------------------------------------------------------------- 断面図

const profile = { active: false, pts: [] };
let profileHover = null;

function setProfileData(pts) {
  const features = pts.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} }));
  if (pts.length === 2) features.unshift({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: {} });
  map.getSource('profile')?.setData({ type: 'FeatureCollection', features });
}

function startProfile(first = null) {
  closeSheetQuiet();
  profileHover?.remove();
  profileHover = null;
  profile.active = true;
  profile.pts = first ? [first] : [];
  setProfileData(profile.pts);
  $('#btn-profile').classList.add('on');
  document.body.classList.add('picking');
  toast(first ? '終点をタップしてください' : '断面図：始点をタップしてください', 0);
}

function closeSheetQuiet() {
  sheet.classList.remove('open', 'expanded');
  document.body.classList.remove('sheet-open');
  sheetMode = null;
}

function clearProfile() {
  profile.active = false;
  profile.pts = [];
  setProfileData([]);
  profileHover?.remove();
  profileHover = null;
  $('#btn-profile').classList.remove('on');
  document.body.classList.remove('picking');
  hideToast();
}

async function addProfilePoint(p) {
  profile.pts.push(p);
  setProfileData(profile.pts);
  if (profile.pts.length === 1) {
    toast('終点をタップしてください', 0);
    return;
  }
  profile.active = false;
  document.body.classList.remove('picking');
  toast('断面を計算中…', 0);
  const [a, b] = profile.pts;
  const data = await getProfile(a, b, 260).catch(() => null);
  hideToast();
  if (!data) {
    toast('標高データを取得できませんでした');
    return;
  }
  const body = openSheet('profile', `
    <div class="panel">
      <h2>断面図</h2>
      <div id="profile-chart"></div>
      <div class="actions"><button class="btn" id="profile-again">別の断面を測る</button></div>
    </div>`);
  const pts = profile.pts.slice();
  renderProfile(body.querySelector('#profile-chart'), data, {
    color: (h) => cssColorAt(S.palette, h, S.max),
    onHover: (pt) => {
      if (!pt) { profileHover?.remove(); profileHover = null; return; }
      if (!profileHover) {
        const el = document.createElement('div');
        el.className = 'profile-cursor';
        profileHover = new Marker({ element: el }).setLngLat([pt.lng, pt.lat]).addTo(map);
      } else {
        profileHover.setLngLat([pt.lng, pt.lat]);
      }
    },
  });
  body.querySelector('#profile-again').addEventListener('click', () => startProfile());
  profile.pts = pts;
  map.fitBounds([[Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.max(a[1], b[1])]], {
    padding: { ...mapPadding(), top: 90, left: (mapPadding().left || 0) + 50, right: 70, bottom: (mapPadding().bottom || 0) + 40 },
    maxZoom: 16.5,
    duration: 900,
  });
}

$('#btn-profile').addEventListener('click', () => {
  if (profile.active || sheetMode === 'profile') {
    if (sheetMode === 'profile') closeSheet();
    clearProfile();
  } else {
    startProfile();
  }
});

// ---------------------------------------------------------------- その他のボタン

$('#btn-3d').addEventListener('click', () => {
  S.terrain = !S.terrain;
  saveSettings();
  applyTerrain();
  if (S.terrain) toast('2本指で傾け・回転できます（PCは右ドラッグ）');
});
$('#btn-locate').addEventListener('click', startLocate);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (profile.active) clearProfile();
    else if (sheetMode) closeSheet();
  }
});

// ---------------------------------------------------------------- 起動

map.on('load', () => {
  applyLayerSettings();
  applyTerrain(false);
  refreshSpotMarkers();
  onZoom();
  $('#btn-sea').classList.toggle('on', S.sea > 0);
});
updateLegend();
