#!/usr/bin/env python3
"""
Bouw een zelfstandige MacBook-Air deploy-bundle van de Familie-kennisgraaf.

Zero-dependency: draait op de in macOS ingebouwde python3 (geen Docker/Neo4j
nodig). serve.py serveert de viewers + een snapshot van /api/family/* . Lezen +
categorie-filters + NL/EN/CN-toggle + verberg-toggle werken; bewerken gebeurt op
de hoofdserver (deze deploy is alleen-lezen).

Output: ~/familie-export/familie-graph-macos-deploy.zip
Gebruik op de Mac:  unzip familie-graph-macos-deploy.zip && cd familie-graph && ./deploy.sh
"""
import json, os, sys, urllib.request, zipfile, io

API = os.environ.get("FAMILY_API_BASE", "http://localhost:3100")
OUT = os.path.join(os.path.expanduser("~"), "familie-export", "familie-graph-macos-deploy.zip")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(REPO, "public")

def fetch(path):
    with urllib.request.urlopen(API + path, timeout=20) as r:
        return r.read().decode("utf-8")

SERVE_PY = r'''#!/usr/bin/env python3
# Zelfstandige viewer-server voor de Familie-kennisgraaf (macOS python3, geen deps).
import json, os, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
HERE = os.path.dirname(os.path.abspath(__file__))
PUB, DATA = os.path.join(HERE, "public"), os.path.join(HERE, "data")
STATE = {"hidden": False}
def load(n):
    try: return json.load(open(os.path.join(DATA, n), encoding="utf-8"))
    except Exception: return {}
GRAPH, CATS, I18N = load("familie-graph.json"), load("categories.json"), load("i18n.json")
class H(BaseHTTPRequestHandler):
    def _j(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/api/family/graph":
            if STATE["hidden"]: return self._j({"graph": "Familie", "hidden": True, "nodes": [], "links": []})
            g = dict(GRAPH); g["hidden"] = False; return self._j(g)
        if p == "/api/family/categories": return self._j(CATS)
        if p == "/api/family/i18n": return self._j(I18N)
        if p == "/api/family/visibility": return self._j({"success": True, "graph": "Familie", "hidden": STATE["hidden"]})
        if p in ("/", ""): p = "/family-portal.html"
        fp = os.path.normpath(os.path.join(PUB, p.lstrip("/")))
        if fp.startswith(PUB) and os.path.isfile(fp):
            ct = "text/html; charset=utf-8" if fp.endswith(".html") else "application/octet-stream"
            b = open(fp, "rb").read(); self.send_response(200); self.send_header("Content-Type", ct)
            self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b); return
        self.send_response(404); self.end_headers()
    def do_POST(self):
        p = self.path.split("?")[0]
        if p == "/api/family/toggle":
            STATE["hidden"] = not STATE["hidden"]; return self._j({"success": True, "graph": "Familie", "hidden": STATE["hidden"]})
        if p == "/api/family/visibility": return self._j({"success": True, "graph": "Familie", "hidden": STATE["hidden"]})
        return self._j({"success": False, "error": "Deze Mac-deploy is alleen-lezen; bewerken via de hoofdserver."}, 501)
    def log_message(self, *a): pass
if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3100
    print("Familie kennisgraaf -> http://localhost:%d/family-portal.html  (Ctrl+C om te stoppen)" % port)
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
'''

DEPLOY_SH = '''#!/usr/bin/env bash
# Familie-kennisgraaf — MacBook Air deploy. Vereist alleen python3 (standaard op macOS).
set -e
cd "$(dirname "$0")"
PORT="${1:-3100}"
echo "Start Familie-kennisgraaf op http://localhost:$PORT/family-portal.html"
python3 serve.py "$PORT" &
SRV=$!
sleep 1
open "http://localhost:$PORT/family-portal.html" 2>/dev/null || true
echo "Server PID $SRV — Ctrl+C om te stoppen."
wait $SRV
'''

README = '''# Familie-kennisgraaf — MacBook Air deploy

Zelfstandige, alleen-lezen viewer. Geen Docker/Neo4j nodig — draait op de
python3 die standaard op macOS staat.

## Starten
```bash
unzip familie-graph-macos-deploy.zip
cd familie-graph
chmod +x deploy.sh
./deploy.sh            # of: ./deploy.sh 8080   (andere poort)
```
De browser opent automatisch op http://localhost:3100/family-portal.html.

## Wat werkt
- 3D-graaf, categorie-filters (aan/uit), NL/EN/CN-toggle, verberg-toggle.
- VR-pagina: http://localhost:3100/family-vr.html (WebXR; in Safari/Chrome).

## Niet in deze deploy
- Bewerken (toevoegen/verwijderen) — dat gebeurt op de hoofdserver. Deze bundle
  is een momentopname; haal een nieuwe zip voor verse data.

## Inhoud
- deploy.sh, serve.py        — start + zero-dep server
- public/                    — viewer-pagina's
- data/familie-graph.json    — graaf-snapshot (nodes/links)
- data/categories.json, data/i18n.json
'''

def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    graph = fetch("/api/family/graph")
    cats = fetch("/api/family/categories")
    i18n = fetch("/api/family/i18n")
    nodes = json.loads(graph).get("nodes", [])
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("familie-graph/serve.py", SERVE_PY)
        z.writestr("familie-graph/deploy.sh", DEPLOY_SH)
        z.writestr("familie-graph/README.md", README)
        z.writestr("familie-graph/data/familie-graph.json", graph)
        z.writestr("familie-graph/data/categories.json", cats)
        z.writestr("familie-graph/data/i18n.json", i18n)
        for name in ("family-portal.html", "family-vr.html", "family-graph.html"):
            fp = os.path.join(PUBLIC, name)
            if os.path.isfile(fp):
                z.write(fp, "familie-graph/public/" + name)
    print("wrote %s (%d nodes)" % (OUT, len(nodes)))

if __name__ == "__main__":
    main()
