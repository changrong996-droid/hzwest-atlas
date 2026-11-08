const fs = require('fs');
const path = require('path');
const { load } = require('/tmp/hzatlas-work/tools/hz/harness');

const { HZ } = load();
HZ.make();

const pose620 = HZ.pose(620);

const boxes = [];
const asmBoxes = [];
for (const act of HZ.acts) {
  if (!act.parts) continue;
  for (const part of act.parts) {
    if (!part.geo || !part.geo.boxes) continue;
    const mat = part.mat !== null && part.mat !== undefined ? String(part.mat) : 'misc';
    const grp = part.grp !== null && part.grp !== undefined ? part.grp : 0;
    for (const b of part.geo.boxes) {
      boxes.push({
        min: [b.min[0], b.min[1], b.min[2]],
        max: [b.max[0], b.max[1], b.max[2]],
        mat,
        grp,
      });
      if (grp === 1 || grp === 2 || grp === 3 || grp === 4) {
        const x0 = Math.min(b.min[0], b.max[0]);
        const x1 = Math.max(b.min[0], b.max[0]);
        const y0 = Math.min(b.min[1], b.max[1]);
        const y1 = Math.max(b.min[1], b.max[1]);
        const z0 = Math.min(b.min[2], b.max[2]);
        const z1 = Math.max(b.min[2], b.max[2]);
        const rawCorners = [
          [x0, y0, z0],
          [x1, y0, z0],
          [x1, y0, z1],
          [x0, y0, z1],
          [x0, y1, z0],
          [x1, y1, z0],
          [x1, y1, z1],
          [x0, y1, z1],
        ];
        const corners = rawCorners.map((pt) => HZ.xf(pose620, grp, pt));
        asmBoxes.push({
          corners,
          mat,
          grp,
        });
      }
    }
  }
}

const cells = HZ.cells.map((c) => ({
  xa: c.xa,
  xb: c.xb,
  za: c.za,
  zb: c.zb,
  xc: c.xc,
  zc: c.zc,
  grp: c.grp,
  yTop: HZ.Ht(c.xc, c.zc),
}));

const asmCells = cells.map((c) => {
  const y = c.yTop;
  const rawQuad = [
    [c.xa, y, c.za],
    [c.xb, y, c.za],
    [c.xb, y, c.zb],
    [c.xa, y, c.zb],
  ];
  return {
    quad: rawQuad.map((pt) => HZ.xf(pose620, c.grp, pt)),
    grp: c.grp,
  };
});

const lifters = HZ.lifters.map((l) => ({
  x: l.x,
  z: l.z,
  top: l.top,
  zone: l.zone,
}));

const poseMid = HZ.pose(642.5);
const dyMid = {
  '1': poseMid['1'].dy,
  '2': poseMid['2'].dy,
  '3': poseMid['3'].dy,
  '4': poseMid['4'].dy,
};

const out = {
  meta: {
    boxes: boxes.length,
    cells: cells.length,
    lifters: lifters.length,
    dyMid,
  },
  boxes,
  cells,
  lifters,
  asm: {
    boxes: asmBoxes,
    cells: asmCells,
    meta: {
      boxes: asmBoxes.length,
      cells: asmCells.length,
    },
  },
};

const outPath = path.join(__dirname, 'geometry.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

console.log(`boxes: ${out.meta.boxes}`);
console.log(`cells: ${out.meta.cells}`);
console.log(`lifters: ${out.meta.lifters}`);
console.log(`asm.boxes: ${out.asm.meta.boxes}`);
console.log(`asm.cells: ${out.asm.meta.cells}`);
