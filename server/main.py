"""Minimal hello-world server to verify the python container is running.

Endpoints:
  GET  /       -> Hello, World!
  POST /data   -> save the JSON request body to data.json
  GET  /data   -> return the saved data.json contents
"""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

HOST = "0.0.0.0"
PORT = 8000
DATA_FILE = os.path.join(os.path.dirname(__file__), "data.json")


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

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), Handler)
    print(f"Listening on http://{HOST}:{PORT}")
    server.serve_forever()
