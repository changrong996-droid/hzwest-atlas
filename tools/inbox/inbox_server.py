#!/usr/bin/env python3
"""hzwest-atlas git inbox: smart-HTTP via `git http-backend`.
Anonymous clone/fetch; push allowed only to refs/heads/agent/<name>/... where <name> is in agents.txt
(enforced by the pre-receive hook). No credentials stored here.
Usage: inbox_server.py <root> <port>   (root contains hzwest-atlas.git)
"""
import os, sys, subprocess, http.server, socketserver, urllib.parse, re

ROOT, PORT = sys.argv[1], int(sys.argv[2])
MAXBODY = 20 * 1024 * 1024
OK_PATH = re.compile(r'^/hzwest-atlas\.git(/.*)?$')


class H(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'

    def _run(self):
        u = urllib.parse.urlsplit(self.path)
        if u.path in ('/', '/health'):
            body = b'hzwest-atlas inbox ok\nclone: <this-url>/hzwest-atlas.git\nrules: see AGENTS.md section 6B\n'
            self.send_response(200); self.send_header('Content-Type', 'text/plain'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
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
        p = subprocess.run(['git', 'http-backend'], input=data, env=env, capture_output=True, timeout=300)
        out = p.stdout
        head, _, body = out.partition(b'\r\n\r\n')
        if not _:
            head, _, body = out.partition(b'\n\n')
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
        self.send_header('Content-Length', str(len(body)))
        self.end_headers(); self.wfile.write(body)

    do_GET = do_POST = _run

    def log_message(self, fmt, *a):
        sys.stderr.write('%s %s\n' % (self.client_address[0], fmt % a))


class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


S(('0.0.0.0', PORT), H).serve_forever()
