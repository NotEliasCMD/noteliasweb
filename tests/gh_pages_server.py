#!/usr/bin/env python3
"""Static file server that mimics GitHub Pages closely enough to test this site.

Key GH Pages behavior we replicate: a request for a path that doesn't map to a
real file returns **404.html** with a 404 status (not the stock directory-listing
404). That is what makes the deep-link shim (404.html -> stash slug -> redirect
to /) testable locally, exactly as it runs in production.

Usage: gh_pages_server.py <root_dir> <port>
"""
import os
import sys
import http.server
import socketserver

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
PORT = int(sys.argv[2] if len(sys.argv) > 2 else "8137")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def _serve_404(self):
        page = os.path.join(ROOT, "404.html")
        body = open(page, "rb").read() if os.path.exists(page) else b"404"
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_GET(self):
        fs = self.translate_path(self.path)
        is_dir_index = os.path.isdir(fs) and os.path.exists(os.path.join(fs, "index.html"))
        if not os.path.exists(fs) and not is_dir_index:
            self._serve_404()
            return
        return super().do_GET()

    def log_message(self, *a):
        pass  # quiet


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"serving {ROOT} at http://127.0.0.1:{PORT}", flush=True)
        httpd.serve_forever()
