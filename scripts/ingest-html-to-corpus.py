#!/usr/bin/env python3
"""
Ingest an external HTML or text file into the VirtualPC corpus.

The script strips HTML tags, chunks the text, and either:
  a) writes a JSON payload to stdout or a file, or
  b) POSTs it directly to a running VirtualPC API.

Usage:
  python3 scripts/ingest-html-to-corpus.py \
      --file /Users/develuse/Documents/loom_landing.html \
      --title "Loom landing page" \
      --kind doc \
      --out data/external/loom-landing-corpus.json

Then POST the output to the running VirtualPC instance:
  curl -X POST http://localhost:3100/api/corpus/ingest \
       -H "Content-Type: application/json" \
       -d @data/external/loom-landing-corpus.json
"""

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from typing import List


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: List[str] = []
        self.skip_tags = {"script", "style", "svg", "nav"}
        self.block_tags = {"p", "div", "section", "h1", "h2", "h3", "h4", "li", "tr", "br"}
        self._skip = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag.lower() in self.skip_tags:
            self._skip += 1
        if self._skip == 0 and tag.lower() in self.block_tags:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in self.skip_tags and self._skip > 0:
            self._skip -= 1
        if self._skip == 0 and tag.lower() in self.block_tags:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip == 0:
            self.parts.append(data)

    def get_text(self) -> str:
        text = "".join(self.parts)
        text = re.sub(r"\n\s*\n", "\n\n", text)
        text = re.sub(r"[ \t]+", " ", text)
        return text.strip()


def strip_html(html: str) -> str:
    extractor = TextExtractor()
    try:
        extractor.feed(html)
        return extractor.get_text()
    except Exception:
        # Fallback to regex if parser fails
        text = re.sub(r"<script[^>]*>[\s\S]*?</script>", " ", html, flags=re.I)
        text = re.sub(r"<style[^>]*>[\s\S]*?</style>", " ", text, flags=re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        return re.sub(r"\s+", " ", text).strip()


def chunk_text(
    text: str,
    source: str,
    target_chars: int = 1200,
    overlap_chars: int = 150,
) -> List[dict]:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: List[dict] = []
    buffer = ""
    chunk_idx = 0

    for p in paragraphs:
        if (
            len(buffer) + len(p) > target_chars
            and len(buffer) > target_chars - overlap_chars
        ):
            chunks.append(
                {
                    "id": f"{source}#{chunk_idx}",
                    "source": source,
                    "source_kind": "doc",
                    "content": buffer.strip(),
                }
            )
            chunk_idx += 1
            tail = buffer[-overlap_chars:]
            last_boundary = max(tail.rfind(". "), tail.rfind("\n"), 0)
            buffer = tail[last_boundary:].strip() + "\n\n" + p
        else:
            buffer += ("\n\n" if buffer else "") + p

    if buffer.strip():
        chunks.append(
            {
                "id": f"{source}#{chunk_idx}",
                "source": source,
                "source_kind": "doc",
                "content": buffer.strip(),
            }
        )
    return chunks


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest HTML/text into VirtualPC corpus")
    parser.add_argument("--file", required=True, help="Path to HTML or text file")
    parser.add_argument("--title", default=None, help="Optional title for chunks")
    parser.add_argument("--kind", default="doc", help="Corpus source kind")
    parser.add_argument("--out", default=None, help="Output JSON file (optional)")
    parser.add_argument("--api", default=None, help="POST directly to API URL, e.g. http://localhost:3100/api/corpus/ingest")
    args = parser.parse_args()

    file_path = Path(args.file).resolve()
    if not file_path.exists():
        print(f"File not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    raw = file_path.read_text(encoding="utf-8", errors="ignore")
    text = strip_html(raw) if file_path.suffix.lower() in {".html", ".htm"} else raw

    if len(text) < 50:
        print("Extracted text too short; nothing to ingest.", file=sys.stderr)
        sys.exit(1)

    chunks = chunk_text(text, str(file_path))
    for c in chunks:
        c["source_kind"] = args.kind
        c["title"] = args.title or file_path.name

    payload = {"chunks": chunks}

    if args.api:
        import urllib.request
        req = urllib.request.Request(
            args.api,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req) as resp:
                print(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"POST failed: {e}", file=sys.stderr)
            sys.exit(1)
    elif args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"Wrote {len(chunks)} chunks to {out_path}")
    else:
        print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
