// S-301 屋盖提升 · 钢绞线加粗 3D 模块（任务 #10，hark-liuzhijie）· 接 window.HZ_MODS 钩子（同 actors / s101-volume / s251-face）
// 缘由：宿主 hzview.js 已按 HZ.K.rig.strands 画钢绞线，但用的是 THREE.LineSegments，WebGL 线宽恒为 1 px，远景下几乎看不见，
//   审查（docs/audit/2026-11-22-visual-logic.md 第 2 条）记为「屋盖没有钢绞线，看起来自己浮着」。
// 做法：每根钢绞线画成一条屏幕空间加宽的墨线带（宽 = max(实际束径 0.35 m 的投影, 2.2 px)），深度测试照常（网架、柱头会遮住它）。
//   上端 = 提升器顶（HZ.strands[i].a，静止）；下端 = 吊点在当前位姿下的位置 HZ.xf(HZ.pose(t), gb, b)，随提升 / 转动逐帧更新。
//   显示窗口与宿主 STR 相同：rig 进行到 60% 起，到 rig.rm 进行到 30% 止（数据读 HZ.K.rig，不写死天数）。
//   id 's301-strands' → 宿主按 modSheet 视为 S-301 分图模块：分图范围启用且不在 S-301 时自动隐藏。
// 检查：node tools/hz/check_strands.js（端点 = 提升器顶 / 当前位姿吊点、窗口与宿主一致、长度 > 0、update 耗时）。
(function () {
  'use strict';
  const ROOT = typeof window !== 'undefined' ? window : globalThis;
  const INK = 0x1c1a17, BUNDLE = 0.35, MINPX = 2.2;

  // 纯函数：t 时刻每根钢绞线的两端（供模块与 Node 检查共用）
  function window_(HZ) { const r = HZ.K.rig; return [r.start + r.dur * 0.6, r.rm.start + r.rm.dur * 0.3]; }
  function visibleAt(HZ, t) { const w = window_(HZ); return t >= w[0] && t < w[1]; }
  function ends(HZ, t, out) {
    const L = HZ.K.rig.strands, ps = HZ.pose(t); out = out || [];
    for (let i = 0; i < L.length; i++) { const s = L[i], b = HZ.xf(ps, s.gb, s.b); out[i] = [s.a[0], s.a[1], s.a[2], b[0], b[1], b[2]]; }
    out.length = L.length; return out;
  }

  const mod = {
    id: 's301-strands', sheet: 'S-301',
    window: window_, visibleAt, ends,
    build(scene, HZ, THREE, opts) {
      this.HZ = HZ; const n = HZ.K.rig.strands.length; this.n = n;
      // 每根 4 个顶点（a 两侧、b 两侧）、2 个三角形；aEnd = 本顶点端点，aOther = 另一端，aSide = ±1
      const P = new Float32Array(n * 12), O = new Float32Array(n * 12), SD = new Float32Array(n * 4), idx = [];
      for (let i = 0; i < n; i++) { SD.set([-1, 1, -1, 1], i * 4); const k = i * 4; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aOther', new THREE.BufferAttribute(O, 3)); g.setAttribute('aSide', new THREE.BufferAttribute(SD, 1)); g.setIndex(idx);
      const clip = opts && opts.clip && opts.clip[0];
      const U = { uC: { value: new THREE.Color(INK) }, uRes: { value: new THREE.Vector2(1600, 900) }, uW: { value: BUNDLE }, uMin: { value: MINPX }, uPl: { value: new THREE.Vector4(0, 0, 0, 1) } };
      const m = new THREE.ShaderMaterial({ uniforms: U, depthTest: true, depthWrite: true, side: THREE.DoubleSide,
        vertexShader: 'attribute vec3 aOther; attribute float aSide; uniform vec2 uRes; uniform float uW, uMin; varying vec3 vW;\n' +
          'void main() { vW = position; mat4 VP = projectionMatrix * viewMatrix; vec4 c0 = VP * vec4(position, 1.0), c1 = VP * vec4(aOther, 1.0);\n' +
          '  vec2 s0 = c0.xy / c0.w * uRes, s1 = c1.xy / c1.w * uRes; vec2 d = normalize(s1 - s0 + vec2(1e-6, 0.0)); vec2 nrm = vec2(-d.y, d.x);\n' +
          '  float px = max(uMin, uW * projectionMatrix[1][1] * uRes.y * 0.5 / max(c0.w, 1e-3));\n' +
          '  c0.xy += nrm * aSide * px / uRes * c0.w; gl_Position = c0; }',
        fragmentShader: 'uniform vec3 uC; uniform vec4 uPl; varying vec3 vW; void main() { if (dot(uPl.xyz, vW) + uPl.w < 0.0) discard; gl_FragColor = vec4(uC, 1.0); }' });
      const o = new THREE.Mesh(g, m); o.frustumCulled = false; o.visible = false; o.renderOrder = 2; o.name = 's301-strands';
      o.onBeforeRender = (r) => { const v = r.getDrawingBufferSize ? r.getDrawingBufferSize(new THREE.Vector2()) : null; if (v) U.uRes.value.set(v.x, v.y); if (clip) U.uPl.value.set(clip.normal.x, clip.normal.y, clip.normal.z, clip.constant); };
      scene.add(o); this.o = o; this.P = P; this.O = O; this.g = g; this.E = []; this.lastT = NaN;
    },
    update(t) {
      const HZ = this.HZ, o = this.o; if (!HZ || !o) return;
      const on = visibleAt(HZ, t); o.visible = on; if (!on || t === this.lastT) return; this.lastT = t;
      const E = ends(HZ, t, this.E), P = this.P, O = this.O;
      for (let i = 0; i < E.length; i++) { const e = E[i], k = i * 12;
        P.set([e[0], e[1], e[2], e[0], e[1], e[2], e[3], e[4], e[5], e[3], e[4], e[5]], k);
        O.set([e[3], e[4], e[5], e[3], e[4], e[5], e[0], e[1], e[2], e[0], e[1], e[2]], k); }
      this.g.attributes.position.needsUpdate = true; this.g.attributes.aOther.needsUpdate = true;
    }
  };
  (ROOT.HZ_MODS = ROOT.HZ_MODS || []).push(mod);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
})();
