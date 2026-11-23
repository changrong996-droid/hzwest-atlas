#!/usr/bin/env python3
# 仓库网页预览（Pages）：直接从 git 仓库里取某个分支的文件当网页返回，不用检出、不用构建。
#   打开  http://<主机>:<端口>/pages/                      → 分支列表
#         http://<主机>:<端口>/pages/<分支>/web/hzwest.html  → 该分支最新提交的页面
#   分支名可以带斜杠（agent/hark-fangyi/ctx-layers），按最长匹配认。
# 只读：只执行 git for-each-ref / rev-parse / cat-file，不写仓库。只依赖 Python 3.8+ 与 git。
# 用法：  PAGES_USER=xinhao PAGES_CODE=<登录码> python3 serve.py --repo /path/to/hzwest-atlas-cs.git --port 8083
#   不设 PAGES_CODE 就不要求登录（只在内网这样用）。
import argparse, base64, hmac, mimetypes, os, posixpath, subprocess, sys, threading, time
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote, unquote, urlsplit

MIME = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm',
        '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.md': 'text/plain', '.txt': 'text/plain',
        '.geojson': 'application/geo+json', '.glb': 'model/gltf-binary', '.gz': 'application/gzip'}
TEXTY = ('text/', 'application/json', 'application/geo+json', 'image/svg+xml')

class Repo:
    def __init__(s, path, ttl=5):
        s.path, s.ttl, s.lock = path, ttl, threading.Lock()
        s._refs, s._t = {}, 0
        s.blobs = {}                    # (提交, 路径) → 内容；提交号不变内容就不变，可放心缓存
        s.cap, s.used = 200 << 20, 0     # 缓存上限 200 MB
    def git(s, *a, inp=None):
        r = subprocess.run(['git', '--git-dir', s.path, *a], input=inp, capture_output=True, timeout=30)
        return r.returncode, r.stdout
    def refs(s):
        with s.lock:
            if time.time() - s._t > s.ttl:
                code, out = s.git('for-each-ref', '--format=%(refname:short) %(objectname) %(committerdate:iso8601)', 'refs/heads')
                if code == 0:
                    s._refs = {}
                    for ln in out.decode('utf-8', 'replace').splitlines():
                        b, sha, *d = ln.split(' ')
                        s._refs[b] = (sha, ' '.join(d)[:16])
                s._t = time.time()
            return dict(s._refs)
    def blob(s, sha, path):
        k = (sha, path)
        if k in s.blobs: return s.blobs[k]
        code, out = s.git('cat-file', '-t', f'{sha}:{path}')
        kind = out.strip().decode() if code == 0 else None
        if kind == 'tree': v = ('tree', None)
        elif kind == 'blob':
            code, data = s.git('cat-file', 'blob', f'{sha}:{path}')
            v = ('blob', data) if code == 0 else (None, None)
        else: v = (None, None)
        with s.lock:
            n = len(v[1] or b'')
            if s.used + n > s.cap: s.blobs.clear(); s.used = 0
            s.blobs[k] = v; s.used += n
        return v
    def tree(s, sha, path):
        code, out = s.git('ls-tree', f'{sha}:{path}' if path else sha)
        if code != 0: return []
        res = []
        for ln in out.decode('utf-8', 'replace').splitlines():
            meta, name = ln.split('\t', 1)
            res.append((name, meta.split(' ')[1] == 'tree'))
        return sorted(res, key=lambda x: (not x[1], x[0]))

def page(title, body):
    return ('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
            f'<title>{escape(title)}</title><style>body{{font:15px/1.6 system-ui,sans-serif;margin:2em auto;max-width:860px;padding:0 1em;color:#222}}'
            'a{color:#a31d1d;text-decoration:none}a:hover{text-decoration:underline}td{padding:2px 14px 2px 0}.d{color:#888;font-size:13px}code{background:#f3eee6;padding:1px 4px}</style>'
            f'<h2>{escape(title)}</h2>{body}').encode()

