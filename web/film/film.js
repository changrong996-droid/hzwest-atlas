'use strict';
// 《长出来的》交互短片小样 v3
// 1) 6s 正式片头  2) 真实 3D 溯源图版（大阪城/筑城图/码头/杭州西站）
// 3) 鼠标飞不出来的穿越机 FPV 路线（穿云门 -> 贴轨掠站台 -> 钻网架 -> 翻越四朵云屋顶）
// 4) 去掉四朵云打断，集中节奏做 17s 机械战警式高频真实图纸闪切 + 38 天真实改动时间密度爆发曲线
// 5) 2500+ 张蓝图阵列 + 50 人跨专业人体图标矩阵（对标数月工期 vs 实际到场 0 人）
// 6) 结尾字幕：「现在，它还在继续生长中……」并交出实时 3D 鼠标控制权
(function () {
  const DUR = 120; // 02:00
  const $ = id => document.getElementById(id);
  const hp = new URLSearchParams(location.hash.slice(1));
  const qp = new URLSearchParams(location.search);

  const stage = $('stage');
  const titleSeq = $('title-seq');
  const veil = $('paper-veil'), blackout = $('blackout'), pulse = $('red-pulse');
  const originStage = $('origin-stage'), heroName = $('hero-name');
  const humanNote = $('human-note');
  const flashStrip = $('flash-strip'), flashShutter = $('flash-shutter');
  const fsImg = $('fs-img'), fsCode = $('fs-code'), fsTime = $('fs-time'), fsHash = $('fs-hash');
  const timeGraph = $('time-burst-graph'), tbgClipRect = $('tbg-clip-rect'), tbgScan = $('tbg-scan'), tbgHeat = $('tbg-heat'), tbgPeakMark = $('tbg-peak-mark');
  const sheetsWall = $('sheets-wall'), wallGrid = $('wall-grid'), wallNum = $('wall-num');
  const crewPanel = $('crew-panel'), crewGrid = $('crew-grid'), crewZero = $('crew-zero');
  const burstCounter = $('burst-counter'), bcNum = $('bc-num');
  const ticker = $('event-ticker'), etTag = $('et-tag'), etHash = $('et-hash');
  const clockBox = $('clock-box'), ckVal = $('ck-val');
  const subText = $('sub-text'), endActions = $('end-actions');
  const curtain = $('curtain'), scrubFill = $('scrub-fill'), timeRead = $('time-read');
  const bgmEl = $('bgm');
  const useExternalBgm = true;

  // 预建 50 张纸面缩略图格（2500+ 蓝图阵列）
  const CODES = ['S-101', 'S-201', 'S-251', 'S-301', 'S-401', 'S-501', 'S-001', 'S-002', 'S-000'];
  const tiles = [];
  for (let i = 0; i < 50; i++) {
    const el = document.createElement('div');
    el.className = 'sheet-tile';
    el.dataset.code = CODES[i % CODES.length] + '-' + String(i + 1).padStart(2, '0');
    wallGrid.appendChild(el);
    tiles.push(el);
  }

  // 预建 50 个人体剪影图标（6 大工种按真实人数配比）
  const CREW_GROUPS = [
    { count: 12, color: '#1d1a17' }, // 结构/土建
    { count: 15, color: '#4a5c6a' }, // 施工图画图
    { count: 8,  color: '#6b5b47' }, // BIM/三维
    { count: 6,  color: '#3f6b5c' }, // 动画渲染
    { count: 5,  color: '#8c4a32' }, // 交互程序
    { count: 4,  color: '#b3202a' }, // 审图校核
  ];
  const personIcons = [];
  const personSvg = color =>
    `<svg class="person-ico" viewBox="0 0 20 28" aria-hidden="true">` +
    `<circle cx="10" cy="5.2" r="3.4" fill="${color}"/>` +
    `<path d="M4.2 15.6 C4.2 11.4 6.5 9.8 10 9.8 C13.5 9.8 15.8 11.4 15.8 15.6 L14.8 16.5 L14.4 26.2 L11.1 26.2 L10.3 18.8 L9.7 18.8 L8.9 26.2 L5.6 26.2 L5.2 16.5 Z" fill="${color}"/>` +
    `</svg>`;
  for (const grp of CREW_GROUPS) {
    for (let k = 0; k < grp.count; k++) {
      const wrap = document.createElement('div');
      wrap.innerHTML = personSvg(grp.color);
      const svg = wrap.firstElementChild;
      crewGrid.appendChild(svg);
      personIcons.push(svg);
    }
  }

  // 预建 38 天真实改动密度 SVG 脉冲爆发曲线（2026-10-16 -> 2026-11-23，严格来自 git log）
  const DAILY_DATA = [
    ['10-16', 1], ['10-17', 0], ['10-18', 0], ['10-19', 0], ['10-20', 1], ['10-21', 4],
    ['10-22', 0], ['10-23', 0], ['10-24', 0], ['10-25', 0], ['10-26', 0], ['10-27', 0],
    ['10-28', 0], ['10-29', 0], ['10-30', 0], ['10-31', 0], ['11-01', 0], ['11-02', 0],
    ['11-03', 0], ['11-04', 0], ['11-05', 0], ['11-06', 2], ['11-07', 8],
    ['11-08', 296], ['11-09', 100], ['11-10', 103], ['11-11', 21], ['11-12', 2],
    ['11-13', 0], ['11-14', 3], ['11-15', 0], ['11-16', 0], ['11-17', 0], ['11-18', 0],
    ['11-19', 0], ['11-20', 0], ['11-21', 29], ['11-22', 29], ['11-23', 60]
  ];
  {
    const W = 760, BASE = 116, TOP = 10, n = DAILY_DATA.length;
    const pts = DAILY_DATA.map(([, cnt], i) => {
      const x = +(i / (n - 1) * W).toFixed(1);
      const h = cnt === 0 ? 0 : (cnt <= 10 ? 3 + cnt * 0.9 : Math.pow(cnt / 296, 0.78) * (BASE - TOP));
      return [x, +(BASE - h).toFixed(1), cnt];
    });
    const lineD = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1]).join(' ');
    const areaD = lineD + ` L${W},${BASE} L0,${BASE} Z`;
    $('tbg-line').setAttribute('d', lineD);
    $('tbg-area').setAttribute('d', areaD);
    const spG = $('tbg-spikes');
    for (const [x, y, cnt] of pts) {
      if (cnt <= 0) continue;
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', x); ln.setAttribute('y1', BASE);
      ln.setAttribute('x2', x); ln.setAttribute('y2', y);
      ln.setAttribute('stroke', cnt >= 80 ? '#ff4a57' : 'rgba(255,244,225,0.42)');
      ln.setAttribute('stroke-width', cnt >= 200 ? '3.2' : (cnt >= 80 ? '2' : '1.4'));
      spG.appendChild(ln);
    }
  }

  // 预加载 24 张仓库真实图纸/白模/法线/卫星图（零卡顿闪切）
  const FLASH_PLATES = [
    ['img/flash/f01.jpg', 'S-401 · 线稿'], ['img/flash/f02.jpg', 'S-401 · 白模'],
    ['img/flash/f03.jpg', 'S-401 · 法线'], ['img/flash/f04.jpg', 'S-401 · 深度'],
    ['img/flash/f05.jpg', 'S-401 · 分割'], ['img/flash/f06.jpg', '总平面图'],
    ['img/flash/f07.jpg', '场区底图'],     ['img/flash/f08.jpg', '屋面四朵云'],
    ['img/flash/f09.jpg', 'G9528 动车'],   ['img/flash/f10.jpg', 'S-000 · 基坑'],
    ['img/flash/f11.jpg', 'S-001 · 结构'], ['img/flash/f12.jpg', 'S-002 · 地下'],
    ['img/flash/f13.jpg', 'S-002 · 承轨'], ['img/flash/f14.jpg', 'S-301 · 提升'],
    ['img/flash/f15.jpg', 'S-401 · 屋面'], ['img/flash/f16.jpg', 'S-301 · 墨线'],
    ['img/flash/f17.jpg', 'S-251 · 塔吊'], ['img/flash/f18.jpg', 'S-201 · 吊装'],
    ['img/flash/f19.jpg', 'S-002 · 地铁'], ['img/flash/f20.jpg', 'S-101 · 透视'],
    ['img/flash/f21.jpg', 'S-000 · 实景'], ['img/flash/f22.jpg', 'S-251 · 履带吊'],
    ['img/flash/f23.jpg', 'S-501 · 开通'], ['img/flash/f24.jpg', '哨兵二号卫星']
  ];
  FLASH_PLATES.forEach(([src]) => { const im = new Image(); im.src = src; });

  // ---------- 真实 git 数据 ----------
  let EVENTS = [['11-06 15:49', '总图', 'ce40c17']];
  fetch('film-events.json').then(r => r.json()).then(d => {
    if (d && Array.isArray(d.events) && d.events.length) EVENTS = d.events;
  }).catch(() => {});

  // ---------- 音频引擎：极简毡音钢琴 + 立体声大厅混响 + 高密度机械提交雨 ----------
  const Audio = {
    ctx: null, muted: false, master: null, dryBus: null, wetBus: null,
    padGain: null, noiseBuf: null,
    nextNoteAt: 0, noteStep: 0, lastMood: '', titleChordPlayed: false,

    midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); },

    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 4;
      comp.attack.value = 0.004; comp.release.value = 0.16;

      const master = this.master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.82;
      comp.connect(master); master.connect(ctx.destination);

      this.dryBus = ctx.createGain();
      this.dryBus.gain.value = 0.78;
      this.dryBus.connect(comp);

      const conv = ctx.createConvolver();
      const irLen = Math.floor(ctx.sampleRate * 2.4);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < irLen; i++) {
          const env = Math.pow(1 - i / irLen, 2.8);
          lp = lp * 0.72 + (Math.random() * 2 - 1) * 0.28;
          d[i] = lp * env * 0.48;
        }
      }
      conv.buffer = ir;
      this.wetBus = ctx.createGain();
      this.wetBus.gain.value = 0.42;
      this.wetBus.connect(conv); conv.connect(comp);

      const nLen = Math.floor(ctx.sampleRate * 0.022);
      const nb = this.noiseBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nLen; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nLen, 2.2);

      const pg = this.padGain = ctx.createGain();
      pg.gain.value = 0.0001;
      pg.connect(this.wetBus);
      for (const [midi, vol] of [[38, 0.055], [45, 0.042], [50, 0.026]]) {
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = this.midiToFreq(midi); g.gain.value = vol;
        osc.connect(g); g.connect(pg); osc.start();
      }
    },

    setPad(level) {
      if (!this.ctx || !this.padGain) return;
      this.padGain.gain.setTargetAtTime(Math.max(0.0001, level), this.ctx.currentTime, 0.6);
    },

    playPiano(midi, vel = 0.22, dur = 2.6, pan = 0) {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx, t = ctx.currentTime, freq = this.midiToFreq(midi);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(Math.min(2400, freq * 4.5), t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(380, freq * 1.6), t + dur * 0.7);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(vel, t + 0.016);
      env.gain.exponentialRampToValueAtTime(vel * 0.36, t + 0.45);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      const osc1 = ctx.createOscillator(); osc1.type = 'sine'; osc1.frequency.setValueAtTime(freq, t);
      const osc2 = ctx.createOscillator(), g2 = ctx.createGain();
      osc2.type = 'sine'; osc2.frequency.setValueAtTime(freq * 2, t);
      g2.gain.setValueAtTime(0.24, t); g2.gain.exponentialRampToValueAtTime(0.02, t + 0.55);
      const osc3 = ctx.createOscillator(), g3 = ctx.createGain();
      osc3.type = 'triangle'; osc3.frequency.setValueAtTime(freq * 3, t);
      g3.gain.setValueAtTime(0.06, t); g3.gain.exponentialRampToValueAtTime(0.005, t + 0.22);

      osc1.connect(lp); osc2.connect(g2); g2.connect(lp); osc3.connect(g3); g3.connect(lp);
      lp.connect(env);
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner(); p.pan.value = Math.max(-0.5, Math.min(0.5, pan));
        env.connect(p); p.connect(this.dryBus); p.connect(this.wetBus);
      } else {
        env.connect(this.dryBus); env.connect(this.wetBus);
      }
      const stopT = t + dur + 0.08;
      osc1.start(t); osc2.start(t); osc3.start(t);
      osc1.stop(stopT); osc2.stop(stopT); osc3.stop(stopT);
    },

    playChord(midis, vel = 0.16, dur = 3.8, spread = 0.09) {
      if (!this.ctx || this.muted) return;
      midis.forEach((m, i) => setTimeout(() => {
        if (!this.muted) this.playPiano(m, vel * (1 - i * 0.08), dur, (i - 1.5) * 0.18);
      }, i * spread * 1000));
    },

    tickScore(s) {
      if (!this.ctx || this.muted) return;
      if (s >= 64.2 && s < 66.2) { this.setPad(0.0001); return; } // 短促呼吸静默
      if (s < 6.0) {
        this.setPad(0.32);
        if (!this.titleChordPlayed && s >= 0.25) {
          this.titleChordPlayed = true;
          this.playChord([50, 57, 64, 66], 0.15, 4.4, 0.14);
        }
        return;
      }

      let mood = 'contemplate', notes = [50, 57, 62, 65, 64, 57, 46, 53, 57, 62, 43, 50, 57, 60, 45, 52, 57, 61], stepGap = 1.32, padLvl = 0.28, vel = 0.13;
      if (s < 11.2 || s >= 104.5) {
        mood = 'golden';
        notes = [50, 57, 62, 66, 69, 66, 64, 57, 47, 54, 62, 66, 43, 50, 59, 64];
        stepGap = s >= 104.5 ? 1.1 : 0.95; padLvl = 0.45; vel = 0.15;
      } else if (s >= 50.2 && s < 61.2) {
        // 穿越机飞行段：流淌上扬的动感分解和弦
        mood = 'fpv';
        notes = [50, 57, 62, 66, 69, 74, 69, 66, 55, 62, 67, 71, 57, 64, 69, 73];
        stepGap = 0.44; padLvl = 0.36; vel = 0.14;
      } else if (s >= 66.2 && s < 83.6) {
        // 17 秒不间断爆发段：紧迫推升的脉冲低音
        mood = 'storm';
        notes = [50, 57, 62, 57, 48, 55, 60, 55, 46, 53, 58, 53, 45, 52, 57, 61];
        stepGap = 0.46; padLvl = 0.26; vel = 0.095;
      } else if (s >= 83.6 && s < 104.5) {
        mood = 'wall';
        notes = [50, 57, 62, 64, 66, 62, 57, 69, 55, 62, 66, 71, 57, 64, 69, 74];
        stepGap = 0.62; padLvl = 0.36; vel = 0.135;
      }

      this.setPad(padLvl);
      if (mood !== this.lastMood) { this.lastMood = mood; this.noteStep = 0; this.nextNoteAt = s + 0.12; }
      if (s >= this.nextNoteAt) {
        const midi = notes[this.noteStep % notes.length];
        this.playPiano(midi, vel * (0.88 + Math.random() * 0.24), mood === 'fpv' ? 1.7 : 2.8, ((this.noteStep % 5) - 2) * 0.14);
        this.noteStep++;
        this.nextNoteAt = s + stepGap;
      }
    },

    mechClick(intensity = 1, pitchBoost = 0) {
      if (!this.ctx || this.muted || !this.noiseBuf) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = (1950 + Math.random() * 1450) * (1 + pitchBoost * 0.5);
      bp.Q.value = 2.6 + Math.random() * 1.8;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime((0.12 + Math.random() * 0.1) * intensity, t + 0.0018);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);

      const body = ctx.createOscillator(), bg = ctx.createGain();
      body.type = 'sine';
      body.frequency.setValueAtTime(260 + Math.random() * 140 + pitchBoost * 100, t);
      body.frequency.exponentialRampToValueAtTime(88, t + 0.014);
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.linearRampToValueAtTime(0.075 * intensity, t + 0.002);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);

      src.connect(bp); bp.connect(ng); body.connect(bg);
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 1.3 - 0.65;
        ng.connect(p); bg.connect(p); p.connect(this.dryBus);
      } else { ng.connect(this.dryBus); bg.connect(this.dryBus); }
      src.start(t); body.start(t); body.stop(t + 0.019);
    },

    rainBurst(intensity = 1, progress = 0.5) {
      if (!this.ctx || this.muted) return;
      this.mechClick(intensity, progress);
      if (Math.random() < 0.78) setTimeout(() => { if (!this.muted) this.mechClick(intensity * 0.8, progress + 0.15); }, 14 + Math.random() * 22);
      if (progress > 0.25 && Math.random() < 0.56) setTimeout(() => { if (!this.muted) this.mechClick(intensity * 0.65, progress + 0.3); }, 28 + Math.random() * 28);
    },

    syncBgm(s, isPlaying) {
      if (!bgmEl || !useExternalBgm) return;
      bgmEl.muted = this.muted;
      // 1:04-1:06 短促呼吸压低音量，1:55.5-2:00 平滑淡出收尾
      let vol = 0.88;
      if (s >= 64.2 && s < 66.2) vol = 0.22;
      else if (s >= 115.5) vol = Math.max(0, 0.88 * (1 - (s - 115.5) / 4.5));
      bgmEl.volume = Math.max(0, Math.min(1, vol));
      if (isPlaying) {
        if (Math.abs((bgmEl.currentTime || 0) - s) > 0.45 && bgmEl.readyState >= 1) {
          try { bgmEl.currentTime = s; } catch (e) {}
        }
        if (bgmEl.paused) bgmEl.play().catch(() => {});
      } else if (!bgmEl.paused) {
        bgmEl.pause();
      }
    },
    toggleMute() {
      this.muted = !this.muted;
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.82, this.ctx.currentTime, 0.08);
      if (bgmEl) bgmEl.muted = this.muted;
      $('btn-mute').textContent = this.muted ? '静' : '声';
    }
  };

  // ---------- 底层实时 3D 引擎接入 ----------
  let PV = null;
  function attachStage() {
    const shotFlag = qp.get('shot') === '1' ? 'shot=1&' : '';
    stage.src = `../hzwest.html?noIntro=1#${shotFlag}sheet=S-000&t=1118&mode=lit&play=0`;
    stage.addEventListener('load', () => {
      const d = stage.contentDocument, w = stage.contentWindow;
      if (d) {
        const st = d.createElement('style');
        st.id = 'film-cinema-css';
        st.textContent = `
          #big,#bar,#rd,#fin,#calc,#log,#mod-ui,#lead,#info,#intro,#col,#sh-jack,#sh-plug { display:none !important; }
          #v3, #view, #gl { position:fixed !important; inset:0 !important; width:100% !important; height:100% !important; }
        `;
        d.head.appendChild(st);
      }
      const poll = setInterval(() => {
        if (w && w.__pv && w.__pv.ready) {
          clearInterval(poll);
          PV = w.__pv;
          PV.noHud = true; PV.noLead = true; PV.noSheet = true;
          PV.layout && PV.layout();
          PV.opt({ play: false, auto: false, mode: 'lit' });
          PV.set(1118);
          PV.setCam([-460, 150, 480], [0, 32, 30]);
          if (hp.has('t') || hp.has('fpv')) {
            curtain.classList.add('gone');
            seekTo(hp.has('t') ? (+hp.get('t') || 0) : 49.8, false);   // #fpv=<name> 直接停在 FPV 段前待飞
          }
        }
      }, 120);
    });
  }

  // ---------- 穿越机 FPV 航线（任务 #38 底座：航线数据与取样器在 fpv-routes.js，按 URL #fpv=<name> 切换）----------
  // fpv-routes.js 动态加载（不改 index.html）；FPV 段到来前（片时 50.2 秒）早已就绪；万一没加载上，FPV 段沿用上一段机位不动。
  let FPV = null, fpvRoute = null;
  const fpvWant = hp.get('fpv') || '';
  function loadScript(src, cb) { const el = document.createElement('script'); el.src = src; el.onload = cb; el.onerror = () => console.warn('[film] 加载失败：' + src); document.head.appendChild(el); }
  loadScript('fpv-routes.js?v=1', () => {
    FPV = window.HZ_FPV || null; if (!FPV) return;
    fpvRoute = (fpvWant && FPV.get(fpvWant)) || FPV.get(FPV.DEFAULT) || FPV.routes[0] || null;
    if (fpvWant && (!fpvRoute || fpvRoute.name !== fpvWant)) console.warn('[film] #fpv=' + fpvWant + ' 不存在，退回 ' + (fpvRoute && fpvRoute.name) + '；可选：' + FPV.routes.map(r => r.name).join(', '));
    if (hp.has('fpvcheck')) loadScript('fpv-selfcheck.js?v=1', () => {});
  });
  window.__fpv = { route: () => fpvRoute, use: name => { const r = FPV && FPV.get(name); if (r) fpvRoute = r; return !!r; } };

  // ---------- 剧本字幕表（v3：穿越机路线 + 不间断时间爆发 + 50人团队对照 + 新结尾句） ----------
  const SUBS = [
    [13.0, 17.4, '一开始，我只是想做个大点的 3D 模型。', false],
    // Act 1: 起念
    [18.2, 21.4, '没想好做什么，随口说了句「大阪城」。', false],
    [21.6, 24.0, '没画草图，做到哪儿算哪儿。', false],
    [24.2, 26.4, '它自己看一眼，改一笔，又改一笔。', false],
    [26.6, 29.0, '后来，这座城长出了一张筑城图。', false],
    [29.2, 31.4, '过了几天，我觉得不够大。', false],
    [31.6, 33.8, '试了座码头，太散，看不清。', false],
    [34.0, 36.4, '我说，换吧——大桥、车站、大坝都行。', false],
    [36.6, 38.4, '它自己翻出了一个名字。', false],
    [38.6, 40.6, '那天之前，我没听说过它。', false],
    // Act 2a: 生长 + 穿越机视角
    [41.2, 44.4, '纸上先铺出站台和轨道。', false],
    [44.8, 47.8, '整座站，落成了纸上的墨线。', false],
    [48.0, 50.0, '屋顶被千斤顶整体抬起来。', false],
    [50.6, 55.2, '钻过云门，贴着轨道和站台一路穿进去。', true],
    [55.6, 60.4, '掠过网架，从四朵云屋顶上面翻出来。', true],
    // Act 2b: 克制收口 + 17 秒不间断爆发
    [64.2, 66.2, '接下来近三个小时，我没再说一句话。', true],
    [66.8, 71.2, '前二十天零零散散，到了杭州西站，突然炸开。', false],
    [71.8, 76.6, '三个小时 87 次改动，最快一小时 41 次。', false],
    [77.2, 82.8, '最密的一天，它自己改了 296 次。', false],
    // Act 3: 2500 张图纸 vs 50 人团队数月工期
    [84.2, 87.4, '要是全靠人工来画——', false],
    [88.0, 92.2, '2500 多张图纸，加上三维推演和交互页面。', false],
    [92.6, 97.0, '正常至少要一支四五十人的团队，干上好几个月。', false],
    [97.4, 100.2, '这里，一个专业人员都没坐进来。', false],
    [100.6, 104.2, '现在，整座站都在这一页里。', false],
    // Act 4: 尾声
    [110.5, 118.2, '现在，它还在继续生长中……', true],
  ];

  // ---------- 状态机 ----------
  let playing = false, sec = 0, lastTs = 0, lastClickSec = -1, lastEventIdx = -1, flashIdx = 0;
  let lastMode = '', lastSheet = '', ended = false;
  const lerp = (a, b, u) => a + (b - a) * Math.max(0, Math.min(1, u));
  const fmtMMSS = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  function setEngine(sheet, tDay, mode, camPos, camTgt) {
    if (!PV) return;
    if (sheet !== lastSheet) { lastSheet = sheet; PV.setSheet(sheet); }
    if (mode !== lastMode) { lastMode = mode; PV.opt({ mode, play: false, auto: false }); }
    if (PV.setCut) PV.setCut(0);
    PV.set(tDay);
    if (camPos && camTgt && !ended) PV.setCam(camPos, camTgt);
  }

  function pushFlashPlate(ev) {
    const plate = FLASH_PLATES[flashIdx % FLASH_PLATES.length];
    flashIdx++;
    // 更新右侧高频快门主框
    fsImg.src = plate[0];
    fsCode.textContent = plate[1];
    fsTime.textContent = ev[0];
    fsHash.textContent = ev[2];
    // 往左侧图纸瀑布推入一张缩略图卡片
    const card = document.createElement('div');
    card.className = 'fstrip-card';
    card.innerHTML = `<img src="${plate[0]}" alt=""><div class="fstrip-meta"><strong>${plate[1]}</strong><span>${ev[2]}</span></div>`;
    flashStrip.prepend(card);
    while (flashStrip.children.length > 6) flashStrip.removeChild(flashStrip.lastChild);
  }

  function triggerPulse(ev, isStorm, progress) {
    etTag.textContent = ev[1];
    etHash.textContent = ev[2];
    ckVal.textContent = ev[0];
    if (isStorm) pushFlashPlate(ev);
    pulse.classList.add(isStorm ? 'storm' : 'flash');
    clearTimeout(pulse._t);
    pulse._t = setTimeout(() => pulse.classList.remove('flash', 'storm'), isStorm ? 75 : 130);
    if (playing) {
      if (isStorm) Audio.rainBurst(1.08, progress);
      else Audio.mechClick(0.65, 0);
    }
  }

  function renderAt(s) {
    scrubFill.style.width = (Math.min(1, s / DUR) * 100).toFixed(2) + '%';
    timeRead.textContent = `${fmtMMSS(s)} / ${fmtMMSS(DUR)}`;

    // 片头（0 - 6.0s）
    titleSeq.classList.toggle('on', s < 6.0);
    titleSeq.classList.toggle('step1', s >= 0.25);
    titleSeq.classList.toggle('step2', s >= 1.15);
    titleSeq.classList.toggle('step3', s >= 2.15);

    // 字幕
    let curSub = null;
    for (const [a, b, txt, dark] of SUBS) {
      if (s >= a && s <= b && txt) { curSub = { txt, dark }; break; }
    }
    if (curSub) {
      if (subText.textContent !== curSub.txt) subText.textContent = curSub.txt;
      subText.classList.toggle('dark', !!curSub.dark);
      subText.classList.add('show');
    } else {
      subText.classList.remove('show');
    }

    // 分幕状态
    const inOrigin = s >= 17.5 && s < 40.8;
    const inSlow = s >= 40.8 && s < 50.2;
    const inFpv = s >= 50.2 && s < 61.2;
    const inHumanNote = s >= 61.2 && s < 64.2;
    const inBlack = s >= 64.2 && s < 66.2;
    const inStorm = s >= 66.2 && s < 83.6;
    const inWall = s >= 83.6 && s < 104.5;
    const isEnd = s >= 116.0;

    veil.classList.toggle('on', s >= 17.2 && s < 40.8);
    veil.classList.toggle('soft', s >= 11.2 && s < 17.2);
    blackout.classList.toggle('on', inBlack);

    originStage.classList.toggle('on', inOrigin);
    $('o-osaka').classList.toggle('show', s >= 18.2);
    $('o-link-1').classList.toggle('show', s >= 26.4);
    $('o-build').classList.toggle('show', s >= 26.6);
    $('o-link-2').classList.toggle('show', s >= 31.4);
    $('o-port').classList.toggle('show', s >= 31.6);
    $('o-link-3').classList.toggle('show', s >= 36.4);
    $('o-hz').classList.toggle('show', s >= 36.6);
    heroName.classList.toggle('show', s >= 38.6);

    // 顶部克制的 14:33 批注微条
    humanNote.classList.toggle('on', inHumanNote);

    // 17 秒不间断爆发：机械战警式图纸闪切 + 38 天时间密度柱图 + 连续计数 1 -> 87 -> 296
    flashStrip.classList.toggle('on', inStorm);
    flashShutter.classList.toggle('on', inStorm);
    timeGraph.classList.toggle('on', inStorm);
    burstCounter.classList.toggle('on', inStorm);
    if (!inStorm && flashStrip.children.length) flashStrip.innerHTML = '';

    if (inStorm) {
      const u = (s - 66.2) / (83.6 - 66.2); // 0 -> 1
      const count = u < 0.45
        ? Math.round(lerp(1, 87, Math.pow(u / 0.45, 1.4)))
        : Math.round(lerp(87, 296, Math.pow((u - 0.45) / 0.55, 0.9)));
      bcNum.textContent = String(count);

      // 暗黑脉冲爆发图：激光游标扫过 38 天，撞上 11-08 时点燃朱红尖峰热晕与震波环
      const scanX = +(u * 760).toFixed(1);
      tbgClipRect.setAttribute('width', scanX);
      tbgScan.setAttribute('x1', scanX);
      tbgScan.setAttribute('x2', scanX);
      const hitPeak = scanX >= 455;
      tbgHeat.setAttribute('opacity', hitPeak ? '1' : '0');
      tbgPeakMark.setAttribute('opacity', hitPeak ? '1' : '0');
    }

    ticker.classList.toggle('on', inSlow);
    clockBox.classList.toggle('on', inSlow || inStorm);

    // Act 3: 2500 张图纸阵列 + 50 人人体图标对比
    sheetsWall.classList.toggle('on', inWall);
    sheetsWall.classList.toggle('collapse', s >= 100.6 && inWall);
    if (inWall) {
      const u = Math.max(0, Math.min(1, (s - 84.2) / 5.2));
      const litCount = Math.floor(u * tiles.length);
      for (let i = 0; i < tiles.length; i++) tiles[i].classList.toggle('lit', i < litCount);
      wallNum.textContent = u >= 0.99 ? '2 500+' : String(Math.round(lerp(0, 2500, u * u))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

      const showCrew = s >= 90.0;
      crewPanel.classList.toggle('on', showCrew);
      const crewProg = Math.max(0, Math.min(1, (s - 90.4) / 4.8));
      const litPeople = Math.floor(crewProg * personIcons.length);
      const ghostOut = s >= 97.4;
      for (let i = 0; i < personIcons.length; i++) {
        personIcons[i].classList.toggle('lit', showCrew && i < litPeople);
        personIcons[i].classList.toggle('ghost', ghostOut);
      }
      crewZero.classList.toggle('show', ghostOut);
    }

    // 结尾交权
    if (isEnd !== ended) {
      ended = isEnd;
      document.body.classList.toggle('ended', ended);
      endActions.classList.toggle('on', ended);
      if (ended && PV) {
        PV.opt({ mode: 'lit', play: false, auto: false });
        if (!useExternalBgm) Audio.playChord([50, 57, 62, 66, 69], 0.16, 4.8, 0.12);
      }
    }

    if (useExternalBgm) Audio.syncBgm(s, playing);
    else if (playing) Audio.tickScore(s);

    // 脉冲与高频图纸闪切调度（爆发段从每秒 6 帧加速到每秒 16 帧！）
    if (inSlow || inStorm) {
      const stormProg = inStorm ? (s - 66.2) / (83.6 - 66.2) : 0;
      const interval = inStorm ? lerp(0.16, 0.058, Math.pow(stormProg, 0.85)) : 0.62;
      if (s - lastClickSec >= interval || s < lastClickSec) {
        lastClickSec = s;
        const idx = inStorm
          ? (lastEventIdx + 1) % EVENTS.length
          : Math.min(EVENTS.length - 1, Math.floor(((s - 40.8) / 10) * 60));
        if (idx !== lastEventIdx || inStorm) {
          lastEventIdx = idx;
          triggerPulse(EVENTS[idx], inStorm, stormProg);
        }
      }
    }

    // ---------- 3D 实时运镜与工期驱动 ----------
    if (s < 11.0) {
      const u = Math.max(0, (s - 5.5) / 5.5);
      setEngine('S-000', lerp(1116, 1122, u), 'lit', [lerp(-480, -400, u), lerp(145, 130, u), lerp(470, 420, u)], [0, 30, 30]);
    } else if (s < 17.5) {
      const u = (s - 11.0) / 6.5;
      setEngine('S-000', Math.max(0, lerp(780, 0, u * u)), 'ink', [lerp(-400, 460, u), lerp(130, 290, u), lerp(420, 460, u)], [0, 14, 0]);
    } else if (s < 40.8) {
      const u = (s - 17.5) / 23.3;
      setEngine('S-000', 0, 'ink', [460 * Math.cos(u * 0.5), 290, 460 * Math.sin(u * 0.5 + 0.8)], [0, 10, 0]);
    } else if (s < 47.8) {
      const u = (s - 40.8) / 7.0;
      setEngine('S-000', lerp(160, 460, u), 'ink', [lerp(360, -260, u), lerp(165, 190, u), lerp(310, 360, u)], [0, 16, 10]);
    } else if (s < 50.2) {
      const u = (s - 47.8) / 2.4;
      setEngine('S-301', lerp(659.2, 662.5, u), 'ink', [lerp(245, 205, u), lerp(52, 62, u), lerp(120, 92, u)], [80, 34, 42]);
    } else if (s < 64.2) {
      // 穿越机 FPV 段：片时 s 对应航线时 t = s − 50.2；航线由 #fpv=<name> 选（缺省 route-classic）
      if (fpvRoute) {
        const t = s - FPV.FILM_T0, q = FPV.sample(fpvRoute, t);
        setEngine('S-000', FPV.day(fpvRoute, t), 'lit', q.pos, q.look);
      }
    } else if (s < 83.6) {
      // 17 秒不间断爆发背景：全站高速生长 + 大幅环绕推近
      const u = Math.max(0, (s - 66.2) / (83.6 - 66.2));
      const ang = lerp(-0.9, 1.4, u);
      const rad = lerp(450, 310, u);
      setEngine('S-000', lerp(220, 1085, u), 'ink', [rad * Math.cos(ang), lerp(205, 128, u), rad * Math.sin(ang)], [0, 28, 8]);
    } else if (s < 104.5) {
      const u = (s - 83.6) / (104.5 - 83.6);
      setEngine('S-000', lerp(1050, 1095, u), 'ink', [lerp(-380, -480, u), lerp(180, 165, u), lerp(390, 460, u)], [0, 28, 20]);
    } else {
      // 尾声：黄昏实景开通亮灯，交出控制权
      const u = Math.min(1, (s - 104.5) / 11.5);
      setEngine('S-000', lerp(1096, 1124, u), 'lit', [lerp(-500, -405, u), lerp(155, 116, u), lerp(480, 415, u)], [-10, 26, 20]);
    }
  }

  function seekTo(targetSec, keepPlay) {
    sec = Math.max(0, Math.min(DUR, targetSec));
    lastClickSec = -1;
    Audio.nextNoteAt = sec + 0.1;
    if (sec < 0.25) Audio.titleChordPlayed = false;
    if (keepPlay === false) { playing = false; document.body.classList.add('paused'); $('btn-play').textContent = '▶'; }
    if (bgmEl && useExternalBgm && bgmEl.readyState >= 1) { try { bgmEl.currentTime = sec; } catch (e) {} }
    renderAt(sec);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!lastTs) lastTs = now;
    const dt = Math.min(0.1, (now - lastTs) / 1000);
    lastTs = now;
    if (playing) {
      sec += dt;
      if (sec >= DUR) { sec = DUR; playing = false; document.body.classList.add('paused'); $('btn-play').textContent = '▶'; if (bgmEl) bgmEl.pause(); }
      renderAt(sec);
    }
  }

  function startFilm() {
    Audio.init();
    Audio.titleChordPlayed = false; Audio.nextNoteAt = 0; Audio.lastMood = '';
    curtain.classList.add('gone');
    ended = false;
    document.body.classList.remove('ended', 'paused');
    $('btn-play').textContent = '❚❚';
    playing = true;
    lastTs = performance.now();
    if (bgmEl && useExternalBgm) {
      try { bgmEl.currentTime = sec; } catch (e) {}
      bgmEl.play().catch(() => {});
    }
    renderAt(sec);
  }

  $('btn-start').onclick = () => { sec = 0; startFilm(); };
  $('btn-replay').onclick = () => { sec = 0; startFilm(); };
  $('btn-play').onclick = () => {
    Audio.init();
    if (sec >= DUR - 0.1) sec = 0;
    playing = !playing;
    document.body.classList.toggle('paused', !playing);
    $('btn-play').textContent = playing ? '❚❚' : '▶';
    if (!playing) { Audio.setPad(0.0001); if (bgmEl) bgmEl.pause(); }
    else if (bgmEl && useExternalBgm) { try { bgmEl.currentTime = sec; } catch (e) {} bgmEl.play().catch(() => {}); }
  };
  $('btn-mute').onclick = () => Audio.toggleMute();

  {
    const sc = $('scrub');
    let dragging = false;
    const at = e => {
      const r = sc.getBoundingClientRect();
      seekTo(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * DUR);
    };
    sc.addEventListener('pointerdown', e => { dragging = true; sc.setPointerCapture(e.pointerId); at(e); });
    sc.addEventListener('pointermove', e => { if (dragging) at(e); });
    sc.addEventListener('pointerup', e => { dragging = false; try { sc.releasePointerCapture(e.pointerId); } catch (x) {} });
  }

  addEventListener('keydown', e => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!curtain.classList.contains('gone')) { sec = 0; startFilm(); }
      else $('btn-play').click();
    } else if (e.code === 'ArrowRight') { seekTo(sec + 5); }
    else if (e.code === 'ArrowLeft') { seekTo(sec - 5); }
  });

  window.__film = {
    seek: s => { curtain.classList.add('gone'); seekTo(s, false); },
    play: () => startFilm(),
    state: () => ({ sec, playing, ended, ready: !!PV })
  };

  attachStage();
  requestAnimationFrame(loop);
})();
