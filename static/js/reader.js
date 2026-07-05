// ====== Shared reader helpers ======
function renderParas(paras, authorSpeak) {
  let html = '';
  for (let pi = 0; pi < paras.length; pi++) {
    const text = paras[pi];
    if (!text) continue;
    const imgMatch = text.match(/^https?:\/\/\S+\.(jpg|jpeg|png|webp|gif)(\?\S*)?$/i);
    if (imgMatch) { html += `<img class="content-img" src="${text}">`; continue; }
    const innerImgs = text.match(/<img[^>]+src="([^"]+)"[^>]*>/gi);
    if (innerImgs) { innerImgs.forEach(imgTag => { const src = imgTag.match(/src="([^"]+)"/); if (src) html += `<img class="content-img" src="${src[1]}">`; }); continue; }
    html += `<div class="para-wrap"><p>${escapeHtml(text)}</p></div>`;
  }
  if (authorSpeak) html += `<div class="author-speak"><i data-lucide="message-circle" width="14" height="14"></i> 作者说：${escapeHtml(authorSpeak)}</div>`;
  return html;
}

function cycleFont() {
  const cur = getFont();
  const i = FONTS.findIndex(f => f.id === cur);
  changeFont(FONTS[(i+1)%FONTS.length].id);
}

function getDisplayTheme() {
  if (getTheme() === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default';
  return getTheme();
}

function saveReaderProgress(bid, idx, chapterId, chapterTitle, total) {
  const data = loadData();
  data.readingHistory = { bookId: bid, name: (cache.detail[bid]||{}).bookName||'', chapterIdx: idx, chapterName: chapterTitle, totalChapters: total, updatedAt: Date.now() };
  saveReadingHistory(data.readingHistory);
  if (!data.stats.readSet) data.stats.readSet = [];
  const csid = String(chapterId);
  if (!data.stats.readSet.includes(csid)) { data.stats.readSet.push(csid); data.stats.chaptersRead = data.stats.readSet.length; saveStats(data.stats); }
}

// ====== Reader state ======
let pg = { bid:'', idx:0, total:0, totalPages:1, curPage:0, animating:false, swipeStartX:0, swipeStartY:0, swipeStartTime:0, swipeActive:false, pages:[] };
let scrollState = { lastScrollY: 0, ticking: false };

// ====== Reader dispatcher ======
function renderReader(app, bid, idx) {
  const d = cache.detail[bid];
  if (!d) { app.innerHTML = errorHtml('加载失败', `reader?book_id=${bid}&chapter_idx=${idx}`); return; }
  const chapterId = d.chapters[idx].ChapterID;
  const c = getContentCache(chapterId);
  if (!c) { app.innerHTML = loadingHtml(); return; }
  if (getReadMode() === 'scroll') renderScrollReader(app, bid, idx);
  else renderPageReader(app, bid, idx);
}

// ====== Scroll Reader ======
function renderScrollReader(app, bid, idx) {
  const d = cache.detail[bid];
  const chapterId = d.chapters[idx].ChapterID;
  const c = getContentCache(chapterId);
  const paras = c.paragraphs;
  const total = d.chapters.length;
  const prevIdx = idx > 0 ? idx - 1 : -1;
  const nextIdx = idx < total - 1 ? idx + 1 : -1;
  const wc = paras.reduce((s,p) => s + (p||'').length, 0);
  const readMin = Math.max(1, Math.round(wc / 400));
  const chapterTitle = d.chapters[idx].Name || `第${idx+1}章`;

  currentChapterKey = chapterId;
  currentBookId = bid; currentChapterIdx = idx; appendedChapters = 0;
  saveReaderProgress(bid, idx, chapterId, chapterTitle, total);

  const dt = getDisplayTheme();
  const curFont = getFont();
  const curMode = getReadMode();
  const fontSize = getFontSize();
  const lineHeight = getLineHeight();

  app.innerHTML = `<div class="scroll-reader view" id="scrollReader">
    <div class="reader-chapter-info">
      <div class="reader-title">${escapeHtml(chapterTitle)}</div>
      <div class="reader-bookname">${escapeHtml(d.bookName)} · 第 ${idx+1}/${total} 章 · 约 ${readMin} 分钟</div>
    </div>
    <div class="reader-content" id="readerContent">${renderParas(paras, c.authorSpeak)}</div>
    <div class="chapter-end">· · ·</div>
    <div class="auto-next-indicator hidden" id="autoNextIndicator">正在加载下一章...</div>
    <div class="reader-nav">
      <button ${prevIdx>=0?`onclick="navigate('reader?book_id=${bid}&chapter_idx=${prevIdx}')"`:'disabled'}><i data-lucide="chevron-left" width="16" height="16"></i> 上一章</button>
      <button onclick="showChapterList()">目录</button>
      <button class="btn-accent" ${nextIdx>=0?`onclick="navigate('reader?book_id=${bid}&chapter_idx=${nextIdx}')"`:'disabled'}>下一章 <i data-lucide="chevron-right" width="16" height="16"></i></button>
    </div>
  </div>
  <div class="reader-bottom-sheet auto-hide" id="readerToolbar">
    <div class="sheet-handle"></div>
    <div class="reader-settings">
      <div class="settings-row">
        <span class="settings-label">字号</span>
        <button class="settings-btn-sm" onclick="changeFontSize(-1)">A-</button>
        <input type="range" class="settings-slider" id="fontSizeSlider" min="14" max="28" step="1" value="${fontSize}" oninput="changeFontSizeTo(+this.value)">
        <button class="settings-btn-sm" onclick="changeFontSize(1)">A+</button>
      </div>
      <div class="settings-row">
        <span class="settings-label">行距</span>
        <input type="range" class="settings-slider" id="lineHeightSlider" min="14" max="24" step="1" value="${Math.round(lineHeight*10)}" oninput="changeLineHeightTo(+this.value/10)">
      </div>
      <div class="settings-row">
        <span class="settings-label">字体</span>
        <div class="settings-chips">${FONTS.map(f=>`<button class="settings-chip${f.id===curFont?' active':''}" onclick="changeFont('${f.id}')">${f.name}</button>`).join('')}</div>
      </div>
      <div class="settings-row">
        <span class="settings-label">背景</span>
        <div class="bg-swatches">
          <button class="bg-swatch swatch-default${dt==='default'?' active':''}" onclick="applyThemeFrom(event,'default')"><div class="mini-lines"><div class="mini-line"></div><div class="mini-line"></div><div class="mini-line"></div></div></button>
          <button class="bg-swatch swatch-sepia${dt==='sepia'?' active':''}" onclick="applyThemeFrom(event,'sepia')"><div class="mini-lines"><div class="mini-line"></div><div class="mini-line"></div><div class="mini-line"></div></div></button>
          <button class="bg-swatch swatch-green${dt==='green'?' active':''}" onclick="applyThemeFrom(event,'green')"><div class="mini-lines"><div class="mini-line"></div><div class="mini-line"></div><div class="mini-line"></div></div></button>
          <button class="bg-swatch swatch-dark${dt==='dark'?' active':''}" onclick="applyThemeFrom(event,'dark')"><div class="mini-lines"><div class="mini-line"></div><div class="mini-line"></div><div class="mini-line"></div></div></button>
        </div>
        <span class="settings-label" style="margin-left:auto">模式</span>
        <div class="settings-chips" style="flex:0">
          <button class="settings-chip${curMode==='scroll'?' active':''}" onclick="cycleReadMode()">${curMode==='scroll'?'滚动':'翻页'}</button>
        </div>
      </div>
    </div>
    <div class="sheet-divider"></div>
    <div class="sheet-nav">
      <button onclick="shareLink('${escapeHtml(chapterTitle)}','/#reader?book_id=${bid}&chapter_idx=${idx}')">分享</button>
      <button onclick="cycleReadMode()">切换模式</button>
    </div>
  </div>`;

  document.documentElement.style.setProperty('--reader-font-size', getFontSize()+'px');
  document.documentElement.style.setProperty('--reader-line-height', getLineHeight());
  applyFont();

  const savedScroll = sessionStorage.getItem('scroll_' + chapterId);
  if (savedScroll) setTimeout(() => window.scrollTo(0, parseInt(savedScroll)), 50);
  else window.scrollTo(0, 0);
  setTimeout(updateProgress, 100);
  preloadAdjacent(bid, idx);
  setupScrollAutoNext(bid, idx);
  setupScrollToolbarAutoHide();
  setupScrollSwipe(bid, idx, total);
  refreshIcons(app);
}

function setupScrollAutoNext(bid, idx) {
  if (autoNextObserver) { autoNextObserver.disconnect(); autoNextObserver = null; }
  const d = cache.detail[bid]; if (!d) return;
  const sentinel = document.createElement('div');
  sentinel.id = 'autoNextSentinel'; sentinel.style.height = '1px';
  const nav = document.querySelector('.scroll-reader .reader-nav');
  if (nav) nav.parentNode.insertBefore(sentinel, nav);

  autoNextObserver = new IntersectionObserver(async (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const nextIdx = currentChapterIdx + appendedChapters + 1;
      if (nextIdx >= d.chapters.length) continue;
      const indicator = $('autoNextIndicator');
      if (indicator) indicator.classList.remove('hidden');
      const nextChapterId = d.chapters[nextIdx].ChapterID;
      if (!getContentCache(nextChapterId)) await fetchContent(nextChapterId);
      const nc = getContentCache(nextChapterId);
      if (nc && nc.paragraphs.length > 0) {
        const content = $('readerContent');
        if (content) {
          const div = document.createElement('div');
          div.className = 'auto-next-chapter';
          div.innerHTML = `<div class="auto-next-chapter"><div class="reader-title">${escapeHtml(d.chapters[nextIdx].Name||'第'+(nextIdx+1)+'章')}</div>` + renderParas(nc.paragraphs, nc.authorSpeak) + `<div class="chapter-end">本章已读完</div></div>`;
          content.appendChild(div);
          appendedChapters++;
          const data = loadData();
          data.readingHistory.chapterIdx = nextIdx;
          data.readingHistory.chapterName = d.chapters[nextIdx].Name || `第${nextIdx+1}章`;
          saveReadingHistory(data.readingHistory);
          if (!data.stats.readSet) data.stats.readSet = [];
          const nsid = String(nextChapterId);
          if (!data.stats.readSet.includes(nsid)) { data.stats.readSet.push(nsid); data.stats.chaptersRead = data.stats.readSet.length; saveStats(data.stats); }
        }
      }
      if (indicator) indicator.classList.add('hidden');
      preloadAdjacent(bid, nextIdx);
    }
  }, { rootMargin: '200px' });
  autoNextObserver.observe(sentinel);
}

function setupScrollToolbarAutoHide() {
  scrollState.lastScrollY = window.scrollY;
  scrollState.ticking = false;
  window.addEventListener('scroll', function() {
    if (scrollState.ticking) return;
    scrollState.ticking = true;
    requestAnimationFrame(() => {
      const curY = window.scrollY;
      const tb = $('readerToolbar');
      if (tb) {
        if (curY > scrollState.lastScrollY + 10) tb.classList.add('hidden-toolbar');
        else if (curY < scrollState.lastScrollY - 10) tb.classList.remove('hidden-toolbar');
      }
      scrollState.lastScrollY = curY;
      scrollState.ticking = false;
    });
  });
}

function setupScrollSwipe(bid, idx, total) {
  let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
  const content = $('readerContent');
  if (!content) return;
  content.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }, { passive: true });
  content.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;
    if (dt > 500 || Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 60) return;
    if (dx < -60 && idx < total - 1) navigate(`reader?book_id=${bid}&chapter_idx=${idx+1}`);
    else if (dx > 60 && idx > 0) navigate(`reader?book_id=${bid}&chapter_idx=${idx-1}`);
  }, { passive: true });
}

