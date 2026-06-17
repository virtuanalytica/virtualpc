#!/usr/bin/env python3
"""Ingest a single external artifact (research dossier, whitepaper, web doc) into
the VirtualPC knowledge_pit: LightRAG facts + GitNexus graph + SQLite + Obsidian.

This complements `digest-markdown-and-nudge-agents.py` (which bulk-scans every
Markdown file under the project/EDS roots). This script instead ingests ONE
artifact deeply: it takes the artifact text plus a pre-extracted, source-verified
entity list and materialises a richly-linked knowledge graph for it.

It is intentionally offline-safe — every artifact is written to local files
(the persistent LightRAG store IS the JSONL + SQLite). A best-effort live
`/api/corpus/ingest` is attempted only with --attempt-api-ingest; when Neo4j is
offline the route is a no-op and we record that honestly.

Outputs (mirroring the digest conventions):
  knowledge_pit/lightrag/<slug>_facts.jsonl          LightRAG-style facts
  knowledge_pit/lightrag/<slug>_lightrag.db          dedicated SQLite store
  knowledge_pit/code_graph/<slug>_gitnexus.json      GitNexus-style graph
  knowledge_pit/obsidian/.../Sources/<slug>.md       Obsidian source note
  knowledge_pit/obsidian/.../<project> {GitNexus,LightRAG} Index.md
  knowledge_pit/reports/<slug>_ingest_latest.json    run summary
  virtualpc/data/governance.json                     lineage entry

Usage:
  python3 ingest-artifact-into-kg.py \
      --source  knowledge_pit/sources/<slug>.md \
      --entities <entities.json from extraction workflow> \
      --slug    knitweb_pulse_loom_dossier \
      --project knitweb \
      --title   "Pulse / Loom: ..." \
      --source-url https://... --artifact-id <id> \
      [--attempt-api-ingest]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

VIRTUALPC = Path("/home/knight2/virtualpc")
KP = Path("/home/knight2/knowledge_pit")
VAULT = KP / "obsidian" / "Cross_Project_Knowledge_Graph"
REPORTS = KP / "reports"
LIGHTRAG = KP / "lightrag"
CODE_GRAPH = KP / "code_graph"
SOURCES = KP / "sources"

SNIPPET_CHARS = 4500
CHUNK_TARGET = 1200
CHUNK_OVERLAP = 150

# Canonical textile-metaphor layers for the "Loom" P2P knowledge fabric.
# Concept nodes the extracted entities hang off of (entity -[MAPS_TO]-> layer).
METAPHOR_LAYERS = {
    "Loom": "Protocol rules / validation layer (libp2p protocol semantics). Internal-architecture vocabulary only — NOT the platform brand; the project brand is Knitweb (Loom as a standalone name is a deprecated codename).",
    "Mesh": "Flat peer connection / transport layer (libp2p connections, WebRTC).",
    "Pulse": "Gossip / epidemic propagation and voting signal (SWIM, gossipsub, Avalanche subsampled vote).",
    "Fibre": "Content-addressed cryptographic thread / token (CID, SHA-256, ed25519 identity).",
    "Plexus": "Convergent knowledge graph (CRDT graph, networkx/rustworkx).",
    "Textus": "CRDT convergence math (Automerge / op- and state-based replicated types).",
    "Knit": "Edge / transfer / reciprocity exchange (Bitswap, BitTorrent tit-for-tat).",
    "Braid": "Interweaving of streams / DAG merge (Avalanche DAG, Braidpool beads).",
    "Silk": "Routing incentive — pay nodes for relaying (Saito-style).",
    "Crawler": "DHT walker / routing substrate (Kademlia, Mainline DHT).",
    "Knot": "Local-mesh discovery / staking unit (zeroconf mDNS).",
    "Blob": "Local block store, the 'ball of wool' (IPFS blockstore).",
    "Web": "The overall knowledge graph / Plexus representation.",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sha_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="ignore")).hexdigest()


def short_id(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8", errors="ignore")).hexdigest()[:16]


def safe(value: Any, limit: int = 150) -> str:
    text = re.sub(r"[^A-Za-z0-9._ -]+", "_", str(value)).strip(" .")
    return (text[:limit] or "unnamed").strip()


def norm_name(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
    tmp.replace(path)


def load_json(path: Path, default: Any) -> Any:
    if not path or not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return default


def post_json(api: str, path: str, payload: dict[str, Any], timeout: int = 120) -> tuple[int, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(api + path, data=data, method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
            try:
                return resp.status, json.loads(body)
            except Exception:
                return resp.status, body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        try:
            return exc.code, json.loads(body)
        except Exception:
            return exc.code, body
    except Exception as exc:
        return 0, str(exc)


def strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            nl = text.find("\n", end + 1)
            return text[nl + 1:] if nl != -1 else ""
    return text


def chunk_text(text: str, source: str) -> list[dict[str, Any]]:
    if not text or len(text) < 50:
        return []
    out: list[dict[str, Any]] = []
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    buf = ""
    idx = 0
    for p in paras:
        if len(buf) + len(p) > CHUNK_TARGET and len(buf) > CHUNK_TARGET - CHUNK_OVERLAP:
            out.append({"id": f"{source}#{idx}", "source": source, "source_kind": "paper", "content": buf.strip()})
            idx += 1
            tail = buf[-CHUNK_OVERLAP:]
            cut = max(tail.rfind(". "), tail.rfind("\n"), 0)
            buf = tail[cut:].strip() + "\n\n" + p
        else:
            buf += ("\n\n" if buf else "") + p
    if buf.strip():
        out.append({"id": f"{source}#{idx}", "source": source, "source_kind": "paper", "content": buf.strip()})
    return out


def split_layers(value: str) -> list[str]:
    raw = re.split(r"[,/;|]+", str(value or ""))
    out = []
    for token in raw:
        t = token.strip().strip(".").title()
        if t in {"Fiber"}:
            t = "Fibre"
        if t in METAPHOR_LAYERS and t not in out:
            out.append(t)
    return out


def dedup_entities(entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge duplicate (node_type, name) entities surfaced across sections/critic."""
    by_key: dict[tuple[str, str], dict[str, Any]] = {}
    order: list[tuple[str, str]] = []
    for e in entities:
        nt = str(e.get("node_type", "entity")).strip() or "entity"
        nm = str(e.get("name", "")).strip()
        if not nm:
            continue
        key = (nt, norm_name(nm))
        if key not in by_key:
            by_key[key] = dict(e)
            order.append(key)
        else:
            cur = by_key[key]
            # Fill empty fields from the duplicate; concat metaphor maps.
            for field in ("category", "language", "maturity", "url", "ticker", "risk_or_status", "summary", "source_quote"):
                if not cur.get(field) and e.get(field):
                    cur[field] = e[field]
            layers = split_layers(cur.get("metaphor_map", "")) + split_layers(e.get("metaphor_map", ""))
            merged = []
            for la in layers:
                if la not in merged:
                    merged.append(la)
            if merged:
                cur["metaphor_map"] = ",".join(merged)
    return [by_key[k] for k in order]


