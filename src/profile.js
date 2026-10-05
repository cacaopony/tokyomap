// 標高断面図（SVG）

const W = 640;
const H = 240;
const PAD = { l: 44, r: 14, t: 16, b: 30 };

function niceStep(range, target) {
  const raw = range / target;
  const steps = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.find((s) => s >= raw) || steps[steps.length - 1];
}

function fmtDist(m) {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)}km`;
}

export function renderProfile(root, data, { color, onHover }) {
  const valid = data.filter((p) => p.h != null);
  if (!valid.length) {
    root.innerHTML = '<p class="empty">この区間には標高データがありません（海・川の上など）</p>';
    return;
  }
  // 水域(null)は前後の値で埋めて線をつなぎ、水域であることは別に描く
  const filled = data.map((p) => ({ ...p, water: p.h == null }));
  let last = valid[0].h;
  for (const p of filled) {
    if (p.h == null) p.h = last;
    else last = p.h;
  }

  const total = data[data.length - 1].d;
  const hs = valid.map((p) => p.h);
  const minH = Math.min(...hs);
  const maxH = Math.max(...hs);
  const span = Math.max(maxH - minH, 8);
  const y0 = Math.floor(minH - span * 0.12);
  const y1 = Math.ceil(maxH + span * 0.18);
  const x = (d) => PAD.l + (d / total) * (W - PAD.l - PAD.r);
  const y = (h) => PAD.t + (1 - (h - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);

  // 統計
  let up = 0;
  let down = 0;
  let maxSlope = 0;
  const STEP_M = 30; // 細かすぎると標高データのノイズを拾うため
  let ref = filled[0];
  for (const p of filled) {
    if (p.d - ref.d >= STEP_M) {
      const dh = p.h - ref.h;
      if (!p.water && !ref.water) {
        if (dh > 0) up += dh; else down -= dh;
        maxSlope = Math.max(maxSlope, Math.abs(dh) / (p.d - ref.d));
      }
      ref = p;
    }
  }

  const line = filled.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.h).toFixed(1)}`).join('');
  const area = `${line}L${x(total).toFixed(1)},${y(y0)}L${x(0)},${y(y0)}Z`;

  const gradStops = [];
  for (let i = 0; i <= 10; i++) {
    // offset は昇順で並べる必要がある（上=高い → 下=低い）
    const h = y1 - ((y1 - y0) * i) / 10;
    gradStops.push(`<stop offset="${i / 10}" stop-color="${color(h)}"/>`);
  }

  const hStep = niceStep(y1 - y0, 4);
  let grid = '';
  for (let h = Math.ceil(y0 / hStep) * hStep; h <= y1; h += hStep) {
    grid += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(h)}" y2="${y(h)}" class="pf-grid"/>
      <text x="${PAD.l - 6}" y="${y(h) + 4}" class="pf-label" text-anchor="end">${h}</text>`;
  }
  const dStep = niceStep(total, 5);
  for (let d = 0; d <= total + 1e-6; d += dStep) {
    grid += `<text x="${x(d)}" y="${H - 9}" class="pf-label" text-anchor="middle">${fmtDist(d)}</text>`;
  }

  // 水域の帯
  let water = '';
  let start = null;
  filled.forEach((p, i) => {
    if (p.water && start == null) start = p.d;
    if ((!p.water || i === filled.length - 1) && start != null) {
      water += `<rect x="${x(start)}" y="${PAD.t}" width="${Math.max(2, x(p.d) - x(start))}" height="${H - PAD.t - PAD.b}" class="pf-water"/>`;
      start = null;
    }
  });

  root.innerHTML = `
    <div class="pf-stats">
      <div><span>距離</span><b>${fmtDist(total)}</b></div>
      <div><span>最高</span><b>${maxH.toFixed(1)}m</b></div>
      <div><span>最低</span><b>${minH.toFixed(1)}m</b></div>
      <div><span>高低差</span><b>${(maxH - minH).toFixed(1)}m</b></div>
      <div><span>上り / 下り</span><b>+${up.toFixed(0)} / −${down.toFixed(0)}m</b></div>
      <div><span>最大勾配</span><b>${(maxSlope * 100).toFixed(0)}%</b></div>
    </div>
    <div class="pf-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="pf-svg" role="img" aria-label="標高断面図">
        <defs><linearGradient id="pf-grad" x1="0" y1="${y(y1)}" x2="0" y2="${y(y0)}" gradientUnits="userSpaceOnUse">${gradStops.join('')}</linearGradient></defs>
        ${water}
        ${grid}
        <path d="${area}" fill="url(#pf-grad)"/>
        <path d="${line}" class="pf-line"/>
        <text x="${x(0) + 4}" y="${PAD.t + 12}" class="pf-ab">A</text>
        <text x="${x(total) - 4}" y="${PAD.t + 12}" class="pf-ab" text-anchor="end">B</text>
        <g class="pf-cursor" visibility="hidden">
          <line y1="${PAD.t}" y2="${H - PAD.b}" class="pf-cursor-line"/>
          <circle r="5" class="pf-cursor-dot"/>
          <text class="pf-cursor-text" y="${PAD.t + 12}"></text>
        </g>
      </svg>
    </div>
    <p class="fine">縦方向は誇張しています。地表の高さ（建物を除く）・国土地理院5mメッシュ標高。<span class="pf-water-key"></span>は水域。グラフをなぞると地図上の位置がわかります。</p>`;

  const svg = root.querySelector('svg');
  const cursor = svg.querySelector('.pf-cursor');
  const cLine = cursor.querySelector('line');
  const cDot = cursor.querySelector('circle');
  const cText = cursor.querySelector('text');

  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / r.width) * W;
    const d = Math.max(0, Math.min(total, ((sx - PAD.l) / (W - PAD.l - PAD.r)) * total));
    const i = Math.round((d / total) * (filled.length - 1));
    const p = filled[i];
    const px = x(p.d);
    cursor.setAttribute('visibility', 'visible');
    cLine.setAttribute('x1', px);
    cLine.setAttribute('x2', px);
    cDot.setAttribute('cx', px);
    cDot.setAttribute('cy', y(p.h));
    cText.textContent = p.water ? `${fmtDist(p.d)}・水域` : `${fmtDist(p.d)}・${p.h.toFixed(1)}m`;
    const right = px > W * 0.7;
    cText.setAttribute('x', right ? px - 8 : px + 8);
    cText.setAttribute('text-anchor', right ? 'end' : 'start');
    onHover?.(p);
  };
  const leave = () => {
    cursor.setAttribute('visibility', 'hidden');
    onHover?.(null);
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', leave);
}
