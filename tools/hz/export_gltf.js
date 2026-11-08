#!/usr/bin/env node
'use strict';
/**
 * HZ 几何导出 GLB（glTF 2.0 Binary）脚本（零外部依赖，纯 Node 标准库）
 *
 * 坐标系映射说明：
 * - HZ 数据坐标系：X 向东、Y 向上（高程）、Z 向北（右手系，但 Z 为水平南北向）
 * - glTF 2.0 标准坐标系：Y-up 右手系（+X 向右、+Y 向上、+Z 向外/朝南）
 * - 映射公式：HZ (x, y, z) -> glTF (x, y, -z)
 *   （Z 取反以消除水平镜像翻转，同时各面按 glTF 外法线逆时针 CCW 绕序排列）
 *
 * 用法：
 *   node tools/hz/export_gltf.js --state final --out /tmp/hz-final.glb
 *   node tools/hz/export_gltf.js --state asm   --out /tmp/hz-asm.glb
 */

const fs = require('fs');
const path = require('path');
const { load } = require('./harness');

function parseArgs(argv) {
  let state = 'final';
  let out = '';
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--state' && i + 1 < argv.length) {
      state = argv[++i];
    } else if (a.startsWith('--state=')) {
      state = a.slice('--state='.length);
    } else if (a === '--out' && i + 1 < argv.length) {
      out = argv[++i];
    } else if (a.startsWith('--out=')) {
      out = a.slice('--out='.length);
    }
  }
  if (state !== 'final' && state !== 'asm') {
    throw new Error(`Invalid --state "${state}" (expected "final" or "asm")`);
  }
  if (!out) {
    throw new Error('Missing required --out <path>');
  }
  return { state, out };
}

// sRGB (0..1) -> Linear RGB (0..1)，符合 glTF 2.0 baseColorFactor 线性空间规范
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToBaseColor(hex) {
  const h = hex.replace(/^#/, '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [
    Number(srgbToLinear(r).toFixed(6)),
    Number(srgbToLinear(g).toFixed(6)),
    Number(srgbToLinear(b).toFixed(6)),
    1.0,
  ];
}

// HZ (x, y, z) -> glTF (x, y, -z)
function mapPt(pt) {
  return [pt[0], pt[1], -pt[2]];
}

function createMeshBucket(name, hexColor) {
  return {
    name,
    hexColor,
    positions: [],
    normals: [],
    indices: [],
    vertexCount: 0,
    triangleCount: 0,
  };
}

// 向 mesh bucket 添加一个平面四边形（4 顶点已处于 glTF 坐标系，按外法线逆时针 CCW 排列）
function addQuadGltf(bucket, v0, v1, v2, v3) {
  const e1x = v1[0] - v0[0];
  const e1y = v1[1] - v0[1];
  const e1z = v1[2] - v0[2];
  const e2x = v2[0] - v0[0];
  const e2y = v2[1] - v0[1];
  const e2z = v2[2] - v0[2];

  let nx = e1y * e2z - e1z * e2y;
  let ny = e1z * e2x - e1x * e2z;
  let nz = e1x * e2y - e1y * e2x;
  const len = Math.hypot(nx, ny, nz);
  if (len > 1e-12) {
    nx /= len;
    ny /= len;
    nz /= len;
  } else {
    nx = 0;
    ny = 1;
    nz = 0;
  }

  const base = bucket.vertexCount;
  const verts = [v0, v1, v2, v3];
  for (let i = 0; i < 4; i++) {
    const v = verts[i];
    bucket.positions.push(v[0], v[1], v[2]);
    bucket.normals.push(nx, ny, nz);
  }
  bucket.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  bucket.vertexCount += 4;
  bucket.triangleCount += 2;
}

// 盒的 8 个角点（HZ 坐标系下：0..3 底面 y0，4..7 顶面 y1）
//   0: [x0, y0, z0], 1: [x1, y0, z0], 2: [x1, y0, z1], 3: [x0, y0, z1]
//   4: [x0, y1, z0], 5: [x1, y1, z0], 6: [x1, y1, z1], 7: [x0, y1, z1]
function boxRawCorners(min, max) {
  const x0 = Math.min(min[0], max[0]);
  const x1 = Math.max(min[0], max[0]);
  const y0 = Math.min(min[1], max[1]);
  const y1 = Math.max(min[1], max[1]);
  const z0 = Math.min(min[2], max[2]);
  const z1 = Math.max(min[2], max[2]);
  return [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y0, z1],
    [x0, y0, z1],
    [x0, y1, z0],
    [x1, y1, z0],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
}

