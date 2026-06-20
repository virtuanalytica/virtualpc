#!/usr/bin/env python3
"""
Familie knowledge-graph extractor.

Ontleedt het volledige Claude.ai-export (809 chats / 17.6k berichten / ~8.6M
tokens) naar objecten/personen/bedrijven/locaties/onderwerpen + relaties, en
schrijft een gecapte graaf-delta naar data/family-extract.json die
family-graph.ts in Neo4j laadt (categorie 'chat' voor de gesprekken, plus de
herkende entiteiten getagd met source='chat').

Aanpak: een volledige *programmatische* sweep (geen LLM — 8.6M tokens is te
duur) over alle chats, verankerd door een curated, hoge-precisie gazetteer en
een locatie-lexicon. Locaties zijn uitsluitend ECHTE plaatsen (eis: fysiek
matchen met de realiteit voor latere AR). Kandidaat-eigennamen (hoofdletter-
frasen) vullen aan met ontdekte entiteiten boven een frequentiedrempel.

Caps houden de 3D-graaf bekijkbaar; alles is toggle-baar per categorie.
"""
import json, re, os, sys
from collections import defaultdict, Counter

EXPORT = os.environ.get("FAMILY_EXPORT_DIR",
    "/media/knight2/EDS2/archive/Claudeweb memory/"
    "20260607data-4e64c290-c713-429c-b397-5fe8e34fde05-1780820328-168014f2-batch-0000")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "family-extract.json")

# Caps (graaf bekijkbaar houden; categorie-toggles beheren de rest).
MAX_CANDIDATES   = 100   # nieuwe ontdekte eigennamen
CAND_MIN_FREQ    = 8     # minimale mentions voor een kandidaat
MAX_CHAT_NODES   = 220   # 'rijke' chats als knoop
CHAT_MIN_ENTS    = 3     # min. herkende entiteiten om chat op te nemen
MAX_COOC_EDGES   = 240   # entiteit↔entiteit co-occurrence
MENTIONED_TOP_CHATS = 3  # per entiteit: link naar top-N chats

