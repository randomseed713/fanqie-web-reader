import asyncio
import io
import json
import re
from pathlib import Path

import httpx
from fontTools.ttLib import TTFont

CHARSET_PATH = Path(__file__).parent / "charset.json"
FONT_CACHE = {}

def load_charset():
    with open(CHARSET_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list) and data and isinstance(data[0], list):
        return data[0]
    if isinstance(data, dict):
        return data.get("charset", data.get("data", []))
    return data


async def build_font_map(font_url: str, client: httpx.AsyncClient) -> dict[int, str] | None:
    if font_url in FONT_CACHE:
        return FONT_CACHE[font_url]

    try:
        r = await client.get(font_url, timeout=15)
        if r.status_code != 200:
            return None

        font = TTFont(io.BytesIO(r.content))
        cmap = font.getBestCmap()
        if cmap is None:
            return None
        charset = load_charset()

        glyph_to_idx = {}
        for pua, glyph_name in cmap.items():
            m = re.search(r"gid(\d+)", str(glyph_name))
            if m:
                gid = int(m.group(1))
                glyph_to_idx[pua] = gid

        if not glyph_to_idx:
            return None

        min_gid = min(glyph_to_idx.values())
        pua_map = {}
        for pua, gid in glyph_to_idx.items():
            idx = gid - min_gid
            if 0 <= idx < len(charset):
                pua_map[pua] = charset[idx]

        FONT_CACHE[font_url] = pua_map
        return pua_map
    except Exception:
        return None


FONT_PATTERN = re.compile(
    r"https?://[^'\"]+?awesome-font[^'\"]+?\.woff2?"
)


def extract_font_urls(html: str) -> list[str]:
    return FONT_PATTERN.findall(html)


async def decode_content(
    encrypted_text: str,
    font_url: str | None,
    client: httpx.AsyncClient,
) -> str:
    if not font_url:
        return encrypted_text

    pua_map = await build_font_map(font_url, client)
    if not pua_map:
        return encrypted_text

    result = []
    for ch in encrypted_text:
        cp = ord(ch)
        if cp in pua_map:
            result.append(pua_map[cp])
        else:
            result.append(ch)
    return "".join(result)