def build(args: argparse.Namespace) -> dict[str, Any]:
    for d in (LIGHTRAG, CODE_GRAPH, REPORTS, SOURCES, VAULT):
        d.mkdir(parents=True, exist_ok=True)

    slug = args.slug
    project = args.project
    source_path = Path(args.source)
    raw = source_path.read_text(encoding="utf-8", errors="ignore")
    body = strip_frontmatter(raw)
    title = args.title or (re.search(r"^#\s+(.+)$", body, re.M).group(1) if re.search(r"^#\s+(.+)$", body, re.M) else slug)

    payload = load_json(Path(args.entities), {}) if args.entities else {}
    raw_entities = payload.get("entities", []) if isinstance(payload, dict) else []
    entities = dedup_entities(raw_entities)

    facts_path = LIGHTRAG / f"{slug}_facts.jsonl"
    graph_path = CODE_GRAPH / f"{slug}_gitnexus.json"
    db_path = LIGHTRAG / f"{slug}_lightrag.db"

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    facts: list[dict[str, Any]] = []

    rel = str(source_path)
    doc_hash = sha_text(rel + "\n" + raw)

    # --- root dossier + project nodes ---
    dossier_id = f"dossier:{slug}"
    project_node = f"project:{project}"
    nodes.append({
        "id": dossier_id, "type": "research_dossier", "name": title, "path": rel,
        "project": project, "source_url": args.source_url, "artifact_id": args.artifact_id,
        "bytes": len(raw.encode("utf-8")), "sha256": doc_hash,
        "entity_count": len(entities), "ingested_at": utc_now(),
    })
    nodes.append({"id": project_node, "type": "project", "name": project, "project": project})
    edges.append({"from": project_node, "to": dossier_id, "kind": "HAS_DOSSIER"})

    facts.append({
        "id": dossier_id, "kind": "research_dossier", "name": title,
        "content": body[:SNIPPET_CHARS],
        "context": f"Research dossier '{title}' ingested for project={project} from {args.source_url or rel}; entities={len(entities)}",
        "source": rel, "project": project, "source_root": str(SOURCES),
        "source_url": args.source_url, "artifact_id": args.artifact_id,
        "created_at": utc_now(), "content_sha": doc_hash, "publish_allowed": False,
    })

    # --- metaphor-layer concept nodes ---
    for layer, desc in METAPHOR_LAYERS.items():
        cid = f"concept:layer:{layer.lower()}"
        nodes.append({"id": cid, "type": "metaphor_layer", "name": layer, "project": project, "description": desc})
        edges.append({"from": dossier_id, "to": cid, "kind": "DEFINES_LAYER"})
        facts.append({
            "id": cid, "kind": "metaphor_layer", "name": layer, "content": desc,
            "context": f"Textile-metaphor layer '{layer}' in the {title} P2P fabric",
            "source": rel, "project": project, "created_at": utc_now(),
            "content_sha": sha_text(cid + desc), "publish_allowed": False,
        })

    # --- section nodes ---
    section_titles = {
        "area1_tech": "AREA 1 — Technical / Python Implementation",
        "area2_lit": "AREA 2 — Academic Literature, Methodology & Empirical Evidence",
        "area3_brand": "AREA 3 — Comparative Crypto Terminology & Branding Risk",
        "meta": "TL;DR / Key Findings / Recommendations / Caveats / Thresholds",
        "critic_extra": "Completeness-critic additions",
    }
    present_sections = []
    for e in entities:
        sk = e.get("_section", "meta")
        if sk not in present_sections:
            present_sections.append(sk)
    section_node_id = {}
    for sk in present_sections:
        sid = f"section:{slug}:{sk}"
        section_node_id[sk] = sid
        nodes.append({"id": sid, "type": "dossier_section", "name": section_titles.get(sk, sk),
                      "project": project, "section_key": sk})
        edges.append({"from": dossier_id, "to": sid, "kind": "HAS_SECTION"})

    # --- entity nodes + facts + edges ---
    type_counts: Counter[str] = Counter()
    layer_link_count = 0
    ent_id_by_name: dict[str, str] = {}          # norm_name -> eid (first wins)
    ent_id_by_type_name: dict[tuple[str, str], str] = {}
    pending_rel_out: list[tuple[str, list[dict]]] = []
    for e in entities:
        nt = str(e.get("node_type", "entity")).strip() or "entity"
        nm = str(e.get("name", "")).strip()
        type_counts[nt] += 1
        eid = f"ent:{slug}:{safe(nt)}:{short_id(nt + '|' + norm_name(nm))}"
        ent_id_by_name.setdefault(norm_name(nm), eid)
        ent_id_by_type_name[(nt, norm_name(nm))] = eid
        if e.get("relations_out"):
            pending_rel_out.append((eid, e["relations_out"]))
        layers = split_layers(e.get("metaphor_map", ""))
        node = {
            "id": eid, "type": nt, "name": nm, "project": project,
            "category": e.get("category", ""), "metaphor_map": ",".join(layers),
            "language": e.get("language", ""), "maturity": e.get("maturity", ""),
            "url": e.get("url", ""), "ticker": e.get("ticker", ""),
            "risk_or_status": e.get("risk_or_status", ""), "summary": e.get("summary", ""),
            "source_quote": e.get("source_quote", ""),
            "deprecated": bool(e.get("deprecated", False)), "note": e.get("note", ""),
        }
        nodes.append(node)
        sk = e.get("_section", "meta")
        sid = section_node_id.get(sk, dossier_id)
        edges.append({"from": sid, "to": eid, "kind": "CONTAINS"})
        edges.append({"from": dossier_id, "to": eid, "kind": "HAS_ENTITY"})
        for layer in layers:
            edges.append({"from": eid, "to": f"concept:layer:{layer.lower()}", "kind": "MAPS_TO"})
            layer_link_count += 1

        ctx_bits = [f"type={nt}", f"section={sk}"]
        for k in ("category", "language", "maturity", "ticker", "risk_or_status"):
            if e.get(k):
                ctx_bits.append(f"{k}={e[k]}")
        if layers:
            ctx_bits.append("layers=" + "|".join(layers))
        if e.get("url"):
            ctx_bits.append(f"url={e['url']}")
        if e.get("deprecated"):
            ctx_bits.append("deprecated=true")
        content = e.get("summary", "") or nm
        if e.get("note"):
            content = f"{content}\n\nNOTE: {e['note']}"
        facts.append({
            "id": eid, "kind": nt, "name": nm,
            "content": content,
            "context": "; ".join(ctx_bits),
            "source": rel, "project": project, "source_url": args.source_url,
            "node_type": nt, "category": e.get("category", ""), "metaphor_map": ",".join(layers),
            "language": e.get("language", ""), "maturity": e.get("maturity", ""),
            "url": e.get("url", ""), "ticker": e.get("ticker", ""),
            "risk_or_status": e.get("risk_or_status", ""), "source_quote": e.get("source_quote", ""),
            "deprecated": bool(e.get("deprecated", False)), "note": e.get("note", ""),
            "created_at": utc_now(), "content_sha": sha_text(eid + e.get("summary", "")),
            "publish_allowed": False,
        })

    # --- resolve explicit entity->entity relations (e.g. SUPERSEDES) by name ---
    rel_out_count = 0
    for src_eid, rels in pending_rel_out:
        for r in rels:
            to_name = norm_name(r.get("to_name", ""))
            to_type = str(r.get("to_type", "")).strip()
            kind = str(r.get("kind", "RELATES_TO")).strip() or "RELATES_TO"
            dst = ent_id_by_type_name.get((to_type, to_name)) if to_type else None
            if not dst:
                dst = ent_id_by_name.get(to_name)
            if dst and dst != src_eid:
                edges.append({"from": src_eid, "to": dst, "kind": kind, "evidence": r.get("evidence", "")})
                rel_out_count += 1

    # --- write facts jsonl ---
    with facts_path.open("w", encoding="utf-8") as fh:
        for f in facts:
            fh.write(json.dumps(f, ensure_ascii=False) + "\n")

    # --- write gitnexus graph ---
    graph = {
        "version": 1,
        "schema": "artifact_gitnexus/v1",
        "built_at": utc_now(),
        "slug": slug,
        "project": project,
        "title": title,
        "source": rel,
        "source_url": args.source_url,
        "artifact_id": args.artifact_id,
        "description": f"GitNexus-style knowledge graph for the ingested artifact '{title}'.",
        "node_count": len(nodes),
        "edge_count": len(edges),
        "nodes": nodes,
        "edges": edges,
    }
    write_json(graph_path, graph)

    # --- corpus chunks (full-text, source_kind=paper) ---
    chunks = chunk_text(body, f"{project}:{slug}")
    chunks_path = LIGHTRAG / f"{slug}_corpus_chunks.json"
    for c in chunks:
        c["title"] = title
        c["meta"] = {"project": project, "source": rel, "source_url": args.source_url,
                     "artifact_id": args.artifact_id, "content_sha": doc_hash}
    write_json(chunks_path, {"chunks": chunks})

    # --- sqlite (dedicated; never clobbers shared digest db) ---
    write_sqlite(db_path, facts, nodes, edges)

    summary = {
        "updated_at": utc_now(),
        "slug": slug,
        "project": project,
        "title": title,
        "source": rel,
        "source_url": args.source_url,
        "artifact_id": args.artifact_id,
        "raw_entities": len(raw_entities),
        "deduped_entities": len(entities),
        "entity_type_counts": dict(type_counts.most_common()),
        "graph_nodes": len(nodes),
        "graph_edges": len(edges),
        "metaphor_layer_links": layer_link_count,
        "explicit_relation_edges": rel_out_count,
        "facts_written": len(facts),
        "corpus_chunks": len(chunks),
        "removed_by_verifier": payload.get("removed", []) if isinstance(payload, dict) else [],
        "url_corrections": payload.get("url_corrections", []) if isinstance(payload, dict) else [],
        "outputs": {
            "lightrag_facts": str(facts_path),
            "gitnexus_graph": str(graph_path),
            "sqlite": str(db_path),
            "corpus_chunks": str(chunks_path),
            "source": rel,
        },
    }

    write_obsidian(slug, project, title, summary, args)
    upsert_governance(slug, project, title, summary, args)
    write_json(REPORTS / f"{slug}_ingest_latest.json", summary)
    return summary


