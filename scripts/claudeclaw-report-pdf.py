#!/usr/bin/env python3
"""Build the final ClaudeClaw integration PDF report.

Reads docs/CLAUDECLAW_INTEGRATION.md, injects the latest benchmark summary
at the <!-- BENCHMARK_RESULTS --> marker, appends appendices (full benchmark
outputs + audit-trail sample), renders to PDF via weasyprint.

Output: /media/knight2/EDS2/software/virtualpc_fill/CLAUDECLAW_INTEGRATION_REPORT.pdf
"""

import glob
import json
import os
import sys
from datetime import date

import markdown  # type: ignore
from weasyprint import HTML  # type: ignore

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = "/media/knight2/EDS2/software/virtualpc_fill"
OUT_PDF = os.path.join(OUT_DIR, "CLAUDECLAW_INTEGRATION_REPORT.pdf")

CSS = """
@page { size: A4; margin: 2cm; @bottom-right { content: counter(page); } }
body { font-family: 'DejaVu Sans', sans-serif; font-size: 10pt; color: #1a1a2e; }
h1 { color: #16213e; border-bottom: 3px solid #0f3460; padding-bottom: 6px; }
h2 { color: #0f3460; margin-top: 22px; }
h3 { color: #16213e; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 9pt; }
th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; vertical-align: top; }
th { background: #0f3460; color: white; }
tr:nth-child(even) { background: #f4f6fa; }
code, pre { font-family: 'DejaVu Sans Mono', monospace; font-size: 8.5pt;
  background: #f0f0f5; border-radius: 3px; }
pre { padding: 8px; white-space: pre-wrap; word-wrap: break-word; }
code { padding: 1px 3px; }
blockquote { border-left: 3px solid #0f3460; margin-left: 0; padding-left: 12px; color: #444; }
.appendix { page-break-before: always; }
"""


def latest_benchmark() -> dict | None:
    files = sorted(glob.glob(os.path.join(ROOT, "reports", "claudeclaw-benchmark-*.json")))
    if not files:
        return None
    with open(files[-1]) as f:
        return json.load(f)


def summary_table(bench: dict) -> str:
    rows = [
        "| Case | Local model | Local score | Local ms | Haiku score | Haiku ms |",
        "|---|---|---|---|---|---|",
    ]
    for c in bench["cases"]:
        l, h = c["local"], c["haiku"]
        hs = "ERR" if "error" in h else f"{h['score']:.2f}"
        hm = "—" if "error" in h else h["latencyMs"]
        flags = ", ".join(l.get("hallucinationFlags") or []) or ""
        rows.append(
            f"| {c['case']}{' ⚑' if flags else ''} | {l['model']} | {l['score']:.2f}"
            f"{' (esc ' + str(l['escalations']) + ')' if l['escalations'] else ''} "
            f"| {l['latencyMs']} | {hs} | {hm} |"
        )
    return "\n".join(rows)


def appendix_outputs(bench: dict) -> str:
    parts = ["\n\n## Appendix A — Full benchmark outputs {.appendix}\n"]
    parts.append(f"Judge: `{bench['judge']}` · Generated: {bench['generatedAt']}\n")
    for c in bench["cases"]:
        parts.append(f"\n### {c['case']} ({c['tier']})\n")
        parts.append(f"**Prompt:**\n\n> {c['prompt']}\n")
        l = c["local"]
        parts.append(
            f"\n**Local ({l['model']}, score {l['score']:.2f}, "
            f"accepted={l['accepted']}, flags={l.get('hallucinationFlags') or []}):**\n"
        )
        parts.append(f"\n```\n{l['output'][:2000]}\n```\n")
        h = c["haiku"]
        if "error" in h:
            parts.append(f"\n**Haiku:** ERROR — `{h['error'][:300]}`\n")
        else:
            parts.append(
                f"\n**claude-haiku-4-5 (score {h['score']:.2f}, "
                f"accepted={h['accepted']}, flags={h.get('hallucinationFlags') or []}):**\n"
            )
            parts.append(f"\n```\n{h['output'][:2000]}\n```\n")
    return "\n".join(parts)