class H(BaseHTTPRequestHandler):
    server_version = 'hz-pages/1'
    def log_message(s, fmt, *a):
        if not s.server.quiet: sys.stderr.write('%s %s\n' % (s.address_string(), fmt % a))
    def authed(s):
        code = s.server.code
        if not code: return True
        h = s.headers.get('Authorization', '')
        if h.startswith('Basic '):
            try: u, _, p = base64.b64decode(h[6:]).decode('utf-8').partition(':')
            except Exception: return False
            return hmac.compare_digest(p, code) and (not s.server.user or hmac.compare_digest(u, s.server.user))
        return False
    def send(s, status, body, ctype='text/html; charset=utf-8', extra=()):
        s.send_response(status)
        s.send_header('Content-Type', ctype); s.send_header('Content-Length', str(len(body)))
        for k, v in extra: s.send_header(k, v)
        s.end_headers()
        if s.command != 'HEAD': s.wfile.write(body)
    def do_HEAD(s): s.do_GET()
    def do_GET(s):
        if not s.authed():
            return s.send(401, '需要登录码'.encode(), 'text/plain; charset=utf-8', [('WWW-Authenticate', 'Basic realm="hz-pages", charset="UTF-8"')])
        url = urlsplit(s.path); p = unquote(url.path)
        if p in ('', '/'): return s.send(302, b'', extra=[('Location', '/pages/')])
        if not p.startswith('/pages/'): return s.send(404, page('没有这个地址', '<p><a href="/pages/">回分支列表</a></p>'))
        rest = p[len('/pages/'):]
        R = s.server.repo; refs = R.refs()
        if rest == '':
            rows = ''.join(f'<tr><td><a href="/pages/{quote(b)}/">{escape(b)}</a></td><td class="d">{escape(d)}</td><td class="d"><code>{sha[:7]}</code></td>'
                           f'<td>{"<a href=" + chr(34) + "/pages/" + quote(b) + "/web/hzwest.html" + chr(34) + ">打开预览</a>" if R.blob(sha, "web/hzwest.html")[0] == "blob" else ""}</td></tr>'
                           for b, (sha, d) in sorted(refs.items(), key=lambda kv: kv[1][1], reverse=True))
            return s.send(200, page('分支预览', f'<table>{rows}</table><p class="d">按最近提交排序；页面取各分支最新提交，推送后刷新即可看到。</p>'), extra=[('Cache-Control', 'no-store')])
        br = max((b for b in refs if rest == b or rest.startswith(b + '/')), key=len, default=None)
        if br is None: return s.send(404, page('没有这个分支', '<p><a href="/pages/">回分支列表</a></p>'))
        sha = refs[br][0]
        path = posixpath.normpath(rest[len(br):].lstrip('/')) if rest[len(br):].strip('/') else ''
        if path in ('.',): path = ''
        if path.startswith('..') or path.startswith('/'): return s.send(400, b'bad path', 'text/plain')
        if path == '' and not rest.endswith('/'): return s.send(302, b'', extra=[('Location', '/pages/' + quote(br) + '/')])
        kind, data = R.blob(sha, path) if path else ('tree', None)
        if kind == 'tree':
            if not p.endswith('/'): return s.send(302, b'', extra=[('Location', quote(p) + '/' + ('?' + url.query if url.query else ''))])
            k2, d2 = R.blob(sha, (path + '/index.html').lstrip('/'))
            if k2 == 'blob': kind, data, path = k2, d2, (path + '/index.html').lstrip('/')
            else:
                items = ''.join(f'<li><a href="{quote(n)}{"/" if t else ""}">{escape(n)}{"/" if t else ""}</a></li>' for n, t in R.tree(sha, path))
                return s.send(200, page(f'{br} : /{path}', f'<p class="d">提交 <code>{sha[:7]}</code> · <a href="/pages/">全部分支</a></p><ul>{items}</ul>'))
        if kind != 'blob': return s.send(404, page('分支里没有这个文件', f'<p>{escape(br)} : {escape(path)}</p><p><a href="/pages/{quote(br)}/">看这个分支的目录</a></p>'))
        ext = posixpath.splitext(path)[1].lower()
        ctype = MIME.get(ext) or mimetypes.guess_type(path)[0] or 'application/octet-stream'
        if ctype.startswith(TEXTY): ctype += '; charset=utf-8'
        etag = '"%s"' % sha[:12]
        if s.headers.get('If-None-Match') == etag: return s.send(304, b'', extra=[('ETag', etag)])
        s.send(200, data, ctype, [('ETag', etag), ('Cache-Control', 'no-cache'), ('X-Branch-Commit', sha[:12])])

def main():
    ap = argparse.ArgumentParser(description='从 git 仓库按分支出网页预览')
    ap.add_argument('--repo', required=True, help='裸仓库或 .git 目录路径')
    ap.add_argument('--host', default='0.0.0.0'); ap.add_argument('--port', type=int, default=8083)
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()
    code, _ = subprocess.run(['git', '--git-dir', a.repo, 'rev-parse', '--git-dir'], capture_output=True).returncode, None
    if code: sys.exit('不是 git 仓库：' + a.repo)
    srv = ThreadingHTTPServer((a.host, a.port), H)
    srv.repo, srv.quiet = Repo(a.repo), a.quiet
    srv.user, srv.code = os.environ.get('PAGES_USER', ''), os.environ.get('PAGES_CODE', '')
    print(f'hz-pages 在 http://{a.host}:{a.port}/pages/  仓库 {a.repo}  登录 {"开" if srv.code else "关"}', flush=True)
    srv.serve_forever()

if __name__ == '__main__': main()
