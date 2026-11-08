'use strict';
// 一键运行全部检查：HZ-01…HZ-05、联动接口 v2 宿主检查、近景人员、吊距、引线标注、插件检查，以及插件镜头扫描（check_cams 逐图一项）。
// 任一失败即整体失败（FAIL check_all at <项>）。
//
// 并行：默认按 CPU 核数并行（环境变量 HZ_JOBS 可改，HZ_JOBS=1 即顺序跑）；每项输出缓冲后按清单顺序整段打印，不串行。
// 分片：--shard=i/n 只跑清单里第 i 片（1 起算，按序号取模），给单条命令有时长上限的环境分几次跑；CI 跑全量。
// --list 只列清单。
//
// 镜头扫描：CAMS 里的图逐张跑 `check_cams.js <图号>`，违反即失败；CAMS_REPORT 里的图只报告不判失败（目前为空：D-14 后五张插件与 S-001/S-002 均 0 违反）。
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const scripts = ['check_make.js', 'check_sheets.js', 'check_atlas.js', 'check_real.js', 'check_realparts.js', 'check_linkage.js', 'check_actors.js', 'check_crane.js', 'check_callouts.js'];
const CAMS = ['S-001', 'S-002', 'S-101', 'S-201', 'S-251', 'S-401', 'S-501'];
const CAMS_REPORT = [];   // 只报告、不判失败的图号（有遗留违反时临时放这里，并在 CLAIMS 记明）
const items = scripts.map(s => ({ name: s, args: [s], report: false }))
  .concat(CAMS.map(id => ({ name: 'check_cams.js ' + id, args: ['check_cams.js', id], report: false })))
  .concat(CAMS_REPORT.map(id => ({ name: 'check_cams.js ' + id + '（报告模式）', args: ['check_cams.js', id], report: true })));

const argv = process.argv.slice(2);
if (argv.includes('--list')) { items.forEach((it, i) => console.log((i + 1) + '\t' + it.name)); process.exit(0); }
const sh = (argv.find(a => a.startsWith('--shard=')) || '').slice(8).split('/').map(Number);
const run = sh.length === 2 && sh[1] > 0 ? items.filter((_, i) => i % sh[1] === sh[0] - 1) : items;
const label = run === items ? '' : ` shard ${sh[0]}/${sh[1]}`;
const JOBS = Math.max(1, +process.env.HZ_JOBS || os.cpus().length || 1);

const res = new Array(run.length);
let next = 0, shown = 0, failed = null;
function flush() {
  while (shown < run.length && res[shown]) {
    const r = res[shown], it = run[shown];
    process.stdout.write(r.out);
    if (r.code !== 0 && !it.report && !failed) failed = it.name;
    if (r.code !== 0 && it.report) console.log('WARN check_all: ' + it.name + ' 有违反（报告模式，不判失败）');
    shown++;
  }
  if (shown === run.length) {
    if (failed) { console.log('FAIL check_all at ' + failed + label); process.exit(1); }
    console.log('OK check_all ' + run.length + '/' + run.length + label);
    process.exit(0);
  }
}
function start() {
  if (next >= run.length) return;
  const i = next++, it = run[i], t0 = Date.now();
  const p = spawn(process.execPath, [path.join(__dirname, it.args[0]), ...it.args.slice(1)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', d => { out += d; });
  p.stderr.on('data', d => { out += d; });
  p.on('close', code => {
    if (process.env.HZ_TIMING) out += `  [${it.name} ${((Date.now() - t0) / 1000).toFixed(1)} s]\n`;
    res[i] = { code: code === null ? 1 : code, out };
    flush(); start();
  });
}
for (let k = 0; k < Math.min(JOBS, run.length); k++) start();
