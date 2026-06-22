#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate VirtualPC overview videos with multilingual voice-overs.

Outputs (one video per language):
  docs/videos/install-<lang>.mp4
  docs/videos/demo-<lang>.mp4
  docs/videos/gui-<lang>.mp4

Languages:
  nl  - Dutch
  en  - English
  yue - Cantonese (Traditional Chinese / Hong Kong)
  ru  - Russian

Because Docker and the full stack are not available on this machine, the videos
are synthetic terminal/browser mockups based on the real repository and
documentation. Voice-overs are generated with macOS `say`.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Callable, Iterable, List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1280, 720
FPS = 30

PALETTE = {
    "bg": "#0d1117",
    "panel": "#161b22",
    "panel2": "#21262d",
    "border": "#30363d",
    "text": "#c9d1d9",
    "muted": "#8b949e",
    "accent": "#58a6ff",
    "green": "#3fb950",
    "yellow": "#d29922",
    "red": "#f85149",
    "purple": "#a371f7",
}

# ---------------------------------------------------------------------------
# Voices (macOS say)
# ---------------------------------------------------------------------------

VOICES = {
    "nl": ("Xander", 170),
    "en": ("Daniel", 170),
    "yue": ("Sinji", 170),
    "ru": ("Milena", 170),
}

# ---------------------------------------------------------------------------
# Fonts
# ---------------------------------------------------------------------------

def load_font(path: str, size: int) -> ImageFont.ImageFont:
    return ImageFont.truetype(path, size)


