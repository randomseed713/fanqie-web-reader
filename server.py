import asyncio
import hashlib
import json
import os
import time
import uuid

import httpx
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import Body, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator:
    yield
    await client.aclose()
    await _fanqie_client.aclose()


app = FastAPI(title="Fanqie Web Reader", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COMMUNITY_API = "http://101.35.133.34:5000"
FANQIE_API = "https://api5-normal-sinfonlinec.fqnovel.com"
UNIDBG_API = os.environ.get("UNIDBG_API", "http://127.0.0.1:8099")  # unidbg signing proxy (docker: http://unidbg:8099)
PARA_COMMENT_MOCK = os.environ.get("PARA_COMMENT_MOCK", "true").lower() in ("true", "1", "yes")

client: httpx.AsyncClient = httpx.AsyncClient(
    timeout=30.0,
    headers={
        "User-Agent": "Mozilla/5.0 (Linux; Android 9; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    },
    follow_redirects=True,
)

# Fanqie official API client for paragraph comments (used when unidbg is available)
_fanqie_client: httpx.AsyncClient = httpx.AsyncClient(
    timeout=30.0,
    headers={
        "User-Agent": "com.dragon.read/6.5.3.32.3 (Android 9)",
        "Content-Type": "application/json",
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
                has_more = any(
                    t.get("has_more") for t in tabs if isinstance(t, dict)
                )
                books = _extract_books_from_tabs(tabs)
                if books:
                    return {"code": 200, "data": books, "has_more": has_more, "msg": "success"}
    except Exception as e:
        print(f"DEBUG search ERROR: {e}")
    return {"code": 200, "data": [], "msg": "no results"}


def _extract_books_from_tabs(tabs: list) -> list:
    """Extract normalized book dicts from upstream search_tabs."""
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
    return books


@app.get("/api/author_books")
async def author_books(author_id: str = Query(...)):
    """Fetch all books by a specific author via official Fanqie API."""
    try:
        r = await client.get(
            "https://api5-normal-sinfonlinec.fqnovel.com/reading/user/basic_info/get/v",
            params={"user_id": author_id, "aid": "1967", "version_code": "65532"},
            headers={"User-Agent": "com.dragon.read/6.5.3.32.3 (Android 9)"},
        )
        data = r.json()
        if data.get("code") != 0:
            return {"code": 200, "data": [], "msg": "no results"}

        author_data = data.get("data", {})
        # praise_book_list contains ALL books; author_book_info may be truncated
        raw_books = author_data.get("praise_info", {}).get("praise_book_list", [])
        if not raw_books:
            raw_books = author_data.get("author_book_info", [])
        status_map = {"1": "连载中", "0": "已完结"}
        books = []
        for bd in raw_books:
            if not bd or not isinstance(bd, dict):
                continue
            bid = bd.get("book_id", "")
            if bid:
                stat = str(bd.get("creation_status", ""))
                books.append({
                    "BookID": bid,
                    "Name": bd.get("book_name", ""),
                    "ShortName": bd.get("book_short_name", ""),
                    "Author": bd.get("author", ""),
                    "Desc": bd.get("abstract", ""),
                    "ThumbUrl": bd.get("thumb_url", bd.get("audio_thumb_uri", "")),
                    "ChapterCount": bd.get("serial_count", ""),
                    "Category": bd.get("category", ""),
                    "Score": bd.get("score", ""),
                    "WordCount": bd.get("word_number", 0),
                    "Status": status_map.get(stat, ""),
                    "Tags": bd.get("tags", ""),
                    "ReadCount": bd.get("read_count", 0),
                    "ReadCountText": bd.get("read_cnt_text", ""),
                })

        result = {
            "code": 200,
            "data": books,
            "author_name": author_data.get("user_name", ""),
            "author_avatar": author_data.get("user_avatar", ""),
            "author_desc": author_data.get("description", ""),
            "author_fans": author_data.get("fans_num", 0),
            "author_book_num": author_data.get("author_book_num", len(books)),
            "is_author": author_data.get("is_author", False),
            "msg": "success",
        }
        return result
    except Exception as e:
        print(f"DEBUG author_books ERROR: {e}")
    return {"code": 200, "data": [], "msg": "error"}


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


@app.post("/api/paragraph_comment_counts")
async def paragraph_comment_counts(request_body: dict = Body(default={})):
    """Get paragraph comment counts. Mock mode for local dev, unidbg proxy for production."""
    body = request_body or {}
    chapter_id = body.get("chapter_id", "")
    if not chapter_id:
        return {"code": 400, "data": {}, "msg": "chapter_id required"}

    if PARA_COMMENT_MOCK:
        return {"code": 200, "data": _mock_para_counts(chapter_id), "msg": "success (mock)"}

    try:
        r = await _fanqie_client.post(
            f"{UNIDBG_API}/api/fqcomment/idea",
            json={"chapterId": chapter_id, "commentSource": 2, "serverChannel": 17},
            timeout=15.0,
        )
        data = r.json()
        print(f"DEBUG paragraph_comment_counts raw response (first 500 chars): {json.dumps(data, ensure_ascii=False)[:500]}")
        counts = _extract_para_counts(data)
        return {"code": 200, "data": counts, "msg": "success"}
    except Exception as e:
        print(f"DEBUG paragraph_comment_counts ERROR: {type(e).__name__}: {e}")
    return {"code": 200, "data": {}, "msg": "no data"}


@app.get("/api/debug/unidbg")
async def debug_unidbg():
    """Debug endpoint to test unidbg connectivity."""
    try:
        r = await _fanqie_client.get(f"{UNIDBG_API}/", timeout=5.0)
        return {"status": "ok", "unidbg_api": UNIDBG_API, "status_code": r.status_code, "body_preview": r.text[:200]}
    except Exception as e:
        return {"status": "error", "unidbg_api": UNIDBG_API, "error": f"{type(e).__name__}: {e}"}


def _mock_para_counts(chapter_id: str) -> dict:
    """Generate mock paragraph comment counts for local development."""
    # Deterministic mock: spread comments across a few paragraphs based on chapter_id hash
    seed = int(hashlib.md5(chapter_id.encode()).hexdigest()[:8], 16)
    counts = {}
    # Put comments on paragraphs 0, 3, 7, 12 with varying counts
    positions = [0, 3, 7, 12]
    for i, pos in enumerate(positions):
        cnt = (seed >> (i * 4) & 0xF) % 8 + 1  # 1-8 comments
        counts[str(pos)] = cnt
    return counts


def _extract_para_counts(raw) -> dict:
    """Extract {para_index: count} mapping from various API response formats."""
    # Try object-map forms: {"0": {"count": 3}, ...}
    def _from_obj(obj):
        out = {}
        for k, v in obj.items():
            try:
                idx = int(k)
            except (ValueError, TypeError):
                continue
            if isinstance(v, dict):
                cnt = v.get("count") or v.get("comment_count") or 0
                if isinstance(cnt, (int, float)) and cnt > 0:
                    out[str(idx)] = cnt
            elif isinstance(v, (int, float)) and v > 0:
                out[str(idx)] = v
        return out

    # Try array forms: [{"para_index": 0, "count": 3}, ...]
    def _from_array(arr):
        out = {}
        for item in arr:
            if not isinstance(item, dict):
                continue
            idx = item.get("para_index") or item.get("para_idx") or item.get("index") or 0
            cnt = item.get("count") or item.get("comment_count") or 0
            try:
                idx = int(idx)
                cnt = int(cnt)
            except (ValueError, TypeError):
                continue
            if idx >= 0 and cnt > 0:
                out[str(idx)] = cnt
        return out

    # Try nested structures
    candidates_obj = [raw]
    if isinstance(raw, dict):
        candidates_obj.append(raw.get("data"))
        candidates_obj.append(raw.get("paras"))
        if isinstance(raw.get("data"), dict):
            candidates_obj.append(raw["data"].get("data"))
            candidates_obj.append(raw["data"].get("paras"))

    for obj in candidates_obj:
        if isinstance(obj, dict) and obj:
            result = _from_obj(obj)
            if result:
                return result

    candidates_arr = []
    if isinstance(raw, dict):
        for key in ["data_list", "list", "idea_list", "ideas"]:
            candidates_arr.append(raw.get(key))
        if isinstance(raw.get("data"), dict):
            for key in ["data_list", "list"]:
                candidates_arr.append(raw["data"].get(key))
        if isinstance(raw.get("detail"), dict):
            for key in ["data_list", "list"]:
                candidates_arr.append(raw["detail"].get(key))

    for arr in candidates_arr:
        if isinstance(arr, list) and arr:
            result = _from_array(arr)
            if result:
                return result

    return {}


@app.post("/api/paragraph_comments")
async def paragraph_comments(request_body: dict = Body(default={})):
    """Get paragraph comments. Mock mode for local dev, unidbg proxy for production."""
    body = request_body or {}
    chapter_id = body.get("chapter_id", "")
    book_id = body.get("book_id", "")
    paragraph_idx = body.get("paragraph_idx", 0)
    count = body.get("count", 20)
    if not chapter_id:
        return {"code": 400, "data": [], "msg": "chapter_id required"}

    if PARA_COMMENT_MOCK:
        return {"code": 200, "data": _mock_para_comments(chapter_id, paragraph_idx), "msg": "success (mock)"}

    try:
        r = await _fanqie_client.post(
            f"{UNIDBG_API}/api/fqcomment/list",
            json={
                "chapterId": chapter_id,
                "bookId": book_id,
                "paraIndex": paragraph_idx,
                "commentSource": 2,
                "commentType": 2,
                "serverChannel": 18,
                "groupType": 15,
                "sort": 2,
                "count": count,
            },
        )
        data = r.json()
        comments = _normalize_comments(data)
        return {"code": 200, "data": comments, "msg": "success"}
    except Exception as e:
        print(f"DEBUG paragraph_comments ERROR: {e}")
    return {"code": 200, "data": [], "msg": "no paragraph comments"}


def _mock_para_comments(chapter_id: str, paragraph_idx: int) -> list:
    """Generate mock paragraph comments for local development."""
    counts = _mock_para_counts(chapter_id)
    # Only return comments for paragraphs that have counts
    if str(paragraph_idx) not in counts:
        return []

    now = int(time.time())
    users = [
        {"name": "书虫小王", "avatar": "https://i.pravatar.cc/80?img=1"},
        {"name": "夜读人", "avatar": "https://i.pravatar.cc/80?img=2"},
        {"name": "墨染书香", "avatar": "https://i.pravatar.cc/80?img=3"},
        {"name": "浮生若梦", "avatar": "https://i.pravatar.cc/80?img=4"},
        {"name": "阅尽千帆", "avatar": "https://i.pravatar.cc/80?img=5"},
    ]
    texts = [
        "这段写得太好了，画面感十足！",
        "作者文笔真的不错，细腻入微",
        "看到这里忍不住笑出了声",
        "剧情转折好突然，完全没想到",
        "这段描写很真实，感同身受",
        "伏笔埋得好深，前面就有暗示了",
        "这角色塑造得很有层次感",
        "节奏把握得恰到好处，不拖沓",
    ]
    seed = int(hashlib.md5(f"{chapter_id}_{paragraph_idx}".encode()).hexdigest()[:8], 16)
    num_comments = (seed % 5) + 1  # 1-5 comments
    result = []
    for i in range(num_comments):
        user_idx = (seed + i) % len(users)
        text_idx = (seed + i * 3) % len(texts)
        comment = {
            "user_name": users[user_idx]["name"],
            "avatar_url": users[user_idx]["avatar"],
            "content": texts[text_idx],
            "create_time": now - (i + 1) * 3600 * ((seed % 24) + 1),
            "digg_count": (seed + i) % 50,
        }
        # Add image to some comments
        if i == 0 and seed % 4 == 0:
            comment["images"] = ["https://picsum.photos/seed/para{}_{}/300/200".format(paragraph_idx, i)]
        # Add a reply to the first comment sometimes
        if i == 0 and seed % 3 == 0:
            reply_user = users[(user_idx + 2) % len(users)]
            comment["reply_list"] = [
                {
                    "user_name": reply_user["name"],
                    "avatar_url": reply_user["avatar"],
                    "content": "同感！",
                    "create_time": comment["create_time"] + 1800,
                    "digg_count": 3,
                }
            ]
        result.append(comment)
    return result


def _normalize_comments(raw) -> list:
    """Normalize comment data from various API response formats."""
    # Try to extract reviews list from response
    reviews = []
    if isinstance(raw, dict):
        # Direct reviews array
        reviews = raw.get("reviews") or raw.get("list") or raw.get("data_list") or []
        # Nested under data
        if not reviews and isinstance(raw.get("data"), dict):
            d = raw["data"]
            reviews = d.get("reviews") or d.get("list") or d.get("data_list") or []
        # Nested under data.data
        if not reviews and isinstance(raw.get("data"), dict) and isinstance(raw["data"].get("data"), dict):
            d = raw["data"]["data"]
            reviews = d.get("reviews") or d.get("list") or d.get("data_list") or []
    elif isinstance(raw, list):
        reviews = raw

    if not reviews:
        return []

    result = []
    for item in reviews:
        if not isinstance(item, dict):
            continue
        # Extract user info
        user_info = item.get("user", {})
        user_name = ""
        avatar_url = ""
        if isinstance(user_info, dict):
            user_name = user_info.get("name") or user_info.get("nick_name") or ""
            avatar_url = user_info.get("avatar_url") or user_info.get("avatar") or user_info.get("head_url") or ""
        # Fallback to top-level user fields
        if not user_name:
            user_name = item.get("user_name") or item.get("nick_name") or "匿名"
        if not avatar_url:
            avatar_url = item.get("avatar_url") or item.get("avatar") or item.get("head_url") or ""

        text = item.get("text") or item.get("content") or ""
        digg_count = item.get("digg_count") or item.get("like_count") or 0
        # Handle timestamp
        ts = item.get("created_ts") or item.get("create_timestamp") or item.get("create_time") or 0
        if isinstance(ts, (int, float)) and ts > 1_000_000_000_000:
            ts = ts // 1000

        comment = {
            "user_name": user_name,
            "avatar_url": avatar_url,
            "content": text,
            "create_time": ts,
            "digg_count": digg_count,
        }

        # Handle images
        images = item.get("image_list") or item.get("pic_list") or item.get("images") or []
        if isinstance(images, str):
            images = [images]
        if images and isinstance(images, list):
            img_urls = []
            for img in images:
                if isinstance(img, str) and img:
                    img_urls.append(img)
                elif isinstance(img, dict):
                    url = img.get("url") or img.get("origin_url") or img.get("thumb_url") or ""
                    if url:
                        img_urls.append(url)
            if img_urls:
                comment["images"] = img_urls

        # Handle replies
        replies = item.get("reply_list") or item.get("replies") or []
        if replies and isinstance(replies, list):
            comment["reply_list"] = []
            for rc in replies[:5]:
                if not isinstance(rc, dict):
                    continue
                rc_user = rc.get("user_name") or rc.get("nick_name") or ""
                rc_avatar = ""
                if not rc_user and isinstance(rc.get("user"), dict):
                    rc_user = rc["user"].get("name") or ""
                    rc_avatar = rc["user"].get("avatar_url") or rc["user"].get("avatar") or ""
                if not rc_user:
                    rc_user = "匿名"
                if not rc_avatar:
                    rc_avatar = rc.get("avatar_url") or rc.get("avatar") or ""
                comment["reply_list"].append({
                    "user_name": rc_user,
                    "avatar_url": rc_avatar,
                    "content": rc.get("text") or rc.get("content") or "",
                    "create_time": rc.get("created_ts") or rc.get("create_timestamp") or 0,
                    "digg_count": rc.get("digg_count") or 0,
                })

        result.append(comment)
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8080, reload=False)
