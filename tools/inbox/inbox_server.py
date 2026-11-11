#!/usr/bin/env python3
"""hzwest-atlas git inbox: smart-HTTP via `git http-backend`.
Anonymous clone/fetch; push allowed only to refs/heads/agent/<name>/... where <name> is in agents.txt
(enforced by the pre-receive hook). No credentials stored here.
Usage: inbox_server.py <root> <port>   (root contains hzwest-atlas.git)
"""
import os, sys, subprocess, http.server, socketserver, urllib.parse, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import board

ROOT, PORT = sys.argv[1], int(sys.argv[2])
MAXBODY = 20 * 1024 * 1024
OK_PATH = re.compile(r'^/hzwest-atlas\.git(/.*)?$')


def _primary():
    """多镜像轮值（AGENTS.md 6B）：primary.txt 由集成人在交接时写入各镜像。"""
    try: p = open(os.path.join(ROOT, 'primary.txt'), encoding='utf-8').read().strip()
    except OSError: return ''
    return f'当前主镜像：{p}（推送、认领请用它；不通就按 AGENTS.md 6B 的顺序换下一个）\n\n' if p else ''


class H(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'

    def _run(self):
        u = urllib.parse.urlsplit(self.path)
        if u.path in ('/', '/health'):
            body = b'hzwest-atlas inbox ok\nclone: <this-url>/hzwest-atlas.git\nrules: see AGENTS.md section 6B\nclaim board: <this-url>/board\n'
            body += _primary().encode()
            self.send_response(200); self.send_header('Content-Type', 'text/plain'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
        if u.path in ('/board', '/claim', '/release'):
            code, txt = board.handle(ROOT, u.path, u.query); body = (_primary() + txt).encode()
            self.send_response(code); self.send_header('Content-Type', 'text/plain; charset=utf-8'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
        if u.path == '/claims':
            try: body = open(os.path.join(ROOT, 'claims.lock.json'), 'rb').read()
            except OSError: body = b'{}'
            self.send_response(200); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
        if not OK_PATH.match(u.path):
            self.send_error(404); return
        n = int(self.headers.get('Content-Length') or 0)
        if n > MAXBODY:
            self.send_error(413, 'push too large (20 MB max)'); return
        data = self.rfile.read(n) if n else b''
        env = {
            'PATH': os.environ.get('PATH', '/usr/bin:/bin'),
            'GIT_PROJECT_ROOT': ROOT, 'GIT_HTTP_EXPORT_ALL': '1',
            'PATH_INFO': u.path, 'QUERY_STRING': u.query, 'REQUEST_METHOD': self.command,
            'CONTENT_TYPE': self.headers.get('Content-Type', ''), 'CONTENT_LENGTH': str(len(data)),
            'REMOTE_ADDR': self.client_address[0], 'REMOTE_USER': 'inbox',
            'HTTP_CONTENT_ENCODING': self.headers.get('Content-Encoding', ''),
            'GIT_PROTOCOL': self.headers.get('Git-Protocol', ''),
        }
        # 边收边转发（HTTP/1.0 以断开连接结束正文）：推送时钩子跑 check_all 约 60 秒，
        # 进度行要实时送到客户端，否则公网代理把静默连接按 502 掐断（11-11 镜像实测）
        p = subprocess.Popen(['git', 'http-backend'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, env=env)
        p.stdin.write(data); p.stdin.close()
        buf = b''
        while b'\r\n\r\n' not in buf and b'\n\n' not in buf:
            ch = p.stdout.read1(65536) if hasattr(p.stdout, 'read1') else p.stdout.read(65536)
            if not ch: break
            buf += ch
        sep = b'\r\n\r\n' if b'\r\n\r\n' in buf else b'\n\n'
        head, _, body = buf.partition(sep)
        status = 200; hdrs = []
        for line in head.decode('latin1').splitlines():
            if not line.strip():
                continue
            k, _, v = line.partition(':')
            if k.lower() == 'status':
                status = int(v.strip().split()[0])
            else:
                hdrs.append((k.strip(), v.strip()))
        self.send_response(status)
        for k, v in hdrs:
            self.send_header(k, v)
        self.end_headers(); self.wfile.write(body); self.wfile.flush()
        while True:
            ch = p.stdout.read1(65536)
            if not ch: break
            self.wfile.write(ch); self.wfile.flush()
        try: p.wait(timeout=300)
        except subprocess.TimeoutExpired: p.kill()

    do_GET = do_POST = _run

    def log_message(self, fmt, *a):
        sys.stderr.write('%s %s\n' % (self.client_address[0], fmt % a))


class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


S(('0.0.0.0', PORT), H).serve_forever()
