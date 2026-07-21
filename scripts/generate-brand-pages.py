#!/usr/bin/env python3
"""Generate brand hub + Loom/Fiber/Plexus landing pages + logos.

Run from repo root:
    python3 scripts/generate-brand-pages.py
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
LOGOS = PUBLIC / "logos"

BRANDS = {
    "loom": {
        "name": "Loom",
        "eyebrow": "Personal knowledge node",
        "title": "Loom · Weave your own thread",
        "tagline": "Weave your own thread.",
        "description": "A Loom is your personal node in the fabric. Spin up a yarn, sign your own stitches, and weave a local patch that stays yours even when you go offline.",
        "primary": "#f59e0b",
        "secondary": "#78350f",
        "accent": "#fbbf24",
        "features": [
            ("🧶", "Own your yarn", "Every identity is a DID-backed yarn. No account on a central server required."),
            ("🪡", "Stitch facts, not files", "Each stitch is a signed triple. Publish assertions and retractions with full provenance."),
            ("🧳", "Offline-first", "Weave locally and gossip later. Your Loom works on a plane, in a bunker, or on a raspberry Pi."),
            ("🔐", "Sovereign by default", "Keys live on your device. You decide which yarns to follow and which facts to trust."),
        ],
        "comparison_caption": "Loom versus the central note-cloud",
        "comparison_rows": [
            ("Notion / Obsidian sync", "Cloud or proprietary sync", "Vendor lock-in", "No DID identity", "Centralised"),
            ("Loom", "Local-first P2P patch", "You own the data", "Yarn = DID", "Decentralised"),
        ],
        "cta_primary": ("Read the brand strategy", "https://github.com/virtuanalytica/virtualpc/blob/main/docs/BRAND-STRATEGY.md"),
        "cta_secondary": [("All brands", "brands.html"), ("GitHub repo", "https://github.com/virtuanalytica/virtualpc")],
    },
    "fiber": {
        "name": "Fiber",
        "eyebrow": "Textus-type database",
        "title": "Fiber · The same fabric underneath",
        "tagline": "The same fabric underneath.",
        "description": "Fiber is the triple-native, content-addressed database that powers Loom, KnitNet and Plexus. One storage model, one query surface, many views.",
        "primary": "#06b6d4",
        "secondary": "#0ea5e9",
        "accent": "#14b8a6",
        "features": [
            ("🧬", "Triple-native", "Subject-predicate-object is the atom. No awkward mapping from tables or documents to a graph."),
            ("📦", "Content-addressed", "Every patch and stitch is a CID. Deduplication, verification and caching are free."),
            ("🔄", "CRDT merges", "Two patches from two looms merge cleanly without locks, leaders or consensus rounds."),
            ("🔍", "Query anything", "SPARQL-ish or Cypher-ish queries run locally against your own patch."),
        ],
        "comparison_caption": "Fiber versus traditional graph stores",
        "comparison_rows": [
            ("Neo4j / RDF store", "Single server or managed cloud", "Schema migrations", "No offline merge", "Centralised"),
            ("Fiber", "Embedded in every loom", "Schema-less CRDT patches", "Offline-first merge", "Decentralised"),
        ],
        "cta_primary": ("Read the brand strategy", "https://github.com/virtuanalytica/virtualpc/blob/main/docs/BRAND-STRATEGY.md"),
        "cta_secondary": [("All brands", "brands.html"), ("GitHub repo", "https://github.com/virtuanalytica/virtualpc")],
    },
    "plexus": {
        "name": "Plexus",
        "eyebrow": "Historical lineage layer",
        "title": "Plexus · Every thread leaves a trace",
        "tagline": "Every thread leaves a trace.",
        "description": "Plexus reads the fabric like a historian reads a timeline. Browse the evolution of any yarn, replay patches, and prove what was known when.",
        "primary": "#7c3aed",
        "secondary": "#d97706",
        "accent": "#ec4899",
        "features": [
            ("⏳", "Time-aware queries", "Ask \"what did the graph look like on June 1st?\" and get a reproducible patch."),
            ("🕸️", "Lineage by construction", "Every triple carries source yarn, source stitch and confidence. No retrofitted audit log."),
            ("🗂️", "Curated histories", "Historians can weave archival yarns that annotate, correct and contextualise events."),
            ("📜", "Proof of record", "Signed stitches give cryptographic evidence of who asserted what, and when."),
        ],
        "comparison_caption": "Plexus versus traditional archives",
        "comparison_rows": [
            ("Static archive / PDF", "Read-only snapshot", "No provenance", "No signed history", "Dead data"),
            ("Plexus", "Living, queryable fabric", "Triple provenance", "Cryptographic audit trail", "Evolving data"),
        ],
        "cta_primary": ("Read the brand strategy", "https://github.com/virtuanalytica/virtualpc/blob/main/docs/BRAND-STRATEGY.md"),
        "cta_secondary": [("All brands", "brands.html"), ("GitHub repo", "https://github.com/virtuanalytica/virtualpc")],
    },
}


def gradient(primary: str, secondary: str) -> str:
    return f"linear-gradient(135deg, {primary} 0%, {secondary} 100%)"


def make_logo(brand: str, primary: str, secondary: str, accent: str) -> str:
    if brand == "loom":
        return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="loomGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:{primary};stop-opacity:1" />
      <stop offset="100%" style="stop-color:{accent};stop-opacity:1" />
    </linearGradient>
    <filter id="loomGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  <circle cx="256" cy="256" r="240" fill="#0b1220" stroke="url(#loomGrad)" stroke-width="4"/>
  <g stroke="url(#loomGrad)" stroke-width="4" fill="none" stroke-linecap="round" filter="url(#loomGlow)">
    <line x1="200" y1="120" x2="200" y2="392"/>
    <line x1="256" y1="120" x2="256" y2="392"/>
    <line x1="312" y1="120" x2="312" y2="392"/>
    <path d="M120 180 Q256 220 392 180"/>
    <path d="M120 256 Q256 296 392 256"/>
    <path d="M120 332 Q256 372 392 332"/>
  </g>
  <circle cx="256" cy="256" r="36" fill="url(#loomGrad)"/>
  <circle cx="256" cy="256" r="18" fill="#050810"/>
  <circle cx="256" cy="256" r="8" fill="url(#loomGrad)"/>
</svg>"""
    if brand == "fiber":
        return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="fiberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:{primary};stop-opacity:1" />
      <stop offset="100%" style="stop-color:{accent};stop-opacity:1" />
    </linearGradient>
    <filter id="fiberGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  <circle cx="256" cy="256" r="240" fill="#0b1220" stroke="url(#fiberGrad)" stroke-width="4"/>
  <g stroke="url(#fiberGrad)" stroke-width="3" fill="none" stroke-linecap="round" filter="url(#fiberGlow)">
    <line x1="120" y1="180" x2="392" y2="180"/>
    <line x1="120" y1="256" x2="392" y2="256"/>
    <line x1="120" y1="332" x2="392" y2="332"/>
    <path d="M120 180 Q256 120 392 180"/>
    <path d="M120 256 Q256 196 392 256"/>
    <path d="M120 332 Q256 272 392 332"/>
  </g>
  <circle cx="256" cy="256" r="36" fill="url(#fiberGrad)"/>
  <circle cx="256" cy="256" r="18" fill="#050810"/>
  <circle cx="256" cy="256" r="8" fill="url(#fiberGrad)"/>
