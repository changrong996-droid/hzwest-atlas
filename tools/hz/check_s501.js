'use strict';
// S-501 开通（web/sheets/s501.js）无头检查：绘制不抛错、图号正确、大数字倒计时单调并在开通当天切换车次、
// 镜头不进地下、亮灯与列车与 hzview 同式且守规则（开通前不亮灯、列车不早于开通出现、停在站台范围内）。
const { load, sheetCtx } = require('./harness');
const { G, HZ, makeCtx } = load({ extra: ['web/sheets/s501.js'] });
HZ.make();
const fail = m => { console.log('FAIL check_s501: ' + m); process.exit(1); };
const P = (G.HZ_SHEET_PLUGINS || []).find(p => p.id === 'S-501');
if (!P) fail('未登记 HZ_SHEET_PLUGINS S-501');
const K = HZ.K, OPEN = HZ.P.OPEN;
if (P.window[0] !== K.ymf.start || P.window[1] !== OPEN + 30) fail(`时间窗 ${P.window} 应为 [${K.ymf.start}, ${OPEN + 30}]`);
const PJ = (G.HZA && G.HZA.PROJECT) || HZ.PROJECT || 'HZW', NO = PJ + '-S-501-1';

// 1. 七个时刻 × 两档尺寸（含开通前一天、开通当天、列车行进中）
const [W0, W1] = P.window, times = [W0, K.ym.start + 30, K.tod.start + 100, OPEN - 20, OPEN - 0.5, OPEN + 2, W1];
let runs = 0;
for (const t of times) for (const [w, h] of [[560, 420], [300, 160]]) {
  const c = makeCtx(), ctx = sheetCtx();
  try { P.draw(c.g, w, h, t, ctx); } catch (e) { fail(`draw t=${t} ${w}x${h} ${e && e.stack}`); }
  if (ctx.seenNo !== NO) fail(`图号 期望 ${NO} 实得 ${ctx.seenNo}`);
  if (!((c.calls.fillRect || 0) >= 1) || !(c.texts.length >= 1)) fail(`t=${t} ${w}x${h} 未画图框或未写字`);
  runs++;
}

// 2. 大数字：开通前 = 天数单调不增且 ≥ 1；开通起 = 首趟车次（有车次、有时刻、有来源）
let last = Infinity;
for (let t = W0; t <= W1 + 1e-9; t += 0.25) {
  const b = P.big(t);
  if (t < OPEN) { if (typeof b.num !== 'number' || b.num < 1 || b.num > last) fail(`t=${t} 倒计时 ${b.num} 不单调或越界`); last = b.num; if (b.unit !== '天') fail('倒计时单位应为 天'); }
  else if (!/^[GDC]\d{1,4}$/.test(String(b.num)) || !/\d{2}:\d{2}/.test(b.label)) fail(`t=${t} 开通后应显示车次与时刻，实得 ${b.num} ${b.unit}`);
}
if (P.big(OPEN - 0.01).num !== 1) fail('开通前一刻倒计时应为 1 天');
if (!P.FIRST.src) fail('首趟车次缺来源');

// 3. 镜头：相机在地面以上、关键帧在窗内且递增
let lt = -1;
for (const k of P.cam) {
  if (k.t < W0 || k.t > W1 || k.t <= lt) fail(`镜头关键帧 t=${k.t} 越窗或不递增`); lt = k.t;
  const camY = k.target[1] + k.dist * Math.sin(k.el * Math.PI / 180);
  if (!(k.target[1] >= 0) || !(camY > 5)) fail(`镜头 t=${k.t} 进地下`);
}

