// 周边远景图层 ENV-1：东西向铁路高架延伸（Ring 1 示范图层）· g-liuzhijie
// 范围：|x| ∈ [650, 1500] m，南场（湖杭场）与北场（杭临绩场）双幅高架箱梁（y = 10.5..12.5 m）及 36 m 跨桥墩。
// 时间：从 HZ.K.platS/N 与 trackS/N 推导，随承轨与铺轨节奏由站端向外单调延伸。
(function () {
  'use strict';
  const ROOT = typeof window !== 'undefined' ? window : globalThis;

  (ROOT.HZ_ENV_LAYERS = ROOT.HZ_ENV_LAYERS || []).push({
    id: 'rail-viaduct',
    name: '东西向铁路高架延伸',
    ring: 1,
    build(HZ, api) {
      const P = HZ.P;
      const xStart = Math.max(650, P.apX || 650);
      const xEnd = 1500;
      const span = 36;
      const yBot = P.deckBot || 10.5;
      const yTop = P.deckTop || 12.5;

      const corridors = [
        {
          z0: 16, z1: 88,
          t0: HZ.K.platS ? HZ.K.platS.start : 450,
          t1: HZ.K.trackS ? HZ.K.trackS.end : 740,
        },
        {
          z0: -88, z1: -16,
          t0: HZ.K.platN ? HZ.K.platN.start : 450,
          t1: HZ.K.trackN ? HZ.K.trackN.end : 900,
        },
      ];

      const nSpans = Math.floor((xEnd - xStart) / span);
      for (const cor of corridors) {
        const dt = cor.t1 - cor.t0;
        const zMid = (cor.z0 + cor.z1) * 0.5;
        const pierZs = [cor.z0 + 10, zMid, cor.z1 - 10];

        for (const side of [-1, 1]) {
          for (let i = 0; i < nSpans; i++) {
            const xa = side * (xStart + i * span);
            const xb = side * (xStart + (i + 1) * span);
            const u0 = i / nSpans;
            const u1 = (i + 1) / nSpans;
            const tPier = cor.t0 + dt * (u0 * 0.65);
            const tDeck0 = cor.t0 + dt * (0.15 + u0 * 0.72);
            const tDeck1 = cor.t0 + dt * (0.15 + u1 * 0.85);

            // 桥墩（立柱 + 盖梁横线）
            for (const pz of pierZs) {
              api.add(tPier, xb, 0, pz, xb, yBot, pz);
            }
            api.add(tPier + 4, xb, yBot, cor.z0 + 4, xb, yBot, cor.z1 - 4);

            // 高架箱梁纵边（上下翼缘 4 条）与中线
            api.add(tDeck0, xa, yTop, cor.z0, xb, yTop, cor.z0);
            api.add(tDeck0, xa, yTop, cor.z1, xb, yTop, cor.z1);
            api.add(tDeck0 + 3, xa, yBot, cor.z0 + 2, xb, yBot, cor.z0 + 2);
            api.add(tDeck0 + 3, xa, yBot, cor.z1 - 2, xb, yBot, cor.z1 - 2);
            api.add(tDeck1, xa, yTop, zMid, xb, yTop, zMid);
          }
        }
      }
    },
  });
})();