def latest_judge_test() -> dict | None:
    files = sorted(glob.glob(os.path.join(ROOT, "reports", "claudeclaw-judge-test-*.json")))
    if not files:
        return None
    with open(files[-1]) as f:
        return json.load(f)


def appendix_judge(jt: dict) -> str:
    parts = ["\n\n## Appendix C — Judge-ensemble calibration test {.appendix}\n"]
    parts.append(
        f"Generated: {jt['generatedAt']} · accept threshold: {jt['acceptThreshold']}.\n"
        "Each judge received fixed prompt/output pairs with a **known** expected "
        "verdict; accuracy = agreement with that expectation. The ensemble row is "
        "a 2-of-3 majority vote over the local judges.\n"
    )
    parts.append("\n### Accuracy\n")
    parts.append("| Judge | Accuracy |")
    parts.append("|---|---|")
    for j, a in jt["accuracy"].items():
        parts.append(f"| {j} | {a * 100:.0f}% |")
    parts.append("\n### Per-case verdicts\n")
    parts.append("| Case | Expected | " + " | ".join(jt["cases"][0]["verdicts"].keys()) + " | ensemble |")
    parts.append("|---|---|" + "---|" * (len(jt["cases"][0]["verdicts"]) + 1))
    for c in jt["cases"]:
        cells = []
        for j, v in c["verdicts"].items():
            if "error" in v:
                cells.append("ERR")
            else:
                mark = "✓" if v["agreesWithExpected"] else "✗"
                cells.append(f"{'accept' if v['accepted'] else 'reject'} ({v['score']:.2f}) {mark}")
        ens = c["ensemble"]
        cells.append(f"{ens['verdict']} {'✓' if ens['agreesWithExpected'] else '✗'}")
        parts.append(f"| {c['case']} | {c['expect']} | " + " | ".join(cells) + " |")
    parts.append("\n### Case definitions\n")
    for c in jt["cases"]:
        parts.append(f"- **{c['case']}** (expect *{c['expect']}*): {c['why']}")
    return "\n".join(parts)


def appendix_audit() -> str:
    day = date.today().isoformat()
    audit_file = os.path.join(ROOT, "data", "claudeclaw", f"audit-{day}.jsonl")
    parts = ["\n\n## Appendix B — Audit-trail sample {.appendix}\n"]
    parts.append(f"Source: `data/claudeclaw/audit-{day}.jsonl` (append-only JSONL)\n")
    if not os.path.exists(audit_file):
        parts.append("\n_No audit records for today._\n")
        return "\n".join(parts)
    with open(audit_file) as f:
        lines = f.read().strip().split("\n")
    parts.append(f"\nTotal records today: **{len(lines)}**. Last 3 (prompts/outputs truncated):\n")
    for line in lines[-3:]:
        try:
            r = json.loads(line)
            for k in ("prompt", "output", "system"):
                if isinstance(r.get(k), str) and len(r[k]) > 300:
                    r[k] = r[k][:300] + " …[truncated]"
            parts.append(f"\n```json\n{json.dumps(r, indent=2)}\n```\n")
        except json.JSONDecodeError:
            parts.append(f"\n```\n{line[:400]}\n```\n")
    return "\n".join(parts)


def main() -> None:
    md_path = os.path.join(ROOT, "docs", "CLAUDECLAW_INTEGRATION.md")
    with open(md_path) as f:
        md = f.read()

    bench = latest_benchmark()
    if bench:
        md = md.replace("<!-- BENCHMARK_RESULTS -->", summary_table(bench))
        md += appendix_outputs(bench)
    else:
        md = md.replace("<!-- BENCHMARK_RESULTS -->", "_Benchmark pending._")
        print("WARN: no benchmark JSON found", file=sys.stderr)
    jt = latest_judge_test()
    if jt:
        md += appendix_judge(jt)
    md += appendix_audit()

    html_body = markdown.markdown(
        md, extensions=["tables", "fenced_code", "attr_list"]
    )
    html = f"<html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{html_body}</body></html>"

    os.makedirs(OUT_DIR, exist_ok=True)
    HTML(string=html).write_pdf(OUT_PDF)
    print(f"PDF written: {OUT_PDF}")


if __name__ == "__main__":
    main()