def get_fonts(lang: str) -> dict[str, ImageFont.ImageFont]:
    if lang == "yue":
        candidates = [
            "/System/Library/Fonts/STHeiti Light.ttc",
            "/System/Library/Fonts/Hiragino Sans GB.ttc",
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        ]
        sizes = {"title": 44, "large": 30, "med": 24, "normal": 20, "small": 14}
    else:
        candidates = [
            "/System/Library/Fonts/Menlo.ttc",
            "/System/Library/Fonts/Monaco.dfont",
            "/Library/Fonts/Andale Mono.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        ]
        sizes = {"title": 42, "large": 28, "med": 22, "normal": 18, "small": 13}

    chosen = next((c for c in candidates if os.path.exists(c)), None)
    if chosen is None:
        default = ImageFont.load_default()
        return {k: default for k in sizes}

    return {k: load_font(chosen, v) for k, v in sizes.items()}


FONT: ImageFont.ImageFont
FONT_SMALL: ImageFont.ImageFont
FONT_MED: ImageFont.ImageFont
FONT_LARGE: ImageFont.ImageFont
FONT_TITLE: ImageFont.ImageFont


def set_fonts(lang: str) -> None:
    global FONT, FONT_SMALL, FONT_MED, FONT_LARGE, FONT_TITLE
    fonts = get_fonts(lang)
    FONT = fonts["normal"]
    FONT_SMALL = fonts["small"]
    FONT_MED = fonts["med"]
    FONT_LARGE = fonts["large"]
    FONT_TITLE = fonts["title"]


set_fonts("nl")


def text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> Tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def line_height(font: ImageFont.ImageFont) -> int:
    return text_size(ImageDraw.Draw(Image.new("RGB", (1, 1))), "Mj", font)[1] + 4


def draw_rounded_rect(
    draw: ImageDraw.ImageDraw,
    xy: Tuple[int, int, int, int],
    radius: int,
    fill: str | None = None,
    outline: str | None = None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


# ---------------------------------------------------------------------------
# Scene helpers
# ---------------------------------------------------------------------------

class Scene:
    def __init__(self, title: str, duration: float):
        self.title = title
        self.duration = duration
        self.image: Image.Image | None = None
        self.audio_path: Optional[Path] = None


def base_frame(title: str = "", progress: float = 0.0) -> Tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (WIDTH, HEIGHT), PALETTE["bg"])
    draw = ImageDraw.Draw(img)

    draw_rounded_rect(draw, (0, 0, WIDTH, 54), radius=0, fill=PALETTE["panel"])
    draw.text((24, 12), "VirtualPC", font=FONT_LARGE, fill=PALETTE["accent"])

    if title:
        tw, _ = text_size(draw, title, FONT_MED)
        draw.text((WIDTH - tw - 24, 15), title, font=FONT_MED, fill=PALETTE["text"])

    bar_y = HEIGHT - 8
    draw.rectangle((0, bar_y, WIDTH, HEIGHT), fill=PALETTE["panel2"])
    draw.rectangle((0, bar_y, int(WIDTH * progress), HEIGHT), fill=PALETTE["accent"])

    return img, draw


def draw_terminal(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    lines: Iterable[Tuple[str, str]],
    title: str = "terminal",
) -> None:
    lh = line_height(FONT)
    draw_rounded_rect(draw, (x, y, x + w, y + h), radius=10, fill=PALETTE["panel"], outline=PALETTE["border"], width=2)

    draw.rectangle((x + 2, y + 2, x + w - 2, y + 34), fill=PALETTE["panel2"])
    for i, col in enumerate([PALETTE["red"], PALETTE["yellow"], PALETTE["green"]]):
        draw.ellipse((x + 14 + i * 18, y + 11, x + 28 + i * 18, y + 25), fill=col)
    tw, _ = text_size(draw, title, FONT_SMALL)
    draw.text((x + (w - tw) // 2, y + 8), title, font=FONT_SMALL, fill=PALETTE["muted"])

    cx, cy = x + 14, y + 44
    max_lines = (h - 60) // lh
    for i, (color, line) in enumerate(lines):
        if i >= max_lines:
            break
        fill = PALETTE.get(color, color)
        draw.text((cx, cy), line, font=FONT, fill=fill)
        cy += lh


def draw_browser(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    url: str,
    content_lines: Iterable[Tuple[str, str]],
) -> None:
    lh = line_height(FONT)
    draw_rounded_rect(draw, (x, y, x + w, y + h), radius=12, fill=PALETTE["panel"], outline=PALETTE["border"], width=2)

    draw.rectangle((x + 2, y + 2, x + w - 2, y + 48), fill=PALETTE["panel2"])
    for i, col in enumerate([PALETTE["red"], PALETTE["yellow"], PALETTE["green"]]):
        draw.ellipse((x + 14 + i * 18, y + 15, x + 28 + i * 18, y + 29), fill=col)
    url_w = w - 120
    draw_rounded_rect(draw, (x + 80, y + 10, x + 80 + url_w, y + 38), radius=8, fill=PALETTE["bg"])
    draw.text((x + 92, y + 13), url, font=FONT_SMALL, fill=PALETTE["muted"])

    cx, cy = x + 24, y + 64
    for color, line in content_lines:
        fill = PALETTE.get(color, color)
        draw.text((cx, cy), line, font=FONT, fill=fill)
        cy += lh


def draw_card(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    title: str,
    bullets: List[str],
    accent: str = PALETTE["accent"],
) -> None:
    lh = line_height(FONT)
    draw_rounded_rect(draw, (x, y, x + w, y + h), radius=8, fill=PALETTE["panel2"], outline=PALETTE["border"])
    draw.rectangle((x, y, x + 6, y + h), fill=accent)
    draw.text((x + 16, y + 12), title, font=FONT_MED, fill=PALETTE["text"])
    cy = y + 46
    for b in bullets:
        draw.text((x + 16, cy), "• " + b, font=FONT, fill=PALETTE["muted"])
        cy += lh


def draw_dashboard_layout(draw: ImageDraw.ImageDraw, labels: List[str]) -> None:
    """Draw a stylised dashboard wireframe with labelled regions."""
    # Sidebar
    draw_rounded_rect(draw, (60, 80, 220, HEIGHT - 80), radius=8, fill=PALETTE["panel"], outline=PALETTE["border"])
    draw.text((80, 100), labels[0], font=FONT, fill=PALETTE["accent"])
    for i, item in enumerate(["Agents", "Tasks", "Vitals", "Newsgroup", "Settings"]):
        draw.text((80, 140 + i * 30), "• " + item, font=FONT_SMALL, fill=PALETTE["muted"])

    # Top bar
    draw_rounded_rect(draw, (240, 80, WIDTH - 60, 130), radius=8, fill=PALETTE["panel"], outline=PALETTE["border"])
    draw.text((260, 100), labels[2], font=FONT, fill=PALETTE["accent"])
    draw.text((260, 125), "LLM: LiteLLM (13 models)", font=FONT_SMALL, fill=PALETTE["muted"])
    draw.text((WIDTH - 240, 125), "API: OK", font=FONT_SMALL, fill=PALETTE["green"])

    # Center agent/task panel
    draw_rounded_rect(draw, (240, 150, WIDTH - 340, HEIGHT - 110), radius=8, fill=PALETTE["panel"], outline=PALETTE["border"])
    draw.text((260, 170), labels[1], font=FONT, fill=PALETTE["accent"])
    statuses = ["idle", "busy", "busy", "idle", "error", "busy"]
    colors = [PALETTE["green"], PALETTE["yellow"], PALETTE["yellow"], PALETTE["green"], PALETTE["red"], PALETTE["yellow"]]
    for i, agent in enumerate(["CEO Fill", "CTO Kai", "Dev Alice", "Dev Bob", "Art Mira", "Research Kim"]):
        draw.text((260, 210 + i * 32), f"● {agent}", font=FONT, fill=colors[i])
        draw.text((460, 210 + i * 32), f"T-{100+i}  {statuses[i]}", font=FONT_SMALL, fill=PALETTE["muted"])

    # Right vitals panel
    draw_rounded_rect(draw, (WIDTH - 320, 150, WIDTH - 60, HEIGHT - 110), radius=8, fill=PALETTE["panel"], outline=PALETTE["border"])
    draw.text((WIDTH - 300, 170), labels[3], font=FONT, fill=PALETTE["accent"])
    right_lines = [
        ("text", "CPU: 12%"),
        ("text", "GPU: 8%"),
        ("text", "Memory: 4.2 GB"),
        ("green", "● Kafka OK"),
        ("green", "● Neo4j OK"),
        ("text", "Auto-update: on"),
    ]
    for i, (color, line) in enumerate(right_lines):
        fill = PALETTE.get(color, color)
        draw.text((WIDTH - 300, 210 + i * 30), line, font=FONT_SMALL, fill=fill)


# ---------------------------------------------------------------------------
# Render / encode helpers
# ---------------------------------------------------------------------------

def save_scenes(out_dir: Path, scenes: List[Scene]) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    concat = out_dir / "concat.txt"
    with concat.open("w") as f:
        for i, scene in enumerate(scenes):
            png = out_dir / f"frame_{i:03d}.png"
            scene.image.save(png, "PNG")
            f.write(f"file '{png.resolve()}'\nduration {scene.duration}\n")
        f.write(f"file '{(out_dir / f'frame_{len(scenes)-1:03d}.png').resolve()}'\n")
    return concat


def encode_video(concat: Path, out_video: Path) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", str(concat),
        "-c:v", "libx264",
        "-r", str(FPS),
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(out_video),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ---------------------------------------------------------------------------
# Audio helpers
# ---------------------------------------------------------------------------

def probe_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True
    )
    return float(out.stdout.strip())


def synthesize(text: str, out_wav: Path, voice: str, rate: int) -> float:
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    aiff = out_wav.with_suffix(".aiff")
    subprocess.run(
        ["say", "-v", voice, "-r", str(rate), "-o", str(aiff), text],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(aiff), "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", str(out_wav)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    aiff.unlink(missing_ok=True)
    return probe_duration(out_wav)


def generate_audio_files(narrations: List[str], audio_dir: Path, voice: str, rate: int) -> List[Tuple[Path, float]]:
    audio_dir.mkdir(parents=True, exist_ok=True)
    info: List[Tuple[Path, float]] = []
    for i, text in enumerate(narrations):
        wav = audio_dir / f"narration_{i:03d}.wav"
        dur = synthesize(text, wav, voice, rate)
        info.append((wav, dur))
    return info


def silence_wav(duration: float, out_path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", str(duration),
         "-c:a", "pcm_s16le", str(out_path)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )


def pad_audio(in_wav: Path, out_wav: Path, target_duration: float) -> None:
    pad = max(0.0, target_duration - probe_duration(in_wav))
    if pad <= 0.0:
        subprocess.run(["cp", str(in_wav), str(out_wav)], check=True)
        return
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(in_wav), "-af", f"apad=pad_dur={pad}",
         "-c:a", "pcm_s16le", str(out_wav)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )


def combine_audio(scenes: List[Scene], audio_info: List[Tuple[Path, float]], audio_dir: Path) -> Path:
    audio_dir.mkdir(parents=True, exist_ok=True)
    concat = audio_dir / "concat.txt"
    padded_paths: List[Path] = []
    with concat.open("w") as f:
        for i, scene in enumerate(scenes):
            if i < len(audio_info):
                src, _ = audio_info[i]
                padded = audio_dir / f"padded_{i:03d}.wav"
                pad_audio(src, padded, scene.duration)
            else:
                padded = audio_dir / f"padded_{i:03d}.wav"
                silence_wav(scene.duration, padded)
            padded_paths.append(padded)
            f.write(f"file '{padded.resolve()}'\nduration {scene.duration}\n")
        if padded_paths:
            f.write(f"file '{padded_paths[-1].resolve()}'\n")

    combined = audio_dir / "combined.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
         "-c:a", "pcm_s16le", str(combined)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    return combined


# ---------------------------------------------------------------------------
# Global build context
# ---------------------------------------------------------------------------

CURRENT_AUDIO: List[Tuple[Path, float]] = []
CURRENT_SCENE_IDX = 0


def add_scene(
    scenes: List[Scene],
    title: str,
    duration: float,
    total: int,
    builder: Callable[[Image.Image, ImageDraw.ImageDraw], None],
) -> None:
    global CURRENT_SCENE_IDX
    idx = CURRENT_SCENE_IDX
    CURRENT_SCENE_IDX += 1

    if idx < len(CURRENT_AUDIO):
        audio_dur = CURRENT_AUDIO[idx][1]
        duration = max(duration, audio_dur + 0.5)

    img, draw = base_frame(title=title, progress=(len(scenes) + 1) / total)
    builder(img, draw)
    scenes.append(Scene(title, duration))
    scenes[-1].image = img
    if idx < len(CURRENT_AUDIO):
        scenes[-1].audio_path = CURRENT_AUDIO[idx][0]


# ---------------------------------------------------------------------------
# Translations
# ---------------------------------------------------------------------------

T = {
    "nl": {
        "repo": "github.com/knitweb/virtualpc",
        "install": {
            "video_title": "VirtualPC installeren",
            "subtitle": "Installatiehandleiding",
            "s1": "Stap 1: Vereisten",
            "s2": "Stap 2: Clone",
            "s3": "Stap 3: Installatiescript",
            "s4": "Stap 4: .env configureren",
            "s5": "Stap 5: Services starten",
            "s6": "Stap 6: Verificatie",
            "s7": "Stap 7: Dashboard",
            "s8": "Klaar",
            "req_lines": [
                ("muted", "$ node --version"),
                ("green", "v20.20.1"),
                ("muted", "$ docker --version"),
                ("green", "Docker version 27.x"),
                ("muted", "$ git --version"),
                ("green", "git version 2.x"),
                ("text", ""),
                ("text", "Nodig: Node 18+, Docker, Git"),
                ("text", "Optioneel: LM Studio op 127.0.0.1:1234"),
            ],
            "clone_lines": [
                ("muted", "$ git clone https://github.com/knitweb/virtualpc.git ~/virtualpc"),
                ("text", "Cloning into '/Users/develuse/virtualpc'..."),
                ("text", "remote: Enumerating objects: 1247, done."),
                ("text", "Resolving deltas: 100% (812/812), done."),
                ("text", ""),
                ("muted", "$ cd ~/virtualpc"),
                ("green", "~/virtualpc"),
            ],
            "install_lines": [
                ("muted", "$ ./scripts/install.sh"),
                ("text", "[INFO] npm ci"),
                ("text", "[INFO] npm run build"),
                ("text", "[INFO] docker compose -f deploy/docker-compose.litellm.yml up -d"),
                ("text", "[INFO] systemd units registreren..."),
                ("green", "[OK] virtualpc.service"),
                ("green", "[OK] virtualpc-litellm.service"),
                ("green", "[OK] virtualpc-auto-update.timer"),
                ("green", "[OK] Installatie voltooid"),
            ],
            "env_lines": [
                ("muted", "$ cp .env.example .env"),
                ("muted", "$ nano .env"),
                ("text", "PORT=3100"),
                ("text", "LITELLM_URL=http://127.0.0.1:4000"),
                ("text", "JWT_SECRET=verander_deze_waarde"),
                ("text", "ADMIN_PASSWORD=een_veilig_wachtwoord"),
                ("yellow", "# Bewaar API-keys in ~/.virtualpc/llm-keys.env"),
            ],
            "service_lines": [
                ("muted", "$ systemctl --user start virtualpc"),
                ("muted", "$ systemctl --user start virtualpc-litellm"),
                ("muted", "$ systemctl --user start virtualpc-auto-update.timer"),
                ("text", ""),
                ("green", "[OK] API draait op poort 3100"),
                ("green", "[OK] LiteLLM gateway draait op poort 4000"),
            ],
            "verify_lines": [
                ("muted", "$ curl -fsS http://localhost:3100/api/health"),
                ("green", '{"status":"ok","version":"1.0.0"}'),
                ("muted", "$ curl -fsS http://localhost:4000/health/liveliness"),
                ("green", '{"status":"healthy"}'),
                ("muted", "$ curl -fsS http://localhost:3100/api/vitals/auto-update"),
                ("green", '{"enabled":true,"interval_min":15}'),
            ],
            "dash_lines": [
                ("accent", "VirtualPC Dashboard"),
                ("text", ""),
                ("green", "✓ API gezond"),
                ("green", "✓ LiteLLM gateway actief"),
                ("green", "✓ 14 agents geregistreerd"),
                ("text", ""),
                ("text", "Inloggen met admin gebruiker"),
                ("text", "Rollen: CEO, CTO, Dev, Art, Research, Commercial"),
            ],
            "done_title": "Installatie voltooid",
            "done_sub": "Bekijk docs/README.md voor details",
        },
        "demo": {
            "video_title": "VirtualPC demonstratie",
            "subtitle": "Demonstratie",
            "desc": "Een overzicht van de belangrijkste features",
            "s1": "Agent roster",
            "s2": "LiteLLM gateway",
            "s3": "Task engine",
            "s4": "Auth & dashboards",
            "s5": "P2P Newsgroup 2.0",
            "s6": "Deliberation gates",
            "s7": "Auto-update",
            "s8": "Commercialisatie",
            "s9": "Meer informatie",
            "agent_cards": [
                ("CEO Fill", ["Strategie & prioritering", "Human-in-the-loop goedkeuring"], "accent"),
                ("CTO Kai", ["Technische architectuur", "Deliberation gates"], "purple"),
                ("Dev Alice", ["Backend / API", "TypeScript taken"], "green"),
                ("Dev Bob", ["Integraties", "Kafka / LightRAG"], "green"),
                ("Art Mira", ["Assets & UI", "Investor demo"], "yellow"),
                ("+ 9 andere agenten", ["Research, Legal, Security", "Commercieel team"], "muted"),
            ],
            "litellm_lines": [
                ("text", "LiteLLM gateway — 13 modellen via één API"),
                ("text", ""),
                ("green", "Lokaal (LM Studio):"),
                ("text", "  qwen-27b, phi-4, deepseek-r1"),
                ("accent", "Cloud (API-keys):"),
                ("text", "  claude-sonnet, gpt-4o-mini, grok"),
                ("text", "  deepseek-chat, kimi, perplexity"),
                ("text", "  mistral-large, gemini"),
                ("text", ""),
                ("yellow", "Endpoint: http://localhost:4000/v1/chat/completions"),
            ],
            "task_lines": [
                ("accent", "Takenmotor"),
                ("text", ""),
                ("green", "✓ Autonome tick per agent"),
                ("green", "✓ Subtaken met voortgangspercentage"),
                ("green", "✓ SSE streaming naar dashboard"),
                ("green", "✓ Persistent in data/tasks.json"),
                ("text", ""),
                ("text", "Voorbeeld: implementeer login endpoint"),
                ("text", "  1. Ontwerp schema  [done]"),
                ("text", "  2. Schrijf route    [in progress]"),
                ("text", "  3. Voeg tests toe   [queued]"),
            ],
            "auth_lines": [
                ("accent", "Authenticatie & Vitals"),
                ("text", ""),
                ("green", "✓ Login + sessies"),
                ("green", "✓ 2FA-ready"),
                ("green", "✓ Role-based dashboards"),
                ("green", "✓ Audit log"),
                ("text", ""),
                ("text", "GPU / services snapshot"),
                ("text", "Auto-update poll status"),
                ("text", "Symbiosis daemon state"),
            ],
            "p2p_lines": [
                ("text", "Souvereine P2P kennisgrafiek"),
                ("text", ""),
                ("accent", "Consensus   "),
                ("text", "  HotStuff BFT — 2/3+1 quorum"),
                ("accent", "State proofs"),
                ("text", "  Sparse Merkle tree (256-bit)"),
                ("accent", "Settlement  "),
                ("text", "  Token ledger + state roots"),
                ("accent", "Identity    "),
                ("text", "  did:vpc + Ed25519 key rotation"),
                ("accent", "Frontend    "),
                ("text", "  public/newsgroup.html"),
            ],
            "delib_lines": [
                ("text", "Smoke test: deliberation gates"),
                ("muted", "$ npm run smoke-deliberation-gates:example"),
                ("green", "[PASS] task-index.json schema"),
                ("green", "[PASS] deliberation refs in tasks"),
                ("green", "[PASS] parallel-group file overlap"),
                ("green", "[PASS] secret markers absent"),
                ("green", "[PASS] high-risk flags reviewed"),
                ("text", ""),
                ("text", "6 reviewers + judge voordat high-risk"),
                ("text", "werk naar master gaat."),
            ],
            "auto_lines": [
                ("text", "Automatische updates"),
                ("text", ""),
                ("accent", "scripts/auto-update.sh"),
                ("text", "  • Pollt GitHub elke 15 minuten"),
                ("text", "  • Pullt master alleen bij schone tree"),
                ("text", "  • Rebuildt en herstart indien nodig"),
                ("red", "  • Weigert bij dirty/diverged tree"),
                ("text", ""),
                ("green", "[OK] veilige, zelfherstellende deployment"),
            ],
            "commercial_lines": [
                ("accent", "Commercialisatie"),
                ("text", ""),
                ("text", "Croesus stelt promotionvoorstellen op"),
                ("text", "Gebonden budgetten en doelgroepen"),
                ("text", ""),
                ("yellow", "⚠ Echte uitgave vereist:"),
                ("yellow", "   PROMO_REAL_MONEY=1"),
                ("yellow", "   + human-in-the-loop goedkeuring"),
                ("text", ""),
                ("green", "Veilig by design"),
            ],
            "more_title": "Meer weten?",
            "more_sub": "docs/README.md",
        },
        "gui": {
            "video_title": "VirtualPC GUI",
            "subtitle": "Dashboard walkthrough",
            "s1": "Inlogscherm",
            "s2": "Dashboard overzicht",
            "s3": "Agent roster",
            "s4": "Taakdetail",
            "s5": "Provider instellingen",
            "s6": "Newsgroup GUI",
            "s7": "Aan de slag",
            "login_lines": [
                ("accent", "VirtualPC Login"),
                ("text", ""),
                ("text", "Gebruikersnaam"),
                ("muted", "admin"),
                ("text", "Wachtwoord"),
                ("muted", "••••••••"),
                ("text", "2FA-code (indien ingeschakeld)"),
                ("muted", "123456"),
                ("green", "[ Inloggen ]"),
                ("text", ""),
                ("text", "Rol wordt bepaald door JWT claims"),
            ],
            "layout_labels": ["Zijbalk", "Midden", "Boven", "Rechts"],
            "roster_lines": [
                ("accent", "Agent roster"),
                ("text", ""),
                ("text", "14 agenten in grid"),
                ("text", "Klik voor profiel & vaardigheden"),
                ("text", "Status: idle / busy / error"),
                ("text", "Filter op rol of vaardigheid"),
            ],
            "task_lines": [
                ("accent", "Taakdetail"),
                ("text", ""),
                ("text", "Taak #T-101"),
                ("text", "Agent: Dev Alice"),
                ("text", "Status: 65% voltooid"),
                ("text", "Subtaken: schema [done], route [busy], tests [queued]"),
                ("text", "SSE voortgang in real-time"),
            ],
            "provider_lines": [
                ("accent", "Provider instellingen"),
                ("text", ""),
                ("text", "LLM-provider dropdown"),
                ("text", "13 modellen via LiteLLM"),
                ("text", "Lokaal vs cloud prioriteit"),
                ("text", "API-keys beheerd via /api/credentials"),
                ("text", "Wijzigingen worden direct toegepast"),
            ],
            "news_lines": [
                ("accent", "Newsgroup GUI"),
                ("text", ""),
                ("text", "P2P feed"),
                ("text", "Posten met DID-identiteit"),
                ("text", "Stemmen & token-beloningen"),
                ("text", "Live feed via SSE"),
                ("text", "Zoek door de kennisgrafiek"),
            ],
            "final_title": "Start met VirtualPC",
            "final_sub": "docs/README.md",
        },
    },
    "en": {
        "repo": "github.com/knitweb/virtualpc",
        "install": {
            "video_title": "Installing VirtualPC",
            "subtitle": "Installation guide",
            "s1": "Step 1: Requirements",
            "s2": "Step 2: Clone",
            "s3": "Step 3: Install script",
            "s4": "Step 4: Configure .env",
            "s5": "Step 5: Start services",
            "s6": "Step 6: Verify",
            "s7": "Step 7: Dashboard",
            "s8": "Done",
            "req_lines": [
                ("muted", "$ node --version"),
                ("green", "v20.20.1"),
                ("muted", "$ docker --version"),
                ("green", "Docker version 27.x"),
                ("muted", "$ git --version"),
                ("green", "git version 2.x"),
                ("text", ""),
                ("text", "Required: Node 18+, Docker, Git"),
                ("text", "Optional: LM Studio on 127.0.0.1:1234"),
            ],
            "clone_lines": [
                ("muted", "$ git clone https://github.com/knitweb/virtualpc.git ~/virtualpc"),
                ("text", "Cloning into '/Users/develuse/virtualpc'..."),
                ("text", "remote: Enumerating objects: 1247, done."),
                ("text", "Resolving deltas: 100% (812/812), done."),
                ("text", ""),
                ("muted", "$ cd ~/virtualpc"),
                ("green", "~/virtualpc"),
            ],
            "install_lines": [
                ("muted", "$ ./scripts/install.sh"),
                ("text", "[INFO] npm ci"),
                ("text", "[INFO] npm run build"),
                ("text", "[INFO] docker compose -f deploy/docker-compose.litellm.yml up -d"),
                ("text", "[INFO] Registering systemd units..."),
                ("green", "[OK] virtualpc.service"),
                ("green", "[OK] virtualpc-litellm.service"),
                ("green", "[OK] virtualpc-auto-update.timer"),
                ("green", "[OK] Installation complete"),
            ],
            "env_lines": [
                ("muted", "$ cp .env.example .env"),
                ("muted", "$ nano .env"),
                ("text", "PORT=3100"),
                ("text", "LITELLM_URL=http://127.0.0.1:4000"),
                ("text", "JWT_SECRET=change_this_value"),
                ("text", "ADMIN_PASSWORD=a_secure_password"),
                ("yellow", "# Store API keys in ~/.virtualpc/llm-keys.env"),
            ],
            "service_lines": [
                ("muted", "$ systemctl --user start virtualpc"),
                ("muted", "$ systemctl --user start virtualpc-litellm"),
                ("muted", "$ systemctl --user start virtualpc-auto-update.timer"),
                ("text", ""),
                ("green", "[OK] API running on port 3100"),
                ("green", "[OK] LiteLLM gateway running on port 4000"),
            ],
            "verify_lines": [
                ("muted", "$ curl -fsS http://localhost:3100/api/health"),
                ("green", '{"status":"ok","version":"1.0.0"}'),
                ("muted", "$ curl -fsS http://localhost:4000/health/liveliness"),
                ("green", '{"status":"healthy"}'),
                ("muted", "$ curl -fsS http://localhost:3100/api/vitals/auto-update"),
                ("green", '{"enabled":true,"interval_min":15}'),
            ],
            "dash_lines": [
                ("accent", "VirtualPC Dashboard"),
                ("text", ""),
                ("green", "✓ API healthy"),
                ("green", "✓ LiteLLM gateway active"),
                ("green", "✓ 14 agents registered"),
                ("text", ""),
                ("text", "Log in as admin user"),
                ("text", "Roles: CEO, CTO, Dev, Art, Research, Commercial"),
            ],
            "done_title": "Installation complete",
            "done_sub": "See docs/README.md for details",
        },
        "demo": {
            "video_title": "VirtualPC demonstration",
            "subtitle": "Demonstration",
            "desc": "An overview of the key features",
            "s1": "Agent roster",
            "s2": "LiteLLM gateway",
            "s3": "Task engine",
            "s4": "Auth & dashboards",
            "s5": "P2P Newsgroup 2.0",
            "s6": "Deliberation gates",
            "s7": "Auto-update",
            "s8": "Commercialization",
            "s9": "Learn more",
            "agent_cards": [
                ("CEO Fill", ["Strategy & prioritization", "Human-in-the-loop approval"], "accent"),
                ("CTO Kai", ["Technical architecture", "Deliberation gates"], "purple"),
                ("Dev Alice", ["Backend / API", "TypeScript tasks"], "green"),
                ("Dev Bob", ["Integrations", "Kafka / LightRAG"], "green"),
                ("Art Mira", ["Assets & UI", "Investor demo"], "yellow"),
                ("+ 9 other agents", ["Research, Legal, Security", "Commercial team"], "muted"),
            ],
            "litellm_lines": [
                ("text", "LiteLLM gateway — 13 models through one API"),
                ("text", ""),
                ("green", "Local (LM Studio):"),
                ("text", "  qwen-27b, phi-4, deepseek-r1"),
                ("accent", "Cloud (API keys):"),
                ("text", "  claude-sonnet, gpt-4o-mini, grok"),
                ("text", "  deepseek-chat, kimi, perplexity"),
                ("text", "  mistral-large, gemini"),
                ("text", ""),
                ("yellow", "Endpoint: http://localhost:4000/v1/chat/completions"),
            ],
            "task_lines": [
                ("accent", "Task engine"),
                ("text", ""),
                ("green", "✓ Autonomous tick per agent"),
                ("green", "✓ Subtasks with progress percentage"),
                ("green", "✓ SSE streaming to dashboard"),
                ("green", "✓ Persistent in data/tasks.json"),
                ("text", ""),
                ("text", "Example: implement login endpoint"),
                ("text", "  1. Design schema  [done]"),
                ("text", "  2. Write route    [in progress]"),
                ("text", "  3. Add tests      [queued]"),
            ],
            "auth_lines": [
                ("accent", "Authentication & Vitals"),
                ("text", ""),
                ("green", "✓ Login + sessions"),
                ("green", "✓ 2FA-ready"),
                ("green", "✓ Role-based dashboards"),
                ("green", "✓ Audit log"),
                ("text", ""),
                ("text", "GPU / services snapshot"),
                ("text", "Auto-update poll status"),
                ("text", "Symbiosis daemon state"),
            ],
            "p2p_lines": [
                ("text", "Sovereign P2P knowledge graph"),
                ("text", ""),
                ("accent", "Consensus   "),
                ("text", "  HotStuff BFT — 2/3+1 quorum"),
                ("accent", "State proofs"),
                ("text", "  Sparse Merkle tree (256-bit)"),
                ("accent", "Settlement  "),
                ("text", "  Token ledger + state roots"),
                ("accent", "Identity    "),
                ("text", "  did:vpc + Ed25519 key rotation"),
                ("accent", "Frontend    "),
                ("text", "  public/newsgroup.html"),
            ],
            "delib_lines": [
                ("text", "Smoke test: deliberation gates"),
                ("muted", "$ npm run smoke-deliberation-gates:example"),
                ("green", "[PASS] task-index.json schema"),
                ("green", "[PASS] deliberation refs in tasks"),
                ("green", "[PASS] parallel-group file overlap"),
                ("green", "[PASS] secret markers absent"),
                ("green", "[PASS] high-risk flags reviewed"),
                ("text", ""),
                ("text", "6 reviewers + judge before high-risk"),
                ("text", "work reaches master."),
            ],
            "auto_lines": [
                ("text", "Automatic updates"),
                ("text", ""),
                ("accent", "scripts/auto-update.sh"),
                ("text", "  • Polls GitHub every 15 minutes"),
                ("text", "  • Pulls master only on clean tree"),
                ("text", "  • Rebuilds and restarts when needed"),
                ("red", "  • Refuses dirty/diverged tree"),
                ("text", ""),
                ("green", "[OK] safe, self-healing deployment"),
            ],
            "commercial_lines": [
                ("accent", "Commercialization"),
                ("text", ""),
                ("text", "Croesus drafts promotion proposals"),
                ("text", "Bounded budgets & audiences"),
                ("text", ""),
                ("yellow", "⚠ Real spend requires:"),
                ("yellow", "   PROMO_REAL_MONEY=1"),
                ("yellow", "   + human-in-the-loop approval"),
                ("text", ""),
                ("green", "Safe by design"),
            ],
            "more_title": "Learn more?",
            "more_sub": "docs/README.md",
        },
        "gui": {
            "video_title": "VirtualPC GUI",
            "subtitle": "Dashboard walkthrough",
            "s1": "Login screen",
            "s2": "Dashboard overview",
            "s3": "Agent roster",
            "s4": "Task detail",
            "s5": "Provider settings",
            "s6": "Newsgroup GUI",
            "s7": "Get started",
            "login_lines": [
                ("accent", "VirtualPC Login"),
                ("text", ""),
                ("text", "Username"),
                ("muted", "admin"),
                ("text", "Password"),
                ("muted", "••••••••"),
                ("text", "2FA code (if enabled)"),
                ("muted", "123456"),
                ("green", "[ Log in ]"),
                ("text", ""),
                ("text", "Role determined by JWT claims"),
            ],
            "layout_labels": ["Sidebar", "Center", "Top bar", "Right panel"],
            "roster_lines": [
                ("accent", "Agent roster"),
                ("text", ""),
                ("text", "14 agents in a grid"),
                ("text", "Click for profile & skills"),
                ("text", "Status: idle / busy / error"),
                ("text", "Filter by role or skill"),
            ],
            "task_lines": [
                ("accent", "Task detail"),
                ("text", ""),
                ("text", "Task #T-101"),
                ("text", "Agent: Dev Alice"),
                ("text", "Status: 65% complete"),
                ("text", "Subtasks: schema [done], route [busy], tests [queued]"),
                ("text", "Real-time SSE progress"),
            ],
            "provider_lines": [
                ("accent", "Provider settings"),
                ("text", ""),
                ("text", "LLM provider dropdown"),
                ("text", "13 models via LiteLLM"),
                ("text", "Local vs cloud priority"),
                ("text", "API keys managed via /api/credentials"),
                ("text", "Changes applied immediately"),
            ],
            "news_lines": [
                ("accent", "Newsgroup GUI"),
                ("text", ""),
                ("text", "P2P feed"),
                ("text", "Post with DID identity"),
                ("text", "Voting & token rewards"),
                ("text", "Live feed via SSE"),
                ("text", "Search the knowledge graph"),
            ],
            "final_title": "Get started with VirtualPC",
            "final_sub": "docs/README.md",
        },
    },
    "yue": {
        "repo": "github.com/knitweb/virtualpc",
        "install": {
            "video_title": "安裝 VirtualPC",
            "subtitle": "安裝教學",
            "s1": "第一步：系統要求",
            "s2": "第二步：複製倉庫",
            "s3": "第三步：安裝腳本",
            "s4": "第四步：設定 .env",
            "s5": "第五步：啟動服務",
            "s6": "第六步：驗證",
            "s7": "第七步：儀表板",
            "s8": "完成",
            "req_lines": [
                ("muted", "$ node --version"),
                ("green", "v20.20.1"),
                ("muted", "$ docker --version"),
                ("green", "Docker 版本 27.x"),
                ("muted", "$ git --version"),
                ("green", "git 版本 2.x"),
                ("text", ""),
                ("text", "需要：Node 18+、Docker、Git"),
                ("text", "選擇性：LM Studio 於 127.0.0.1:1234"),
            ],
            "clone_lines": [
                ("muted", "$ git clone https://github.com/knitweb/virtualpc.git ~/virtualpc"),
                ("text", "複製到 '/Users/develuse/virtualpc'..."),
                ("text", "remote: 正在列舉物件..."),
                ("text", "解析差異：100% (812/812)，完成"),
                ("text", ""),
                ("muted", "$ cd ~/virtualpc"),
                ("green", "~/virtualpc"),
            ],
            "install_lines": [
                ("muted", "$ ./scripts/install.sh"),
                ("text", "[資訊] npm ci"),
                ("text", "[資訊] npm run build"),
                ("text", "[資訊] docker compose -f deploy/docker-compose.litellm.yml up -d"),
                ("text", "[資訊] 註冊 systemd 單元..."),
                ("green", "[OK] virtualpc.service"),
                ("green", "[OK] virtualpc-litellm.service"),
                ("green", "[OK] virtualpc-auto-update.timer"),
                ("green", "[OK] 安裝完成"),
            ],
            "env_lines": [
                ("muted", "$ cp .env.example .env"),
                ("muted", "$ nano .env"),
                ("text", "PORT=3100"),
                ("text", "LITELLM_URL=http://127.0.0.1:4000"),
                ("text", "JWT_SECRET=更改此值"),
                ("text", "ADMIN_PASSWORD=安全密碼"),
                ("yellow", "# 將 API 金鑰儲存於 ~/.virtualpc/llm-keys.env"),
            ],
            "service_lines": [
                ("muted", "$ systemctl --user start virtualpc"),
                ("muted", "$ systemctl --user start virtualpc-litellm"),
                ("muted", "$ systemctl --user start virtualpc-auto-update.timer"),
                ("text", ""),
                ("green", "[OK] API 運行於 3100 埠"),
                ("green", "[OK] LiteLLM 閘道運行於 4000 埠"),
            ],
            "verify_lines": [
                ("muted", "$ curl -fsS http://localhost:3100/api/health"),
                ("green", '{"status":"ok","version":"1.0.0"}'),
                ("muted", "$ curl -fsS http://localhost:4000/health/liveliness"),
                ("green", '{"status":"healthy"}'),
                ("muted", "$ curl -fsS http://localhost:3100/api/vitals/auto-update"),
                ("green", '{"enabled":true,"interval_min":15}'),
            ],
            "dash_lines": [
                ("accent", "VirtualPC 儀表板"),
                ("text", ""),
                ("green", "✓ API 狀態良好"),
                ("green", "✓ LiteLLM 閘道運作中"),
                ("green", "✓ 已註冊 14 個 agent"),
                ("text", ""),
                ("text", "以 admin 用戶登入"),
                ("text", "角色：CEO、CTO、Dev、Art、Research、Commercial"),
            ],
            "done_title": "安裝完成",
            "done_sub": "詳情請參閱 docs/README.md",
        },
        "demo": {
            "video_title": "VirtualPC 示範",
            "subtitle": "示範",
            "desc": "主要功能概覽",
            "s1": "Agent 名單",
            "s2": "LiteLLM 閘道",
            "s3": "任務引擎",
            "s4": "認證與儀表板",
            "s5": "P2P Newsgroup 2.0",
            "s6": "審議關卡",
            "s7": "自動更新",
            "s8": "商業化",
            "s9": "想知更多？",
            "agent_cards": [
                ("CEO Fill", ["策略與優先排序", "人類在環審批"], "accent"),
                ("CTO Kai", ["技術架構", "審議關卡"], "purple"),
                ("Dev Alice", ["後端 / API", "TypeScript 任務"], "green"),
                ("Dev Bob", ["整合", "Kafka / LightRAG"], "green"),
                ("Art Mira", ["資產與 UI", "投資者示範"], "yellow"),
                ("+ 9 個其他 agent", ["研究、法律、安全", "商業團隊"], "muted"),
            ],
            "litellm_lines": [
                ("text", "LiteLLM 閘道 — 透過單一 API 使用 13 個模型"),
                ("text", ""),
                ("green", "本地（LM Studio）："),
                ("text", "  qwen-27b、phi-4、deepseek-r1"),
                ("accent", "雲端（API 金鑰）："),
                ("text", "  claude-sonnet、gpt-4o-mini、grok"),
                ("text", "  deepseek-chat、kimi、perplexity"),
                ("text", "  mistral-large、gemini"),
                ("text", ""),
                ("yellow", "端點：http://localhost:4000/v1/chat/completions"),
            ],
            "task_lines": [
                ("accent", "任務引擎"),
                ("text", ""),
                ("green", "✓ 每個 agent 自動運行"),
                ("green", "✓ 子任務附帶進度百分比"),
                ("green", "✓ SSE 串流至儀表板"),
                ("green", "✓ 持久化於 data/tasks.json"),
                ("text", ""),
                ("text", "範例：實作登入端點"),
                ("text", "  1. 設計結構  [完成]"),
                ("text", "  2. 編寫路由  [進行中]"),
                ("text", "  3. 新增測試  [等待中]"),
            ],
            "auth_lines": [
                ("accent", "認證與 Vitals"),
                ("text", ""),
                ("green", "✓ 登入 + 工作階段"),
                ("green", "✓ 支援 2FA"),
                ("green", "✓ 角色導向儀表板"),
                ("green", "✓ 審計記錄"),
                ("text", ""),
                ("text", "GPU / 服務快照"),
                ("text", "自動更新輪詢狀態"),
                ("text", "symbiosis 守護程式狀態"),
            ],
            "p2p_lines": [
                ("text", "主權 P2P 知識圖譜"),
                ("text", ""),
                ("accent", "共識   "),
                ("text", "  HotStuff BFT — 2/3+1 quorum"),
                ("accent", "狀態證明"),
                ("text", "  Sparse Merkle tree（256-bit）"),
                ("accent", "結算  "),
                ("text", "  Token 帳本 + state roots"),
                ("accent", "身份    "),
                ("text", "  did:vpc + Ed25519 key rotation"),
                ("accent", "前端    "),
                ("text", "  public/newsgroup.html"),
            ],
            "delib_lines": [
                ("text", "煙霧測試：審議關卡"),
                ("muted", "$ npm run smoke-deliberation-gates:example"),
                ("green", "[通過] task-index.json schema"),
                ("green", "[通過] deliberation refs in tasks"),
                ("green", "[通過] parallel-group file overlap"),
                ("green", "[通過] secret markers absent"),
                ("green", "[通過] high-risk flags reviewed"),
                ("text", ""),
                ("text", "6 位審查員 + judge，高風險"),
                ("text", "工作才能進入 master"),
            ],
            "auto_lines": [
                ("text", "自動更新"),
                ("text", ""),
                ("accent", "scripts/auto-update.sh"),
                ("text", "  • 每 15 分鐘輪詢 GitHub"),
                ("text", "  • 只在乾淨 tree 時拉取 master"),
                ("text", "  • 需要時重新建置並重啟"),
                ("red", "  • 拒絕 dirty / diverged tree"),
                ("text", ""),
                ("green", "[OK] 安全且自我修復的部署"),
            ],
            "commercial_lines": [
                ("accent", "商業化"),
                ("text", ""),
                ("text", "Croesus 制定推廣建議"),
                ("text", "有預算與目標受眾限制"),
                ("text", ""),
                ("yellow", "⚠ 真正支出需要："),
                ("yellow", "   PROMO_REAL_MONEY=1"),
                ("yellow", "   + 人類在環審批"),
                ("text", ""),
                ("green", "預設安全"),
            ],
            "more_title": "想知更多？",
            "more_sub": "docs/README.md",
        },
        "gui": {
            "video_title": "VirtualPC 圖形介面",
            "subtitle": "儀表板導覽",
            "s1": "登入畫面",
            "s2": "儀表板概覽",
            "s3": "Agent 名單",
            "s4": "任務詳情",
            "s5": "提供者設定",
            "s6": "Newsgroup 介面",
            "s7": "開始使用",
            "login_lines": [
                ("accent", "VirtualPC 登入"),
                ("text", ""),
                ("text", "用戶名稱"),
                ("muted", "admin"),
                ("text", "密碼"),
                ("muted", "••••••••"),
                ("text", "2FA 驗證碼（如已啟用）"),
                ("muted", "123456"),
                ("green", "[ 登入 ]"),
                ("text", ""),
                ("text", "角色由 JWT claims 決定"),
            ],
            "layout_labels": ["側邊欄", "中間", "頂部", "右側"],
            "roster_lines": [
                ("accent", "Agent 名單"),
                ("text", ""),
                ("text", "14 個 agent 以網格顯示"),
                ("text", "點擊查看個人檔案與技能"),
                ("text", "狀態：idle / busy / error"),
                ("text", "按角色或技能篩選"),
            ],
            "task_lines": [
                ("accent", "任務詳情"),
                ("text", ""),
                ("text", "任務 #T-101"),
                ("text", "Agent：Dev Alice"),
                ("text", "狀態：65% 完成"),
                ("text", "子任務：schema [完成]、route [進行中]、tests [等待中]"),
                ("text", "即時 SSE 進度"),
            ],
            "provider_lines": [
                ("accent", "提供者設定"),
                ("text", ""),
                ("text", "LLM 提供者下拉選單"),
                ("text", "透過 LiteLLM 使用 13 個模型"),
                ("text", "本地與雲端優先次序"),
                ("text", "API 金鑰由 /api/credentials 管理"),
                ("text", "變更即時生效"),
            ],
            "news_lines": [
                ("accent", "Newsgroup 介面"),
                ("text", ""),
                ("text", "P2P 信息流"),
                ("text", "以 DID 身份發文"),
                ("text", "投票與代幣獎勵"),
                ("text", "透過 SSE 即時推送"),
                ("text", "搜尋知識圖譜"),
            ],
            "final_title": "開始使用 VirtualPC",
            "final_sub": "docs/README.md",
        },
    },
    "ru": {
        "repo": "github.com/knitweb/virtualpc",
        "install": {
            "video_title": "Установка VirtualPC",
            "subtitle": "Руководство по установке",
            "s1": "Шаг 1: Требования",
            "s2": "Шаг 2: Клонирование",
            "s3": "Шаг 3: Скрипт установки",
            "s4": "Шаг 4: Настройка .env",
            "s5": "Шаг 5: Запуск сервисов",
            "s6": "Шаг 6: Проверка",
            "s7": "Шаг 7: Панель управления",
            "s8": "Готово",
            "req_lines": [
                ("muted", "$ node --version"),
                ("green", "v20.20.1"),
                ("muted", "$ docker --version"),
                ("green", "Docker версия 27.x"),
                ("muted", "$ git --version"),
                ("green", "git версия 2.x"),
                ("text", ""),
                ("text", "Требуется: Node 18+, Docker, Git"),
                ("text", "Опционально: LM Studio на 127.0.0.1:1234"),
            ],
            "clone_lines": [
                ("muted", "$ git clone https://github.com/knitweb/virtualpc.git ~/virtualpc"),
                ("text", "Клонирование в '/Users/develuse/virtualpc'..."),
                ("text", "remote: Перечисление объектов: 1247, готово."),
                ("text", "Разрешение дельт: 100% (812/812), готово."),
                ("text", ""),
                ("muted", "$ cd ~/virtualpc"),
                ("green", "~/virtualpc"),
            ],
            "install_lines": [
                ("muted", "$ ./scripts/install.sh"),
                ("text", "[ИНФО] npm ci"),
                ("text", "[ИНФО] npm run build"),
                ("text", "[ИНФО] docker compose -f deploy/docker-compose.litellm.yml up -d"),
                ("text", "[ИНФО] Регистрация systemd юнитов..."),
                ("green", "[OK] virtualpc.service"),
                ("green", "[OK] virtualpc-litellm.service"),
                ("green", "[OK] virtualpc-auto-update.timer"),
                ("green", "[OK] Установка завершена"),
            ],
            "env_lines": [
                ("muted", "$ cp .env.example .env"),
                ("muted", "$ nano .env"),
                ("text", "PORT=3100"),
                ("text", "LITELLM_URL=http://127.0.0.1:4000"),
                ("text", "JWT_SECRET=измените_это_значение"),
                ("text", "ADMIN_PASSWORD=надежный_пароль"),
                ("yellow", "# Храните API-ключи в ~/.virtualpc/llm-keys.env"),
            ],
            "service_lines": [
                ("muted", "$ systemctl --user start virtualpc"),
                ("muted", "$ systemctl --user start virtualpc-litellm"),
                ("muted", "$ systemctl --user start virtualpc-auto-update.timer"),
                ("text", ""),
                ("green", "[OK] API работает на порту 3100"),
                ("green", "[OK] Шлюз LiteLLM работает на порту 4000"),
            ],
            "verify_lines": [
                ("muted", "$ curl -fsS http://localhost:3100/api/health"),
                ("green", '{"status":"ok","version":"1.0.0"}'),
                ("muted", "$ curl -fsS http://localhost:4000/health/liveliness"),
                ("green", '{"status":"healthy"}'),
                ("muted", "$ curl -fsS http://localhost:3100/api/vitals/auto-update"),
                ("green", '{"enabled":true,"interval_min":15}'),
            ],
            "dash_lines": [
                ("accent", "Панель управления VirtualPC"),
                ("text", ""),
                ("green", "✓ API здоров"),
                ("green", "✓ Шлюз LiteLLM активен"),
                ("green", "✓ 14 агентов зарегистрировано"),
                ("text", ""),
                ("text", "Войдите как admin"),
                ("text", "Роли: CEO, CTO, Dev, Art, Research, Commercial"),
            ],
            "done_title": "Установка завершена",
            "done_sub": "Подробности в docs/README.md",
        },
        "demo": {
            "video_title": "Демонстрация VirtualPC",
            "subtitle": "Демонстрация",
            "desc": "Обзор ключевых возможностей",
            "s1": "Список агентов",
            "s2": "Шлюз LiteLLM",
            "s3": "Движок задач",
            "s4": "Аутентификация и панели",
            "s5": "P2P Newsgroup 2.0",
            "s6": "Ворота совещания",
            "s7": "Автообновление",
            "s8": "Коммерциализация",
            "s9": "Узнать больше",
            "agent_cards": [
                ("CEO Fill", ["Стратегия и приоритеты", "Утверждение человеком"], "accent"),
                ("CTO Kai", ["Техническая архитектура", "Ворота совещания"], "purple"),
                ("Dev Alice", ["Бэкенд / API", "Задачи TypeScript"], "green"),
                ("Dev Bob", ["Интеграции", "Kafka / LightRAG"], "green"),
                ("Art Mira", ["Ассеты и UI", "Демо для инвесторов"], "yellow"),
                ("+ 9 других агентов", ["Исследования, Legal, Security", "Коммерческая команда"], "muted"),
            ],
            "litellm_lines": [
                ("text", "Шлюз LiteLLM — 13 моделей через один API"),
                ("text", ""),
                ("green", "Локальные (LM Studio):"),
                ("text", "  qwen-27b, phi-4, deepseek-r1"),
                ("accent", "Облачные (API-ключи):"),
                ("text", "  claude-sonnet, gpt-4o-mini, grok"),
                ("text", "  deepseek-chat, kimi, perplexity"),
                ("text", "  mistral-large, gemini"),
                ("text", ""),
                ("yellow", "Endpoint: http://localhost:4000/v1/chat/completions"),
            ],
            "task_lines": [
                ("accent", "Движок задач"),
                ("text", ""),
                ("green", "✓ Автономный тик для каждого агента"),
                ("green", "✓ Подзадачи с процентом прогресса"),
                ("green", "✓ SSE-стриминг на панель"),
                ("green", "✓ Сохранение в data/tasks.json"),
                ("text", ""),
                ("text", "Пример: реализовать endpoint входа"),
                ("text", "  1. Спроектировать схему  [done]"),
                ("text", "  2. Написать маршрут  [in progress]"),
                ("text", "  3. Добавить тесты  [queued]"),
            ],
            "auth_lines": [
                ("accent", "Аутентификация и Vitals"),
                ("text", ""),
                ("green", "✓ Вход + сессии"),
                ("green", "✓ Готовность к 2FA"),
                ("green", "✓ Панели по ролям"),
                ("green", "✓ Журнал аудита"),
                ("text", ""),
                ("text", "Снимок GPU / сервисов"),
                ("text", "Статус опроса автообновления"),
                ("text", "Состояние демона symbiosis"),
            ],
            "p2p_lines": [
                ("text", "Суверенный P2P граф знаний"),
                ("text", ""),
                ("accent", "Консенсус   "),
                ("text", "  HotStuff BFT — 2/3+1 кворум"),
                ("accent", "Доказательства"),
                ("text", "  Sparse Merkle tree (256-bit)"),
                ("accent", "Расчеты  "),
                ("text", "  Token ledger + state roots"),
                ("accent", "Идентичность    "),
                ("text", "  did:vpc + Ed25519 key rotation"),
                ("accent", "Фронтенд    "),
                ("text", "  public/newsgroup.html"),
            ],
            "delib_lines": [
                ("text", "Дымовой тест: ворота совещания"),
                ("muted", "$ npm run smoke-deliberation-gates:example"),
                ("green", "[PASS] task-index.json schema"),
                ("green", "[PASS] deliberation refs in tasks"),
                ("green", "[PASS] parallel-group file overlap"),
                ("green", "[PASS] secret markers absent"),
                ("green", "[PASS] high-risk flags reviewed"),
                ("text", ""),
                ("text", "6 рецензентов + судья перед высокорисковой"),
                ("text", "работой в master."),
            ],
            "auto_lines": [
                ("text", "Автоматические обновления"),
                ("text", ""),
                ("accent", "scripts/auto-update.sh"),
                ("text", "  • Опрос GitHub каждые 15 минут"),
                ("text", "  • Pull master только на чистом дереве"),
                ("text", "  • Пересборка и перезапуск при необходимости"),
                ("red", "  • Отказ при dirty/diverged tree"),
                ("text", ""),
                ("green", "[OK] безопасное самовосстанавливающееся развертывание"),
            ],
            "commercial_lines": [
                ("accent", "Коммерциализация"),
                ("text", ""),
                ("text", "Croesus готовит рекламные предложения"),
                ("text", "Ограниченные бюджеты и аудитории"),
                ("text", ""),
                ("yellow", "⚠ Реальные расходы требуют:"),
                ("yellow", "   PROMO_REAL_MONEY=1"),
                ("yellow", "   + одобрения человеком"),
                ("text", ""),
                ("green", "Безопасно по дизайну"),
            ],
            "more_title": "Узнать больше?",
            "more_sub": "docs/README.md",
        },
        "gui": {
            "video_title": "Графический интерфейс VirtualPC",
            "subtitle": "Обзор панели управления",
            "s1": "Экран входа",
            "s2": "Обзор панели",
            "s3": "Список агентов",
            "s4": "Детали задачи",
            "s5": "Настройки провайдера",
            "s6": "Интерфейс Newsgroup",
            "s7": "Начало работы",
            "login_lines": [
                ("accent", "Вход в VirtualPC"),
                ("text", ""),
                ("text", "Имя пользователя"),
                ("muted", "admin"),
                ("text", "Пароль"),
                ("muted", "••••••••"),
                ("text", "Код 2FA (если включено)"),
                ("muted", "123456"),
                ("green", "[ Войти ]"),
                ("text", ""),
                ("text", "Роль определяется JWT claims"),
            ],
            "layout_labels": ["Боковая панель", "Центр", "Верхняя панель", "Правая панель"],
            "roster_lines": [
                ("accent", "Список агентов"),
                ("text", ""),
                ("text", "14 агентов в сетке"),
                ("text", "Клик для профиля и навыков"),
                ("text", "Статус: idle / busy / error"),
                ("text", "Фильтр по роли или навыку"),
            ],
            "task_lines": [
                ("accent", "Детали задачи"),
                ("text", ""),
                ("text", "Задача #T-101"),
                ("text", "Агент: Dev Alice"),
                ("text", "Статус: 65% выполнено"),
                ("text", "Подзадачи: schema [done], route [busy], tests [queued]"),
                ("text", "Прогресс SSE в реальном времени"),
            ],
            "provider_lines": [
                ("accent", "Настройки провайдера"),
                ("text", ""),
                ("text", "Выпадающий список LLM-провайдеров"),
                ("text", "13 моделей через LiteLLM"),
                ("text", "Приоритет локальных vs облачных"),
                ("text", "API-ключи через /api/credentials"),
                ("text", "Изменения применяются сразу"),
            ],
            "news_lines": [
                ("accent", "Интерфейс Newsgroup"),
                ("text", ""),
                ("text", "P2P-лента"),
                ("text", "Публикация с DID-идентификатором"),
                ("text", "Голосования и токен-награды"),
                ("text", "Live-лента через SSE"),
                ("text", "Поиск по графу знаний"),
            ],
            "final_title": "Начните работу с VirtualPC",
            "final_sub": "docs/README.md",
        },
    },
}


# ---------------------------------------------------------------------------
# Narrations (one per scene, matching the scene order of the builders below)
# ---------------------------------------------------------------------------

NARRATIONS = {
    "install": {
        "nl": [
            "Welkom bij de VirtualPC installatiehandleiding. In een paar minuten ben je klaar.",
            "Eerst de vereisten: Node 18 of hoger, Docker en Git. LM Studio is optioneel.",
            "Clone de repository naar je thuismap met git.",
            "Run install dot slash scripts slash install dot sh. Dit regelt npm, de build, Docker en systemd.",
            "Kopieer env dot example naar dot env en vul je geheimen in.",
            "Start de drie systemd services: VirtualPC, LiteLLM en auto-update.",
            "Controleer de health endpoints met curl.",
            "Open het dashboard in je browser en log in als admin.",
            "Gefeliciteerd, VirtualPC staat aan de praat. Veel bouwplezier!",
        ],
        "en": [
            "Welcome to the VirtualPC installation guide. You'll be up and running in minutes.",
            "First the requirements: Node 18 or newer, Docker and Git. LM Studio is optional.",
            "Clone the repository into your home folder.",
            "Run install dot slash scripts slash install dot sh. It handles npm, the build, Docker and systemd.",
            "Copy env dot example to dot env and fill in your secrets.",
            "Start the three systemd services: VirtualPC, LiteLLM and auto-update.",
            "Check the health endpoints with curl.",
            "Open the dashboard in your browser and log in as admin.",
            "Congratulations, VirtualPC is live. Happy building!",
        ],
        "yue": [
            "歡迎嚟到 VirtualPC 安裝教學，幾分鐘就搞掂。",
            "首先要準備 Node 18 或以上、Docker 同 Git，LM Studio 係選擇性㗎。",
            "用 git clone 複製倉庫去你嘅 home 目錄。",
            "執行 install dot slash scripts slash install dot sh，會幫你裝 npm、build、Docker 同 systemd。",
            "複製 env dot example 做 dot env，再填寫你嘅密鑰。",
            "啟動三個 systemd 服務：VirtualPC、LiteLLM 同自動更新。",
            "用 curl 檢查 health endpoints。",
            "喺瀏覽器打開 dashboard，用 admin 登入。",
            "恭喜，VirtualPC 已經跑緊，祝你用得開心！",
        ],
        "ru": [
            "Добро пожаловать в руководство по установке VirtualPC. Через несколько минут всё будет работать.",
            "Сначала требования: Node 18 или новее, Docker и Git. LM Studio опционально.",
            "Клонируйте репозиторий в домашнюю папку.",
            "Запустите install dot slash scripts slash install dot sh. Он установит npm, соберёт проект, запустит Docker и systemd.",
            "Скопируйте env dot example в dot env и укажите свои секреты.",
            "Запустите три сервиса systemd: VirtualPC, LiteLLM и автообновление.",
            "Проверьте health endpoints с помощью curl.",
            "Откройте dashboard в браузере и войдите как admin.",
            "Поздравляю, VirtualPC работает. Удачной разработки!",
        ],
    },
    "demo": {
        "nl": [
            "Welkom bij de VirtualPC demonstratie. Dit zijn de belangrijkste features.",
            "VirtualPC heeft veertien agents, van CEO Fill tot onderzoekers.",
            "De LiteLLM gateway biedt dertien modellen via één API, lokaal en in de cloud.",
            "De task engine splitst werk op in subtaken en streamt voortgang live.",
            "Authenticatie, rollen, vitals en een audit log houden alles veilig.",
            "P2P Newsgroup is een soevereine kennisgrafiek met consensus en cryptografie.",
            "Deliberation gates zorgen dat riskante wijzigingen eerst door zes reviewers gaan.",
            "Auto-update haalt elke vijftien minuten GitHub en herstart alleen als het veilig is.",
            "Croesus doet promotionvoorstellen, maar echte uitgave vraagt menselijke goedkeuring.",
            "Meer weten? Bekijk de documentatie op GitHub.",
        ],
        "en": [
            "Welcome to the VirtualPC demo. Here are the key features.",
            "VirtualPC has fourteen agents, from CEO Fill to researchers.",
            "The LiteLLM gateway offers thirteen models through one API, local and cloud.",
            "The task engine splits work into subtasks and streams progress live.",
            "Authentication, roles, vitals and an audit log keep everything secure.",
            "P2P Newsgroup is a sovereign knowledge graph with consensus and cryptography.",
            "Deliberation gates make sure risky changes pass six reviewers first.",
            "Auto-update pulls GitHub every fifteen minutes and only restarts when safe.",
            "Croesus drafts promotion proposals, but real spending needs human approval.",
            "Want to learn more? Check the docs on GitHub.",
        ],
        "yue": [
            "歡迎嚟到 VirtualPC 示範，呢度係主要功能。",
            "VirtualPC 有十四個 agent，由 CEO Fill 到研究員都有。",
            "LiteLLM 閘道提供十三個模型，本地同雲端都得。",
            "任務引擎會將工作拆做子任務，並即時串流進度。",
            "認證、角色、vitals 同審計記錄確保安全。",
            "P2P Newsgroup 係一個主權知識圖譜，有共識同加密。",
            "審議關卡確保高風險修改先經過六位審查員。",
            "自動更新每十五分鐘拉一次 GitHub，安全先會重啟。",
            "Croesus 會草擬推廣建議，但真係要洗錢就要人批。",
            "想知多啲？去 GitHub 睇文件啦。",
        ],
        "ru": [
            "Добро пожаловать в демонстрацию VirtualPC. Вот ключевые возможности.",
            "У VirtualPC четырнадцать агентов, от CEO Fill до исследователей.",
            "Шлюз LiteLLM предоставляет тринадцать моделей через один API: локальные и облачные.",
            "Движок задач разбивает работу на подзадачи и транслирует прогресс в реальном времени.",
            "Аутентификация, роли, vitals и журнал аудита обеспечивают безопасность.",
            "P2P Newsgroup — это суверенный граф знаний с консенсусом и криптографией.",
            "Ворота совещания гарантируют, что рискованные изменения проходят шесть рецензентов.",
            "Автообновление опрашивает GitHub каждые пятнадцать минут и перезапускается только при безопасности.",
            "Croesus готовит рекламные предложения, но реальные траты требуют человеческого одобрения.",
            "Хотите узнать больше? Смотрите документацию на GitHub.",
        ],
    },
    "gui": {
        "nl": [
            "Welkom bij de VirtualPC GUI-rondleiding.",
            "Log in met gebruikersnaam, wachtwoord en optioneel een 2FA-code.",
            "Het dashboard bestaat uit een zijbalk, topbalk, middenpaneel en vitals.",
            "In het agent roster zie je alle veertien agents, hun status en vaardigheden.",
            "Klik op een taak om subtaken, voortgang en verantwoordelijke agent te zien.",
            "Bij provider settings kies je een LLM-model en beheer je API-sleutels.",
            "Newsgroup is de P2P-feed waar agents kennis delen en stemmen.",
            "Dat was de rondleiding. Veel succes met VirtualPC!",
        ],
        "en": [
            "Welcome to the VirtualPC GUI walkthrough.",
            "Log in with username, password and optionally a 2FA code.",
            "The dashboard has a sidebar, top bar, center panel and vitals panel.",
            "The agent roster shows all fourteen agents, their status and skills.",
            "Click a task to see subtasks, progress and the responsible agent.",
            "In provider settings you pick an LLM model and manage API keys.",
            "Newsgroup is the P2P feed where agents share knowledge and vote.",
            "That concludes the tour. Enjoy using VirtualPC!",
        ],
        "yue": [
            "歡迎嚟到 VirtualPC 圖形介面導覽。",
            "用用戶名、密碼登入，有需要可以輸入 2FA 驗證碼。",
            "儀表板有側邊欄、頂部列、中間面板同 vitals 面板。",
            "Agent 名單顯示全部十四個 agent、狀態同技能。",
            "點擊任務可以睇到子任務、進度同負責嘅 agent。",
            "喺提供者設定揀 LLM 模型同管理 API 金鑰。",
            "Newsgroup 係 P2P 信息流，agent 可以分享知識同投票。",
            "導覽完畢，祝你用得開心！",
        ],
        "ru": [
            "Добро пожаловать в обзор графического интерфейса VirtualPC.",
            "Войдите с именем пользователя, паролем и при необходимости кодом 2FA.",
            "Панель управления содержит боковую панель, верхнюю панель, центральную область и vitals.",
            "Список агентов показывает всех четырнадцати агентов, их статус и навыки.",
            "Нажмите на задачу, чтобы увидеть подзадачи, прогресс и ответственного агента.",
            "В настройках провайдера выбираете модель LLM и управляете API-ключами.",
            "Newsgroup — это P2P-лента, где агенты делятся знаниями и голосуют.",
            "Это конец экскурсии. Успехов с VirtualPC!",
        ],
    },
}


# ---------------------------------------------------------------------------
# Video builders
# ---------------------------------------------------------------------------

def install_video(lang: str) -> List[Scene]:
    d = T[lang]["install"]
    scenes: List[Scene] = []
    total = 9

    add_scene(
        scenes, d["video_title"], 3.0, total,
        lambda img, draw: (
            draw.text((WIDTH // 2, HEIGHT // 2 - 40), "VirtualPC", font=FONT_TITLE, fill=PALETTE["accent"], anchor="mm"),
            draw.text((WIDTH // 2, HEIGHT // 2 + 30), d["subtitle"], font=FONT_LARGE, fill=PALETTE["text"], anchor="mm"),
            draw.text((WIDTH // 2, HEIGHT // 2 + 80), T[lang]["repo"], font=FONT, fill=PALETTE["muted"], anchor="mm"),
        ),
    )

    add_scene(scenes, d["s1"], 4.0, total, lambda img, draw: draw_terminal(draw, 60, 80, WIDTH - 120, HEIGHT - 160, d["req_lines"], title=d["s1"]))
    add_scene(scenes, d["s2"], 4.0, total, lambda img, draw: draw_terminal(draw, 60, 80, WIDTH - 120, HEIGHT - 160, d["clone_lines"], title=d["s2"]))
    add_scene(scenes, d["s3"], 6.0, total, lambda img, draw: draw_terminal(draw, 60, 80, WIDTH - 120, HEIGHT - 160, d["install_lines"], title=d["s3"]))
    add_scene(scenes, d["s4"], 5.0, total, lambda img, draw: draw_terminal(draw, 60, 80, WIDTH - 120, HEIGHT - 160, d["env_lines"], title=".env"))
    add_scene(scenes, d["s5"], 4.0, total, lambda img, draw: draw_terminal(draw, 60, 80, WIDTH - 120, HEIGHT - 160, d["service_lines"], title=d["s5"]))
    add_scene(scenes, d["s6"], 6.0, total, lambda img, draw: draw_terminal(draw, 60, 80, WIDTH - 120, HEIGHT - 160, d["verify_lines"], title=d["s6"]))
    add_scene(
        scenes, d["s7"], 5.0, total,
        lambda img, draw: draw_browser(draw, 60, 80, WIDTH - 120, HEIGHT - 160, "http://localhost:3100/dashboard.html", d["dash_lines"]),
    )

    add_scene(
        scenes, d["s8"], 3.0, total,
        lambda img, draw: (
            draw.text((WIDTH // 2, HEIGHT // 2 - 30), d["done_title"], font=FONT_TITLE, fill=PALETTE["green"], anchor="mm"),
            draw.text((WIDTH // 2, HEIGHT // 2 + 40), d["done_sub"], font=FONT, fill=PALETTE["text"], anchor="mm"),
            draw.text((WIDTH // 2, HEIGHT // 2 + 75), T[lang]["repo"], font=FONT, fill=PALETTE["muted"], anchor="mm"),
        ),
    )

    return scenes


def demo_video(lang: str) -> List[Scene]:
    d = T[lang]["demo"]
    scenes: List[Scene] = []
    total = 10

    add_scene(
        scenes, d["video_title"], 3.0, total,
        lambda img, draw: (
            draw.text((WIDTH // 2, HEIGHT // 2 - 40), "VirtualPC", font=FONT_TITLE, fill=PALETTE["accent"], anchor="mm"),
            draw.text((WIDTH // 2, HEIGHT // 2 + 30), d["subtitle"], font=FONT_LARGE, fill=PALETTE["text"], anchor="mm"),
            draw.text((WIDTH // 2, HEIGHT // 2 + 80), d["desc"], font=FONT, fill=PALETTE["muted"], anchor="mm"),
        ),
    )

    def roster(img: Image.Image, draw: ImageDraw.ImageDraw) -> None:
        cards = d["agent_cards"]
        positions = [
            (40, 80), (450, 80), (860, 80),
            (40, 350), (450, 350), (860, 350),
        ]
        for (x, y), (title, bullets, color_key) in zip(positions, cards):
            color = PALETTE[color_key] if color_key in PALETTE else PALETTE["accent"]
            draw_card(draw, x, y, 380, 240, title, bullets, accent=color)

    add_scene(scenes, d["s1"], 4.5, total, roster)
    add_scene(scenes, d["s2"], 5.0, total, lambda img, draw: draw_terminal(draw, 60, 80, WIDTH - 120, HEIGHT - 160, d["litellm_lines"], title="LiteLLM"))
    add_scene(scenes, d["s3"], 5.0, total, lambda img, draw: draw_browser(draw, 60, 80, WIDTH - 120, HEIGHT - 160, "http://localhost:3100/dashboard.html", d["task_lines"]))
    add_scene(scenes, d["s4"], 5.0, total, lambda img, draw: draw_browser(draw, 60, 80, WIDTH - 120, HEIGHT - 160, "http://localhost:3100/vitals.html", d["auth_lines"]))
    add_scene(scenes, d["s5"], 5.0, total, lambda img, draw: draw_terminal(draw, 60, 80, WIDTH - 120, HEIGHT - 160, d["p2p_lines"], title="LightRAG"))
    add_scene(scenes, d["s6"], 6.0, total, lambda img, draw: draw_terminal(draw, 60, 80, WIDTH - 120, HEIGHT - 160, d["delib_lines"], title="deliberation gates"))
    add_scene(scenes, d["s7"], 4.0, total, lambda img, draw: draw_terminal(draw, 60, 80, WIDTH - 120, HEIGHT - 160, d["auto_lines"], title="auto-update"))
    add_scene(scenes, d["s8"], 4.0, total, lambda img, draw: draw_browser(draw, 60, 80, WIDTH - 120, HEIGHT - 160, "http://localhost:3100/investor-demo.html", d["commercial_lines"]))

    add_scene(
        scenes, d["s9"], 3.0, total,
        lambda img, draw: (
            draw.text((WIDTH // 2, HEIGHT // 2 - 30), d["more_title"], font=FONT_TITLE, fill=PALETTE["accent"], anchor="mm"),
            draw.text((WIDTH // 2, HEIGHT // 2 + 40), d["more_sub"], font=FONT, fill=PALETTE["text"], anchor="mm"),
            draw.text((WIDTH // 2, HEIGHT // 2 + 75), T[lang]["repo"], font=FONT, fill=PALETTE["muted"], anchor="mm"),
        ),
    )

    return scenes


def gui_video(lang: str) -> List[Scene]:
    d = T[lang]["gui"]
    scenes: List[Scene] = []
    total = 7

    add_scene(
        scenes, d["video_title"], 3.0, total,
        lambda img, draw: (
            draw.text((WIDTH // 2, HEIGHT // 2 - 40), "VirtualPC", font=FONT_TITLE, fill=PALETTE["accent"], anchor="mm"),
            draw.text((WIDTH // 2, HEIGHT // 2 + 30), d["subtitle"], font=FONT_LARGE, fill=PALETTE["text"], anchor="mm"),
            draw.text((WIDTH // 2, HEIGHT // 2 + 80), "GUI", font=FONT, fill=PALETTE["muted"], anchor="mm"),
        ),
    )

    add_scene(
        scenes, d["s1"], 4.5, total,
        lambda img, draw: draw_browser(draw, 60, 80, WIDTH - 120, HEIGHT - 160, "http://localhost:3100/login", d["login_lines"]),
    )

    add_scene(
        scenes, d["s2"], 6.0, total,
        lambda img, draw: draw_dashboard_layout(draw, d["layout_labels"]),
    )

    add_scene(
        scenes, d["s3"], 4.5, total,
        lambda img, draw: draw_browser(draw, 60, 80, WIDTH - 120, HEIGHT - 160, "http://localhost:3100/agents.html", d["roster_lines"]),
    )

    add_scene(
        scenes, d["s4"], 5.0, total,
        lambda img, draw: draw_browser(draw, 60, 80, WIDTH - 120, HEIGHT - 160, "http://localhost:3100/task/T-101", d["task_lines"]),
    )

    add_scene(
        scenes, d["s5"], 5.0, total,
        lambda img, draw: draw_browser(draw, 60, 80, WIDTH - 120, HEIGHT - 160, "http://localhost:3100/settings/providers", d["provider_lines"]),
    )

    add_scene(
        scenes, d["s6"], 5.0, total,
        lambda img, draw: draw_browser(draw, 60, 80, WIDTH - 120, HEIGHT - 160, "http://localhost:3100/newsgroup.html", d["news_lines"]),
    )

    add_scene(
        scenes, d["s7"], 3.0, total,
        lambda img, draw: (
            draw.text((WIDTH // 2, HEIGHT // 2 - 30), d["final_title"], font=FONT_TITLE, fill=PALETTE["green"], anchor="mm"),
            draw.text((WIDTH // 2, HEIGHT // 2 + 40), d["final_sub"], font=FONT, fill=PALETTE["text"], anchor="mm"),
            draw.text((WIDTH // 2, HEIGHT // 2 + 75), T[lang]["repo"], font=FONT, fill=PALETTE["muted"], anchor="mm"),
        ),
    )

    return scenes


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def make_video(name: str, lang: str, builder: Callable[[str], List[Scene]]) -> Path:
    global CURRENT_AUDIO, CURRENT_SCENE_IDX
    root = Path(__file__).resolve().parent.parent
    out_dir = root / "docs" / "videos"
    out_dir.mkdir(parents=True, exist_ok=True)
    frames_dir = out_dir / f"{name}_{lang}_frames"
    audio_dir = out_dir / f"{name}_{lang}_audio"
    silent_video = out_dir / f"{name}_{lang}_silent.mp4"
    final_video = out_dir / f"{name}-{lang}.mp4"

    narrations = NARRATIONS.get(name, {}).get(lang, [])
    voice, rate = VOICES[lang]

    if narrations:
        print(f"  [{name}-{lang}] Synthesizing narrations...")
        CURRENT_AUDIO = generate_audio_files(narrations, audio_dir, voice, rate)
    else:
        CURRENT_AUDIO = []

    CURRENT_SCENE_IDX = 0
    scenes = builder(lang)

    if narrations and len(scenes) != len(narrations):
        raise RuntimeError(f"Scene/narration mismatch for {name}-{lang}: {len(scenes)} scenes, {len(narrations)} narrations")

    concat = save_scenes(frames_dir, scenes)
    encode_video(concat, silent_video)

    if CURRENT_AUDIO:
        combined_audio = combine_audio(scenes, CURRENT_AUDIO, audio_dir)
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(silent_video), "-i", str(combined_audio),
             "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", str(final_video)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        silent_video.unlink(missing_ok=True)
    else:
        silent_video.rename(final_video)

    return final_video


def main() -> None:
    langs = ["nl", "en", "yue", "ru"]
    for lang in langs:
        set_fonts(lang)
        for name, builder in [("install", install_video), ("demo", demo_video), ("gui", gui_video)]:
            print(f"Building {name}-{lang}...")
            path = make_video(name, lang, builder)
            print(f"  -> {path}")

    print("Done.")


if __name__ == "__main__":
    main()
