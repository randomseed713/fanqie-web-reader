// ====== Cache (LRU + IndexedDB) ======
const cache = { detail: {}, content: new Map() };
const CONTENT_CACHE_MAX = 20;
const inflight = {};

function setContentCache(key, val) {
  if (cache.content.has(key)) cache.content.delete(key);
  cache.content.set(key, val);
  if (cache.content.size > CONTENT_CACHE_MAX) {
    const oldest = cache.content.keys().next().value;
    cache.content.delete(oldest);
  }
  idbPut(key, val);
}
function getContentCache(key) {
  if (cache.content.has(key)) {
    const v = cache.content.get(key);
    cache.content.delete(key); cache.content.set(key, v);
    return v;
  }
  return null;
}

// ====== Shared state ======
let currentChapterKey = null;
let currentBookId = null;
let currentChapterIdx = 0;
let autoNextObserver = null;
let appendedChapters = 0;

// ====== API fetchers (with dedup) ======
async function fetchDetail(bid) {
  if (cache.detail[bid]) return;
  if (inflight['d_'+bid]) return inflight['d_'+bid];
  const p = (async () => {
    try {
      const [dr, cr] = await Promise.all([
        fetch(`${API}/api/detail?book_id=${bid}`),
        fetch(`${API}/api/chapters?book_id=${bid}`),
      ]);
      const dd = await dr.json(), cd = await cr.json();
      const detail = dd.code===200 ? dd.data : null;
      const chapters = cd.code===200 ? (cd.data||[]) : [];
      let bookName='', bookAuthor='', bookThumb='';
      if (detail && detail.data) {
        bookName = detail.data.title || detail.data.book_name || '';
        bookAuthor = detail.data.author || detail.data.writer || '';
        bookThumb = detail.data.thumb_url || detail.data.audio_thumb_uri || '';
      }
      cache.detail[bid] = { detail, chapters, bookName, bookAuthor, bookThumb, comments: null };
    } catch(e) {
      cache.detail[bid] = { detail: null, chapters: [], bookName: '', bookAuthor: '', bookThumb: '', comments: null };
    }
  })();
  inflight['d_'+bid] = p;
  p.finally(() => delete inflight['d_'+bid]);
  return p;
}

async function fetchContent(chapterId) {
  if (getContentCache(chapterId)) return;
  if (inflight['c_'+chapterId]) return inflight['c_'+chapterId];
  const p = (async () => {
    try {
      const r = await fetch(`${API}/api/content?chapter_id=${chapterId}`);
      const data = await r.json();
      if (data.code===200) setContentCache(chapterId, { paragraphs: data.data.Paragraphs||[], authorSpeak: data.data.AuthorSpeak||'' });
      else setContentCache(chapterId, { paragraphs: [], authorSpeak: '' });
    } catch(e) { setContentCache(chapterId, { paragraphs: [], authorSpeak: '' }); }
  })();
  inflight['c_'+chapterId] = p;
  p.finally(() => delete inflight['c_'+chapterId]);
  return p;
}

async function fetchComments(bid) {
  if (cache.detail[bid] && cache.detail[bid].comments) return;
  if (inflight['cm_'+bid]) return inflight['cm_'+bid];
  const p = (async () => {
    try {
      const r = await fetch(`${API}/api/comments?book_id=${bid}&count=50`);
      const data = await r.json();
      let list = [];
      if (data.code===200 && data.data) { const o = data.data.data || data.data; list = o.comment || o; if (!Array.isArray(list)) list = []; }
      if (cache.detail[bid]) cache.detail[bid].comments = list;
    } catch(e) { if (cache.detail[bid]) cache.detail[bid].comments = []; }
  })();
  inflight['cm_'+bid] = p;
  p.finally(() => delete inflight['cm_'+bid]);
  return p;
}

// Smart preload: next 3 chapters + prev 1
function preloadAdjacent(bid, idx) {
  const ch = cache.detail[bid]; if (!ch) return;
  for (let i = 1; i <= 3; i++) {
    const ni = idx + i;
    if (ni < ch.chapters.length) {
      const id = ch.chapters[ni].ChapterID;
      if (!getContentCache(id)) fetchContent(id);
    }
  }
  if (idx > 0) { const id = ch.chapters[idx-1].ChapterID; if (!getContentCache(id)) fetchContent(id); }
}