def write_sqlite(db_path: Path, facts: list[dict], nodes: list[dict], edges: list[dict]) -> None:
    if db_path.exists():
        db_path.unlink()
    con = sqlite3.connect(db_path)
    con.executescript(
        """
        pragma journal_mode=wal;
        create table if not exists facts (
          id text primary key, kind text not null, content text not null,
          context text, source text, project text, created_at text, content_sha text
        );
        create table if not exists entities (
          id text primary key, name text not null, kind text, project text, source text
        );
        create table if not exists relations (
          src_id text not null, dst_id text not null, kind text not null,
          evidence text, primary key (src_id, dst_id, kind)
        );
        """
    )
    for row in facts:
        con.execute(
            "insert or replace into facts values (?, ?, ?, ?, ?, ?, ?, ?)",
            (row.get("id"), row.get("kind"), row.get("content", ""), row.get("context", ""),
             row.get("source", ""), row.get("project", ""), row.get("created_at", ""), row.get("content_sha", "")),
        )
    for n in nodes:
        con.execute(
            "insert or replace into entities values (?, ?, ?, ?, ?)",
            (n.get("id"), n.get("name", ""), n.get("type", ""), n.get("project", ""), n.get("path", n.get("url", ""))),
        )
    for e in edges:
        con.execute(
            "insert or replace into relations values (?, ?, ?, ?)",
            (e.get("from"), e.get("to"), e.get("kind"), e.get("evidence", "")),
        )
    con.commit()
    con.close()