// ====== Paginated Reader ======
function renderPageReader(app, bid, idx) {
  const d = cache.detail[bid];
  const chapterId = d.chapters[idx].ChapterID;
  const c = getContentCache(chapterId);
  const paras = c.paragraphs;
  const total = d.chapters.length;
  const chapterTitle = d.chapters[idx].Name || `第${idx+1}章`;

  currentChapterKey = null;
  currentBookId = bid; currentChapterIdx = idx;
  pg = { bid, idx, total, totalPages:1, curPage:0, animating:false, swipeStartX:0, swipeStartY:0, swipeStartTime:0, swipeActive:false, pages:[] };
  saveReaderProgress(bid, idx, chapterId, chapterTitle, total);

  const dt = getDisplayTheme();
  const curFont = getFont();
  const curMode = getReadMode();
  const fontSize = getFontSize();
  const lineHeight = getLineHeight();
  const prevDisabled = idx <= 0;
  const nextDisabled = idx >= total - 1;

  app.innerHTML = `<div class="paginated-reader" id="paginatedReader">
    <div class="page-header" id="pageHeader">
      <button class="back-btn" onclick="goBack()"><i data-lucide="chevron-left" width="22" height="22"></i></button>
      <span class="chapter-name">${escapeHtml(chapterTitle)}</span>
      <button class="settings-btn" onclick="toggleToolbar()">Aa</button>
    </div>
    <div class="page-container" id="pageContainer">
      <div class="page-viewport" id="pageViewport"></div>
      <div class="page-shadow-left" id="pageShadowLeft"></div>
      <div class="page-shadow-right" id="pageShadowRight"></div>
      <div class="tap-zone tap-zone-left" onclick="pagePrev()"></div>
      <div class="tap-zone tap-zone-center" onclick="toggleToolbar()"></div>
      <div class="tap-zone tap-zone-right" onclick="pageNext()"></div>
      <div class="page-toolbar-overlay" id="pageToolbar">
        <div class="page-toolbar-top">
          <button class="back-btn" onclick="goBack()"><i data-lucide="chevron-left" width="22" height="22"></i></button>
          <span class="chapter-name">${escapeHtml(chapterTitle)}</span>
          <button class="icon-btn" onclick="toggleToolbar()"><i data-lucide="x" width="16" height="16"></i></button>
        </div>
        <div style="flex:1" onclick="toggleToolbar()"></div>
        <div class="page-toolbar-bottom">
          <div class="reader-settings">
            <div class="settings-row">
              <span class="settings-label">字号</span>
              <button class="settings-btn-sm" onclick="pgFontSize(-1)">A-</button>
              <input type="range" class="settings-slider" min="14" max="28" step="1" value="${fontSize}" oninput="changeFontSizeTo(+this.value);pgCalcDelayed()">
              <button class="settings-btn-sm" onclick="pgFontSize(1)">A+</button>
            </div>
            <div class="settings-row">
              <span class="settings-label">行距</span>
              <input type="range" class="settings-slider" min="14" max="24" step="1" value="${Math.round(lineHeight*10)}" oninput="changeLineHeightTo(+this.value/10);pgCalcDelayed()">
            </div>
            <div class="settings-row">
              <span class="settings-label">字体</span>
              <div class="settings-chips">${FONTS.map(f=>`<button class="settings-chip${f.id===curFont?' active':''}" onclick="changeFont('${f.id}');pgCalcDelayed()">${f.name}</button>`).join('')}</div>
            </div>
            <div class="settings-row">
              <span class="settings-label">背景</span>
              <div class="bg-swatches">
                <button class="bg-swatch swatch-default${dt==='default'?' active':''}" onclick="applyThemeFrom(event,'default')"><div class="mini-lines"><div class="mini-line"></div><div class="mini-line"></div><div class="mini-line"></div></div></button>
                <button class="bg-swatch swatch-sepia${dt==='sepia'?' active':''}" onclick="applyThemeFrom(event,'sepia')"><div class="mini-lines"><div class="mini-line"></div><div class="mini-line"></div><div class="mini-line"></div></div></button>
                <button class="bg-swatch swatch-green${dt==='green'?' active':''}" onclick="applyThemeFrom(event,'green')"><div class="mini-lines"><div class="mini-line"></div><div class="mini-line"></div><div class="mini-line"></div></div></button>
                <button class="bg-swatch swatch-dark${dt==='dark'?' active':''}" onclick="applyThemeFrom(event,'dark')"><div class="mini-lines"><div class="mini-line"></div><div class="mini-line"></div><div class="mini-line"></div></div></button>
              </div>
              <span class="settings-label" style="margin-left:auto">模式</span>
              <div class="settings-chips" style="flex:0">
                <button class="settings-chip${curMode==='page'?' active':''}" onclick="cycleReadMode()">翻页</button>
              </div>
            </div>
          </div>
          <div class="sheet-divider"></div>
          <div class="nav-row">
            <button ${prevDisabled?'disabled':''} onclick="pgSwitchChapter(${idx-1},-1)">上一章</button>
            <button onclick="showChapterList()">目录</button>
            <button ${nextDisabled?'disabled':''} onclick="pgSwitchChapter(${idx+1},0)">下一章</button>
          </div>
          <div class="slider-row">
            <input type="range" id="pageSlider" min="1" max="1" value="1" oninput="pgSliderGo(this.value)">
            <span class="slider-label" id="pageSliderLabel">1/1</span>
          </div>
        </div>
      </div>
    </div>
    <div class="page-footer">
      <div class="page-footer-left">
        <span>${escapeHtml(d.bookName)}</span><span>·</span><span>第${idx+1}/${total}章</span>
      </div>
      <div class="page-footer-right">
        <span id="pageInfo">1/1</span>
        <span id="pagePercent">0%</span>
      </div>
    </div>
  </div>`;

  document.documentElement.style.setProperty('--reader-font-size', getFontSize()+'px');
  document.documentElement.style.setProperty('--reader-line-height', getLineHeight());
  applyFont();

  requestAnimationFrame(() => { requestAnimationFrame(() => { pgCalculatePages(); }); });
  setupPgGestures();
  preloadAdjacent(bid, idx);
  refreshIcons(app);
}

