import argparse
import asyncio
import html
import re
import uuid
import zipfile
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


def safe_filename_stem(name: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]+', "", name or "").strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned or "book"


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


def xhtml_page(title: str, body: str) -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<!DOCTYPE html>\n'
        '<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">\n'
        "<head>\n"
        f"  <title>{html.escape(title)}</title>\n"
        '  <link rel="stylesheet" type="text/css" href="style.css"/>\n'
        "</head>\n"
        f"<body>\n{body}\n</body>\n"
        "</html>\n"
    )


def chapter_xhtml(chapter: dict, index: int) -> str:
    title = chapter.get("title") or f"第{index}章"
    parts = [f"<h1>{html.escape(title)}</h1>"]
    paragraphs = chapter.get("paragraphs") or []
    if paragraphs:
        for paragraph in paragraphs:
            text = str(paragraph).strip()
            if text:
                parts.append(f"<p>{html.escape(text)}</p>")
    else:
        parts.append("<p>[本章暂无正文]</p>")
    author_speak = str(chapter.get("author_speak") or "").strip()
    if author_speak:
        parts.append(f'<p class="author-speak">作者说：{html.escape(author_speak)}</p>')
    if chapter.get("failed"):
        parts.append('<p class="failed">[本章下载失败]</p>')
    return xhtml_page(title, "\n".join(parts))


def build_epub_content(book_title: str, author: str, chapters: list[dict]) -> dict[str, bytes | str]:
    book_uuid = str(uuid.uuid5(uuid.NAMESPACE_URL, f"fanqie:{book_title}:{author}"))
    escaped_title = html.escape(book_title or "未知书名")
    escaped_author = html.escape(author or "未知作者")
    css = """
body {
  font-family: "Noto Serif CJK SC", "Songti SC", "SimSun", serif;
  line-height: 1.9;
  margin: 0 6%;
}
h1 {
  font-size: 1.4em;
  margin: 1.2em 0 1em;
  text-align: center;
}
p {
  margin: 0.85em 0;
  text-indent: 2em;
}
.author-speak, .failed {
  color: #666;
  font-style: italic;
}
nav ol {
  line-height: 1.8;
}
""".strip()
    manifest_items = [
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="style" href="style.css" media-type="text/css"/>',
    ]
    spine_items = []
    nav_items = []
    files: dict[str, bytes | str] = {
        "mimetype": "application/epub+zip",
        "META-INF/container.xml": (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
            '  <rootfiles><rootfile full-path="EPUB/package.opf" '
            'media-type="application/oebps-package+xml"/></rootfiles>\n'
            "</container>\n"
        ),
        "EPUB/style.css": css,
    }

    for index, chapter in enumerate(chapters, 1):
        chapter_id = f"chapter-{index}"
        href = f"chapter-{index}.xhtml"
        title = chapter.get("title") or f"第{index}章"
        manifest_items.append(
            f'<item id="{chapter_id}" href="{href}" media-type="application/xhtml+xml"/>'
        )
        spine_items.append(f'<itemref idref="{chapter_id}"/>')
        nav_items.append(f'<li><a href="{href}">{html.escape(title)}</a></li>')
        files[f"EPUB/{href}"] = chapter_xhtml(chapter, index)

    files["EPUB/nav.xhtml"] = xhtml_page(
        "目录",
        (
            f"<h1>{escaped_title}</h1>\n"
            '<nav epub:type="toc" id="toc" xmlns:epub="http://www.idpf.org/2007/ops">\n'
            "<h2>目录</h2>\n"
            f"<ol>{''.join(nav_items)}</ol>\n"
            "</nav>"
        ),
    )
    files["EPUB/package.opf"] = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">\n'
        "  <metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n"
        f'    <dc:identifier id="bookid">urn:uuid:{book_uuid}</dc:identifier>\n'
        f"    <dc:title>{escaped_title}</dc:title>\n"
        f"    <dc:creator>{escaped_author}</dc:creator>\n"
        '    <dc:language>zh-CN</dc:language>\n'
        "  </metadata>\n"
        f"  <manifest>{''.join(manifest_items)}</manifest>\n"
        f"  <spine>{''.join(spine_items)}</spine>\n"
        "</package>\n"
    )
    return files


def write_epub(output_path: Path, book_title: str, author: str, chapters: list[dict]) -> None:
    files = build_epub_content(book_title, author, chapters)
    with zipfile.ZipFile(output_path, "w") as epub:
        epub.writestr(
            zipfile.ZipInfo("mimetype"),
            files.pop("mimetype"),
            compress_type=zipfile.ZIP_STORED,
        )
        for name, content in files.items():
            epub.writestr(name, content, compress_type=zipfile.ZIP_DEFLATED)


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

        concurrency = max(1, args.concurrency)
        semaphore = asyncio.Semaphore(concurrency)
        downloaded = [None] * len(chapters)
        failed = []
        total = len(chapters)

        async def download_one(index: int, chapter: dict) -> None:
            title = chapter.get("title") or f"第{index}章"
            print(f"[{index}/{total}] 开始 {title}", flush=True)
            try:
                async with semaphore:
                    content = await fetch_chapter_content(
                        client,
                        args.api_base,
                        chapter["id"],
                        args.retries,
                    )
                downloaded[index - 1] = (
                    {
                        "title": content.get("title") or title,
                        "paragraphs": content.get("paragraphs") or [],
                        "author_speak": content.get("author_speak") or "",
                    }
                )
                print(f"[{index}/{total}] 完成 {title}", flush=True)
            except Exception as exc:
                failed.append((index, title, str(exc)))
                downloaded[index - 1] = (
                    {
                        "title": title,
                        "paragraphs": [],
                        "author_speak": "",
                        "failed": True,
                    }
                )
                print(f"[{index}/{total}] 失败 {title}: {exc}", flush=True)

        print(f"开始下载 {total} 章，并发数 {concurrency}", flush=True)
        await asyncio.gather(
            *(download_one(index, chapter) for index, chapter in enumerate(chapters, 1))
        )

        downloaded_chapters = [chapter for chapter in downloaded if chapter]
        if args.format == "epub":
            output_path = output_dir / f"{safe_filename_stem(book_title)}.epub"
            write_epub(output_path, book_title, author, downloaded_chapters)
        else:
            txt = build_txt_content(book_title, author, downloaded_chapters)
            output_path = output_dir / safe_txt_filename(book_title)
            output_path.write_text(txt, encoding="utf-8")

        print(f"已保存: {output_path}")
        if failed:
            print("失败章节:")
            for index, title, error in failed:
                print(f"  {index}. {title} - {error}")
        return output_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="下载番茄小说全文并保存为 txt 或 epub")
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
    parser.add_argument(
        "--concurrency",
        type=int,
        default=10,
        help="并发下载章节数，默认 10",
    )
    parser.add_argument(
        "--format",
        choices=("txt", "epub"),
        default="txt",
        help="输出格式，默认 txt",
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
