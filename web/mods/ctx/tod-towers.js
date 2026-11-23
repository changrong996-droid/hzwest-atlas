// 远景图层 tod.towers（南北站城综合体：金钥匙 / 金手指，按工期生长）· g-liuzhijie
// 依据：北综合体「金钥匙」2021-11-02 开工（t≈777，主塔 399.8 m + 300 m + 双 249 m）；南综合体「金手指」2021-12 公示、2022 全面施工（t≈820，A 塔 320 m + B 塔 300 m + C/D 塔 213 m），均计划 2028 交付。
// 时间窗分三段：基坑施工期 → 开通前夕低层起步（不违背 2022-09 历史实景）→ 开通后远景规划轮廓（t≥1101）。全部位于主站与云门包络（z∈[-170,245]）之外。
(function () {
  'use strict';
  const rect = (cx, cz, w, d) => {
    const hw = w / 2, hd = d / 2;
    return [
      [cx - hw, cz - hd],
      [cx + hw, cz - hd],
      [cx + hw, cz + hd],
      [cx - hw, cz + hd],
      [cx - hw, cz - hd],
    ];
  };

  const items = [];

  // ── 1. 北综合体「金钥匙」（z ∈ [-470, -255]，2021-11-02 开工 t=777）──
  const northTowers = [
    { name: '金钥匙 1 号主塔', cx: 0,    cz: -365, w: 62, d: 62, hStart: 28, hFull: 399.8 },
    { name: '金钥匙 2 号塔',   cx: -105, cz: -345, w: 52, d: 52, hStart: 22, hFull: 300 },
    { name: '金钥匙 3 号附塔', cx: 105,  cz: -345, w: 48, d: 48, hStart: 18, hFull: 249 },
    { name: '金钥匙 4 号附塔', cx: 0,    cz: -445, w: 48, d: 48, hStart: 18, hFull: 249 },
  ];
  // 北区基坑期（t: 777 → 960）
  items.push({ k: 'area', p: rect(0, -370, 310, 210), c: '#d8cfc2', from: 777, to: 960 });
  items.push({ k: 'line', p: rect(0, -370, 316, 216), c: '#8f7e6a', y: 1.2, from: 777, to: 960 });
  // 北区开通前夕起步（t: 960 → 1101）与开通后规划轮廓（t: 1101 → 3000）
  items.push({ k: 'bldg', p: rect(0, -370, 280, 180), h: 16, c: '#e6e1d7', from: 960, to: 3000 });
  for (const tw of northTowers) {
    items.push({ k: 'bldg', p: rect(tw.cx, tw.cz, tw.w, tw.d), h: tw.hStart, c: '#dfd9ce', from: 960, to: 1101 });
    items.push({ k: 'bldg', p: rect(tw.cx, tw.cz, tw.w, tw.d), h: tw.hFull,  c: '#ebe7df', from: 1101, to: 3000 });
  }
  items.push({ k: 'pin', p: [0, -365], n: '北综合体 · 金钥匙（在建）', h: 70, c: '#6e655c', from: 777, to: 1101 });
  items.push({ k: 'pin', p: [0, -365], n: '金钥匙 · 399.8 m（规划）', h: 425, c: '#5c534a', from: 1101, to: 3000 });

  // ── 2. 南综合体「金手指」（云门 z=178..238 以南，z ∈ [275, 485]，t=820 起）──
  const southTowers = [
    { name: '金手指 A 塔', cx: -85,  cz: 365, w: 56, d: 56, hStart: 24, hFull: 320 },
    { name: '金手指 B 塔', cx: 85,   cz: 365, w: 54, d: 54, hStart: 22, hFull: 300 },
    { name: '金手指 C 塔', cx: -155, cz: 435, w: 44, d: 44, hStart: 16, hFull: 213 },
    { name: '金手指 D 塔', cx: 155,  cz: 435, w: 44, d: 44, hStart: 16, hFull: 213 },
  ];
  // 南区基坑期（t: 820 → 990）
  items.push({ k: 'area', p: rect(0, 385, 380, 195), c: '#d8cfc2', from: 820, to: 990 });
  items.push({ k: 'line', p: rect(0, 385, 386, 201), c: '#8f7e6a', y: 1.2, from: 820, to: 990 });
  // 南区开通前夕起步（t: 990 → 1101）与开通后规划轮廓（t: 1101 → 3000）
  items.push({ k: 'bldg', p: rect(0, 385, 340, 165), h: 15, c: '#e6e1d7', from: 990, to: 3000 });
  for (const tw of southTowers) {
    items.push({ k: 'bldg', p: rect(tw.cx, tw.cz, tw.w, tw.d), h: tw.hStart, c: '#dfd9ce', from: 990, to: 1101 });
    items.push({ k: 'bldg', p: rect(tw.cx, tw.cz, tw.w, tw.d), h: tw.hFull,  c: '#ebe7df', from: 1101, to: 3000 });
  }
  items.push({ k: 'pin', p: [-85, 365], n: '南综合体 · 金手指（在建）', h: 65, c: '#6e655c', from: 820, to: 1101 });
  items.push({ k: 'pin', p: [-85, 365], n: '金手指 · 320 m（规划）', h: 345, c: '#5c534a', from: 1101, to: 3000 });

  (window.HZ_CTX_LAYERS = window.HZ_CTX_LAYERS || []).push({
    id: 'tod.towers',
    name: '南北综合体（金钥匙/金手指）',
    by: 'g-liuzhijie',
    src: {
      text: '杭州云城南北综合体公开规划尺寸示意（自绘，推演）',
      license: '自绘（CC0 / hzwest-atlas）',
      url: '',
    },
    from: 777,
    to: 3000,
    on: true,
    items,
  });
})();
