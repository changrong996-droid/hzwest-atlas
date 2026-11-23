'use strict';
// 一键运行全部检查：HZ-01…HZ-05、联动接口 v2 宿主检查、近景人员、吊距、引线标注、插件检查、认领板数据（check_claims）、履带吊同日台数（check_cranecount --strict）、FPV 航线验收（check_fpv，#50 接线；报告档——其判定依赖的 HZ_FPV 口径未落地，SKIP/违反先报不拦，落地后转严格），以及插件镜头扫描（check_cams 逐图一项）。
// 任一失败即整体失败（FAIL check_all at <项>）。
//
// 并行：默认按 CPU 核数并行（环境变量 HZ_JOBS 可改，HZ_JOBS=1 即顺序跑）；每项输出缓冲后按清单顺序整段打印，不串行。
// 串行：CHECK_ALL_SERIAL=1 或 --serial 时逐项顺序跑（JOBS=1），每项完成即单独报一行 PASS/WARN/FAIL（含耗时；被信号杀掉或拉不起来也留痕），任何一项死掉都留下明确 FAIL 行而不是静默消失，适合小内存预检机。
// 分片：--shard=i/n 只跑清单里第 i 片（1 起算，按序号取模），给单条命令有时长上限的环境分几次跑；CI 跑全量。
// --list 只列清单。SOLO 里的项（有耗时断言）等其余项跑完后单独跑。
//
// 镜头扫描：CAMS 里的图逐张跑 `check_cams.js <图号>`，违反即失败；CAMS_REPORT 里的图只报告不判失败（11-09 起为空）。
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const scripts = ['check_make.js', 'check_sheets.js', 'check_atlas.js', 'check_real.js', 'check_realparts.js', 'check_linkage.js', 'check_actors.js', 'check_crane.js', 'check_callouts.js', 'check_s001.js', 'check_s002.js', 'check_yunmen.js', 'check_info.js', 'check_scopecam.js', 'check_claims.js', 'check_rel.js', 'check_tour.js', 'check_osmctx.js', 'check_fpv.js'];
// 带参数跑的检查：check_cranecount --strict（履带吊全场同日在吊 ≤ 14 台；hzseq 同工序同日 ≤ 5 台限流后接入，11-10）
const STRICT = [['check_cranecount.js', '--strict'], ['check_homomorph.js', '--strict']];
const CAMS = ['S-001', 'S-002', 'S-101', 'S-201', 'S-251', 'S-401', 'S-501'];
// 只报告、不判失败的图号（有遗留违反时临时放这里，并在 CLAIMS 记明）。
// 11-09：D-26 合入（s201.js 加 t=636 帧）后 S-201 违反 0，已移回 CAMS 严格模式
const CAMS_REPORT = [];
// 含耗时断言的检查（check_actors 断言 update / 重排帧耗时）单独跑：并行时 CPU 被占满会误报，等其余项跑完、没有别的进程时再跑
const SOLO = new Set(['check_actors.js']);
const items = scripts.map(s => ({ name: s, args: [s], report: s === 'check_fpv.js', solo: SOLO.has(s) }))
  .concat(STRICT.map(([s, ...a]) => ({ name: [s, ...a].join(' '), args: [s, ...a], report: false })))
  .concat(CAMS.map(id => ({ name: 'check_cams.js ' + id, args: ['check_cams.js', id], report: false })))
  .concat(CAMS_REPORT.map(id => ({ name: 'check_cams.js ' + id + '（报告模式）', args: ['check_cams.js', id], report: true })));

const argv = process.argv.slice(2);
if (argv.includes('--list')) { items.forEach((it, i) => console.log((i + 1) + '\t' + it.name)); process.exit(0); }
const sh = (argv.find(a => a.startsWith('--shard=')) || '').slice(8).split('/').map(Number);
const run = sh.length === 2 && sh[1] > 0 ? items.filter((_, i) => i % sh[1] === sh[0] - 1) : items;
const label = run === items ? '' : ` shard ${sh[0]}/${sh[1]}`;
const SERIAL = process.env.CHECK_ALL_SERIAL === '1' || argv.includes('--serial');
const JOBS = SERIAL ? 1 : Math.max(1, +process.env.HZ_JOBS || os.cpus().length || 1);

const res = new Array(run.length);
let shown = 0, failed = null, running = 0;
const queue = run.map((_, i) => i).filter(i => !run[i].solo), solos = run.map((_, i) => i).filter(i => run[i].solo);
function flush() {
  while (shown < run.length && res[shown]) {
    const r = res[shown], it = run[shown];
    if (!SERIAL) process.stdout.write(r.out);
    if (r.code !== 0 && !it.report && !failed) failed = it.name;
    if (r.code !== 0 && it.report && !SERIAL) console.log('WARN check_all: ' + it.name + ' 有违反（报告模式，不判失败）');
    shown++;
  }
  if (shown === run.length) {
    if (failed) { console.log('FAIL check_all at ' + failed + label); process.exit(1); }
    console.log('OK check_all ' + run.length + '/' + run.length + label);
    process.exit(0);
  }
}
function start() {
  let i;
  if (queue.length) i = queue.shift(); else if (solos.length && running === 0) i = solos.shift(); else return;
  running++; const it = run[i], t0 = Date.now();
  const p = spawn(process.execPath, [path.join(__dirname, it.args[0]), ...it.args.slice(1)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', settled = false;
  p.stdout.on('data', d => { out += d; });
  p.stderr.on('data', d => { out += d; });
  const settle = (code, signal) => {
    if (settled) return; settled = true;
    if (SERIAL) {
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const tag = code === 0 ? 'PASS' : (it.report ? 'WARN' : 'FAIL');
      process.stdout.write(out);
      process.stdout.write(`[${i + 1}/${run.length}] ${tag} ${it.name} (${secs} s${signal ? ', signal ' + signal : ''})\n`);
    }
    if (process.env.HZ_TIMING && !SERIAL) out += `  [${it.name} ${((Date.now() - t0) / 1000).toFixed(1)} s]\n`;
    res[i] = { code: code === null ? 1 : code, out }; running--;
    flush(); for (let k = running; k < JOBS; k++) start();
  };
  p.on('close', (code, signal) => settle(code === null ? 1 : code, signal));
  p.on('error', err => { out += `spawn error: ${err.code || err.message}\n`; settle(1, 'ERR'); });
}
if (!run.length) { console.log("OK check_all 0/0" + label); process.exit(0); }
if (SERIAL) console.log(`serial mode: ${run.length} items, one at a time`);
for (let k = 0; k < JOBS; k++) start();
