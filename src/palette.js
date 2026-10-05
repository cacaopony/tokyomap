// 標高 → 色 のルックアップテーブル
// 東京の地形は高低差が数十mしかないため、0〜max(既定40m)の範囲に色相を集中させる

export const LUT_MIN = -20;     // m
export const LUT_STEP = 0.1;    // m
export const LUT_SIZE = 22000;  // -20m 〜 2180m

// 現在の水域色 (データなし=海・川・池)。中身を書き換えて使う
export const WATER_RGBA = new Uint8ClampedArray([24, 62, 130, 255]);

// t = 標高 / max (0〜1)。1 を超えた分は top へ向けて淡くなる
export const PALETTES = {
  vivid: {
    label: '鮮やか',
    below: ['#1b2a6b', '#0b3f7a'],
    water: '#183e82',
    flood: '#2457b8',
    top: '#f5e1ff',
    stops: [
      [0.0, '#0a6f9e'],
      [0.06, '#14a3a8'],
      [0.14, '#3fc07d'],
      [0.25, '#9fd84a'],
      [0.38, '#f3e24b'],
      [0.52, '#fba63a'],
      [0.68, '#ef5638'],
      [0.84, '#c4175c'],
      [1.0, '#6b1d9a'],
    ],
  },
  classic: {
    label: '地形図風',
    below: ['#3d5a80', '#5c7fa3'],
    water: '#8fb8de',
    flood: '#5d8fd6',
    top: '#ffffff',
    stops: [
      [0.0, '#5f9e6e'],
      [0.12, '#8cbf6c'],
      [0.3, '#cfe08a'],
      [0.5, '#f0dc94'],
      [0.7, '#d9a868'],
      [0.88, '#b07848'],
      [1.0, '#8a5a3c'],
    ],
  },
  night: {
    label: 'ナイト',
    below: ['#05030f', '#0a0a24'],
    water: '#05060f',
    flood: '#1c2a7a',
    top: '#ffffff',
    stops: [
      [0.0, '#0b1030'],
      [0.1, '#13246b'],
      [0.25, '#1d4fbf'],
      [0.42, '#16a6d9'],
      [0.6, '#3ef0c9'],
      [0.78, '#f2f55a'],
      [0.9, '#ff7b54'],
      [1.0, '#ff2e88'],
    ],
  },
};

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function colorAt(paletteName, h, max) {
  const p = PALETTES[paletteName] || PALETTES.vivid;
  if (h < 0) {
    const [deep, shallow] = p.below.map(hex);
    return mix(shallow, deep, Math.min(1, -h / 5));
  }
  const t = h / max;
  const stops = p.stops;
  if (t >= 1) {
    const last = hex(stops[stops.length - 1][1]);
    return mix(last, hex(p.top), Math.min(1, (t - 1) / 3) * 0.85);
  }
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      return mix(hex(c0), hex(c1), (t - t0) / (t1 - t0));
    }
  }
  return hex(stops[stops.length - 1][1]);
}

let lut = null;
let settings = { palette: 'vivid', max: 40, sea: 0, step: 0 };

export function setReliefSettings(s) {
  settings = { ...settings, ...s };
  lut = null;
  const p = PALETTES[settings.palette] || PALETTES.vivid;
  const w = hex(p.water);
  WATER_RGBA.set([w[0], w[1], w[2], 255]);
}

export function getLUT() {
  if (lut) return lut;
  const { palette, max, sea, step } = settings;
  const flood = hex((PALETTES[palette] || PALETTES.vivid).flood);
  lut = new Uint8ClampedArray(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    let h = LUT_MIN + i * LUT_STEP;
    let c;
    if (sea > 0 && h < sea) {
      // 海面上昇シミュレーション: 深いほど濃く
      const depth = Math.min(1, (sea - h) / 8);
      c = mix(flood, [10, 25, 70], depth * 0.7);
    } else {
      if (step > 0) h = Math.floor(h / step) * step;
      c = colorAt(palette, h, max);
    }
    lut[i * 4] = c[0];
    lut[i * 4 + 1] = c[1];
    lut[i * 4 + 2] = c[2];
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

export function cssColorAt(paletteName, h, max) {
  const c = colorAt(paletteName, h, max).map(Math.round);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