</svg>"""
    # plexus
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="plexusGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:{primary};stop-opacity:1" />
      <stop offset="100%" style="stop-color:{accent};stop-opacity:1" />
    </linearGradient>
    <filter id="plexusGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  <circle cx="256" cy="256" r="240" fill="#0b1220" stroke="url(#plexusGrad)" stroke-width="4"/>
  <g stroke="url(#plexusGrad)" stroke-width="3" fill="none" stroke-linecap="round" filter="url(#plexusGlow)">
    <circle cx="256" cy="256" r="80"/>
    <circle cx="256" cy="256" r="140"/>
    <line x1="256" y1="120" x2="256" y2="180"/>
    <line x1="256" y1="332" x2="256" y2="392"/>
    <line x1="120" y1="256" x2="180" y2="256"/>
    <line x1="332" y1="256" x2="392" y2="256"/>
  </g>
  <circle cx="256" cy="256" r="36" fill="url(#plexusGrad)"/>
  <circle cx="256" cy="256" r="18" fill="#050810"/>
  <circle cx="256" cy="256" r="8" fill="url(#plexusGrad)"/>
</svg>"""


def brand_page(key: str, data: dict) -> str:
    primary = data["primary"]
    accent = data["accent"]
    grad = gradient(primary, accent)
    features_html = "\n".join(
        f'      <div class="card"><h3>{icon} {title}</h3><p>{desc}</p></div>'
        for icon, title, desc in data["features"]
    )
    rows_html = "\n".join(
        f"""          <tr{' class="brand-row"' if i == len(data["comparison_rows"]) - 1 else ''}>
            <td><strong>{name}</strong></td>
            <td>{a}</td>
            <td>{b}</td>
            <td>{c}</td>
            <td>{d}</td>
          </tr>"""
        for i, (name, a, b, c, d) in enumerate(data["comparison_rows"])
    )
    cta_secondary_html = "\n".join(
        f'    <a class="btn btn-secondary" href="{href}">{label}</a>'
        for label, href in data["cta_secondary"]
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{data['title']}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    background: #050810; color: #e6f0ff;
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    line-height: 1.6;
  }}
  a {{ color: {primary}; text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}

  header {{
    position: sticky; top: 0; z-index: 10;
    background: rgba(5,8,16,.85); backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255,255,255,.08); padding: 14px 24px;
    display: flex; align-items: center; justify-content: space-between;
  }}
  .brand {{ display: flex; align-items: center; gap: 10px; font-family: 'Orbitron', sans-serif; font-weight: 800; font-size: 1.15rem; color: #f0f9ff; }}
  .brand img {{ width: 32px; height: 32px; }}

  .hero {{
    padding: 56px 24px 40px; text-align: center;
    background:
      radial-gradient(circle at 20% 25%, {primary}18 0%, transparent 45%),
      radial-gradient(circle at 80% 75%, {accent}14 0%, transparent 45%);
  }}
  .logo-hero {{ width: 140px; height: 140px; margin: 0 auto 24px; filter: drop-shadow(0 0 24px {primary}40); }}
  .eyebrow {{
    display: inline-block; font-size: .72rem; letter-spacing: .2em; text-transform: uppercase;
    color: {accent}; border: 1px solid {primary}50; border-radius: 999px;
    padding: 6px 14px; margin-bottom: 18px;
  }}
  h1 {{
    font-family: 'Orbitron', sans-serif; font-weight: 900;
    font-size: clamp(2rem, 5.5vw, 3.4rem); line-height: 1.05;
    background: {grad};
    -webkit-background-clip: text; background-clip: text; color: transparent;
    margin-bottom: 14px;
  }}
  .hero p {{ color: #94a3b8; max-width: 720px; margin: 0 auto 28px; font-size: 1.1rem; }}

  .cta-row {{ display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }}
  .btn {{
    display: inline-flex; align-items: center; gap: 8px; font-weight: 600; font-size: .92rem;
    padding: 12px 20px; border-radius: 8px; transition: transform .12s;
  }}
  .btn-primary {{ background: {primary}; color: #050810; box-shadow: 0 4px 18px {primary}50; }}
  .btn-primary:hover {{ transform: translateY(-2px); text-decoration: none; }}
  .btn-secondary {{ background: rgba(255,255,255,.06); color: #e6f0ff; border: 1px solid rgba(255,255,255,.12); }}
  .btn-secondary:hover {{ background: rgba(255,255,255,.10); text-decoration: none; }}

  section {{ padding: 56px 24px; }}
  .container {{ max-width: 1100px; margin: 0 auto; }}
  h2 {{
    font-family: 'Orbitron', sans-serif; font-size: clamp(1.4rem, 3vw, 1.9rem); font-weight: 700;
    margin-bottom: 12px; color: #f0f9ff;
  }}
  .section-sub {{ color: #94a3b8; max-width: 680px; margin-bottom: 32px; }}

  .table-wrap {{ overflow-x: auto; margin: 22px 0; }}
  table {{ width: 100%; border-collapse: collapse; font-size: .85rem; }}
  th, td {{ padding: 12px 14px; text-align: left; border-bottom: 1px solid rgba(255,255,255,.08); }}
  th {{ color: #bfdbfe; background: rgba(255,255,255,.04); }}
  td {{ color: #cbd5e1; vertical-align: top; }}
  tr:hover td {{ background: rgba(255,255,255,.03); }}
  .brand-row td {{ background: {primary}15; }}

  .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }}
  .card {{
    background: rgba(255,255,255,.04); border: 1px solid rgba(96,165,250,.15); border-radius: 12px;
    padding: 22px; transition: transform .12s, border-color .12s;
  }}
  .card:hover {{ transform: translateY(-3px); border-color: {primary}60; }}
  .card h3 {{ font-size: 1.05rem; color: #bfdbfe; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }}
  .card p {{ font-size: .9rem; color: #94a3b8; }}

  footer {{ text-align: center; padding: 40px 24px; color: #64748b; font-size: .85rem; border-top: 1px solid rgba(255,255,255,.06); }}
</style>
</head>
<body>

<header>
  <div class="brand">
    <img src="logos/{key}-logo.svg" alt="{data['name']}">
    {data['name']}
  </div>
  <a href="brands.html">← All brands</a>
</header>

<section class="hero">
  <img src="logos/{key}-logo.svg" alt="{data['name']} logo" class="logo-hero">
  <span class="eyebrow">{data['eyebrow']}</span>
  <h1>{data['name']}</h1>
  <p>{data['description']}</p>
  <div class="cta-row">
    <a class="btn btn-primary" href="{data['cta_primary'][1]}">{data['cta_primary'][0]}</a>
{cta_secondary_html}
  </div>
</section>

<section id="comparison">
  <div class="container">
    <h2>{data['comparison_caption']}</h2>
    <p class="section-sub">{data['name']} is one view of the same fabric. The difference is the narrative, not the data model.</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Approach</th>
            <th>Storage / sync</th>
            <th>Ownership</th>
            <th>Identity</th>
            <th>Topology</th>
          </tr>
        </thead>
        <tbody>
{rows_html}
        </tbody>
      </table>
    </div>
  </div>
</section>

<section style="background:rgba(255,255,255,.02);">
  <div class="container">
    <h2>Why {data['name']}?</h2>
    <div class="grid">
{features_html}
    </div>
  </div>
</section>

<section>
  <div class="container">
    <h2>Part of one fabric</h2>
    <p class="section-sub">Loom, KnitNet, Fiber and Plexus are not four products. They are four lenses on the same Textus-type database — the brain lives in the GitHub repo.</p>
    <div class="cta-row" style="justify-content:flex-start;">
      <a class="btn btn-primary" href="https://github.com/virtuanalytica/virtualpc">Open the machine on GitHub</a>
      <a class="btn btn-secondary" href="brands.html">Explore all brands</a>
      <a class="btn btn-secondary" href="knitnet.html">KnitNet →</a>
    </div>
  </div>
</section>

<footer>
  <p>{data['name']} is a brand line of VirtualPC · <a href="brands.html">All brands</a> · <a href="https://github.com/virtuanalytica/virtualpc">GitHub</a></p>
</footer>

</body>
</html>
"""


def hub_page() -> str:
    return """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VirtualPC Brand Fabric · Loom · KnitNet · Fiber · Plexus</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    background: #050810; color: #e6f0ff;
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    line-height: 1.6;
  }
  a { color: #60a5fa; text-decoration: none; }
  a:hover { text-decoration: underline; }

  header {
    position: sticky; top: 0; z-index: 10;
    background: rgba(5,8,16,.85); backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255,255,255,.08); padding: 14px 24px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .brand { font-family: 'Orbitron', sans-serif; font-weight: 800; font-size: 1.15rem; color: #f0f9ff; }

  .hero {
    min-height: 70vh; display: flex; flex-direction: column; justify-content: center; align-items: center;
    text-align: center; padding: 60px 24px;
    background:
      radial-gradient(circle at 20% 30%, rgba(96,165,250,.12) 0%, transparent 40%),
      radial-gradient(circle at 80% 70%, rgba(124,58,237,.12) 0%, transparent 40%);
  }
  .eyebrow {
    display: inline-block; font-size: .75rem; letter-spacing: .2em; text-transform: uppercase;
    color: #93c5fd; border: 1px solid rgba(96,165,250,.3); border-radius: 999px;
    padding: 6px 14px; margin-bottom: 24px;
  }
  h1 {
    font-family: 'Orbitron', sans-serif; font-weight: 900;
    font-size: clamp(2.2rem, 5.5vw, 3.8rem); line-height: 1.1;
    background: linear-gradient(90deg, #f59e0b 0%, #2563eb 33%, #06b6d4 66%, #7c3aed 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    margin-bottom: 20px;
  }
  .hero p { font-size: 1.15rem; color: #94a3b8; max-width: 660px; margin: 0 auto 32px; }

  section { padding: 72px 24px; }
  .container { max-width: 1200px; margin: 0 auto; }
  .section-title {
    font-family: 'Orbitron', sans-serif; font-size: clamp(1.4rem, 3vw, 1.9rem); font-weight: 700;
    margin-bottom: 12px; color: #f0f9ff;
  }
  .section-sub { color: #94a3b8; max-width: 700px; margin-bottom: 36px; }

  .brand-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }
  .brand-card {
    background: rgba(255,255,255,.04); border: 1px solid rgba(96,165,250,.15); border-radius: 14px;
    padding: 26px; transition: transform .15s, border-color .15s;
    display: flex; flex-direction: column; gap: 14px;
  }
  .brand-card:hover { transform: translateY(-4px); border-color: rgba(96,165,250,.4); }
  .brand-card img { width: 72px; height: 72px; }
  .brand-card h3 { font-family: 'Orbitron', sans-serif; font-size: 1.3rem; color: #f0f9ff; }
  .brand-card .tagline { color: #bfdbfe; font-weight: 600; }
  .brand-card p { color: #94a3b8; font-size: .92rem; flex-grow: 1; }
  .brand-card a { align-self: flex-start; font-weight: 600; }

  .fabric {
    background: rgba(255,255,255,.02);
  }
  .cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 12px; }
  .btn {
    display: inline-flex; align-items: center; gap: 8px; font-weight: 600; font-size: .95rem;
    padding: 12px 22px; border-radius: 8px; transition: transform .15s;
  }
  .btn-primary { background: #2563eb; color: #fff; }
  .btn-primary:hover { transform: translateY(-2px); text-decoration: none; }
  .btn-secondary { background: rgba(255,255,255,.06); color: #e6f0ff; border: 1px solid rgba(255,255,255,.12); }
  .btn-secondary:hover { background: rgba(255,255,255,.10); text-decoration: none; }

  footer { text-align: center; padding: 40px 24px; color: #64748b; font-size: .9rem; border-top: 1px solid rgba(255,255,255,.06); }
</style>
</head>
<body>

<header>
  <div class="brand">VirtualPC · Brand Fabric</div>
  <a href="index.html">← VirtualPC overview</a>
</header>

<section class="hero">
  <span class="eyebrow">One fabric · four entry points</span>
  <h1>Loom · KnitNet · Fiber · Plexus</h1>
  <p>Four brands that lead to the same Textus-type database. The brain lives in the GitHub repository; each website is a view of the same machine.</p>
  <div class="cta-row">
    <a class="btn btn-primary" href="https://github.com/virtuanalytica/virtualpc">Open the machine</a>
    <a class="btn btn-secondary" href="../docs/BRAND-STRATEGY.md">Read the strategy</a>
  </div>
</section>

<section>
  <div class="container">
    <h2 class="section-title">Pick a brand</h2>
    <p class="section-sub">Each line speaks to a different audience, but they all read and write the same fabric.</p>
    <div class="brand-grid">
      <div class="brand-card">
        <img src="logos/loom-logo.svg" alt="Loom">
        <h3>Loom</h3>
        <div class="tagline">Weave your own thread.</div>
        <p>The personal node. Spin up a DID-backed yarn, sign stitches, and weave a local patch that stays yours offline or online.</p>
        <a href="loom.html">Enter Loom →</a>
      </div>
      <div class="brand-card">
        <img src="logos/knitnet-logo.svg" alt="KnitNet">
        <h3>KnitNet</h3>
        <div class="tagline">The woven knowledge network.</div>
        <p>The blockless, hashgraph-less P2P protocol that turns looms into a shared KnitWeb of signed triples.</p>
        <a href="knitnet.html">Enter KnitNet →</a>
      </div>
      <div class="brand-card">
        <img src="logos/fiber-logo.svg" alt="Fiber">
        <h3>Fiber</h3>
        <div class="tagline">The same fabric underneath.</div>
        <p>The Textus-type database: triple-native, content-addressed, CRDT-mergeable storage for every brand.</p>
        <a href="fiber.html">Enter Fiber →</a>
      </div>
      <div class="brand-card">
        <img src="logos/plexus-logo.svg" alt="Plexus">
        <h3>Plexus</h3>
        <div class="tagline">Every thread leaves a trace.</div>
        <p>The historian layer. Browse, audit and replay the lineage of any yarn with cryptographic proof.</p>
        <a href="plexus.html">Enter Plexus →</a>
      </div>
    </div>
  </div>
</section>

<section class="fabric">
  <div class="container">
    <h2 class="section-title">The shared fabric</h2>
    <p class="section-sub">Loom, KnitNet, Fiber and Plexus are not separate products. They are four lenses on one machine.</p>
    <div class="brand-grid">
      <div class="brand-card"><h3>🧬 Content-addressed</h3><p>Every stitch, patch and yarn has a CID. Deduplication and verification are built in.</p></div>
      <div class="brand-card"><h3>🔄 CRDT merge</h3><p>Two local patches converge without consensus, locks or a central coordinator.</p></div>
      <div class="brand-card"><h3>🔐 DID identity</h3><p>Every yarn is owned by a decentralised identifier. Accountability without a platform.</p></div>
      <div class="brand-card"><h3>🌐 Offline-first</h3><p>Weave locally, sync via epidemic gossip when a peer appears. Like git, but for knowledge.</p></div>
    </div>
  </div>
</section>

<footer>
  <p>VirtualPC brand fabric · <a href="index.html">Overview</a> · <a href="https://github.com/virtuanalytica/virtualpc">GitHub</a></p>
</footer>

</body>
</html>
"""


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    LOGOS.mkdir(parents=True, exist_ok=True)

    for key, data in BRANDS.items():
        logo = make_logo(key, data["primary"], data["secondary"], data["accent"])
        (LOGOS / f"{key}-logo.svg").write_text(logo, encoding="utf-8")
        page = brand_page(key, data)
        (PUBLIC / f"{key}.html").write_text(page, encoding="utf-8")
        print(f"Generated {key}.html + logos/{key}-logo.svg")

    (PUBLIC / "brands.html").write_text(hub_page(), encoding="utf-8")
    print("Generated brands.html")


if __name__ == "__main__":
    main()
