const API = '';
const TABS = [{id:3,name:'小说'},{id:2,name:'听书'},{id:8,name:'漫画'},{id:11,name:'短剧'}];
const FALLBACK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='100'%3E%3Crect fill='%23ddd' width='72' height='100'/%3E%3Ctext x='36' y='52' text-anchor='middle' fill='%23999' font-size='11'%3E无封面%3C/text%3E%3C/svg%3E";

const THEMES = [
  { id: 'default', name: '默认', icon: 'sun' },
  { id: 'sepia', name: '羊皮纸', icon: 'scroll-text' },
  { id: 'green', name: '护眼', icon: 'leaf' },
  { id: 'dark', name: '夜间', icon: 'moon' },
];

const FONTS = [
  { id: 'sans', name: '黑体', family: '-apple-system, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { id: 'serif', name: '宋体', family: '"Noto Serif SC", "Songti SC", "SimSun", Georgia, serif' },
  { id: 'kai', name: '楷体', family: '"KaiTi", "STKaiti", "Noto Serif SC", serif' },
];

function $(id) { return document.getElementById(id); }
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

// ---- IndexedDB ----
let dbInstance = null;
function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('fanqie-reader', 1);
    req.onupgradeneeded = e => { e.target.result.createObjectStore('content', { keyPath: 'id' }); };
    req.onsuccess = e => { dbInstance = e.target.result; resolve(dbInstance); };
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('content', 'readonly');
      const req = tx.objectStore('content').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.val : null);
      req.onerror = () => reject(req.error);
    });
  } catch(e) { return null; }
}
async function idbPut(key, val) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('content', 'readwrite');
      tx.objectStore('content').put({ id: key, val });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch(e) {}
}

// ---- Time ----
function formatTime(ts) {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function timeAgo(ts) {
  if (!ts || ts === '0') return '';
  const d = new Date(ts * 1000), diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 0) return formatTime(ts);
  if (diff < 3600) return Math.floor(diff/60) + '分钟前';
  if (diff < 86400) return Math.floor(diff/3600) + '小时前';
  if (diff < 259200) return Math.floor(diff/86400) + '天前';
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---- Theme (4 modes, system auto) ----
function getTheme() { return localStorage.getItem('readerTheme') || 'auto'; }
function initTheme() {
  const saved = getTheme();
  if (saved === 'auto') applyTheme('auto');
  else applyTheme(saved);
}
function applyTheme(themeId) {
  document.body.classList.remove('theme-default', 'theme-sepia', 'theme-green', 'theme-dark');
  let appliedId = themeId;
  if (themeId === 'auto') {
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.classList.add(sysDark ? 'theme-dark' : 'theme-default');
    localStorage.setItem('readerTheme', 'auto');
    appliedId = sysDark ? 'dark' : 'default';
  } else {
    document.body.classList.add('theme-' + themeId);
    localStorage.setItem('readerTheme', themeId);
  }
  const btn = $('themeBtn');
  if (btn) {
    const iconName = themeId === 'auto' ? 'monitor' : (THEMES.find(x => x.id === themeId) || THEMES[0]).icon;
    btn.innerHTML = `<i data-lucide="${iconName}" width="16" height="16"></i>`;
    lucide.createIcons({ nodes: [btn] });
  }
  // Update swatch active states in reader toolbars
  document.querySelectorAll('.bg-swatch').forEach(s => {
    s.classList.toggle('active', s.classList.contains('swatch-' + appliedId));
  });
}
function toggleTheme() {
  const cur = getTheme();
  const ALL = ['auto', ...THEMES.map(t => t.id)];
  const idx = ALL.indexOf(cur);
  const next = ALL[(idx + 1) % ALL.length];
  applyTheme(next);
  const label = $('themeLabel');
  if (label) label.textContent = next === 'auto' ? '自动' : (THEMES.find(t => t.id === next) || THEMES[0]).name;
}

// ---- Font family ----
function getFont() { return localStorage.getItem('readerFont') || 'sans'; }
function changeFont(fontId) {
  localStorage.setItem('readerFont', fontId);
  applyFont();
  const label = $('fontLabel');
  if (label) label.textContent = (FONTS.find(f => f.id === fontId) || FONTS[0]).name;
  readerSettingsChanged();
}
function applyFont() {
  const f = FONTS.find(x => x.id === getFont()) || FONTS[0];
  document.documentElement.style.setProperty('--reader-font-family', f.family);
}

// ---- Font size ----
function getFontSize() { return parseInt(localStorage.getItem('fontSize') || '17'); }
function changeFontSize(d) {
  const sz = Math.max(14, Math.min(28, getFontSize() + d));
  localStorage.setItem('fontSize', sz);
  document.documentElement.style.setProperty('--reader-font-size', sz + 'px');
  const el = $('fontSizeLabel');
  if (el) el.textContent = sz;
  const sl = $('fontSizeSlider');
  if (sl) sl.value = sz;
  readerSettingsChanged();
}
function changeFontSizeTo(sz) {
  sz = Math.max(14, Math.min(28, parseInt(sz)));
  localStorage.setItem('fontSize', sz);
  document.documentElement.style.setProperty('--reader-font-size', sz + 'px');
  const el = $('fontSizeLabel');
  if (el) el.textContent = sz;
  readerSettingsChanged();
}

// ---- Line height ----
function getLineHeight() { return parseFloat(localStorage.getItem('lineHeight') || '1.85'); }
function changeLineHeight(d) {
  const lh = Math.round((getLineHeight() + d) * 10) / 10;
  if (lh < 1.4 || lh > 2.4) return;
  localStorage.setItem('lineHeight', lh);
  document.documentElement.style.setProperty('--reader-line-height', lh);
  const el = $('lineHeightLabel');
  if (el) el.textContent = lh.toFixed(1);
  const sl = $('lineHeightSlider');
  if (sl) sl.value = Math.round(lh * 10);
  readerSettingsChanged();
}
function changeLineHeightTo(lh) {
  lh = Math.round(lh * 10) / 10;
  if (lh < 1.4 || lh > 2.4) return;
  localStorage.setItem('lineHeight', lh);
  document.documentElement.style.setProperty('--reader-line-height', lh);
  const el = $('lineHeightLabel');
  if (el) el.textContent = lh.toFixed(1);
  readerSettingsChanged();
}

// ---- Read mode (scroll / page) ----
function getReadMode() { return localStorage.getItem('readMode') || 'page'; }
function setReadMode(mode) { localStorage.setItem('readMode', mode); }
function cycleReadMode() {
  const next = getReadMode() === 'scroll' ? 'page' : 'scroll';
  setReadMode(next);
  window.dispatchEvent(new CustomEvent('read-mode-change'));
}
function readerSettingsChanged() { window.dispatchEvent(new CustomEvent('reader-settings-change')); }

// ---- Debounce ----
function debounce(fn, ms) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}

