import argparse
import asyncio
import re
from pathlib import Path

import httpx


COMMUNITY_API = "http://101.35.133.34:5000"
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Linux; Android 9; SM-G960F) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    ),
}


def safe_txt_filename(name: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', "", name or "").strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return f"{cleaned or 'book'}.txt"


def build_txt_content(book_title: str, author: str, chapters: list[dict]) -> str:
    lines = [book_title or "未知书名"]
    if author:
        lines.append(f"作者：{author}")
    lines.append("")

    for index, chapter in enumerate(chapters):
        title = chapter.get("title") or f"第{index + 1}章"
        lines.extend([title, ""])

        paragraphs = chapter.get("paragraphs") or []
        if paragraphs:
            for paragraph in paragraphs:
                text = str(paragraph).strip()
                if text:
                    lines.extend([text, ""])
        else:
            lines.extend(["[本章暂无正文]", ""])

        author_speak = str(chapter.get("author_speak") or "").strip()
        if author_speak:
            lines.extend([f"作者说：{author_speak}", ""])

        if chapter.get("failed"):
            lines.extend(["[本章下载失败]", ""])

    return "\n".join(lines).rstrip() + "\n"


def parse_content_html(content_html: str) -> list[str]:
    if not content_html:
        return []

    parts = re.split(r"</?p[^>]*>", content_html)
    paragraphs = []
    for part in parts:
        text = part.strip()
        if text and not text.startswith("<") and not text.startswith("</"):
            paragraphs.append(text)

    if paragraphs:
        return paragraphs
    return [line.strip() for line in content_html.splitlines() if line.strip()]


async def fetch_json(
    client: httpx.AsyncClient,
    url: str,
    params: dict,
    retries: int,
) -> dict:
    last_error = None
    for attempt in range(retries + 1):
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            last_error = exc
            if attempt < retries:
                await asyncio.sleep(min(2**attempt, 5))
    raise RuntimeError(f"请求失败: {url} {params} ({last_error})")


async def fetch_book_detail(
    client: httpx.AsyncClient,
    api_base: str,
    book_id: str,
    retries: int,
) -> dict:
    data = await fetch_json(
        client,
        f"{api_base}/api/detail",
        {"book_id": book_id},
        retries,
    )
    if data.get("code") != 200:
        return {}
    detail = data.get("data") or {}
    if isinstance(detail, dict) and isinstance(detail.get("data"), dict):
        return detail["data"]
    return detail


async def fetch_chapters(
    client: httpx.AsyncClient,
    api_base: str,
    book_id: str,
    retries: int,
) -> list[dict]:
    data = await fetch_json(
        client,
        f"{api_base}/api/book",
        {"book_id": book_id},
        retries,
    )
    if data.get("code") != 200:
        return []

    inner = ((data.get("data") or {}).get("data") or {})
    ids = inner.get("allItemIds") or []
    volumes = inner.get("chapterListWithVolume") or []
    chapters = []

    for volume in volumes:
        if isinstance(volume, list):
            for chapter in volume:
                chapters.append(
                    {
                        "id": chapter.get("itemId") or "",
                        "title": chapter.get("title") or "",
                    }
                )
        elif isinstance(volume, dict):
            for chapter in volume.get("chapterList") or []:
                chapters.append(
                    {
                        "id": chapter.get("chapterId") or chapter.get("itemId") or "",
                        "title": chapter.get("chapterTitle") or chapter.get("title") or "",
                    }
                )

    chapters = [chapter for chapter in chapters if chapter["id"]]
    if chapters:
        return chapters

    return [
        {"id": chapter_id, "title": f"第{index + 1}章"}
        for index, chapter_id in enumerate(ids)
        if chapter_id
    ]


async def fetch_chapter_content(
    client: httpx.AsyncClient,
    api_base: str,
    chapter_id: str,
    retries: int,
) -> dict:
    raw = await fetch_json(
        client,
        f"{api_base}/api/raw_full",
        {"item_id": chapter_id},
        retries,
    )
    if raw.get("code") == 200:
        data = raw.get("data") or {}
        paragraphs = parse_content_html(data.get("content") or "")
        return {
            "title": data.get("title") or "",
            "paragraphs": paragraphs,
            "author_speak": data.get("author_speak") or "",
        }

    fallback = await fetch_json(
        client,
        f"{api_base}/api/content",
        {"tab": "小说", "item_id": chapter_id},
        retries,
    )
    text = ((fallback.get("data") or {}).get("content") or "").strip()
    return {
        "title": "",
        "paragraphs": [line.strip() for line in text.splitlines() if line.strip()],
        "author_speak": "",
    }


async def download_book(args: argparse.Namespace) -> Path:
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    timeout = httpx.Timeout(args.timeout)
    async with httpx.AsyncClient(
        timeout=timeout,
        headers=DEFAULT_HEADERS,
        follow_redirects=True,
    ) as client:
        detail = await fetch_book_detail(client, args.api_base, args.book_id, args.retries)
        book_title = (
            detail.get("title")
            or detail.get("book_name")
            or detail.get("original_book_name")
            or args.book_id
        )
        author = detail.get("author") or detail.get("writer") or ""

        chapters = await fetch_chapters(client, args.api_base, args.book_id, args.retries)
        if args.limit:
            chapters = chapters[: args.limit]
        if not chapters:
            raise RuntimeError("未获取到章节目录")

        downloaded = []
        failed = []
        total = len(chapters)
        for index, chapter in enumerate(chapters, 1):
            title = chapter.get("title") or f"第{index}章"
            print(f"[{index}/{total}] {title}", flush=True)
            try:
                content = await fetch_chapter_content(
                    client,
                    args.api_base,
                    chapter["id"],
                    args.retries,
                )
                downloaded.append(
                    {
                        "title": content.get("title") or title,
                        "paragraphs": content.get("paragraphs") or [],
                        "author_speak": content.get("author_speak") or "",
                    }
                )
            except Exception as exc:
                failed.append((index, title, str(exc)))
                downloaded.append(
                    {
                        "title": title,
                        "paragraphs": [],
                        "author_speak": "",
                        "failed": True,
                    }
                )

        txt = build_txt_content(book_title, author, downloaded)
        output_path = output_dir / safe_txt_filename(book_title)
        output_path.write_text(txt, encoding="utf-8")

        print(f"已保存: {output_path}")
        if failed:
            print("失败章节:")
            for index, title, error in failed:
                print(f"  {index}. {title} - {error}")
        return output_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="下载番茄小说全文并保存为 txt")
    parser.add_argument("book_id", help="书籍 ID")
    parser.add_argument(
        "-o",
        "--output",
        default="downloads",
        help="输出目录，默认 downloads",
    )
    parser.add_argument(
        "--api-base",
        default=COMMUNITY_API,
        help=f"上游 API 地址，默认 {COMMUNITY_API}",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=2,
        help="单次请求失败后的重试次数，默认 2",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="请求超时时间秒数，默认 30",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="只下载前 N 章，调试用；默认 0 表示全部",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        asyncio.run(download_book(args))
    except KeyboardInterrupt:
        print("已取消")
        return 130
    except Exception as exc:
        print(f"下载失败: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
