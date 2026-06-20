#!/usr/bin/env python3
"""
Exporteer de Familie-graaf naar een Roblox/Luau ModuleScript.

Roblox-cloudservers kunnen localhost niet bereiken, dus de betrouwbare (privé)
weg is een ingebakken snapshot: we halen /api/family/graph op en schrijven
roblox/familie-graph/src/ReplicatedStorage/FamilieGraphData.luau, dat de
renderer (FamilieGraphBuilder.server.luau) in 3D opbouwt — ook in Roblox-VR.

Gebruik:  python3 scripts/export-family-roblox.py
Daarna:   rojo serve  (en sync in Roblox Studio)
"""
import json, os, sys, urllib.request

API = os.environ.get("FAMILY_API", "http://localhost:3100/api/family/graph")
OUT = os.path.join(os.path.dirname(__file__), "..", "roblox", "familie-graph",
                   "src", "ReplicatedStorage", "FamilieGraphData.luau")

def luau_str(s):
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ") + '"'

def main():
    with urllib.request.urlopen(API, timeout=20) as r:
        d = json.load(r)
    if d.get("hidden"):
        print("graaf staat op VERBORGEN — zet zichtbaar voor je exporteert", file=sys.stderr)
        sys.exit(1)
    nodes, links = d.get("nodes", []), d.get("links", [])

    lines = ["-- AUTO-GEGENEREERD door scripts/export-family-roblox.py — niet handmatig bewerken",
             "local M = {}", "", "M.nodes = {"]
    for n in nodes:
        lines.append("  {id=%s, name=%s, group=%d, category=%s, kind=%s}," % (
            luau_str(n["id"]), luau_str(n["name"]), int(n.get("group", 0) or 0),
            luau_str(n.get("category", "")), luau_str(n.get("kind", "entity"))))
    lines += ["}", "", "M.links = {"]
    for l in links:
        src = l["source"]["id"] if isinstance(l.get("source"), dict) else l.get("source")
        tgt = l["target"]["id"] if isinstance(l.get("target"), dict) else l.get("target")
        lines.append("  {source=%s, target=%s, rel=%s, inferred=%s}," % (
            luau_str(src), luau_str(tgt), luau_str(l.get("type", "")),
            "true" if l.get("inferred") else "false"))
    lines += ["}", "", "return M", ""]

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        f.write("\n".join(lines))
    print(f"wrote {OUT}: {len(nodes)} nodes, {len(links)} links")

if __name__ == "__main__":
    main()
