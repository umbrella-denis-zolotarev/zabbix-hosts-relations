"""Minimal hello-world server to verify the python container is running.

Endpoints:
  GET  /                 -> Hello, World!
  POST /data             -> save the JSON request body to data.json
  GET  /data             -> return the saved data.json contents
  POST /zabbix           -> proxy a JSON-RPC request to the Zabbix API (token
                            added server-side, so the browser never sees it)
  POST /ansible/run      -> start the ansible script for a host (background)
  GET  /ansible/status   -> the last ansible run status/output for a host
"""

import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import ansible

HOST = "0.0.0.0"
PORT = 8000
DATA_FILE = os.path.join(os.path.dirname(__file__), "data.json")

# Zabbix JSON-RPC proxy target. The token is read from the container env so it
# stays server-side and is never shipped to the browser bundle.
ZABBIX_URL = os.environ.get("ZABBIX_URL", "http://localhost")
ZABBIX_API_URL = f"{ZABBIX_URL}/zabbix/api_jsonrpc.php"
ZABBIX_TOKEN = os.environ.get("ZABBIX_API_TOKEN") or os.environ.get(
    "VITE_ZABBIX_TOKEN", ""
)


class Handler(BaseHTTPRequestHandler):
    def _send_cors(self):
        # The app calls this server directly from the browser (cross-origin).
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._send_cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        # CORS preflight (sent before the POST with a JSON Content-Type).
        self.send_response(204)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/ansible/status":
            hostid = (parse_qs(parsed.query).get("hostid") or [""])[0]
            if not hostid:
                self._send_json(400, {"error": "hostid required"})
                return
            self._send_json(200, ansible.get_status(hostid))
            return

        if self.path == "/data":
            if not os.path.exists(DATA_FILE):
                self._send_json(404, {"error": "no data saved yet"})
                return
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                self._send_json(200, json.load(f))
            return

        # Default hello-world route.
        self.send_response(200)
        self._send_cors()
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"Hello, World!\n")

    def do_POST(self):
        if self.path == "/zabbix":
            self._proxy_zabbix()
            return

        if self.path == "/ansible/run":
            self._run_ansible()
            return

        if self.path != "/data":
            self._send_json(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError as e:
            self._send_json(400, {"error": f"invalid JSON: {e}"})
            return

        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

        self._send_json(200, {"saved": True, "data": data})

    def _proxy_zabbix(self):
        # Forward the raw JSON-RPC body to the Zabbix API, injecting the auth
        # token here so it never leaves the server.
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""

        req = urllib.request.Request(
            ZABBIX_API_URL,
            data=raw,
            method="POST",
            headers={
                "Content-Type": "application/json-rpc",
                "Authorization": f"Bearer {ZABBIX_TOKEN}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
                status = resp.status
        except urllib.error.HTTPError as e:
            body = e.read()
            status = e.code
        except urllib.error.URLError as e:
            self._send_json(502, {"error": f"zabbix unreachable: {e.reason}"})
            return

        self.send_response(status)
        self._send_cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _run_ansible(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError as e:
            self._send_json(400, {"error": f"invalid JSON: {e}"})
            return

        hostid = str(body.get("hostid") or "")
        if not hostid:
            self._send_json(400, {"error": "hostid required"})
            return
        # The ansible inventory target (e.g. "r0"); falls back to the host id.
        target = str(body.get("target") or hostid)

        record = ansible.start_run(hostid, target)
        self._send_json(200, record)

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Listening on http://{HOST}:{PORT}")
    server.serve_forever()