// ====== Page calculation ======
function pgCalculatePages() {
  const container = $('pageContainer');
  const viewport = $('pageViewport');
  if (!container || !viewport) return;
  
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  if (cw <= 0 || ch <= 0) return;
  
  const bid = pg.bid;
  const idx = pg.idx;
  const d = cache.detail[bid];
  if (!d) return;
  const chapterId = d.chapters[idx].ChapterID;
  const c = getContentCache(chapterId);
  if (!c) return;
  
  const paras = c.paragraphs;
  const authorSpeak = c.authorSpeak;
  
  // Build paragraph HTML array
  const paraHtmls = [];
  for (const text of paras) {
    if (!text) continue;
    const imgMatch = text.match(/^https?:\/\/\S+\.(jpg|jpeg|png|webp|gif)(\?\S*)?$/i);
    if (imgMatch) { paraHtmls.push(`<img class="content-img" src="${text}">`); continue; }
    const innerImgs = text.match(/<img[^>]+src="([^"]+)"[^>]*>/gi);
    if (innerImgs) { innerImgs.forEach(imgTag => { const src = imgTag.match(/src="([^"]+)"/); if (src) paraHtmls.push(`<img class="content-img" src="${src[1]}">`); }); continue; }
    paraHtmls.push(`<div class="para-wrap"><p>${escapeHtml(text)}</p></div>`);
  }
  if (authorSpeak) paraHtmls.push(`<div class="author-speak"><i data-lucide="message-circle" width="14" height="14"></i> 作者说：${escapeHtml(authorSpeak)}</div>`);
  
  // Use a real .page-page element as measurer to guarantee layout consistency.
  // This avoids any mismatch between manual style replication and actual CSS.
  const measurer = document.createElement('div');
  measurer.className = 'page-page';
  measurer.style.cssText = 'position:fixed;visibility:hidden;left:-9999px;top:0;width:' + cw + 'px;height:' + ch + 'px;inset:auto;overflow:hidden;';
  // Attach inside the reader so CSS variables are available
  const reader = $('paginatedReader');
  if (reader) reader.appendChild(measurer);
  else document.body.appendChild(measurer);
  
  // Available content height: with border-box, clientHeight includes padding,
  // so contentH = height - padding-top - padding-bottom.
  // scrollHeight > contentH means content overflows the visible area.
  const contentH = measurer.clientHeight;
  
  // Split paragraphs into pages
  const pages = [];
  let currentPage = '';
  
  for (const ph of paraHtmls) {
    measurer.innerHTML = currentPage + ph;
    if (measurer.scrollHeight > contentH && currentPage !== '') {
      pages.push(currentPage);
      currentPage = ph;
      measurer.innerHTML = ph;
    } else {
      currentPage += ph;
    }
  }
  if (currentPage) pages.push(currentPage);
  
  // Cleanup measurer
  if (measurer.parentNode) measurer.parentNode.removeChild(measurer);
  
  if (pages.length === 0) pages.push('');
  
  // Store pages in state
  pg.pages = pages;
  pg.totalPages = pages.length;
  pg.curPage = 0;
  
  // Render pages into viewport
  viewport.innerHTML = '';
  pages.forEach((html, i) => {
    const div = document.createElement('div');
    div.className = 'page-page';
    div.dataset.page = i;
    div.innerHTML = html;
    div.style.display = i === 0 ? '' : 'none';
    viewport.appendChild(div);
  });
  
  pgUpdateUI();
}

function pgUpdateUI() {
  const info = $('pageInfo');
  const pct = $('pagePercent');
  const slider = $('pageSlider');
  const sliderLabel = $('pageSliderLabel');
  if (info) info.textContent = `${pg.curPage+1}/${pg.totalPages}`;
  if (pct) pct.textContent = pg.totalPages > 1 ? Math.round(pg.curPage/(pg.totalPages-1)*100)+'%' : '0%';
  if (slider) { slider.max = pg.totalPages; slider.value = pg.curPage + 1; }
  if (sliderLabel) sliderLabel.textContent = `${pg.curPage+1}/${pg.totalPages}`;
}

// ====== Page navigation ======
function pgGoToPage(target, animate) {
  if (pg.animating && animate) return;
  if (target < 0 || target >= pg.totalPages) return;
  
  const viewport = $('pageViewport');
  if (!viewport) return;
  
  const oldPage = viewport.querySelector(`.page-page[data-page="${pg.curPage}"]`);
  const newPage = viewport.querySelector(`.page-page[data-page="${target}"]`);
  if (!newPage) return;
  
  if (animate && oldPage && oldPage !== newPage) {
    pg.animating = true;
    const dir = target > pg.curPage ? 1 : -1;
    
    // Position new page off-screen
    newPage.style.display = '';
    newPage.style.transform = `translateX(${dir * 100}%)`;
    newPage.style.transition = 'none';
    
    // Force reflow
    newPage.offsetHeight;
    
    // Animate both pages
    newPage.style.transition = 'transform 0.3s ease';
    oldPage.style.transition = 'transform 0.3s ease';
    oldPage.style.transform = `translateX(${-dir * 100}%)`;
    newPage.style.transform = 'translateX(0)';
    
    setTimeout(() => {
      oldPage.style.display = 'none';
      oldPage.style.transform = '';
      oldPage.style.transition = '';
      newPage.style.transform = '';
      newPage.style.transition = '';
      pg.animating = false;
    }, 320);
  } else {
    // Instant switch
    if (oldPage && oldPage !== newPage) oldPage.style.display = 'none';
    newPage.style.display = '';
  }
  
  pg.curPage = target;
  pgUpdateUI();
}

function pageNext() {
  if (pg.curPage < pg.totalPages - 1) pgGoToPage(pg.curPage + 1, true);
  else if (pg.idx < pg.total - 1) pgSwitchChapter(pg.idx + 1, 0);
}
function pagePrev() {
  if (pg.curPage > 0) pgGoToPage(pg.curPage - 1, true);
  else if (pg.idx > 0) pgSwitchChapter(pg.idx - 1, -1);
}
async function pgSwitchChapter(newIdx, startPageHint) {
  const d = cache.detail[pg.bid];
  if (!d || newIdx < 0 || newIdx >= d.chapters.length) return;
  const chapterId = d.chapters[newIdx].ChapterID;
  // Ensure content is loaded (may need fetch)
  if (!getContentCache(chapterId)) {
    // Show a brief loading indicator on current page
    const viewport = $('pageViewport');
    if (viewport) {
      const loader = document.createElement('div');
      loader.className = 'page-page';
      loader.style.cssText = 'display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:14px;';
      loader.innerHTML = '加载中...';
      viewport.appendChild(loader);
    }
    await fetchContent(chapterId);
    // Remove loader
    if (viewport) { const l = viewport.lastElementChild; if (l && l !== viewport.querySelector(`.page-page[data-page="${pg.curPage}"]`)) l.remove(); }
  }
  const c = getContentCache(chapterId);
  if (!c || !c.paragraphs.length) return;

  // Update state
  pg.idx = newIdx;
  pg.curPage = 0;
  currentBookId = pg.bid;
  currentChapterIdx = newIdx;
  const chapterTitle = d.chapters[newIdx].Name || `第${newIdx+1}章`;
  saveReaderProgress(pg.bid, newIdx, chapterId, chapterTitle, pg.total);

  // Update header chapter name
  const headerName = document.querySelector('.page-header .chapter-name');
  if (headerName) headerName.textContent = chapterTitle;
  const toolbarName = document.querySelector('.page-toolbar-top .chapter-name');
  if (toolbarName) toolbarName.textContent = chapterTitle;

  // Update footer
  const footerLeft = document.querySelector('.page-footer-left');
  if (footerLeft) footerLeft.innerHTML = `<span>${escapeHtml(d.bookName)}</span><span>·</span><span>第${newIdx+1}/${pg.total}章</span>`;

  // Recalculate pages for new chapter
  pgCalculatePages();

  // Jump to last page if going back, first page if going forward
  if (startPageHint === -1 && pg.totalPages > 1) {
    pgGoToPage(pg.totalPages - 1, false);
  }

  // Update URL without full re-render
  const newHash = `reader?book_id=${pg.bid}&chapter_idx=${newIdx}`;
  if (location.hash.slice(1) !== newHash) {
    history.replaceState(null, '', '#' + newHash);
  }

  preloadAdjacent(pg.bid, newIdx);
}
function pgSliderGo(val) { pgGoToPage(parseInt(val) - 1, false); }

// ====== Chapter list panel ======
function showChapterList() {
  const bid = currentBookId || pg.bid;
  const d = cache.detail[bid];
  if (!d) return;
  const chapters = d.chapters;
  const resumeIdx = currentChapterIdx >= 0 ? currentChapterIdx : pg.idx;

  // Remove existing panel if any
  const old = $('chapterListOverlay');
  if (old) { old.remove(); return; }

  const panel = document.createElement('div');
  panel.id = 'chapterListOverlay';
  panel.className = 'chapter-list-overlay';
  panel.innerHTML = `
    <div class="chapter-list-header">
      <span>目录 · ${chapters.length} 章</span>
      <button class="icon-btn" onclick="closeChapterList()"><i data-lucide="x" width="16" height="16"></i></button>
    </div>
    <div class="chapter-list-scroll">${renderChapterItems(chapters, bid, resumeIdx)}</div>
  `;
  document.body.appendChild(panel);
  refreshIcons(panel);

  // Override chapter item clicks to close panel first
  panel.querySelectorAll('.chapter-item').forEach(item => {
    item.addEventListener('click', () => closeChapterList(), true);
  });

  // Scroll to current chapter
  requestAnimationFrame(() => {
    const cur = panel.querySelector('.chapter-item-current');
    if (cur) cur.scrollIntoView({ block: 'center' });
  });
}

function closeChapterList() {
  const panel = $('chapterListOverlay');
  if (panel) panel.remove();
}

// ====== Toolbar ======
function toggleToolbar() {
  const tb = $('pageToolbar');
  if (tb) tb.classList.toggle('open');
}
function pgFontSize(d) { changeFontSize(d); setTimeout(()=>pgCalculatePages(),150); }
function pgLineHeight(d) { changeLineHeight(d); setTimeout(()=>pgCalculatePages(),150); }
function pgCalcDelayed() { setTimeout(()=>pgCalculatePages(),150); }

// ====== Touch gestures ======
function setupPgGestures() {
  const container = $('pageContainer');
  if (!container) return;
  
  let dragCurrentPage = null;
  
  container.addEventListener('touchstart', e => {
    if (pg.animating) return;
    pg.swipeStartX = e.touches[0].clientX;
    pg.swipeStartY = e.touches[0].clientY;
    pg.swipeStartTime = Date.now();
    pg.swipeActive = false;
    dragCurrentPage = null;
  }, { passive: true });
  
  container.addEventListener('touchmove', e => {
    if (pg.animating) return;
    const dx = e.touches[0].clientX - pg.swipeStartX;
    const dy = e.touches[0].clientY - pg.swipeStartY;
    if (!pg.swipeActive) {
      if (Math.abs(dx) < 15 || Math.abs(dy) > Math.abs(dx)) return;
      pg.swipeActive = true;
      const viewport = $('pageViewport');
      dragCurrentPage = viewport ? viewport.querySelector(`.page-page[data-page="${pg.curPage}"]`) : null;
    }
    if (pg.swipeActive && dragCurrentPage) {
      dragCurrentPage.style.transition = 'none';
      dragCurrentPage.style.transform = `translateX(${dx}px)`;
    }
  }, { passive: true });
  
  container.addEventListener('touchend', e => {
    if (!pg.swipeActive) return;
    pg.swipeActive = false;
    
    const dx = e.changedTouches[0].clientX - pg.swipeStartX;
    const dt = Date.now() - pg.swipeStartTime;
    const cw = container.clientWidth;
    const threshold = cw * 0.15;
    
    if (dragCurrentPage) {
      dragCurrentPage.style.transition = 'transform 0.3s ease';
      dragCurrentPage.style.transform = '';
    }
    
    let target = pg.curPage;
    if (Math.abs(dx) > threshold) {
      if (dx < -threshold && pg.curPage < pg.totalPages - 1) target = pg.curPage + 1;
      else if (dx > threshold && pg.curPage > 0) target = pg.curPage - 1;
    }
    
    if (target !== pg.curPage) {
      pgGoToPage(target, true);
    } else if (dragCurrentPage) {
      setTimeout(() => {
        if (dragCurrentPage) {
          dragCurrentPage.style.transition = '';
          dragCurrentPage.style.transform = '';
        }
      }, 300);
    }
    dragCurrentPage = null;
  }, { passive: true });
  
  document.onkeydown = e => {
    if (e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
    const hash = location.hash.slice(1)||'';
    if (!hash.startsWith('reader')) return;
    if (getReadMode() !== 'page') return;
    if (e.key==='ArrowLeft'||e.key==='a') pagePrev();
    else if (e.key==='ArrowRight'||e.key==='d') pageNext();
    else if (e.key==='Escape') goBack();
  };
}

// ====== Read mode / settings change ======
window.addEventListener('read-mode-change', () => {
  const hash = location.hash.slice(1) || '';
  if (!hash.startsWith('reader')) return;
  const q = {};
  const qs = hash.split('?')[1];
  if (qs) new URLSearchParams(qs).forEach((v,k) => q[k] = v);
  if (q.book_id) renderReader($('app'), q.book_id, parseInt(q.chapter_idx||'0'));
});
window.addEventListener('reader-settings-change', () => {
  if (getReadMode() === 'page' && $('pageViewport')) setTimeout(() => pgCalculatePages(), 150);
});

// ====== Resize handling ======
let pgResizeTimer = 0;
window.addEventListener('resize', () => {
  if (getReadMode() !== 'page' || !$('pageViewport')) return;
  clearTimeout(pgResizeTimer);
  pgResizeTimer = setTimeout(() => pgCalculatePages(), 200);
});

// ====== Image click ======
document.addEventListener('click', function(e) {
  const img = e.target.closest('.content-img');
  if (img && !e.target.closest('.img-viewer-overlay')) openImageViewer(img.src);
});