def write_note(path: Path, title: str, body: list[str], props: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    front = ["---"]
    for key, value in props.items():
        if isinstance(value, list):
            front.append(f"{key}:")
            for item in value:
                front.append(f"  - {json.dumps(str(item), ensure_ascii=False)}")
        elif isinstance(value, bool):
            front.append(f"{key}: {'true' if value else 'false'}")
        elif isinstance(value, (int, float)):
            front.append(f"{key}: {value}")
        else:
            front.append(f"{key}: {json.dumps(str(value), ensure_ascii=False)}")
    front.append("---")
    path.write_text("\n".join(front + ["", f"# {title}", ""] + body) + "\n", encoding="utf-8")


def write_obsidian(slug: str, project: str, title: str, summary: dict[str, Any], args: argparse.Namespace) -> None:
    out = summary["outputs"]
    counts = summary["entity_type_counts"]
    body = [
        f"Ingested artifact **{title}** for project `{project}`.",
        "",
        f"- Source: `{out['source']}`",
        f"- Source URL: {args.source_url or 'n/a'}",
        f"- LightRAG facts: `{out['lightrag_facts']}`",
        f"- GitNexus graph: `{out['gitnexus_graph']}` ({summary['graph_nodes']} nodes / {summary['graph_edges']} edges)",
        f"- SQLite LightRAG store: `{out['sqlite']}`",
        f"- Corpus chunks: `{out['corpus_chunks']}` ({summary['corpus_chunks']} chunks)",
        "",
        "## Entity types",
        "",
    ]
    for k, v in counts.items():
        body.append(f"- {k}: {v}")
    body += ["", f"Graph: [[{project} GitNexus Index]] · Facts: [[{project} LightRAG Index]]"]
    write_note(
        VAULT / "Sources" / f"{safe(slug)}.md",
        title,
        body,
        {"tags": ["artifact-ingest", project, "lightrag", "gitnexus"], "project": project,
         "publish": False, "graph_kind": "research_dossier", "source_url": args.source_url or "",
         "updated": summary["updated_at"]},
    )
    # Project-scoped index notes (create or refresh; non-destructive to others).
    write_note(
        VAULT / f"{project} GitNexus Index.md",
        f"{project} GitNexus Index",
        ["", "## Graph Artifacts", "",
         f"- `{out['gitnexus_graph']}` nodes={summary['graph_nodes']} edges={summary['graph_edges']}",
         "", f"Source note: [[Sources/{safe(slug)}|{title}]]"],
        {"tags": ["index", "gitnexus", project], "project": project, "publish": False, "graph_kind": "index"},
    )
    write_note(
        VAULT / f"{project} LightRAG Index.md",
        f"{project} LightRAG Index",
        ["", "## LightRAG Artifacts", "",
         f"- facts: `{out['lightrag_facts']}` ({summary['facts_written']} facts)",
         f"- sqlite: `{out['sqlite']}`",
         f"- corpus chunks: `{out['corpus_chunks']}` ({summary['corpus_chunks']})",
         "", f"Source note: [[Sources/{safe(slug)}|{title}]]"],
        {"tags": ["index", "lightrag", project], "project": project, "publish": False, "graph_kind": "index"},
    )


def upsert_governance(slug: str, project: str, title: str, summary: dict[str, Any], args: argparse.Namespace) -> None:
    path = VIRTUALPC / "data" / "governance.json"
    data = load_json(path, {"entries": []})
    gid = f"artifact-ingest-{slug}"
    entries = [e for e in data.get("entries", []) if e.get("id") != gid]
    entries.append({
        "id": gid,
        "name": f"Artifact ingest: {title}",
        "kind": "knowledge-graph",
        "owner": "Governor",
        "project": project,
        "source": summary["outputs"]["lightrag_facts"],
        "source_url": args.source_url,
        "lineage": (
            f"External artifact '{title}' ({args.source_url or 'local'}) ingested into the knowledge_pit. "
            f"{summary['deduped_entities']} source-verified entities -> {summary['graph_nodes']} GitNexus nodes / "
            f"{summary['graph_edges']} edges, {summary['facts_written']} LightRAG facts, {summary['corpus_chunks']} corpus chunks."
        ),
        "updatedAt": summary["updated_at"],
        "license": "research dossier; cite original sources",
        "tags": ["knowledge-graph", "artifact-ingest", project, "lightrag", "gitnexus"],
    })
    data["entries"] = entries
    write_json(path, data)


def attempt_api_ingest(summary: dict[str, Any], api: str, max_chunks: int) -> dict[str, Any]:
    chunks_path = Path(summary["outputs"]["corpus_chunks"])
    payload = load_json(chunks_path, {})
    chunks = payload.get("chunks", [])[:max_chunks]
    if not chunks:
        return {"attempted": False, "reason": "no chunks"}
    status, response = post_json(api, "/api/corpus/ingest", {"chunks": chunks}, timeout=180)
    return {"attempted": True, "chunks": len(chunks), "status": status, "response": response}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--entities", default="")
    ap.add_argument("--slug", required=True)
    ap.add_argument("--project", default="knitweb")
    ap.add_argument("--title", default="")
    ap.add_argument("--source-url", default="")
    ap.add_argument("--artifact-id", default="")
    ap.add_argument("--api", default="http://127.0.0.1:3100")
    ap.add_argument("--attempt-api-ingest", action="store_true")
    ap.add_argument("--api-ingest-max-chunks", type=int, default=500)
    args = ap.parse_args()

    summary = build(args)
    api_ingest = (
        attempt_api_ingest(summary, args.api, args.api_ingest_max_chunks)
        if args.attempt_api_ingest else {"attempted": False, "reason": "not requested"}
    )
    summary["api_ingest"] = api_ingest
    write_json(REPORTS / f"{args.slug}_ingest_latest.json", summary)
    print(json.dumps({
        "slug": summary["slug"], "project": summary["project"], "title": summary["title"],
        "deduped_entities": summary["deduped_entities"], "entity_type_counts": summary["entity_type_counts"],
        "graph_nodes": summary["graph_nodes"], "graph_edges": summary["graph_edges"],
        "facts_written": summary["facts_written"], "corpus_chunks": summary["corpus_chunks"],
        "metaphor_layer_links": summary["metaphor_layer_links"],
        "removed_by_verifier": len(summary["removed_by_verifier"]),
        "url_corrections": len(summary["url_corrections"]),
        "outputs": summary["outputs"], "api_ingest": api_ingest,
    }, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
