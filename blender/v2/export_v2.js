'use strict';
// 终版精修二版（hark-cs）：导出某一时刻与页面同一份几何给 Blender。
// 用法：node blender/v2/export_v2.js <t> <outDir> [--train-f F]
// 产出：<outDir>/scene.obj（按材质分组；列车按车体颜色分 tr_sil/tr_red/tr_blk/tr_sk + trainW；
//        t ≥ pv 完成时 clad 三角按 HZ.pvMask 分出 pv）、<outDir>/lines.bin（float32 墨线段：页面 Geo.L 同源 + 屋面 Hc 等高线）、<outDir>/meta.json
// 规则：构件生长 / 临时构件缩回 / 提升分区变换同 tools/hz/export_glb.js（= hzview.js hzCalc）；
// 列车同 hzview.js：tw=1 绕 Y 转 180° 后平移到 (tx, deckTop+0.48, tracks(S)[0])，tx = -1500 + (1500+99)(1-(1-f)^2.2)，f = smoothstep((t-(OPEN+1))/23)。
const fs = require('fs'), path = require('path');
const { load } = require('../../tools/hz/harness');
const t = +process.argv[2], outDir = process.argv[3];
if (!(t >= 0) || !outDir) { console.log('用法：node blender/v2/export_v2.js <t> <outDir> [--train-f F]'); process.exit(1); }
const fi = process.argv.indexOf('--train-f'), trainF = fi > 0 ? +process.argv[fi + 1] : null;
// --scope a,b,c：同页面 SCOPE_OUT = 'hide'（hzview.js，委托人 11-09）——临时构件（塔吊等，a.temp.serves）不服务本图范围的不画
const si = process.argv.indexOf('--scope'), SCOPE = si > 0 ? new Set(process.argv[si + 1].split(',')) : null;
fs.mkdirSync(outDir, { recursive: true });
const { HZ } = load({}); HZ.make();
const P = HZ.P, K = HZ.K, pose = HZ.pose(t), sm = k => k * k * (3 - 2 * k), cl = v => Math.max(0, Math.min(1, v));
const groups = new Map(), push = (n, v) => { let a = groups.get(n); if (!a) groups.set(n, a = []); a.push(v); };
const lines = new Map(), pushL = (n, a, b) => { let L = lines.get(n); if (!L) lines.set(n, L = []); L.push(a[0], a[1], a[2], b[0], b[1], b[2]); };
const pvDone = t >= K.pv.end, pvOn = t >= K.pv.start ? cl((t - K.pv.start) / (K.pv.end - K.pv.start)) : 0;
let nPart = 0;
const TEMP = {}; for (const a of HZ.acts) if (a.temp && a.temp.serves) TEMP[a.key] = a.temp.serves;
let nHid = 0;
for (const a of HZ.acts) for (const p of a.parts) {
  const g = p.geo; if (!g || !g.P || !g.P.length || p.st == null || t < p.st) continue;
  const tk = a.key.split('~')[0]; if (SCOPE && TEMP[tk] && !TEMP[tk].some(x => SCOPE.has(x))) { nHid++; continue; }
  let k = cl((t - p.st) / Math.max(p.du, 1e-3)); if (p.rm && p.rm[0] >= 0) k *= 1 - cl((t - p.rm[0]) / Math.max(p.rm[1], 1e-3)); k = sm(k); if (k < 1e-4) continue;
  const base = g.min[1], grp = p.grp || 0, Pp = g.P, X = (x, y, z) => HZ.xf(pose, grp, [x, base + (y - base) * k, z]);
  for (let i = 0; i < Pp.length; i += 9) {
    const v0 = X(Pp[i], Pp[i + 1], Pp[i + 2]), v1 = X(Pp[i + 3], Pp[i + 4], Pp[i + 5]), v2 = X(Pp[i + 6], Pp[i + 7], Pp[i + 8]);
    const m = g.mat;
    // 光伏：不再按三角切分（会出锯齿），改为逐顶点 HZ.pvMask 写进 OBJ 顶点色 r，Blender 里用属性节点混色
    if (m === 'clad' && pvOn > 0) for (const [k3, v] of [[0, v0], [3, v1], [6, v2]]) { const x = Pp[i + k3], z = Pp[i + k3 + 2]; v.pv = HZ.pvMask(x, z) * (pvDone || HZ.rho(x, z) < 0.5 + 0.4 * pvOn ? 1 : 0); }
    push(m, v0); push(m, v1); push(m, v2);
  }
  const L = g.L; if (L && L.length) for (let i = 0; i < L.length; i += 6) pushL(g.mat, X(L[i], L[i + 1], L[i + 2]), X(L[i + 3], L[i + 4], L[i + 5]));
  nPart++;
}
// 屋面 Hc 等高线（2 m，同 web/sheets/s401.js）：只在金属屋面铺完后画（四朵云 / 云缝的读法）
let nIso = 0;
if (t >= K.clad.end) {
  const gs = 1.0, gx = Math.ceil(P.roofA / gs), gz = Math.ceil(P.roofB / gs), H = (x, z) => HZ.rho(x, z) <= 0.985 && !HZ.inSky(x, z) ? HZ.Hc(x, z) : NaN;
  const V = []; for (let i = -gx; i <= gx; i++) { const r = []; for (let j = -gz; j <= gz; j++) r.push(H(i * gs, j * gs)); V.push(r); }
  for (let lv = 38; lv <= 62; lv += 2) for (let i = 0; i < 2 * gx; i++) for (let j = 0; j < 2 * gz; j++) {
    const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], h = c.map(([a, b]) => V[a][b]); if (h.some(v => v !== v)) continue;
    const pts = []; for (let e = 0; e < 4; e++) { const h0 = h[e], h1 = h[(e + 1) % 4]; if ((h0 < lv) !== (h1 < lv)) { const f = (lv - h0) / (h1 - h0), A = c[e], B = c[(e + 1) % 4]; const x = (A[0] + (B[0] - A[0]) * f - gx) * gs, z = (A[1] + (B[1] - A[1]) * f - gz) * gs; pts.push([x, HZ.Hc(x, z) + 0.12, z]); } }
    if (pts.length >= 2) { pushL('iso', pts[0], pts[1]); nIso++; } if (pts.length === 4) { pushL('iso', pts[2], pts[3]); nIso++; }
  }
  // 云纹 HZ.Wv 等值线（0.5 m 一圈，画在 Hc 面上）：每个象限一组闭合圈 = 四朵云；十字天窗两侧 Wv = 0 = 云缝
  const Wg = []; for (let i = -gx; i <= gx; i++) { const r = []; for (let j = -gz; j <= gz; j++) { const x = i * gs, z = j * gs; r.push(HZ.rho(x, z) <= 0.985 ? HZ.Wv(x, z) : NaN); } Wg.push(r); }
  for (let lv = 0.5; lv <= 3.01; lv += 0.5) for (let i = 0; i < 2 * gx; i++) for (let j = 0; j < 2 * gz; j++) {
    const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], h = c.map(([a, b]) => Wg[a][b]); if (h.some(v => v !== v)) continue;
    const pts = []; for (let e = 0; e < 4; e++) { const h0 = h[e], h1 = h[(e + 1) % 4]; if ((h0 < lv) !== (h1 < lv)) { const f = (lv - h0) / (h1 - h0), A = c[e], B = c[(e + 1) % 4]; const x = (A[0] + (B[0] - A[0]) * f - gx) * gs, z = (A[1] + (B[1] - A[1]) * f - gz) * gs; pts.push([x, HZ.Hc(x, z) + 0.15, z]); } }
    if (pts.length >= 2) pushL('wv', pts[0], pts[1]); if (pts.length === 4) pushL('wv', pts[2], pts[3]);
  }
}
// 首趟列车（hzview.js 同一变换）
const O = P.OPEN, f = trainF != null ? trainF : sm(cl((t - (O + 1)) / 23)), te = 99, tx = -1500 + (1500 + te) * (1 - Math.pow(1 - f, 2.2)), tz = HZ.tracks(HZ.YARDS.S)[0], ty = P.deckTop + 0.48;
let train = null;
if (t > O + 0.5) { const tr = HZ.makeTrain(); const xfT = q => [tx - q[0], ty + q[1], tz - q[2]];
  const cname = c => { const [r, g] = c; if (r > 0.6 && g < 0.3) return 'tr_red'; if (r < 0.2) return 'tr_blk'; if (r < 0.45) return 'tr_sk'; return 'tr_sil'; };
  for (const [G, nm] of [[tr.g, null], [tr.gw, 'trainW']]) { const Pp = G.P, C = G.C; for (let i = 0; i < Pp.length; i += 3) push(nm || cname([C[i], C[i + 1], C[i + 2]]), xfT([Pp[i], Pp[i + 1], Pp[i + 2]]));
    const L = G.L || []; for (let i = 0; i < L.length; i += 6) pushL('train', xfT([L[i], L[i + 1], L[i + 2]]), xfT([L[i + 3], L[i + 4], L[i + 5]])); }
  train = { tx, tz, ty, noseX: tx + tr.T.nose, tailX: tx - tr.T.len, len: tr.T.nose + tr.T.len }; }
