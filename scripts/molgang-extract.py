#!/usr/bin/env python3
"""
Molgang-game extractor → data/molgang-extract.json (ingest: ingestMolgang).

Ontleedt de Molgang-game (chemical-engineering simulator) naar graaf-objecten:
  - PERSONAGES (NPC's): fictieve karakters mogen — categorie 'personage'.
  - GAME-ZONES (biomes): game-layout — categorie 'gamezone' (BEWUST geen
    'locatie', zodat geen fictieve plaats als locatie in de graaf komt).
  - ECHTE LOCATIE-ANKERS: voor latere AR moet de game fysiek matchen met de
    realiteit, dus we ankeren MOLGANG aan ECHTE plaatsen (IJmuiden/Tata Steel,
    Zaandam, Bergen NH, Amsterdam) via AR_ANKER — geen verzonnen locaties.

Bron: de Molgang-Roblox repo (gameserver/data + game/src). Alles getagd
source='molgang'.
"""
import json, os, re, sys

ROBLOX = os.environ.get("MOLGANG_ROBLOX", "/home/knight2/molgang-roblox")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "molgang-extract.json")

# Echte plaatsen waar de game fysiek aan gekoppeld is (voor AR). UITSLUITEND
# bestaande, echte locaties — geen fictie. Matcht 'locatie'-knopen uit de
# chat-extractie zodat MOLGANG aan dezelfde echte plaats hangt.
REAL_ANCHORS = ["IJmuiden", "Tata Steel IJmuiden", "Zaandam", "Bergen NH", "Amsterdam"]

def read_npcs():
    """Karakternamen uit NPCDialogues.lua (name = "...")."""
    path = os.path.join(ROBLOX, "game/src/ReplicatedStorage/Modules/NPCDialogues.lua")
    names = []
    if os.path.exists(path):
        txt = open(path, encoding="utf-8", errors="ignore").read()
        for m in re.findall(r'name\s*=\s*"([^"]+)"', txt):
            if m not in names:
                names.append(m)
    return names

def read_zones():
    """Game-zones uit zones.json ({id,name,theme,description})."""
    path = os.path.join(ROBLOX, "gameserver/data/zones.json")
    if not os.path.exists(path):
        return []
    z = json.load(open(path))
    return z if isinstance(z, list) else z.get("zones", [])

def main():
    npcs = read_npcs()
    zones = read_zones()

    entities, edges = [], []

    # MOLGANG bestaat al als curated 'project'-knoop; we hangen er content aan.
    for n in npcs:
        entities.append({"name": f"{n} (Molgang)", "category": "personage",
                         "note": "fictief NPC-personage", "source": "molgang"})
        edges.append({"from": f"{n} (Molgang)", "to": "MOLGANG", "rel": "PERSONAGE_IN", "kind": "rel"})

    for z in zones:
        nm = z.get("name") or z.get("id")
        if not nm:
            continue
        note = (z.get("theme", "") + " — " + (z.get("description", "") or ""))[:90]
        entities.append({"name": f"{nm} (zone)", "category": "gamezone",
                         "note": note, "source": "molgang"})
        edges.append({"from": f"{nm} (zone)", "to": "MOLGANG", "rel": "ZONE_VAN", "kind": "rel"})

    # Echte locatie-ankers voor AR (geen fictie). MOLGANG -AR_ANKER-> echte plaats.
    for loc in REAL_ANCHORS:
        edges.append({"from": "MOLGANG", "to": loc, "rel": "AR_ANKER", "kind": "rel"})
    # De game simuleert het echte SmartSlag3-proces (chemical-engineering sim).
    edges.append({"from": "MOLGANG", "to": "SmartSlag3", "rel": "SIMULEERT", "kind": "rel"})

    out = {
        "generated_from": "molgang-roblox",
        "stats": {"personages": len(npcs), "zones": len(zones),
                  "real_anchors": len(REAL_ANCHORS), "entities": len(entities), "edges": len(edges)},
        "entities": entities, "chats": [], "edges": edges,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(json.dumps(out["stats"], indent=2))
    print(f"[molgang] wrote {OUT}", file=sys.stderr)

if __name__ == "__main__":
    main()