// 将 HZ 坐标系下的 8 角点转为 glTF 6 个面（每面按外法线逆时针 CCW）
function addCornersBox(bucket, hzCorners) {
  const c = hzCorners.map(mapPt);
  // 顶面 (+Y): 4, 5, 6, 7
  addQuadGltf(bucket, c[4], c[5], c[6], c[7]);
  // 底面 (-Y): 0, 3, 2, 1
  addQuadGltf(bucket, c[0], c[3], c[2], c[1]);
  // HZ z0 面 (glTF +Z): 0, 1, 5, 4
  addQuadGltf(bucket, c[0], c[1], c[5], c[4]);
  // HZ z1 面 (glTF -Z): 2, 3, 7, 6
  addQuadGltf(bucket, c[2], c[3], c[7], c[6]);
  // +X 面: 1, 2, 6, 5
  addQuadGltf(bucket, c[1], c[2], c[6], c[5]);
  // -X 面: 3, 0, 4, 7
  addQuadGltf(bucket, c[3], c[0], c[4], c[7]);
}

function addAxisBox(bucket, min, max) {
  addCornersBox(bucket, boxRawCorners(min, max));
}

function buildGlbBuffer(buckets) {
  const materials = [];
  const meshes = [];
  const nodes = [];
  const sceneNodes = [];
  const bufferViews = [];
  const accessors = [];
  const binChunks = [];
  let byteOffset = 0;

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    materials.push({
      name: b.name,
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorFactor: hexToBaseColor(b.hexColor),
        metallicFactor: 0,
        roughnessFactor: 0.9,
      },
    });

    const posArray = new Float32Array(b.positions);
    const normArray = new Float32Array(b.normals);
    const idxArray = new Uint32Array(b.indices);

    // 计算 POSITION accessor 的 min / max（基于 Float32 精确值）
    const minPos = [Infinity, Infinity, Infinity];
    const maxPos = [-Infinity, -Infinity, -Infinity];
    for (let j = 0; j < posArray.length; j += 3) {
      const x = posArray[j];
      const y = posArray[j + 1];
      const z = posArray[j + 2];
      if (x < minPos[0]) minPos[0] = x;
      if (y < minPos[1]) minPos[1] = y;
      if (z < minPos[2]) minPos[2] = z;
      if (x > maxPos[0]) maxPos[0] = x;
      if (y > maxPos[1]) maxPos[1] = y;
      if (z > maxPos[2]) maxPos[2] = z;
    }

    const posBuf = Buffer.from(posArray.buffer, posArray.byteOffset, posArray.byteLength);
    const normBuf = Buffer.from(normArray.buffer, normArray.byteOffset, normArray.byteLength);
    const idxBuf = Buffer.from(idxArray.buffer, idxArray.byteOffset, idxArray.byteLength);

    const posViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: posBuf.byteLength,
      target: 34962, // ARRAY_BUFFER
    });
    binChunks.push(posBuf);
    byteOffset += posBuf.byteLength;

    const normViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: normBuf.byteLength,
      target: 34962, // ARRAY_BUFFER
    });
    binChunks.push(normBuf);
    byteOffset += normBuf.byteLength;

    const idxViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: idxBuf.byteLength,
      target: 34963, // ELEMENT_ARRAY_BUFFER
    });
    binChunks.push(idxBuf);
    byteOffset += idxBuf.byteLength;

    const posAccIdx = accessors.length;
    accessors.push({
      bufferView: posViewIdx,
      byteOffset: 0,
      componentType: 5126, // FLOAT
      count: b.vertexCount,
      type: 'VEC3',
      min: minPos,
      max: maxPos,
    });

    const normAccIdx = accessors.length;
    accessors.push({
      bufferView: normViewIdx,
      byteOffset: 0,
      componentType: 5126, // FLOAT
      count: b.vertexCount,
      type: 'VEC3',
    });

    const idxAccIdx = accessors.length;
    accessors.push({
      bufferView: idxViewIdx,
      byteOffset: 0,
      componentType: 5125, // UNSIGNED_INT
      count: idxArray.length,
      type: 'SCALAR',
    });

    const meshIdx = meshes.length;
    meshes.push({
      name: b.name,
      primitives: [
        {
          attributes: {
            POSITION: posAccIdx,
            NORMAL: normAccIdx,
          },
          indices: idxAccIdx,
          material: i,
          mode: 4, // TRIANGLES
        },
      ],
    });

    const nodeIdx = nodes.length;
    nodes.push({
      name: b.name,
      mesh: meshIdx,
    });
    sceneNodes.push(nodeIdx);
  }

  // BIN chunk 4 字节对齐填充（Float32/Uint32 天然 4 字节对齐，此处保底）
  const binPad = (4 - (byteOffset % 4)) % 4;
  if (binPad > 0) {
    binChunks.push(Buffer.alloc(binPad, 0));
    byteOffset += binPad;
  }
  const binBuffer = Buffer.concat(binChunks, byteOffset);

  const gltf = {
    asset: {
      version: '2.0',
      generator: 'hzwest-atlas tools/hz/export_glb.js',
    },
    scene: 0,
    scenes: [
      {
        name: 'Scene',
        nodes: sceneNodes,
      },
    ],
    nodes,
    meshes,
    materials,
    buffers: [
      {
        byteLength: binBuffer.byteLength,
      },
    ],
    bufferViews,
    accessors,
  };

  const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonRaw.byteLength % 4)) % 4;
  const jsonChunkData =
    jsonPad > 0 ? Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]) : jsonRaw;

  const totalLength = 12 + 8 + jsonChunkData.byteLength + 8 + binBuffer.byteLength;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4); // version 2
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonChunkData.byteLength, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuffer.byteLength, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([
    header,
    jsonChunkHeader,
    jsonChunkData,
    binChunkHeader,
    binBuffer,
  ]);
}