// 写 OBJ
const Lo = ['# hzwest-atlas v2 t=' + t + ' ' + HZ.dayDate(t)]; let vi = 1, nTri = 0;
for (const [m, vs] of groups) { Lo.push('o ' + m, 'usemtl ' + m); for (const v of vs) Lo.push('v ' + v[0].toFixed(3) + ' ' + v[1].toFixed(3) + ' ' + v[2].toFixed(3) + (pvOn > 0 ? ' ' + (v.pv || 0).toFixed(3) + ' 0 0' : '')); for (let i = 0; i < vs.length; i += 3) Lo.push('f ' + (vi + i) + ' ' + (vi + i + 1) + ' ' + (vi + i + 2)); vi += vs.length; nTri += vs.length / 3; }
fs.writeFileSync(path.join(outDir, 'scene.obj'), Lo.join('\n') + '\n');
// 线段：每组 [名字长度 u8][名字][段数 u32][段数×6 float32]
const bufs = []; const lcount = {};
for (const [n, L] of lines) { const nb = Buffer.from(n); const h = Buffer.alloc(5 + nb.length); h.writeUInt8(nb.length, 0); nb.copy(h, 1); h.writeUInt32LE(L.length / 6, 1 + nb.length); bufs.push(h, Buffer.from(new Float32Array(L).buffer)); lcount[n] = L.length / 6; }
fs.writeFileSync(path.join(outDir, 'lines.bin'), Buffer.concat(bufs));
const MAT = {}; for (const k in HZ.MAT) MAT[k] = HZ.MAT[k];
const meta = { t, date: HZ.dayDate(t), parts: nPart, tris: nTri, mats: [...groups.keys()].map(m => [m, groups.get(m).length / 3]), lines: lcount, iso: nIso, pose, train, MAT, lt: 4.5, P: { roofA: P.roofA, roofB: P.roofB, roofHi: P.roofHi, roofLo: P.roofLo, deckTop: P.deckTop, skyW: P.skyW } };
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta));
console.log(`OK export_v2 t=${t} ${HZ.dayDate(t)} hiddenTemp=${nHid} parts=${nPart} tris=${nTri} lines=${JSON.stringify(lcount)} train=${train ? 'nose ' + train.noseX.toFixed(1) : '-'}`);
