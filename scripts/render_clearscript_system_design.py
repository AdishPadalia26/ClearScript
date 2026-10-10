from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


OUT = Path("artifacts/clearscript_system_design.jpg")

W, H = 1800, 1160
INK = "#102a43"
MUTED = "#5f7288"
BLUE = "#2563eb"
TEAL = "#059669"
ORANGE = "#f97316"
RED = "#dc2626"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = (
        [r"C:\Windows\Fonts\segoeuib.ttf", r"C:\Windows\Fonts\arialbd.ttf"]
        if bold
        else [r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf"]
    )
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


img = Image.new("RGB", (W, H), "#f5f8fb")
d = ImageDraw.Draw(img)

F_TITLE = font(43, True)
F_SUB = font(22)
F_BODY = font(16)
F_SMALL = font(13)
F_BOX = font(18, True)
F_TIER = font(27, True)
F_FOOT = font(13)


def text_center(y: int, text: str, f: ImageFont.FreeTypeFont, fill: str) -> None:
    box = d.textbbox((0, 0), text, font=f)
    d.text(((W - (box[2] - box[0])) / 2, y), text, font=f, fill=fill)


def rounded_rect(xy: tuple[int, int, int, int], fill: str, outline: str, width: int = 2, radius: int = 8) -> None:
    d.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def wrap_text(text: str, f: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if d.textbbox((0, 0), candidate, font=f)[2] <= max_w:
            line = candidate
            continue
        if line:
            lines.append(line)
        line = word
    if line:
        lines.append(line)
    return lines


def paragraph(x: int, y: int, text: str, f: ImageFont.FreeTypeFont, fill: str, max_w: int, line_gap: int = 5) -> None:
    for i, line in enumerate(wrap_text(text, f, max_w)):
        d.text((x, y + i * (f.size + line_gap)), line, font=f, fill=fill)


def arrow(x1: int, y: int, x2: int, color: str) -> None:
    d.line((x1, y, x2 - 14, y), fill=color, width=3)
    d.polygon([(x2 - 14, y - 9), (x2 - 14, y + 9), (x2, y)], fill=color)


def card(x: int, y: int, w: int, h: int, title: str, sub: str, color: str = BLUE, fill: str = "#ffffff") -> None:
    rounded_rect((x, y, x + w, y + h), fill, color, width=2, radius=9)
    d.rounded_rectangle((x, y, x + w, y + 8), radius=4, fill=color, outline=color)
    d.text((x + 18, y + 30), title, font=F_BOX, fill=INK)
    if sub:
        paragraph(x + 18, y + 63, sub, F_SMALL, MUTED, w - 36, line_gap=3)


def tier(x: int, y: int, w: int, h: int, title: str, sub: str, color: str, fill: str) -> None:
    rounded_rect((x, y, x + w, y + h), fill, color, width=2, radius=16)
    d.text((x + 20, y + 30), title, font=F_TIER, fill=INK)
    d.text((x + 20, y + 66), sub, font=F_SMALL, fill=MUTED)


def pill(x: int, y: int, w: int, text: str, color: str, fill: str) -> None:
    rounded_rect((x, y, x + w, y + 46), fill, color, width=2, radius=23)
    box = d.textbbox((0, 0), text, font=F_SMALL)
    d.text((x + (w - (box[2] - box[0])) / 2, y + 14), text, font=F_SMALL, fill=INK)


text_center(38, "ClearScript - Fax to Fill System Design", F_TITLE, INK)
text_center(
    92,
    "PillSpark Track | OpenAPI contract, OCR/image-tested intake, Prism traces, agent web search, and pharmacist-safe outputs",
    F_SUB,
    MUTED,
)

rounded_rect((110, 145, 1690, 218), "#e8f1ff", BLUE, width=2, radius=8)
paragraph(
    132,
    171,
    "Project summary: ClearScript turns faxed prescription images into structured, evidence-backed orders, flags uncertain fields, supports prescriber clarification, and exports demo-ready FHIR and CSV payloads.",
    F_BODY,
    INK,
    1535,
)

flow_y, box_h = 270, 105
items = [
    ("Fax / Image", "Upload PNG or scanned prescription"),
    ("OpenAPI + OCR", "Contract-backed extraction"),
    ("Agent Graph", "Research and reconcile evidence"),
    ("Prism Traces", "Trace every step and decision"),
    ("Pharmacist Review", "Resolve red/yellow fields safely"),
    ("FHIR + CSV", "Structured payloads for handoff"),
]
xs = [106, 365, 640, 915, 1205, 1490]
ws = [210, 220, 220, 230, 235, 205]
colors = [BLUE, BLUE, BLUE, TEAL, TEAL, BLUE]
fills = ["#eaf2ff", "#eaf2ff", "#eaf2ff", "#e6f7ef", "#e6f7ef", "#eaf2ff"]
for i, (title, sub) in enumerate(items):
    card(xs[i], flow_y, ws[i], box_h, title, sub, colors[i], fills[i])
    if i < len(items) - 1:
        arrow(xs[i] + ws[i] + 8, flow_y + box_h // 2, xs[i + 1] - 8, BLUE if i < 3 else TEAL)

rounded_rect((255, 398, 1545, 442), "#f8fbff", "#b8cbe5", width=2, radius=8)
text_center(
    413,
    "Design principle: AI proposes and explains. Deterministic services verify, reconcile, trace, and block unsafe guesses.",
    F_BODY,
    INK,
)

tier(
    105,
    475,
    1590,
    168,
    "Tier 1 - Image OCR + Extraction",
    "Normalize image uploads into candidate prescription fields before reasoning begins",
    BLUE,
    "#edf6ff",
)
chain1 = ["Image Upload", "OCR Pass", "OCR Field Read", "Normalized Fields"]
cx = [170, 510, 850, 1190]
for i, title in enumerate(chain1):
    card(cx[i], 558, 260, 64, title, "", BLUE)
    if i < len(chain1) - 1:
        arrow(cx[i] + 268, 590, cx[i + 1] - 8, BLUE)

tier(
    105,
    670,
    1590,
    162,
    "Tier 2 - Agent Research + Traceability",
    "Use web-search agents, clinical references, and run traces to ground the current analysis",
    TEAL,
    "#e9f8f0",
)
chain2 = ["Agent Web Search", "RxNorm + NPI Checks", "Prism Trace Store", "Evidence Bundle"]
cx = [220, 560, 900, 1240]
cw = [300, 300, 300, 260]
for i, title in enumerate(chain2):
    card(cx[i], 753, cw[i], 64, title, "", TEAL)
    if i < len(chain2) - 1:
        arrow(cx[i] + cw[i] + 8, 785, cx[i + 1] - 8, TEAL)

tier(
    105,
    860,
    1590,
    188,
    "Tier 3 - Pharmacist Review, Voice Loop, and Output",
    "Resolve ambiguous fields, document decisions, and produce the final pharmacy-ready answer",
    ORANGE,
    "#fff3df",
)
chain3 = ["Review Console", "Call Guardrails", "Prescriber Call", "FHIR Builder", "Demo + Metrics"]
cx = [160, 450, 740, 1030, 1320]
cols = [ORANGE, ORANGE, RED, ORANGE, ORANGE]
for i, title in enumerate(chain3):
    card(cx[i], 943, 230, 72, title, "", cols[i])
    if i < len(chain3) - 1:
        arrow(cx[i] + 238, 979, cx[i + 1] - 8, ORANGE)

pill(135, 1062, 355, "OpenAPI contract + OCR extraction", BLUE, "#eaf2ff")
pill(560, 1062, 320, "OCR pipeline tested with images", TEAL, "#e6f7ef")
pill(955, 1062, 245, "Prism traces", TEAL, "#e6f7ef")
pill(1275, 1062, 300, "Agent web searches", ORANGE, "#fff3df")

text_center(1128, "ClearScript - PillSpark Fax to Fill System Design", F_FOOT, MUTED)

OUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUT, "JPEG", quality=95, optimize=True)
print(OUT.resolve())
