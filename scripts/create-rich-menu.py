#!/usr/bin/env python3
"""Generate LINE Rich Menu image and create it via API."""

import json
import os
import ssl
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Fix SSL cert verification on macOS
ssl._create_default_https_context = ssl._create_unverified_context

# ── Config ──────────────────────────────────────────────────────────────────
WIDTH, HEIGHT = 2500, 1686
COLS, ROWS = 3, 2
CELL_W = WIDTH // COLS   # 833
CELL_H = HEIGHT // ROWS  # 843

# Colors (matching app theme)
BG_COLOR = "#FFFFFF"
DIVIDER_COLOR = "#E5E5EA"
TEXT_COLOR = "#1D1D1F"
SUBTEXT_COLOR = "#8E8E93"
LINE_GREEN = "#06C755"

TILES = [
    # Row 1
    {"label": "หน้าหลัก",  "icon": "💰", "bg_tint": "#06C75512", "icon_color": "#06C755"},
    {"label": "เพิ่มรายการ", "icon": "➕", "bg_tint": "#007AFF12", "icon_color": "#007AFF"},
    {"label": "งบประมาณ", "icon": "📊", "bg_tint": "#8B5CF612", "icon_color": "#8B5CF6"},
    # Row 2
    {"label": "รายการ",    "icon": "📋", "bg_tint": "#FF950012", "icon_color": "#FF9500"},
    {"label": "โปรไพล์",   "icon": "👤", "bg_tint": "#34C75912", "icon_color": "#34C759"},
    {"label": "ตั้งค่า",     "icon": "⚙️", "bg_tint": "#8E8E9312", "icon_color": "#8E8E93"},
]

LIFF_URL_BASE = "https://liff.line.me/2010006005-hye7KNGx"

ACTIONS = [
    {"type": "uri", "uri": f"{LIFF_URL_BASE}/dashboard"},
    {"type": "uri", "uri": f"{LIFF_URL_BASE}/dashboard?action=add"},
    {"type": "uri", "uri": f"{LIFF_URL_BASE}/budget"},
    {"type": "uri", "uri": f"{LIFF_URL_BASE}/categories"},
    {"type": "uri", "uri": f"{LIFF_URL_BASE}/profile"},
    {"type": "uri", "uri": f"{LIFF_URL_BASE}/settings"},
]

OUTPUT_PATH = Path(__file__).parent.parent / "public" / "rich-menu.png"