# --- Gazetteer: curated echte entiteiten {canoniek: (cat, [aliassen])} --------
# cat-keys matchen family-graph.ts CATEGORIES.
GAZ = {
    # personen
    "Edwin Hauwert": ("persoon", ["Edwin Hauwert", "Hauwert"]),
    "Diederik Fierig": ("persoon", ["Diederik Fierig", "Fierig"]),
    "Witteveen": ("persoon", ["Witteveen"]),
    "Mark Nooijen": ("persoon", ["Mark Nooijen"]),
    "Colin Barrow": ("persoon", ["Colin Barrow"]),
    # bedrijven / instellingen
    "VirtualV Holding B.V.": ("bedrijf", ["VirtualV Holding", "VirtualV"]),
    "EHMAC B.V.": ("bedrijf", ["EHMAC"]),
    "SLAG B.V.": ("bedrijf", ["Slag B.V.", "SLAG B.V."]),
    "Slakkenspoor VOF": ("bedrijf", ["Slakkenspoor"]),
    "VirtualPC VOF": ("bedrijf", ["VirtualPC"]),
    "Uniforce Group B.V.": ("bedrijf", ["Uniforce"]),
    "Magnit": ("bedrijf", ["Magnit"]),
    "APG": ("bedrijf", ["APG"]),
    "Tata Steel IJmuiden": ("bedrijf", ["Tata Steel", "Tata"]),
    "Goldman Sachs": ("bedrijf", ["Goldman Sachs"]),
    "Nike": ("bedrijf", ["Nike"]),
    "Aegon": ("bedrijf", ["Aegon"]),
    "Numerai": ("bedrijf", ["Numerai"]),
    "Science Park Spark": ("bedrijf", ["Science Park Spark", "Spark 904"]),
    "VITO": ("bedrijf", ["VITO"]),
    "TNO": ("bedrijf", ["TNO"]),
    "Heraeus": ("bedrijf", ["Heraeus"]),
    "Supermicro": ("bedrijf", ["Supermicro"]),
    "ABB": ("bedrijf", ["ABB"]),
    "FIMER": ("bedrijf", ["FIMER", "VSN300"]),
    "Wyndham": ("bedrijf", ["Wyndham"]),
    # locaties (UITSLUITEND echte plaatsen — voor AR)
    "Amsterdam": ("locatie", ["Amsterdam"]),
    "IJburg": ("locatie", ["IJburg"]),
    "Bergen NH": ("locatie", ["Bergen NH", "Bergen, NH"]),
    "Zaandam": ("locatie", ["Zaandam", "Zuiddijk 103"]),
    "IJmuiden": ("locatie", ["IJmuiden"]),
    "Delft": ("locatie", ["Delft"]),
    "TU Delft": ("locatie", ["TU Delft", "QuTech"]),
    "Wognum": ("locatie", ["Wognum"]),
    "Rotterdam": ("locatie", ["Erasmus", "Rotterdam"]),
    "Kanaaldijk 71": ("locatie", ["Kanaaldijk 71"]),
    "Euronext Amsterdam": ("locatie", ["Euronext Amsterdam", "Euronext"]),
    "Spanje": ("locatie", ["Spanje", "Mediterranean Corridor", "AVE"]),
    "FA YIN": ("locatie", ["FA YIN"]),
    # software / tech
    "Python": ("software", ["Python"]),
    "Rust": ("software", ["Rust"]),
    "Three.js": ("software", ["Three.js", "ThreeJS"]),
    "FastAPI": ("software", ["FastAPI"]),
    "Neo4j": ("software", ["Neo4j"]),
    "Kafka": ("software", ["Kafka"]),
    "Roblox Studio": ("tool", ["Roblox Studio"]),
    "Godot": ("engine", ["Godot", "GoDot"]),
    "Unreal": ("engine", ["Unreal"]),
    "Roblox": ("engine", ["Roblox"]),
    "Hedera": ("software", ["Hedera", "HTS"]),
    "XRPL": ("software", ["XRPL"]),
    "Ollama": ("software", ["Ollama"]),
    "LiteLLM": ("software", ["LiteLLM"]),
    "FreeCAD": ("software", ["FreeCAD"]),
    # hardware
    "GPU Server 1": ("hardware", ["4029GP-TRT", "RTX 3090", "3090"]),
    "Optane nvram": ("hardware", ["Optane", "DCPMM", "X11DPG"]),
    "Ratfisch RS55": ("hardware", ["Ratfisch", "RS55"]),
    # projecten
    "SmartSlag3": ("project", ["SmartSlag3", "SmartSlag³", "SmartSlag"]),
    "SlagBox": ("project", ["SlagBox", "SlagBox 100"]),
    "MOLGANG": ("project", ["MOLGANG", "Molgang"]),
    "MOLSI28": ("project", ["MOLSI28", "Si-28"]),
    "VANECO": ("project", ["VANECO"]),
    "QuantumSilica": ("project", ["QuantumSilica"]),
    # winning / materialen
    "Vanadium winning": ("winning", ["Vanadium"]),
    "Silicium winning": ("winning", ["Silicium", "Silicon"]),
    "Titanium winning": ("winning", ["Titanium"]),
    "Vanadium baar": ("materiaal", ["Vanadium baar", "vanadium bar"]),
    "Vanadium elektrolyt": ("materiaal", ["Vanadium elektrolyt", "vanadium electrolyte"]),
    "BOF slak": ("materiaal", ["BOF slag", "BOF-slak", "steel slag"]),
    # activiteiten / onderwerpen
    "WBSO": ("activiteit", ["WBSO", "SO26017891"]),
    "Hydrometallurgie": ("activiteit", ["hydrometallurg", "leaching", "loging"]),
    "Ultrasoon disaggregatie": ("activiteit", ["ultrasonic", "ultrasoon"]),
    "XRF-meting": ("activiteit", ["XRF"]),
    "Dagvaarding": ("activiteit", ["dagvaarding"]),
    "DCF-analyse": ("activiteit", ["DCF"]),
    "Numerai Signals": ("activiteit", ["Numerai Signals", "Signals"]),
    "Cantonees leren": ("activiteit", ["Cantonese", "Cantonees", "Kantonees"]),
    "Quantum computing": ("onderwerp", ["quantum computing", "qubit", "Quantum Pioneers"]),
}

# Genormaliseerde gazetteer-vormen om kandidaat-duplicaten te weren
# (bv. "Slag B.V" ~ "SLAG B.V.", "EHMAC B.V" ~ "EHMAC B.V.").
def _norm(s):
    return re.sub(r"[^\w]", "", s).lower()
GAZ_FORMS = set()
for _canon, (_cat, _aliases) in GAZ.items():
    GAZ_FORMS.add(_norm(_canon))
    for _a in _aliases:
        GAZ_FORMS.add(_norm(_a))
# Ruis: Claude-UI termen, SQL/code-fragmenten, generieke frasen.
NOISE = {_norm(x) for x in [
    "Analysis Tool", "Union All Select", "Order By", "Group By", "Step Step",
    "Code Code", "File File", "New York", "United States", "Pull Request",
    "Machine Learning", "Large Language", "Open Source", "Real Time",
]}
SQL_KW = {"select", "union", "from", "where", "join", "insert", "update",
          "delete", "table", "order", "null", "inner", "outer", "left", "right"}

# Compile alias -> canonical, langste alias eerst (greedy precisie).
ALIAS = []
for canon, (cat, aliases) in GAZ.items():
    for a in aliases:
        ALIAS.append((a, canon, cat))
ALIAS.sort(key=lambda x: -len(x[0]))
ALIAS_RE = {a: re.compile(r"(?<![\w])" + re.escape(a) + r"(?![\w])", re.IGNORECASE) for a, _, _ in ALIAS}

# Kandidaat-eigennamen (ontdekking). Filter ruis/stopwoorden/code.
CAND_RE = re.compile(r"\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z.&-]+){1,2})\b")
STOP = set("""The This That These Those With From When What Where Which While Your Their There Here
I You We He She It They Them His Her Our Step Note Yes No OK Okay Please Thanks Hello Hi Let Use
Create Add Make Build Run Get Set New Code File Data User Error None True False If Else For Return
Image Click Click Here Read More See Also Table Figure Chapter Section Markdown Python JavaScript
Claude Anthropic GPT OpenAI ChatGPT""".split())