// ---- localStorage data ----
function loadData() {
  return {
    shelf: JSON.parse(localStorage.getItem('shelf') || '[]'),
    searchHistory: JSON.parse(localStorage.getItem('searchHistory') || '[]'),
    readingHistory: JSON.parse(localStorage.getItem('readingHistory') || 'null'),
    stats: JSON.parse(localStorage.getItem('stats') || '{"chaptersRead":0,"readSet":[]}'),
  };
}
function saveShelf(shelf) { localStorage.setItem('shelf', JSON.stringify(shelf)); }
function saveSearchHistory(h) { localStorage.setItem('searchHistory', JSON.stringify(h)); }
function saveReadingHistory(rh) { localStorage.setItem('readingHistory', JSON.stringify(rh)); }
function saveStats(s) { localStorage.setItem('stats', JSON.stringify(s)); }

function isInShelf(bookId) {
  return loadData().shelf.some(b => b.bookId === bookId);
}
function toggleShelf(bookId, name, author, thumb) {
  const data = loadData();
  const i = data.shelf.findIndex(b => b.bookId === bookId);
  if (i >= 0) data.shelf.splice(i, 1);
  else data.shelf.unshift({ bookId, name, author, thumb, addedAt: Date.now() });
  saveShelf(data.shelf);
  return i < 0;
}

// ---- Image viewer ----
function openImageViewer(src) {
  const ov = $('imgViewer');
  $('imgViewerContent').src = src;
  ov.classList.add('open');
}
function closeImageViewer() { $('imgViewer').classList.remove('open'); }

// ---- Progress bar ----
function updateProgress() {
  const st = window.scrollY, dh = document.documentElement.scrollHeight - window.innerHeight;
  const pct = dh > 0 ? Math.min(100, Math.round(st / dh * 100)) : 0;
  const bar = $('readProgress');
  if (bar) bar.style.width = pct + '%';
  const el = $('progressText');
  if (el) el.textContent = pct + '%';
  return pct;
}

// ---- Share ----
async function shareLink(title, url) {
  const fullUrl = location.origin + url;
  if (navigator.share) {
    try { await navigator.share({ title, url: fullUrl }); } catch(e) {}
  } else if (navigator.clipboard) {
    try { await navigator.clipboard.writeText(fullUrl); showToast('链接已复制'); } catch(e) { showToast('复制失败'); }
  } else {
    showToast('不支持分享');
  }
}

// ---- Toast ----
function showToast(msg) {
  let el = $('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 20px;border-radius:20px;font-size:13px;z-index:600;opacity:0;transition:opacity 0.3s';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.style.opacity = '0', 2000);
}

// ---- Skeleton ----
function skeletonHtml(count) {
  let h = '<div class="skeleton-list">';
  for (let i = 0; i < (count||5); i++) {
    h += '<div class="skeleton-card"><div class="skeleton-cover"></div><div class="skeleton-info"><div class="skeleton-line w80"></div><div class="skeleton-line w50"></div><div class="skeleton-line w90"></div><div class="skeleton-line w60"></div></div></div>';
  }
  h += '</div>';
  return h;
}
function loadingHtml(msg) { return `<div class="loading view">${msg || '加载中...'}</div>`; }
function errorHtml(msg, retryHash) { return `<div class="error view">${msg}<br><button class="error-retry" onclick="navigate('${retryHash}')">重试</button></div>`; }

// ---- Lucide icon refresh ----
// Call after any dynamic innerHTML that contains data-lucide elements
function refreshIcons(root) {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons(root ? { nodes: [root] } : undefined);
  }
}