# ── Font Setup ──────────────────────────────────────────────────────────────
def get_font(size: int) -> ImageFont.FreeTypeFont:
    """Try to find a Thai-supporting font on macOS."""
    candidates = [
        "/System/Library/Fonts/Supplemental/Sarabun-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Sarabun-Bold.ttf",
        "/Library/Fonts/Sarabun-Regular.ttf",
        "/Library/Fonts/Sarabun-Bold.ttf",
        "/System/Library/Fonts/Supplemental/ThaiSystem.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    # Fallback to default
    return ImageFont.load_default()


# ── Draw Rich Menu ──────────────────────────────────────────────────────────
def draw_rich_menu() -> Image.Image:
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    font_label = get_font(52)
    font_icon = get_font(80)

    for idx, tile in enumerate(TILES):
        col = idx % COLS
        row = idx // COLS
        x = col * CELL_W
        y = row * CELL_H
        cx = x + CELL_W // 2
        cy = y + CELL_H // 2 - 30

        # Draw tinted circle background
        circle_radius = 120
        draw.ellipse(
            [cx - circle_radius, cy - circle_radius, cx + circle_radius, cy + circle_radius],
            fill=tile["bg_tint"],
        )

        # Draw icon (emoji)
        try:
            draw.text((cx, cy), tile["icon"], font=font_icon, fill=tile["icon_color"], anchor="mm")
        except Exception:
            draw.text((cx, cy), tile["icon"], font=font_icon, fill=tile["icon_color"], anchor="mm")

        # Draw label
        label_y = cy + circle_radius + 30
        draw.text((cx, label_y), tile["label"], font=font_label, fill=TEXT_COLOR, anchor="mm")

    # Draw divider lines
    for col in range(1, COLS):
        x = col * CELL_W
        draw.line([(x, 0), (x, HEIGHT)], fill=DIVIDER_COLOR, width=2)
    for row in range(1, ROWS):
        y = row * CELL_H
        draw.line([(0, y), (WIDTH, y)], fill=DIVIDER_COLOR, width=2)

    # Top accent line (LINE Green)
    draw.line([(0, 0), (WIDTH, 0)], fill=LINE_GREEN, width=6)

    return img


# ── LINE API ────────────────────────────────────────────────────────────────
def create_rich_menu_via_api(image_path: Path) -> dict:
    """Create rich menu on LINE platform using Messaging API."""
    import urllib.request
    import urllib.error

    channel_token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
    if not channel_token:
        # Try loading from .env
        env_path = Path(__file__).parent.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("LINE_CHANNEL_ACCESS_TOKEN="):
                    channel_token = line.split("=", 1)[1].strip()
                    break

    if not channel_token:
        print("ERROR: LINE_CHANNEL_ACCESS_TOKEN not found")
        sys.exit(1)

    headers = {
        "Authorization": f"Bearer {channel_token}",
        "Content-Type": "application/json",
    }

    # Step 1: Create rich menu object
    areas = []
    for idx in range(len(TILES)):
        col = idx % COLS
        row = idx // COLS
        x1 = col * CELL_W
        y1 = row * CELL_H
        x2 = x1 + CELL_W
        y2 = y1 + CELL_H

        # Clamp to image bounds
        x2 = min(x2, WIDTH)
        y2 = min(y2, HEIGHT)

        action = ACTIONS[idx]
        areas.append({
            "bounds": {
                "x": x1,
                "y": y1,
                "width": x2 - x1,
                "height": y2 - y1,
            },
            "action": action,
        })

    rich_menu_data = {
        "size": {"width": WIDTH, "height": HEIGHT},
        "selected": True,
        "name": "MyFam Main Menu",
        "chatBarText": "เมนู",
        "areas": areas,
    }

    print("Creating rich menu object...")
    req = urllib.request.Request(
        "https://api.line.me/v2/bot/richmenu",
        data=json.dumps(rich_menu_data).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            rich_menu_id = result.get("richMenuId")
            print(f"✓ Rich menu created: {rich_menu_id}")
    except urllib.error.HTTPError as e:
        print(f"ERROR creating rich menu: {e.code} {e.reason}")
        print(e.read().decode("utf-8"))
        sys.exit(1)

    # Step 2: Upload image
    print("Uploading rich menu image...")
    image_data = image_path.read_bytes()

    upload_headers = {
        "Authorization": f"Bearer {channel_token}",
        "Content-Type": "image/png",
    }

    upload_req = urllib.request.Request(
        f"https://api-data.line.me/v2/bot/richmenu/{rich_menu_id}/content",
        data=image_data,
        headers=upload_headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(upload_req) as resp:
            print(f"✓ Image uploaded (status: {resp.status})")
    except urllib.error.HTTPError as e:
        print(f"ERROR uploading image: {e.code} {e.reason}")
        print(e.read().decode("utf-8"))
        sys.exit(1)

    # Step 3: Set as default rich menu
    print("Setting as default rich menu...")
    default_req = urllib.request.Request(
        f"https://api.line.me/v2/bot/user/all/richmenu/{rich_menu_id}",
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(default_req) as resp:
            print(f"✓ Set as default rich menu (status: {resp.status})")
    except urllib.error.HTTPError as e:
        print(f"ERROR setting default: {e.code} {e.reason}")
        print(e.read().decode("utf-8"))
        # Not fatal — can still set manually

    return {"richMenuId": rich_menu_id, "areas": areas}


# ── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"Generating rich menu image ({WIDTH}x{HEIGHT})...")
    img = draw_rich_menu()

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUTPUT_PATH, "PNG", optimize=True)
    print(f"✓ Image saved: {OUTPUT_PATH}")

    # Upload to LINE if --upload flag
    if "--upload" in sys.argv:
        result = create_rich_menu_via_api(OUTPUT_PATH)
        print(f"\n✓ Rich Menu ID: {result['richMenuId']}")
        print(f"  Areas: {len(result['areas'])} tiles")
        for i, (tile, action) in enumerate(zip(TILES, ACTIONS)):
            print(f"  [{i+1}] {tile['label']} → {action['uri']}")
    else:
        print("\nRun with --upload to create on LINE platform:")
        print(f"  python3 {__file__} --upload")