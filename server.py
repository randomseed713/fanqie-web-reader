import json

import httpx
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator:
    yield
    await client.aclose()


app = FastAPI(title="Fanqie Web Reader", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COMMUNITY_API = "http://101.35.133.34:5000"

client: httpx.AsyncClient = httpx.AsyncClient(
    timeout=30.0,
    headers={
        "User-Agent": "Mozilla/5.0 (Linux; Android 9; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    },
    follow_redirects=True,
)

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def index():
    return FileResponse("static/index.html")


@app.get("/api/search")
async def search(key: str = Query(...), tab_type: int = 3, offset: int = 0):
    try:
        r = await client.get(
            f"{COMMUNITY_API}/api/search",
            params={"key": key, "tab_type": tab_type, "offset": offset},
        )
        data = r.json()
        if data.get("code") == 200:
            raw = data.get("data", {})
            if isinstance(raw, dict):
                tabs = raw.get("search_tabs", [])
                books = []
                for tab in tabs:
                    if not tab or not isinstance(tab, dict):
                        continue
                    items = tab.get("data", [])
                    if not items:
                        continue
                    for item in items:
                        if not item or not isinstance(item, dict):
                            continue
                        bd_raw = item.get("book_data")
                        if not bd_raw or not isinstance(bd_raw, list):
                            continue
                        bd = bd_raw[0] if bd_raw else {}
                        if not bd or not isinstance(bd, dict):
                            continue
                        bid = bd.get("book_id", "")
                        if bid:
                            stat = bd.get("creation_status", "")
                            status_map = {"1": "连载中", "0": "已完结"}
                            books.append({
                                "BookID": bid,
                                "Name": bd.get("book_name", ""),
                                "Author": bd.get("author", ""),
                                "Desc": bd.get("abstract", ""),
                                "ThumbUrl": bd.get("thumb_url", bd.get("audio_thumb_uri", "")),
                                "ChapterCount": bd.get("chapter_number", ""),
                                "Category": bd.get("category", ""),
                                "Score": bd.get("score", ""),
                                "WordCount": bd.get("word_number", 0),
                                "Status": status_map.get(str(stat), ""),
                                "Tags": bd.get("tags", ""),
                                "ReadCount": bd.get("read_count", 0),
                            })
                if books:
                    return {"code": 200, "data": books, "msg": "success"}
    except Exception as e:
        print(f"DEBUG search ERROR: {e}")
    return {"code": 200, "data": [], "msg": "no results"}


@app.get("/api/chapters")
async def chapters(book_id: str = Query(...)):
    try:
        r = await client.get(
            f"{COMMUNITY_API}/api/book",
            params={"book_id": book_id},
        )
        data = r.json()
        if data.get("code") == 200:
            outer = data.get("data", {})
            inner = outer.get("data", {})
            ids = inner.get("allItemIds", [])
            vols = inner.get("chapterListWithVolume", [])
            vol_names = inner.get("volumeNameList", [])

            result = []
            for vi, vol in enumerate(vols):
                if isinstance(vol, list):
                    for ch in vol:
                        result.append({
                            "ChapterID": ch.get("itemId", ""),
                            "Name": ch.get("title", ""),
                            "Order": ch.get("realChapterOrder", ""),
                            "UpdateTime": ch.get("firstPassTime", 0),
                        })
                elif isinstance(vol, dict):
                    ch_list = vol.get("chapterList", [])
                    for ch in ch_list:
                        result.append({
                            "ChapterID": ch.get("chapterId", ch.get("itemId", "")),
                            "Name": ch.get("chapterTitle", ch.get("title", "")),
                            "UpdateTime": ch.get("firstPassTime", ch.get("publishTime", 0)),
                        })

            if result:
                return {"code": 200, "data": result, "msg": "success", "total": len(result)}

            if ids:
                result = [{"ChapterID": cid, "Name": f"第{i+1}章"} for i, cid in enumerate(ids)]
                return {"code": 200, "data": result, "msg": "success", "total": len(result)}
    except Exception:
        pass
    return {"code": 200, "data": [], "msg": "no chapters"}


@app.get("/api/content")
async def content(chapter_id: str = Query(...)):
    try:
        r = await client.get(
            f"{COMMUNITY_API}/api/raw_full",
            params={"item_id": chapter_id},
        )
        data = r.json()
        if data.get("code") == 200:
            raw = data.get("data", {})
            content_html = raw.get("content", "")
            author_speak = raw.get("author_speak", "")
            title = raw.get("title", "")
            paragraphs = []
            if content_html:
                import re
                parts = re.split(r'</?p[^>]*>', content_html)
                for p in parts:
                    p = p.strip()
                    if p and not p.startswith('<') and not p.startswith('</'):
                        paragraphs.append(p)
            if not paragraphs and content_html:
                paragraphs = [l for l in content_html.split('\n') if l.strip()]

            return {
                "code": 200,
                "data": {
                    "ChapterID": chapter_id,
                    "Title": title,
                    "Paragraphs": paragraphs,
                    "AuthorSpeak": author_speak,
                },
                "msg": "success",
            }

        r = await client.get(
            f"{COMMUNITY_API}/api/content",
            params={"tab": "小说", "item_id": chapter_id},
        )
        data = r.json()
        if data.get("code") == 200:
            text = data.get("data", {}).get("content", "")
            if text:
                paragraphs = [l for l in text.split('\n') if l.strip()]
                return {
                    "code": 200,
                    "data": {
                        "ChapterID": chapter_id,
                        "Paragraphs": paragraphs,
                        "AuthorSpeak": "",
                    },
                    "msg": "success",
                }
    except Exception:
        pass

    return JSONResponse(
        status_code=503,
        content={"code": 503, "msg": "Content unavailable"},
    )


@app.get("/api/detail")
async def detail(book_id: str = Query(...)):
    try:
        r = await client.get(
            f"{COMMUNITY_API}/api/detail",
            params={"book_id": book_id},
        )
        data = r.json()
        if data.get("code") == 200:
            return data
    except Exception:
        pass
    return {"code": 200, "data": {}, "msg": "no detail"}


@app.get("/api/comments")
async def comments(
    book_id: str = Query(...),
    chapter_id: str = Query(default=""),
    offset: int = 0,
    count: int = 20,
):
    try:
        params = {"book_id": book_id, "offset": offset, "count": count}
        if chapter_id:
            params["chapter_id"] = chapter_id
        r = await client.get(
            f"{COMMUNITY_API}/api/comment",
            params=params,
        )
        data = r.json()
        if data.get("code") == 200:
            return data
    except Exception:
        pass
    return {"code": 200, "data": [], "msg": "no comments"}


@app.get("/api/paragraph_comments")
async def paragraph_comments(
    chapter_id: str = Query(...),
    paragraph_idx: int = Query(default=0),
    page: int = 1,
    page_size: int = 20,
):
    try:
        r = await client.get(
            f"{COMMUNITY_API}/api/paragraph_comment",
            params={
                "chapter_id": chapter_id,
                "paragraph_idx": paragraph_idx,
                "page": page,
                "page_size": page_size,
            },
        )
        data = r.json()
        if data.get("code") == 200:
            return data
    except Exception:
        pass
    return {"code": 200, "data": [], "msg": "no paragraph comments"}


@app.get("/api/paragraph_comment_counts")
async def paragraph_comment_counts(chapter_id: str = Query(...)):
    try:
        r = await client.get(
            f"{COMMUNITY_API}/api/paragraph_comment_count",
            params={"chapter_id": chapter_id},
        )
        data = r.json()
        if data.get("code") == 200:
            return data
    except Exception:
        pass
    return {"code": 200, "data": {}, "msg": "success"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8080, reload=False)