function main() {
  const { state, out } = parseArgs(process.argv);
  const { HZ } = load();
  HZ.make();

  // final: t=660（原始坐标，HZ.xf 为恒等）；asm: t=620（分区盒与屋盖格经 HZ.xf(HZ.pose(620), grp, pt) 变换）
  const pose = state === 'asm' ? HZ.pose(620) : HZ.pose(660);
  const isAsm = state === 'asm';

  const buckets = {
    static: createMeshBucket('static', '#8a8d90'),
    zone1: createMeshBucket('zone1', '#8fa3c4'),
    zone2: createMeshBucket('zone2', '#93b8ab'),
    zone3: createMeshBucket('zone3', '#cfa586'),
    zone4: createMeshBucket('zone4', '#b3c493'),
    cells: createMeshBucket('cells', '#7e8894'),
    lifters: createMeshBucket('lifters', '#a83c2c'),
  };

  let staticBoxCount = 0;
  let zoneBoxCount = 0;

  for (const act of HZ.acts) {
    if (!act.parts) continue;
    for (const part of act.parts) {
      if (!part.geo || !part.geo.boxes) continue;
      const grp = part.grp !== null && part.grp !== undefined ? part.grp : 0;
      for (const b of part.geo.boxes) {
        if (grp === 1 || grp === 2 || grp === 3 || grp === 4) {
          zoneBoxCount++;
          const targetBucket = buckets['zone' + grp];
          const rawCorners = boxRawCorners(b.min, b.max);
          const corners = isAsm
            ? rawCorners.map((pt) => HZ.xf(pose, grp, pt))
            : rawCorners;
          addCornersBox(targetBucket, corners);
        } else {
          staticBoxCount++;
          addAxisBox(buckets.static, b.min, b.max);
        }
      }
    }
  }

  let cellCount = 0;
  for (const c of HZ.cells) {
    cellCount++;
    const y = HZ.Ht(c.xc, c.zc);
    const rawQuad = [
      [c.xa, y, c.za],
      [c.xb, y, c.za],
      [c.xb, y, c.zb],
      [c.xa, y, c.zb],
    ];
    const quad = isAsm
      ? rawQuad.map((pt) => HZ.xf(pose, c.grp, pt))
      : rawQuad;
    // rawQuad 顺序与盒顶面 (4,5,6,7) 一致，映射为 glTF (x, y, -z) 后外法线朝 +Y
    addQuadGltf(
      buckets.cells,
      mapPt(quad[0]),
      mapPt(quad[1]),
      mapPt(quad[2]),
      mapPt(quad[3])
    );
  }

  let lifterCount = 0;
  for (const l of HZ.lifters) {
    lifterCount++;
    const lx = Number(l.x);
    const lz = Number(l.z);
    const ltop = Number(l.top);
    // 柱身：3.4×3.4 自地面 0 到 top - 2.6
    addAxisBox(
      buckets.lifters,
      [lx - 1.7, 0.0, lz - 1.7],
      [lx + 1.7, ltop - 2.6, lz + 1.7]
    );
    // 塔帽：4.6×2.6×4.6 自 top - 2.6 到 top
    addAxisBox(
      buckets.lifters,
      [lx - 2.3, ltop - 2.6, lz - 2.3],
      [lx + 2.3, ltop, lz + 2.3]
    );
  }

  const orderedBuckets = [
    buckets.static,
    buckets.zone1,
    buckets.zone2,
    buckets.zone3,
    buckets.zone4,
    buckets.cells,
    buckets.lifters,
  ];

  const glbBuffer = buildGlbBuffer(orderedBuckets);
  const outPath = path.resolve(out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, glbBuffer);

  let totalVertices = 0;
  let totalTriangles = 0;
  for (const b of orderedBuckets) {
    totalVertices += b.vertexCount;
    totalTriangles += b.triangleCount;
  }

  const totalBoxes = staticBoxCount + zoneBoxCount;
  const summary = {
    state,
    boxes: totalBoxes,
    staticBoxes: staticBoxCount,
    zoneBoxes: zoneBoxCount,
    cells: cellCount,
    lifters: lifterCount,
    vertices: totalVertices,
    triangles: totalTriangles,
    bytes: glbBuffer.byteLength,
  };
  console.log(JSON.stringify(summary));
}

main();
