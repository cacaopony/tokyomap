// 国土地理院 標高タイル (dem_png / dem5a_png) の読み込み・変換
// - 'gsidem://' : MapLibre の raster-dem 用に Terrarium 形式へ変換
// - 'relief://' : 標高を独自カラーで塗った段彩タイル
import { getLUT, LUT_MIN, LUT_STEP, LUT_SIZE, WATER_RGBA } from './palette.js';

const GSI = 'https://cyberjapandata.gsi.go.jp/xyz';
const TILE = 256;
const NA_CODE = 8388608; // 2^23 = データなし

const cache = new Map();
const CACHE_MAX = 160;

const decodeCanvas = makeCanvas();
const decodeCtx = decodeCanvas.getContext('2d', { willReadFrequently: true });

function makeCanvas() {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(TILE, TILE);
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  return c;
}

function nanTile() {
  return new Float32Array(TILE * TILE).fill(NaN);
}

async function fetchDecode(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const bmp = await createImageBitmap(await res.blob());
  decodeCtx.clearRect(0, 0, TILE, TILE);
  decodeCtx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const d = decodeCtx.getImageData(0, 0, TILE, TILE).data;
  const out = new Float32Array(TILE * TILE);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    if (d[p + 3] === 0) { out[i] = NaN; continue; }
    const x = d[p] * 65536 + d[p + 1] * 256 + d[p + 2];
    out[i] = x === NA_CODE ? NaN : (x < NA_CODE ? x : x - 16777216) * 0.01;
  }
  return out;
}

// z15 は 5m メッシュ (dem5a) を優先し、欠損は z14 の 10m メッシュで補う
async function loadZ15(x, y) {
  const [fine, parent] = await Promise.all([
    fetchDecode(`${GSI}/dem5a_png/15/${x}/${y}.png`).catch(() => null),
    loadDem(14, x >> 1, y >> 1),
  ]);
  const out = new Float32Array(TILE * TILE);
  const ox = (x & 1) * 128, oy = (y & 1) * 128;
  for (let r = 0; r < TILE; r++) {
    for (let c = 0; c < TILE; c++) {
      const i = r * TILE + c;
      const v = fine ? fine[i] : NaN;
      out[i] = Number.isNaN(v) ? parent[(oy + (r >> 1)) * TILE + ox + (c >> 1)] : v;
    }
  }
  return out;
}

export function loadDem(z, x, y) {
  if (z > 15) {
    // 15 より細かいズームは呼ばれない想定だが念のため z15 へ丸める
    const s = z - 15;
    return loadDem(15, x >> s, y >> s);
  }
  const key = `${z}/${x}/${y}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const p = (z === 15
    ? loadZ15(x, y)
    : fetchDecode(`${GSI}/dem_png/${z}/${x}/${y}.png`).then((a) => a || nanTile())
  ).catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, p);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return p;
}

async function encodePng(rgba) {
  const c = makeCanvas();
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(rgba, TILE, TILE), 0, 0);
  const blob = c.convertToBlob
    ? await c.convertToBlob({ type: 'image/png' })
    : await new Promise((r) => c.toBlob(r, 'image/png'));
  return blob.arrayBuffer();
}

function parseTileUrl(url) {
  const m = url.match(/:\/\/(\d+)\/(\d+)\/(\d+)/);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

async function terrariumTile(params) {
  const [z, x, y] = parseTileUrl(params.url);
  const dem = await loadDem(z, x, y);
  const rgba = new Uint8ClampedArray(TILE * TILE * 4);
  for (let i = 0, p = 0; i < dem.length; i++, p += 4) {
    const h = Number.isNaN(dem[i]) ? 0 : dem[i];
    const v = h + 32768;
    rgba[p] = Math.floor(v / 256);
    rgba[p + 1] = Math.floor(v) % 256;
    rgba[p + 2] = Math.floor((v - Math.floor(v)) * 256);
    rgba[p + 3] = 255;
  }
  return { data: await encodePng(rgba) };
}

async function reliefTile(params) {
  const [z, x, y] = parseTileUrl(params.url);
  const dem = await loadDem(z, x, y);
  const lut = getLUT();
  const rgba = new Uint8ClampedArray(TILE * TILE * 4);
  for (let i = 0, p = 0; i < dem.length; i++, p += 4) {
    const h = dem[i];
    if (Number.isNaN(h)) {
      rgba[p] = WATER_RGBA[0]; rgba[p + 1] = WATER_RGBA[1];
      rgba[p + 2] = WATER_RGBA[2]; rgba[p + 3] = WATER_RGBA[3];
      continue;
    }
    let k = Math.round((h - LUT_MIN) / LUT_STEP);
    k = k < 0 ? 0 : k >= LUT_SIZE ? LUT_SIZE - 1 : k;
    k *= 4;
    rgba[p] = lut[k]; rgba[p + 1] = lut[k + 1]; rgba[p + 2] = lut[k + 2]; rgba[p + 3] = lut[k + 3];
  }
  return { data: await encodePng(rgba) };
}

export function registerProtocols(maplibregl) {
  maplibregl.addProtocol('gsidem', terrariumTile);
  maplibregl.addProtocol('relief', reliefTile);
}

// ---- 地点の標高 ----

function lngLatToPixel(lng, lat, z) {
  const n = 2 ** z * TILE;
  const s = Math.sin((lat * Math.PI) / 180);
  const px = ((lng + 180) / 360) * n;
  const py = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return [px, py];
}

export async function getElevation(lng, lat) {
  const [px, py] = lngLatToPixel(lng, lat, 15);
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  const dem = await loadDem(15, tx, ty);
  const c = Math.min(TILE - 1, Math.floor(px) - tx * TILE);
  const r = Math.min(TILE - 1, Math.floor(py) - ty * TILE);
  const h = dem[r * TILE + c];
  return Number.isNaN(h) ? null : h;
}

export function distanceMeters(a, b) {
  const R = 6371008;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// A→B の標高断面。samples 個の [距離m, 標高m|null] を返す
export async function getProfile(a, b, samples = 240) {
  const total = distanceMeters(a, b);
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, total * t]);
  }
  const hs = await Promise.all(pts.map(([lng, lat]) => getElevation(lng, lat)));
  return pts.map((p, i) => ({ d: p[2], h: hs[i], lng: p[0], lat: p[1] }));
}