def chat_text(conv):
    parts = [conv.get("name") or ""]
    for m in conv.get("chat_messages", []):
        t = m.get("text") or ""
        if t:
            parts.append(t)
    return "\n".join(parts)

def main():
    convs = json.load(open(os.path.join(EXPORT, "conversations.json")))
    print(f"[extract] {len(convs)} conversations", file=sys.stderr)

    ent_mentions = Counter()                 # canonical -> total mentions
    ent_chats = defaultdict(Counter)         # canonical -> {chat_uuid: count}
    cooc = Counter()                         # (a,b) sorted -> co-occurrence
    cand_freq = Counter()                    # candidate proper noun -> freq
    chat_meta = {}                           # uuid -> {name,date,ents:set}

    for conv in convs:
        uuid = conv.get("uuid"); name = (conv.get("name") or "(zonder titel)")[:80]
        date = (conv.get("created_at") or "")[:10]
        text = chat_text(conv)
        if not text.strip():
            continue
        present = {}
        for a, canon, cat in ALIAS:
            n = len(ALIAS_RE[a].findall(text))
            if n:
                present[canon] = present.get(canon, 0) + n
        for canon, n in present.items():
            ent_mentions[canon] += n
            ent_chats[canon][uuid] += n
        ents = list(present.keys())
        for i in range(len(ents)):
            for j in range(i + 1, len(ents)):
                a, b = sorted((ents[i], ents[j]))
                cooc[(a, b)] += 1
        chat_meta[uuid] = {"name": name, "date": date, "ents": set(ents)}
        # kandidaten
        for m in CAND_RE.findall(text):
            m = m.strip()
            toks = m.split()
            head = toks[0]
            if head in STOP or len(m) < 4:
                continue
            if m in GAZ or _norm(m) in GAZ_FORMS or _norm(m) in NOISE:
                continue  # duplicaat van gazetteer of bekende ruis
            if m.isupper():
                continue  # all-caps → vrijwel altijd SQL/code/acroniem-ruis
            if any(t.lower() in SQL_KW for t in toks):
                continue  # SQL/code-fragment
            cand_freq[m] += 1

    # Kandidaten heuristisch categoriseren.
    def categorize(name):
        low = name.lower()
        if re.search(r"\b(b\.v\.|bv|vof|holding|group|inc|ltd|gmbh)\b", low):
            return "bedrijf"
        return "onderwerp"
    candidates = [(m, c) for m, c in cand_freq.most_common() if c >= CAND_MIN_FREQ][:MAX_CANDIDATES]

    # Entiteiten samenstellen (gazetteer + kandidaten).
    entities = []
    for canon, (cat, _) in GAZ.items():
        if ent_mentions[canon] > 0:
            top = ent_chats[canon].most_common(MENTIONED_TOP_CHATS)
            entities.append({"name": canon, "category": cat, "mentions": ent_mentions[canon],
                             "chats": [u for u, _ in top], "source": "chat"})
    for m, freq in candidates:
        entities.append({"name": m, "category": categorize(m), "mentions": freq,
                         "chats": [], "source": "chat"})

    # Rijke chats als knoop (>= CHAT_MIN_ENTS herkende entiteiten), gecapt.
    rich = sorted(((u, meta) for u, meta in chat_meta.items() if len(meta["ents"]) >= CHAT_MIN_ENTS),
                  key=lambda x: -len(x[1]["ents"]))[:MAX_CHAT_NODES]
    rich_uuids = {u for u, _ in rich}
    chats = [{"name": f'💬 {meta["name"]}', "uuid": u, "date": meta["date"],
              "category": "chat", "source": "chat", "entities": len(meta["ents"])}
             for u, meta in rich]

    # Randen: entiteit GENOEMD_IN chat (alleen rijke chats) + co-occurrence.
    edges = []
    ent_names = {e["name"] for e in entities}
    for e in entities:
        for u in e["chats"]:
            if u in rich_uuids:
                edges.append({"from": e["name"], "to": u, "rel": "GENOEMD_IN", "kind": "mention"})
    for (a, b), w in cooc.most_common(MAX_COOC_EDGES):
        if a in ent_names and b in ent_names:
            edges.append({"from": a, "to": b, "rel": "SAMEN_GENOEMD", "weight": w, "kind": "cooc"})

    out = {
        "generated_from": os.path.basename(EXPORT),
        "stats": {"conversations": len(convs), "entities": len(entities),
                  "chat_nodes": len(chats), "edges": len(edges),
                  "gazetteer_hits": sum(1 for c in GAZ if ent_mentions[c] > 0),
                  "candidates": len(candidates)},
        "entities": entities, "chats": chats, "edges": edges,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"[extract] wrote {OUT}", file=sys.stderr)
    print(json.dumps(out["stats"], indent=2))

if __name__ == "__main__":
    main()
