"""Generate a 2-page PDF audit of VirtuAnalytica occurrences in the virtualpc repo."""

from __future__ import annotations

from fpdf import FPDF
from pathlib import Path


_FONT_DIR = Path("/System/Library/Fonts/Supplemental")


class AuditPDF(FPDF):
    def __init__(self) -> None:
        super().__init__(format="A4")
        self.set_auto_page_break(auto=True, margin=20)
        self.set_margins(20, 20, 20)
        self.add_font("Arial", "", str(_FONT_DIR / "Arial.ttf"), uni=True)
        self.add_font("Arial", "B", str(_FONT_DIR / "Arial Bold.ttf"), uni=True)
        self.add_font("Arial", "I", str(_FONT_DIR / "Arial Italic.ttf"), uni=True)
        self.add_font("Code", "", str(_FONT_DIR / "Courier New.ttf"), uni=True)

    def header(self) -> None:
        self.set_font("Arial", "I", 9)
        self.set_text_color(100, 100, 100)
        self.cell(0, 10, "VirtuAnalytica Name Audit - knitweb/virtualpc", align="L", new_x="LMARGIN", new_y="NEXT")
        self.set_xy(self.w - self.r_margin - 40, self.t_margin - 10)
        self.cell(40, 10, f"Page {self.page_no()}", align="R", new_x="LMARGIN", new_y="NEXT")

    def section_title(self, title: str) -> None:
        self.set_font("Arial", "B", 14)
        self.set_text_color(30, 58, 138)
        self.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def body_text(self, text: str) -> None:
        self.set_font("Arial", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 6, text)
        self.ln(3)

    def code_block(self, text: str) -> None:
        self.set_fill_color(245, 245, 245)
        self.set_font("Code", "", 8)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5, text, fill=True)
        self.ln(3)

    def occurrence(self, path: str, line: int, text: str) -> None:
        self.set_font("Arial", "B", 10)
        self.set_text_color(30, 30, 30)
        self.cell(0, 6, f"{path}:{line}", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Arial", "", 10)
        self.set_text_color(80, 80, 80)
        self.multi_cell(0, 5, f"  {text}")
        self.ln(2)


def main() -> None:
    pdf = AuditPDF()
    pdf.add_page()
    pdf.section_title("VirtuAnalytica Name Audit")
    pdf.body_text(
        "This document records every occurrence of the private company name "
        "'VirtuAnalytica' found in the knitweb/virtualpc repository before cleanup. "
        "The name has been removed from code, documentation, filenames, and generated "
        "artifacts and replaced with neutral VirtualPC Demo branding."
    )

    pdf.section_title("Tracked files with occurrences")
    pdf.occurrence(
        "public/virtuanalytica.html",
        7,
        '<title>VirtuAnalytica - VirtualPC Demo</title>',
    )
    pdf.occurrence(
        "public/virtuanalytica.html",
        103,
        '<div class="sidebar-title">VirtuAnalytica</div>',
    )
    pdf.occurrence(
        "public/virtuanalytica.html",
        141,
        '<h1>🧠 VirtuAnalytica</h1>',
    )
    pdf.occurrence(
        "scripts/verify-virtuanalytica.ts",
        3,
        "const DEMO_URL = process.env.DEMO_URL || 'http://localhost:3100/virtuanalytica.html';",
    )
    pdf.occurrence(
        "scripts/verify-virtuanalytica.ts",
        13,
        "await page.screenshot({ path: 'data/verify-virtuanalytica.png', fullPage: true });",
    )

    pdf.add_page()
    pdf.section_title("Untracked / generated files with occurrences")
    pdf.occurrence(
        "data-agents-sidecar/dashboard/create_demo_video.py",
        19,
        '(OUT / "virtuanalytica.png", 6, "VirtuAnalytica - samenwerking data & kwaliteit")',
    )
    pdf.occurrence(
        "data-agents-sidecar/dashboard/__pycache__/create_demo_video.cpython-312.pyc",
        0,
        "Compiled Python bytecode containing the VirtuAnalytica string literal.",
    )
    pdf.occurrence(
        "data-agents-sidecar/data/outputs/report/virtuanalytica.png",
        0,
        "Generated screenshot artifact named after the old dashboard.",
    )
    pdf.occurrence(
        "dist/integrations/lightrag/family-graph.js",
        155,
        "{ name: 'VirtuAnalytica VOF', cat: 'bedrijf', note: 'VOF' }",
    )

    pdf.section_title("Cleanup actions taken")
    pdf.body_text(
        "- Deleted tracked legacy file public/virtuanalytica.html (superseded by public/demo-dashboard.html).\n"
        "- Deleted tracked legacy script scripts/verify-virtuanalytica.ts (superseded by scripts/verify-demo-dashboard.ts).\n"
        "- Updated data-agents-sidecar/dashboard/create_demo_video.py to reference demo_dashboard.png and VirtualPC Demo.\n"
        "- Removed generated artifacts: __pycache__ file and virtuanalytica.png.\n"
        "- Left dist/ untouched because it is a gitignored build output; it rebuilds from clean sources."
    )

    out_path = Path(__file__).parent.parent / "docs" / "VIRTUANALYTICA_AUDIT.pdf"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(out_path))
    print(f"Wrote audit PDF to {out_path}")


if __name__ == "__main__":
    main()
