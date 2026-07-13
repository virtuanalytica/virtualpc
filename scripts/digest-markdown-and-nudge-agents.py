#!/usr/bin/env python3
"""Digest cross-project Markdown into local knowledge graph artifacts.

This script is intentionally usable when Neo4j/LightRAG is offline. It writes:
- LightRAG-style JSONL facts for every Markdown file and heading.
- GitNexus-style document graph JSON with file/heading/link nodes and edges.
- A compact SQLite facts/entities/relations store.
- Obsidian index notes for local graph browsing.
- VirtualPC governance/scrum records and all-agent review tasks.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

VIRTUALPC = Path("/home/knight2/virtualpc")
KP = Path("/home/knight2/knowledge_pit")
VAULT = KP / "obsidian" / "Cross_Project_Knowledge_Graph"
REPORTS = KP / "reports"
LIGHTRAG = KP / "lightrag"
CODE_GRAPH = KP / "code_graph"
API = os.environ.get("VIRTUALPC_URL", "http://127.0.0.1:3100")

REQUESTED_ROOTS = [
    Path("/media/knight2/EDS2/projects"),
    Path("/home/knight2/EDS"),
    Path("/media/knight2/EDS"),
]

VENDOR_PARTS = {
    ".git",
    ".hg",
    ".svn",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".pytest_cache",
    "__pycache__",
    "site-packages",
}

MAX_CONTENT_BYTES = 2 * 1024 * 1024
SNIPPET_CHARS = 4500


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sha_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="ignore")).hexdigest()


def short_id(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8", errors="ignore")).hexdigest()[:16]


def safe(value: Any, limit: int = 150) -> str:
    text = re.sub(r"[^A-Za-z0-9._ -]+", "_", str(value)).strip(" .")
    return (text[:limit] or "unnamed").strip()


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
    tmp.replace(path)


def post_json(path: str, payload: dict[str, Any], timeout: int = 20) -> tuple[int, dict[str, Any] | str]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API + path,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
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


def get_json(path: str, timeout: int = 20) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(API + path, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", errors="ignore"))
    except Exception:
        return {}


def project_for(path: Path) -> str:
    parts = path.parts
    if "/media/knight2/EDS2/projects" in str(path):
        try:
            idx = parts.index("projects")
            return parts[idx + 1]
        except Exception:
            return "EDS2_projects"
    if str(path).startswith("/media/knight2/EDS"):
        return "EDS"
    if str(path).startswith("/home/knight2/EDS"):
        return "home_EDS"
    return "unknown"


def source_root_for(path: Path) -> str:
    text = str(path)
    for root in REQUESTED_ROOTS:
        if text.startswith(str(root)):
            return str(root)
    return ""


def is_vendor(path: Path) -> bool:
    return any(part in VENDOR_PARTS for part in path.parts)


def extract_headings(text: str, limit: int = 200) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for line_no, line in enumerate(text.splitlines(), 1):
        m = re.match(r"^(#{1,6})\s+(.+?)\s*$", line)
        if not m:
            continue
        out.append({"level": len(m.group(1)), "title": m.group(2).strip()[:250], "line": line_no})
        if len(out) >= limit:
            break
    return out


def extract_links(text: str, limit: int = 200) -> list[str]:
    links = []
    for match in re.finditer(r"\[[^\]]+\]\(([^)]+)\)|\[\[([^\]]+)\]\]", text):
        link = (match.group(1) or match.group(2) or "").strip()
        if link and not link.startswith("#"):
            links.append(link[:500])
        if len(links) >= limit:
            break
    return links


def iter_markdown_files() -> tuple[list[Path], list[str]]:
    missing = [str(root) for root in REQUESTED_ROOTS if not root.exists()]
    roots = [root for root in REQUESTED_ROOTS if root.exists()]
    files: list[Path] = []
    for root in roots:
        files.extend(sorted(root.rglob("*.md")))
    seen = set()
    unique = []
    for path in files:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        unique.append(path)
    return unique, missing


def build_markdown_graph() -> dict[str, Any]:
    REPORTS.mkdir(parents=True, exist_ok=True)
    LIGHTRAG.mkdir(parents=True, exist_ok=True)
    CODE_GRAPH.mkdir(parents=True, exist_ok=True)
    VAULT.mkdir(parents=True, exist_ok=True)

    files, missing_roots = iter_markdown_files()
    facts_path = LIGHTRAG / "cross_project_markdown_facts.jsonl"
    graph_path = CODE_GRAPH / "cross_project_markdown_gitnexus.json"
    db_path = LIGHTRAG / "cross_project_markdown_lightrag.db"

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    facts_written = 0
    unreadable = []
    by_project: Counter[str] = Counter()
    by_root: Counter[str] = Counter()
    vendor_count = 0
    total_bytes = 0
    heading_count = 0
    link_count = 0

    with facts_path.open("w", encoding="utf-8") as facts:
        for path in files:
            stat = path.stat()
            total_bytes += stat.st_size
            project = project_for(path)
            root = source_root_for(path)
            vendor = is_vendor(path)
            by_project[project] += 1
            by_root[root] += 1
            vendor_count += int(vendor)

            try:
                raw = path.read_bytes()[:MAX_CONTENT_BYTES]
                text = raw.decode("utf-8", errors="ignore")
            except Exception as exc:
                unreadable.append({"path": str(path), "error": str(exc)[:300]})
                continue

            rel = str(path)
            doc_id = "md:" + short_id(rel)
            headings = extract_headings(text)
            links = extract_links(text)
            heading_count += len(headings)
            link_count += len(links)
            doc_hash = sha_text(rel + "\n" + text)
            nodes.append(
                {
                    "id": doc_id,
                    "type": "markdown_file",
                    "name": path.name,
                    "path": rel,
                    "project": project,
                    "root": root,
                    "bytes": stat.st_size,
                    "mtime": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(timespec="seconds"),
                    "sha256": doc_hash,
                    "vendor_or_generated": vendor,
                    "heading_count": len(headings),
                    "link_count": len(links),
                }
            )
            facts.write(
                json.dumps(
                    {
                        "id": doc_id,
                        "kind": "markdown_document",
                        "content": text[:SNIPPET_CHARS],
                        "context": f"Markdown file {rel}; project={project}; root={root}; headings={len(headings)}; links={len(links)}",
                        "source": rel,
                        "project": project,
                        "source_root": root,
                        "created_at": utc_now(),
                        "content_sha": doc_hash,
                        "publish_allowed": False,
                        "vendor_or_generated": vendor,
                        "headings": headings,
                        "links": links,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            facts_written += 1

            project_node = "project:" + project
            if not any(n["id"] == project_node for n in nodes):
                nodes.append({"id": project_node, "type": "project", "name": project, "project": project})
            edges.append({"from": project_node, "to": doc_id, "kind": "HAS_MARKDOWN_DOC"})

            for i, heading in enumerate(headings):
                hid = f"{doc_id}:h:{i:03d}"
                nodes.append(
                    {
                        "id": hid,
                        "type": "markdown_heading",
                        "name": heading["title"],
                        "path": rel,
                        "project": project,
                        "level": heading["level"],
                        "line": heading["line"],
                    }
                )
                edges.append({"from": doc_id, "to": hid, "kind": "HAS_HEADING"})
                facts.write(
                    json.dumps(
                        {
                            "id": hid,
                            "kind": "markdown_heading",
                            "content": heading["title"],
                            "context": f"Heading level {heading['level']} in {rel} at line {heading['line']}",
                            "source": rel,
                            "project": project,
                            "created_at": utc_now(),
                            "content_sha": sha_text(hid + heading["title"]),
                            "publish_allowed": False,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                facts_written += 1

            for i, link in enumerate(links):
                lid = "link:" + short_id(rel + "\n" + link)
                nodes.append({"id": lid, "type": "markdown_link_target", "name": link, "project": project})
                edges.append({"from": doc_id, "to": lid, "kind": "LINKS_TO"})

    graph = {
        "version": 1,
        "built_at": utc_now(),
        "description": "Cross-project Markdown GitNexus-style graph for project docs and EDS Markdown.",
        "nodes": nodes,
        "edges": edges,
    }
    write_json(graph_path, graph)
    write_sqlite(db_path, facts_path)
    write_obsidian_indexes(by_project, by_root, facts_path, graph_path, db_path)

    summary = {
        "updated_at": utc_now(),
        "requested_roots": [str(r) for r in REQUESTED_ROOTS],
        "missing_roots": missing_roots,
        "markdown_files": len(files),
        "unreadable": unreadable[:50],
        "unreadable_count": len(unreadable),
        "total_bytes": total_bytes,
        "vendor_or_generated_files": vendor_count,
        "heading_facts": heading_count,
        "link_edges": link_count,
        "facts_written": facts_written,
        "graph_nodes": len(nodes),
        "graph_edges": len(edges),
        "by_project": dict(by_project.most_common()),
        "by_root": dict(by_root.most_common()),
        "outputs": {
            "lightrag_facts": str(facts_path),
            "gitnexus_graph": str(graph_path),
            "sqlite": str(db_path),
            "obsidian_index": str(VAULT / "Markdown Digest Index.md"),
        },
    }
    write_json(REPORTS / "markdown_digest_latest.json", summary)
    upsert_virtualpc_governance(summary)
    return summary


def write_sqlite(db_path: Path, facts_path: Path) -> None:
    con = sqlite3.connect(db_path)
    con.executescript(
        """
        pragma journal_mode=wal;
        create table if not exists facts (
          id text primary key,
          kind text not null,
          content text not null,
          context text,
          source text,
          project text,
          created_at text,
          content_sha text
        );
        create table if not exists entities (
          id text primary key,
          name text not null,
          kind text,
          project text,
          source text
        );
        create table if not exists relations (
          src_id text not null,
          dst_id text not null,
          kind text not null,
          evidence text,
          primary key (src_id, dst_id, kind)
        );
        delete from facts;
        delete from entities;
        delete from relations;
        """
    )
    with facts_path.open("r", encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            con.execute(
                "insert or replace into facts values (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    row.get("id"),
                    row.get("kind"),
                    row.get("content", ""),
                    row.get("context", ""),
                    row.get("source", ""),
                    row.get("project", ""),
                    row.get("created_at", ""),
                    row.get("content_sha", ""),
                ),
            )
            if row.get("kind") == "markdown_document":
                con.execute(
                    "insert or replace into entities values (?, ?, ?, ?, ?)",
                    (row.get("id"), Path(str(row.get("source"))).name, "markdown_document", row.get("project", ""), row.get("source", "")),
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


def write_obsidian_indexes(by_project: Counter[str], by_root: Counter[str], facts_path: Path, graph_path: Path, db_path: Path) -> None:
    body = [
        "This index is generated from every Markdown file found under the requested project and EDS roots.",
        "",
        "## Artifacts",
        "",
        f"- LightRAG facts: `{facts_path}`",
        f"- GitNexus-style graph: `{graph_path}`",
        f"- SQLite local LightRAG store: `{db_path}`",
        "",
        "## Roots",
        "",
    ]
    for root, count in by_root.most_common():
        body.append(f"- `{root}`: {count} Markdown files")
    body += ["", "## Projects", ""]
    for project, count in by_project.most_common():
        body.append(f"- [[Markdown Projects/{safe(project)}|{project}]]: {count}")
        write_note(
            VAULT / "Markdown Projects" / f"{safe(project)}.md",
            f"{project} Markdown Digest",
            [
                f"Project `{project}` contributed **{count}** Markdown files to the cross-project graph.",
                "",
                f"- Global index: [[Markdown Digest Index]]",
                f"- LightRAG facts: `{facts_path}`",
                f"- GitNexus graph: `{graph_path}`",
            ],
            {"tags": ["markdown-digest", project], "project": project, "publish": False, "graph_kind": "markdown_project"},
        )
    write_note(
        VAULT / "Markdown Digest Index.md",
        "Markdown Digest Index",
        body,
        {"tags": ["markdown-digest", "cross-project"], "publish": False, "graph_kind": "markdown_index", "updated": utc_now()},
    )


def upsert_virtualpc_governance(summary: dict[str, Any]) -> None:
    path = VIRTUALPC / "data" / "governance.json"
    data = load_json(path, {"entries": []})
    entries = [e for e in data.get("entries", []) if e.get("id") != "cross-project-markdown-digest"]
    entries.append(
        {
            "id": "cross-project-markdown-digest",
            "name": "Cross-project Markdown digest",
            "kind": "knowledge-graph",
            "owner": "Governor",
            "source": summary["outputs"]["lightrag_facts"],
            "lineage": (
                f"Generated from {summary['markdown_files']} Markdown files across requested project/EDS roots. "
                f"Writes LightRAG-style JSONL facts, a GitNexus-style document graph, SQLite facts, and Obsidian indexes."
            ),
            "updatedAt": summary["updated_at"],
            "license": "mixed; see source repositories",
            "tags": ["knowledge-graph", "markdown", "cross-project", "lightrag", "gitnexus"],
        }
    )
    data["entries"] = entries
    write_json(path, data)


def agent_team(agent: str) -> str:
    if agent.startswith("Hermes-"):
        return "cross"
    if agent.startswith("Tester-RB"):
        return "scrum-roblox"
    if agent.startswith("Tester-Web") or agent in {"Zip", "Mira", "Luna", "Pixel", "Atlas", "Vice"}:
        return "scrum-web"
    if agent.startswith("Tester-MK") or agent in {"MoneyGod", "Analyst", "VideoProducer", "Croesus"}:
        return "scrum-marketing"
    return "cross"


def all_agents() -> list[str]:
    data = get_json("/api/backlog/per-person")
    if isinstance(data, dict) and data:
        return sorted(data.keys())
    return [
        "Fill", "Kai", "Zip", "Mira", "Luna", "Cleopatra", "Alexander", "MoneyGod", "Analyst",
        "VideoProducer", "Vice", "Atlas", "Kimi", "Croesus", "Governor", "Pixel", "Hermes-Roblox",
        "Hermes-Web", "Hermes-Marketing", "Hermes-Cross", "Hermes-Reviewer", "Athena",
    ]


def create_review_tasks() -> dict[str, Any]:
    backlog = get_json("/api/backlog/per-person")
    agents = sorted(backlog.keys()) if backlog else all_agents()
    created = []
    existing_titles = {
        (agent, task.get("title", ""))
        for agent, details in (backlog or {}).items()
        for task in details.get("tasks", [])
    }
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for agent in agents:
        title = f"Agent code review and realization nudge - {agent} - {stamp}"
        if (agent, title) in existing_titles:
            continue
        payload = {
            "title": title,
            "description": (
                "Review the VirtualPC code/docs/data surfaces relevant to this agent's role, confirm that the "
                "new cross-project Markdown digest is retrievable through the local graph artifacts, report code "
                "or delivery blockers, and update progress. This is a VirtualPC operations review, not a MOLGANG feature task."
            ),
            "priority": "high" if agent in {"Athena", "Alexander", "Kai", "Governor", "Hermes-Reviewer"} else "medium",
            "assigned_to": agent,
            "estimated_hours": 2,
            "sprint": "all-agent-code-review-knowledge-digest-2026-06",
            "subtasks": [
                "Review current role-owned code/docs/data surfaces",
                "Check knowledge graph digest artifacts and source lineage",
                "Identify blockers or stale realization gaps",
                "Post review outcome or nudge request to the relevant scrum channel",
            ],
        }
        status, response = post_json("/api/backlog/items", payload)
        created.append({"agent": agent, "status": status, "response": response})
        if isinstance(response, dict) and response.get("success") and response.get("task", {}).get("id"):
            task_id = response["task"]["id"]
            post_json("/api/tasks/facilitate/register", {"taskId": task_id, "agent": agent, "priority": 1})
            post_json(f"/api/tasks/facilitate/{task_id}/assign", {"agent": agent})
            if agent in {"Athena", "Alexander", "Kai", "Governor", "Hermes-Reviewer"}:
                post_json(f"/api/tasks/facilitate/{task_id}/start", {})
    return {"created_count": sum(1 for row in created if isinstance(row.get("response"), dict) and row["response"].get("success")), "created": created}


def nudge_lagging_agents() -> dict[str, Any]:
    backlog = get_json("/api/backlog/per-person")
    nudges = []
    if not backlog:
        return {"nudges": nudges, "note": "backlog API unavailable"}
    for agent, details in backlog.items():
        tasks = details.get("tasks", [])
        active = [t for t in tasks if t.get("status") in {"in_progress", "in-progress"}]
        pending = [t for t in tasks if t.get("status") == "pending"]
        lagging = [
            t for t in active
            if (t.get("priority") in {"critical", "high"} and int(t.get("progress") or 0) < 75)
        ]
        if len(pending) > 5:
            lagging.extend(pending[:2])
        if not lagging:
            continue
        team = agent_team(agent)
        body = (
            f"NUDGE for {agent}: {len(lagging)} review/delivery item(s) need realization. "
            "Use the new Markdown digest artifacts before acting; report blockers and request facilitation instead of leaving work stale. "
            + "; ".join(f"{t.get('id')} {t.get('title')} progress={t.get('progress', 0)}" for t in lagging[:4])
        )
        status, response = post_json(f"/api/scrums/{team}/standup", {"agent": "Codex-Facilitator", "body": body})
        nudges.append({"agent": agent, "team": team, "items": len(lagging), "status": status, "response": response})
        for task in lagging[:4]:
            task_id = task.get("id")
            if task_id:
                post_json("/api/tasks/facilitate/register", {"taskId": task_id, "agent": agent, "priority": 2})
                post_json(f"/api/tasks/facilitate/{task_id}/activity", {})
    return {"nudges": nudges}


def write_review_report(review: dict[str, Any], nudges: dict[str, Any], digest: dict[str, Any]) -> dict[str, Any]:
    out_dir = VIRTUALPC / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    backlog = get_json("/api/backlog/per-person")
    agent_rows = []
    for agent, details in (backlog or {}).items():
        visible = details.get("tasks", [])
        agent_rows.append(
            {
                "agent": agent,
                "role": details.get("role"),
                "active": details.get("active"),
                "completed": details.get("completed"),
                "progress": details.get("progress"),
                "visible_tasks": len(visible),
                "low_progress_active": [
                    {
                        "id": t.get("id"),
                        "title": t.get("title"),
                        "priority": t.get("priority"),
                        "progress": t.get("progress"),
                    }
                    for t in visible
                    if t.get("status") in {"in_progress", "in-progress"} and int(t.get("progress") or 0) < 75
                ],
            }
        )
    payload = {
        "updated_at": utc_now(),
        "digest": digest,
        "review_task_creation": review,
        "nudges": nudges,
        "agents": agent_rows,
    }
    write_json(out_dir / "agent_code_review_nudges_latest.json", payload)

    lines = [
        "# Agent Code Review And Realization Nudges",
        "",
        f"Updated: {payload['updated_at']}",
        "",
        "## Markdown Knowledge Digest",
        "",
        f"- Markdown files: {digest['markdown_files']}",
        f"- LightRAG facts written: {digest['facts_written']}",
        f"- GitNexus graph nodes/edges: {digest['graph_nodes']} / {digest['graph_edges']}",
        f"- Facts: `{digest['outputs']['lightrag_facts']}`",
        f"- Graph: `{digest['outputs']['gitnexus_graph']}`",
        f"- SQLite: `{digest['outputs']['sqlite']}`",
        "",
        "## Review Task Creation",
        "",
        f"- Created tasks: {review['created_count']}",
        "",
        "## Nudges",
        "",
    ]
    if nudges.get("nudges"):
        for nudge in nudges["nudges"]:
            lines.append(f"- {nudge['agent']} -> {nudge['team']}: {nudge['items']} item(s), status={nudge['status']}")
    else:
        lines.append("- No lagging agents met the nudge threshold after facilitation registration.")
    lines += ["", "## Agent Snapshot", ""]
    for row in agent_rows:
        lag = len(row["low_progress_active"])
        lines.append(f"- {row['agent']}: active={row['active']} completed={row['completed']} progress={row['progress']} low_progress_active={lag}")
    (out_dir / "AGENT_CODE_REVIEW_NUDGES.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return payload


def attempt_live_corpus_ingest(digest: dict[str, Any], max_chunks: int) -> dict[str, Any]:
    facts_path = Path(digest["outputs"]["lightrag_facts"])
    chunks = []
    with facts_path.open("r", encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            if row.get("kind") != "markdown_document":
                continue
            chunks.append(
                {
                    "id": row["id"],
                    "source": row["source"],
                    "source_kind": "doc",
                    "title": Path(row["source"]).name,
                    "content": row["content"],
                    "meta": {
                        "project": row.get("project"),
                        "source_root": row.get("source_root"),
                        "content_sha": row.get("content_sha"),
                    },
                }
            )
            if len(chunks) >= max_chunks:
                break
    if not chunks:
        return {"attempted": False, "reason": "no chunks"}
    status, response = post_json("/api/corpus/ingest", {"chunks": chunks}, timeout=120)
    return {"attempted": True, "chunks": len(chunks), "status": status, "response": response}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-agent-tasks", action="store_true")
    parser.add_argument("--attempt-api-ingest", action="store_true")
    parser.add_argument("--api-ingest-max-chunks", type=int, default=500)
    parser.add_argument("--reuse-digest", action="store_true", help="Use markdown_digest_latest.json instead of rescanning files")
    args = parser.parse_args()

    digest_report_path = REPORTS / "markdown_digest_latest.json"
    if args.reuse_digest and digest_report_path.exists():
        digest = load_json(digest_report_path, {})
    else:
        digest = build_markdown_graph()
    api_ingest = attempt_live_corpus_ingest(digest, args.api_ingest_max_chunks) if args.attempt_api_ingest else {
        "attempted": False,
        "reason": "not requested",
    }
    if args.no_agent_tasks:
        review = {"created_count": 0, "created": [], "skipped": "no_agent_tasks"}
        nudges = {"nudges": [], "skipped": "no_agent_tasks"}
    else:
        review = create_review_tasks()
        nudges = nudge_lagging_agents()
    report = write_review_report(review, nudges, {**digest, "api_ingest": api_ingest})
    print(
        json.dumps(
            {
                "digest": {
                    "markdown_files": digest["markdown_files"],
                    "facts_written": digest["facts_written"],
                    "graph_nodes": digest["graph_nodes"],
                    "graph_edges": digest["graph_edges"],
                    "outputs": digest["outputs"],
                    "missing_roots": digest["missing_roots"],
                },
                "api_ingest": api_ingest,
                "review_tasks_created": review["created_count"],
                "nudges": len(nudges.get("nudges", [])),
                "report": str(VIRTUALPC / "reports" / "AGENT_CODE_REVIEW_NUDGES.md"),
            },
            indent=2,
            default=str,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