// 4. 规则：亮灯不早于开通前 1 天（与 hzview sm(OPEN−1, OPEN+5) 一致），之后单调不减；
//    列车不早于开通出现；车头单调向停位推进；停稳时车头在站台范围（|x| ≤ stX）内、整列在铺好的股道上
let lastOn = 0, lastHead = null; const stX = HZ.P.stX;
for (let t = W0; t <= W1 + 1e-9; t += 0.1) {
  const L = P.lightAt(t), T = P.trainAt(t);
  if (t < OPEN - 1 - 1e-9 && L.on > 0) fail(`t=${t} 开通前就亮灯`);
  if (L.on < lastOn - 1e-9) fail(`t=${t} 灯光变暗`); lastOn = L.on;
  if (T.vis && t <= OPEN) fail(`t=${t} 列车早于开通出现`);
  if (T.vis) { if (lastHead != null && (T.head - lastHead) * T.dir < -1e-6) fail(`t=${t} 列车倒退`); lastHead = T.head; }
}
const Te = P.trainAt(W1), apX = HZ.P.apX;
// 联动 v2：首趟列车走湖杭场靠云谷第 1 股道（HZ.tracks(HZ.YARDS.S)[0]），停稳时整列在站台 ±stX 内
if (!Te.vis || Math.max(Math.abs(Te.head), Math.abs(Te.tail)) > stX) fail(`结尾列车 ${Te.tail && Te.tail.toFixed(1)}..${Te.head && Te.head.toFixed(1)} 不在站台 ±${stX} 内`);
if (Math.abs(Te.z - HZ.tracks(HZ.YARDS.S)[0]) > 1e-6) fail(`首趟列车股道 z=${Te.z} 不是湖杭场第 1 股道 ${HZ.tracks(HZ.YARDS.S)[0]}`);
const zTr = P.model().tracks.map(q => (q.b.min[2] + q.b.max[2]) / 2);
if (!zTr.some(z => Math.abs(z - Te.z) < 2.5)) fail(`列车股道 z=${Te.z} 附近没有铺轨构件`);
const trk = P.model().tracks.find(q => Math.abs((q.b.min[2] + q.b.max[2]) / 2 - Te.z) < 2.5);
if (P.stOf(trk.p, OPEN) !== 2) fail('开通时列车所在股道还没铺完');
// 5. 联动 v2：parts() 每个采样时刻 ≥ 1 项、id 唯一、hit 在画布内、box 有限非零体积；开通后有 TRAIN；focus 绘制
let nParts = 0;
for (const [w, h] of [[760, 420], [1258, 540], [300, 160]]) for (let t = W0; t <= W1 + 1e-9; t += 5) {
  const c = makeCtx(); P.draw(c.g, w, h, t, sheetCtx()); const ps = P.parts(t, sheetCtx());
  if (!Array.isArray(ps) || !ps.length) fail(`parts(${t}) ${w}x${h} 为空`); const ids = new Set();
  for (const q of ps) { if (!q.id || ids.has(q.id)) fail(`parts(${t}) id 重复或为空：${q.id}`); ids.add(q.id);
    const [x, y, ww, hh] = q.hit; if (!(x >= 0 && y >= 0 && ww > 0 && hh > 0 && x + ww <= w + 1e-6 && y + hh <= h + 1e-6)) fail(`parts(${t}) ${q.id} hit 越出画布`);
    const b = q.box; if (b.length !== 6 || !b.every(Number.isFinite) || !(b[3] > b[0] && b[4] > b[1] && b[5] > b[2])) fail(`parts(${t}) ${q.id} box 无效 ${b}`); nParts++; }
  if (w === 760) { const c2 = makeCtx(), cx2 = sheetCtx(); cx2.focus = ps[ps.length - 1].id; P.draw(c2.g, w, h, t, cx2); }
}
if (!P.parts(W1, sheetCtx()).some(q => q.id === 'TRAIN')) fail('开通后 parts 没有首趟列车');
// 6. 改 HZ，图跟着变：开通日 +10 → 倒计时与亮灯跟着移；云门构件工期 → 时间窗外的 model 重算；改完复原
{ const O0 = HZ.P.OPEN, tq = O0 - 20, b0 = P.big(tq).num; HZ.P.OPEN = O0 + 10; const b1 = P.big(tq).num, L1 = P.lightAt(O0 + 2).on; HZ.P.OPEN = O0; P.model();
  if (b1 !== b0 + 10) fail(`改开通日后倒计时没跟着变（${b0}→${b1}）`); if (L1 !== 0) fail('改开通日后亮灯没跟着推迟'); }

console.log(`OK check_s501 parts=${nParts}  runs=${runs} cam=${P.cam.length} train_z=${Te.z} head_x=${Te.head.toFixed(1)}`);
