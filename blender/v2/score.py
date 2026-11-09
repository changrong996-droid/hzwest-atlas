#!/usr/bin/env python3
# Gemini 4 逐张评分（一次只送 1 张，先压 JPEG ≤300 KB）：score.py <轮次目录> [shot_style ...]
# 结果追加到 <目录>/scores.jsonl；429 / 错误等 120 s 重试一次，仍失败记 {"err":...}
import sys, os, json, subprocess, time, re
D = sys.argv[1]; names = sys.argv[2:] or [f'{a}_{b}' for a in ('lift', 'roof', 'train', 'night') for b in ('clay', 'ink', 'real')]
SHOT = {
 'lift': 'S-301 整体提升中段：杭州西站钢网架屋盖（四个分区已合龙）由 32 台红色液压提升器同步提升 5.8 m 的中途（已升约一半），柱头尚未连接。观众要一眼看出“整片屋盖悬在半空、正被提升器顶上去”。',
 'roof': 'S-401 屋面合拢：金属屋面刚铺完，屋面由“四朵云”组成——四个象限各鼓起一朵云（约 3.5 m），云与云之间是十字采光顶形成的“云缝”。观众要一眼看出四朵云和十字云缝。',
 'train': 'S-501 开通：首趟复兴号 8 编组列车（约 210 m，银白车身、红色腰线）在高架股道上驶向站房，南侧 80 m 高的“云门”（中间有门洞的巨型门框建筑）必须与列车同框。观众要同时读出列车、站房和云门。',
 'night': '夜景亮灯全景：开通后夜晚，站房十字采光顶、玻璃幕墙、云门立面亮灯，整个站区全景。',
}
STY = {'clay': '白模（统一浅色材质，只靠光影读形体）', 'ink': '墨线（纸上墨线 NPR：纸白底、墨色轮廓线、平涂阴影；夜景版为深蓝底浅线的蓝图负片）', 'real': '实景（接近真实材质与日光/夜光）'}
RUB = '''你是建筑可视化评审。项目：杭州西站施工推演图册，网页画面语言是“纸上墨线”（NPR），完工后才亮灯，不要 SketchUp 灰盒子或游戏画风。
本图镜头：{shot}
本图风格：{sty}
按下面四项打分（可用 0.5 分）：构图（0–3）、主体可读（0–3）、质感光线（0–2）、贴合墨线语言（0–2；白模/实景版看它与墨线图册能否成套）。
给出最大的三个问题，每条一句、要能直接改（说清改什么、往哪个方向）。
只输出 JSON：{{"comp":x,"read":x,"light":x,"ink":x,"total":x,"problems":["…","…","…"]}}'''
G = os.path.expanduser('~/tv-hub/tools/gemini4'); FF = os.path.expanduser('~/.local/bin/ffmpeg')
for n in names:
    src = os.path.join(D, n + '.png'); sj = os.path.join(D, n + '_s.jpg')
    if not os.path.exists(src): src = os.path.join(D, n + '.jpg')   # muse 一版只有入库 jpg 缩略图
    for q in (5, 7, 9, 12):
        subprocess.run([FF, '-loglevel', 'error', '-y', '-i', src, '-vf', 'scale=1280:-2', '-q:v', str(q), sj])
        if os.path.getsize(sj) <= 300 * 1024: break
    sh, st = n.split('_'); prompt = RUB.format(shot=SHOT[sh], sty=STY[st]); rec = {'name': n, 'kb': os.path.getsize(sj) // 1024}
    for att in (1, 2):
        r = subprocess.run(['python3', G, '-i', sj, '--temp', '0.2'], input=prompt, capture_output=True, text=True)
        m = re.search(r'\{.*\}', r.stdout, re.S)
        if r.returncode == 0 and m:
            try: rec.update(json.loads(m.group(0))); rec['by'] = 'gemini-4-argon'; break
            except Exception as e: rec['err'] = 'json ' + str(e)
        else: rec['err'] = (r.stderr or r.stdout)[-300:]
        if att == 1: time.sleep(120)
    open(os.path.join(D, 'scores.jsonl'), 'a').write(json.dumps(rec, ensure_ascii=False) + '\n'); print(json.dumps(rec, ensure_ascii=False), flush=True)
