'use strict';
// 导出某一时刻的 3D 几何（与页面同一份 HZ 构件、工期、提升姿态）为 OBJ，供 Blender 参考渲染。
// 用法：node tools/hz/export_glb.js <t> <out.obj>
// 规则与 hzview.js 顶点着色器 hzCalc 一致：t < st 不出现；st..st+du 按 smoothstep 从底面长高；
// 临时构件 rm=[开始, 时长] 期间按同样方式缩回；提升分区按 HZ.xf(HZ.pose(t), grp, p) 变换。
// 输出按材质分组（o <mat>），坐标为页面 three.js 坐标（米，Y 向上）；Blender 导入用默认 forward -Z / up Y。
// 文件名沿用任务书（export_glb）；只出 OBJ，不依赖任何外部库。
const fs = require('fs');
const { load } = require('./harness');

const t = +process.argv[2], out = process.argv[3];
if (!(t >= 0) || !out) { console.log('用法：node tools/hz/export_glb.js <t> <out.obj>'); process.exit(1); }
const { HZ } = load({}); HZ.make();
const pose = HZ.pose(t), sm = k => k * k * (3 - 2 * k), cl = v => Math.max(0, Math.min(1, v));
const byMat = new Map(); let nTri = 0, nPart = 0;
for (const a of HZ.acts) for (const p of a.parts) {
  const g = p.geo; if (!g || !g.P || !g.P.length || p.st == null || t < p.st) continue;
  let k = cl((t - p.st) / Math.max(p.du, 1e-3));
  if (p.rm && p.rm[0] >= 0) k *= 1 - cl((t - p.rm[0]) / Math.max(p.rm[1], 1e-3));
  k = sm(k); if (k < 1e-4) continue;
  const base = g.min[1], grp = p.grp || 0, P = g.P, arr = byMat.get(g.mat) || [];
  for (let i = 0; i < P.length; i += 3) { const y = base + (P[i + 1] - base) * k; arr.push(HZ.xf(pose, grp, [P[i], y, P[i + 2]])); }
  byMat.set(g.mat, arr); nPart++;
}
const L = ['# hzwest-atlas 导出 t=' + t + '（' + HZ.dayDate(t) + '）', 'mtllib none'];
let vi = 1;
for (const [m, vs] of byMat) {
  L.push('o ' + m, 'usemtl ' + m);
  for (const v of vs) L.push('v ' + v[0].toFixed(3) + ' ' + v[1].toFixed(3) + ' ' + v[2].toFixed(3));
  for (let i = 0; i < vs.length; i += 3) { L.push('f ' + (vi + i) + ' ' + (vi + i + 1) + ' ' + (vi + i + 2)); nTri++; }
  vi += vs.length;
}
fs.writeFileSync(out, L.join('\n') + '\n');
console.log(`OK export t=${t} ${HZ.dayDate(t)} parts=${nPart} tris=${nTri} mats=${[...byMat.keys()].join(',')}`);
