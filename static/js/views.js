// ====== Render: Home ======
function renderHome(app) {
  const data = loadData();
  let html = '';
  if (data.readingHistory) {
    const rh = data.readingHistory;
    const pct = rh.totalChapters > 0 ? Math.round((rh.chapterIdx+1)/rh.totalChapters*100) : 0;
    const circumference = 2 * Math.PI * 22;
    const dashOffset = circumference * (1 - pct / 100);
    html += `<div class="continue-card view" onclick="navigate('reader?book_id=${rh.bookId}&chapter_idx=${rh.chapterIdx}')">
      <div class="info"><div class="label">继续阅读</div><div class="title">${escapeHtml(rh.name||'')}</div><div class="chapter">${escapeHtml(rh.chapterName||'')}</div></div>
      <div class="ring"><svg width="52" height="52"><circle class="ring-bg" cx="26" cy="26" r="22"/><circle class="ring-fg" cx="26" cy="26" r="22" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"/></svg><div class="ring-text">${pct}%</div></div><i data-lucide="chevron-right" class="continue-chev" width="20" height="20"></i></div>`;
  }
  // Discover content — always shown (bookshelf is on its own tab)
  const genreTags = [
    {name:'热门',icon:'🔥'},{name:'玄幻',icon:'🗡️'},{name:'都市',icon:'🏙️'},
    {name:'言情',icon:'💕'},{name:'仙侠',icon:'🔮'},{name:'游戏',icon:'🎮'},
    {name:'历史',icon:'🏰'},{name:'科幻',icon:'🔬'}
  ];
  const quickCats = [
    {name:'都市小说',icon:'🏙️',q:'都市'},{name:'玄幻奇幻',icon:'🗡️',q:'玄幻'},
    {name:'仙侠修真',icon:'🔮',q:'仙侠'},      {name:'历史军事',icon:'🏰',q:'历史'},
    {name:'游戏竞技',icon:'🎮',q:'游戏'},{name:'科幻世界',icon:'🔬',q:'科幻'},
    {name:'悬疑灵异',icon:'🕵️',q:'悬疑'},{name:'古代言情',icon:'💕',q:'言情'}
  ];
  html += `<div class="home-discover view">
    <div class="discover-welcome">
      <div class="welcome-emoji">📚</div>
      <div class="welcome-title">发现好书</div>
      <div class="welcome-desc">搜索书名或作者，找到你的下一本读物</div>
    </div>
    <div class="discover-section">
      <div class="discover-section-title">热门分类</div>
      <div class="discover-tags">${genreTags.map(t => `<span class="discover-tag" onclick="navigate('search?q=${encodeURIComponent(t.name)}')">${t.icon} ${t.name}</span>`).join('')}</div>
    </div>
    <div class="discover-section">
      <div class="discover-section-title">探索发现</div>
      <div class="discover-grid">${quickCats.map(c => `<div class="discover-card" onclick="navigate('search?q=${encodeURIComponent(c.q)}')"><div class="discover-card-icon">${c.icon}</div><div class="discover-card-name">${c.name}</div></div>`).join('')}</div>
    </div>
    <div class="discover-tip">
      <div class="discover-tip-icon">💡</div>
      <div class="discover-tip-text">搜索你喜欢的小说开始阅读</div>
    </div>
  </div>`;
  app.innerHTML = html;
  refreshIcons(app);
}

// ====== Render: Search results ======
function renderResults(app) {
  app = app || $('app');
  const td = getTabData();
  if (td.books.length === 0 && !S.loading) { renderHome(app); return; }
  if (td.books.length === 0 && S.loading) { app.innerHTML = skeletonResults(5); return; }
  const display = td.filtered.length > 0 ? td.filtered : td.books;
  const allTags = [...new Set(td.books.flatMap(b => (b.Tags||'').split(',').map(t=>t.trim()).filter(Boolean)))];
  let html = `<div class="search-controls view"><span class="search-result-info">${td.books.length} 条</span>`;
  if (td.filtered.length !== td.books.length) html += `<span class="search-result-info">· 筛选 ${td.filtered.length}</span>`;
  for (const s of [{key:'default',label:'默认'},{key:'read',label:'热度'},{key:'words',label:'字数'},{key:'chapters',label:'章节'}]) {
    html += `<span class="sort-btn${td.sortBy===s.key?' active':''}" onclick="setSort('${s.key}')">${s.label}</span>`;
  }
  html += '</div>';
  if (allTags.length > 0) {
    html += '<div class="search-controls view" style="margin-top:-4px">';
    html += allTags.map(t => `<span class="sort-btn${td.tagFilter===t?' active':''}" onclick="setTag('${escapeHtml(t)}')">${escapeHtml(t)}</span>`).join('');
    html += '</div>';
  }
  html += '<div class="book-list view">';
  for (const book of display) {
    const tags = (book.Tags||'').split(',').map(t=>t.trim()).filter(Boolean);
    const status = book.Status||'';
    const wc = book.WordCount ? (book.WordCount/10000).toFixed(1)+'万字' : '';
    const score = parseFloat(book.Score);
    const stars = score > 0 ? '<i data-lucide="star" width="12" height="12" style="vertical-align:-1px"></i>'+(score > 10 ? (score/10).toFixed(1) : score.toFixed(1)) : '';
    html += `<div class="book-card" onclick="navigate('detail?book_id=${book.BookID}')">
      <img class="book-cover" src="${book.ThumbUrl||FALLBACK_IMG}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'">
      <div class="book-info">
        <div class="book-title">${escapeHtml(book.Name||'')}${status?`<span class="status-badge ${status==='连载中'?'ongoing':'finished'}">${status}</span>`:''}</div>
        <div class="book-author">${escapeHtml(book.Author||'')} ${stars?'· '+stars:''}</div>
        <div class="book-desc">${escapeHtml(book.Desc||'')}</div>
        <div class="book-meta">${[book.ChapterCount?book.ChapterCount+'章':'', wc, ...tags.map(t=>`<span class="tag-pill">${escapeHtml(t)}</span>`)].filter(Boolean).join(' · ')}</div>
      </div></div>`;
  }
  html += '</div>';
  if (td.books.length > 0) html += `<div class="load-more view"><button onclick="loadMore()" ${S.loading?'disabled':''}>${S.loading?'加载中...':td.hasMore?'加载更多':'没有更多了'}</button></div>`;
  app.innerHTML = html;
  refreshIcons(app);
}

// ====== Render: Shelf ======
let _shelfFilter = '';
function renderShelf(app, filter) {
  if (filter !== undefined) _shelfFilter = filter;
  const data = loadData();
  const rh = data.readingHistory;
  const shelf = _shelfFilter
    ? data.shelf.filter(b => (b.name||'').toLowerCase().includes(_shelfFilter.toLowerCase()) || (b.author||'').toLowerCase().includes(_shelfFilter.toLowerCase()))
    : data.shelf;
  let html = `<div class="home-section view">`;
  if (!data.shelf.length) html += '<div class="shelf-empty"><div class="icon"><i data-lucide="book-open" width="48" height="48"></i></div><div>还没有收藏的书籍<br><span style="font-size:12px">在书籍详情页点击收藏即可加入书架</span></div><button class="shelf-empty-cta" onclick="navigate(\'search\')">去书城逛逛</button></div>';
  else if (!shelf.length) html += '<div class="shelf-empty"><div class="icon"><i data-lucide="search" width="32" height="32"></i></div><div>书架中没有匹配的书籍</div></div>';
  else {
    html += '<div class="shelf-grid">';
    for (const b of shelf) {
      const sp = rh && rh.bookId === b.bookId && rh.totalChapters > 0
        ? Math.round((rh.chapterIdx+1)/rh.totalChapters*100) : 0;
      html += `<div class="shelf-grid-item" onclick="navigate('detail?book_id=${b.bookId}')"><img src="${b.thumb||FALLBACK_IMG}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'"><div class="name">${escapeHtml(b.name||'')}</div>${sp?`<div class="progress-text">读到第${rh.chapterIdx+1}章 · ${sp}%</div>`:''}<div class="del-btn" onclick="event.stopPropagation();removeShelf('${b.bookId}')"><i data-lucide="x" width="10" height="10"></i></div></div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  app.innerHTML = html;
  refreshIcons(app);
}
function removeShelf(bid) { const d = loadData(); d.shelf = d.shelf.filter(b => b.bookId !== bid); saveShelf(d.shelf); renderShelf($('app')); }

// ====== Render: Detail ======
function renderDetail(app, bid) {
  const d = cache.detail[bid];
  if (!d) { app.innerHTML = errorHtml('加载失败', `detail?book_id=${bid}`); return; }
  const detail = d.detail && d.detail.data ? d.detail.data : null;
  const chapters = d.chapters;
  const inShelf = isInShelf(bid);
  const data = loadData();
  const resumeIdx = data.readingHistory && data.readingHistory.bookId === bid ? data.readingHistory.chapterIdx : -1;
  $('pageTitle').textContent = d.bookName || '书籍详情';

  let html = '<div class="book-detail view">';
  let hasAlias = false;
  if (detail) {
    const cover = detail.thumb_url || detail.audio_thumb_uri || '';
    const title = detail.title || detail.book_name || '未知';
    const author = detail.author || detail.writer || '未知';
    const desc = detail.abstract || detail.description || '';
    const cat = detail.category || detail.categories || '';
    const cc = detail.chapter_number || chapters.length || '';
    const wc = detail.word_number ? (detail.word_number/10000).toFixed(0)+'万字' : '';
    const score = detail.score || '';
    const originalName = detail.original_book_name || '';
    const aliasName = detail.book_flight_alias_name || '';
    // Show alias if: original name differs from current title, or alias differs from both
    const aliasParts = [];
    if (originalName && originalName !== title) aliasParts.push(originalName);
    if (aliasName && aliasName !== title && aliasName !== originalName) aliasParts.push(aliasName);
    const aliasLine = aliasParts.length ? `<div class="book-detail-alias">又名：${aliasParts.map(n=>escapeHtml(n)).join(' / ')}</div>` : '';
    hasAlias = detail.original_book_name && detail.original_book_name !== title;
    let coverHtml;
    if (hasAlias) {
      coverHtml = `<div class="cover-flip" id="coverFlip" onclick="this.classList.toggle('flipped');event.stopPropagation()">
        <div class="cover-flip-inner">
          <div class="cover-flip-front">
            <img src="${cover||FALLBACK_IMG}" onerror="this.src='${FALLBACK_IMG}'">
            <span class="cover-flip-badge">推广</span>
          </div>
          <div class="cover-flip-back">
            <img id="originalCoverImg" src="${cover||FALLBACK_IMG}" onerror="this.src='${FALLBACK_IMG}'">
            <span class="cover-flip-badge">原始</span>
          </div>
        </div>
        <span class="cover-flip-hint">⇄</span>
      </div>`;
    } else {
      coverHtml = `<img class="book-detail-cover" src="${cover||FALLBACK_IMG}" onerror="this.src='${FALLBACK_IMG}'">`;
    }
    html += `<div class="book-detail-header">
      ${coverHtml}
      <div class="book-detail-info">
        <div class="book-detail-title">${escapeHtml(title)}</div>
        ${aliasLine}
        <div class="book-detail-author"><a class="author-link" onclick="navigate('author?author_id=${encodeURIComponent(d.authorId||'')}&name=${encodeURIComponent(author)}&from=${bid}')">${escapeHtml(author)}</a></div>
        <div class="book-detail-meta">${cat?`<span class="detail-tag">${escapeHtml(cat)}</span>`:''}${cc?`<span class="detail-stat">${cc}章</span>`:''}${wc?`<span class="detail-stat">${wc}</span>`:''}${score?`<span class="detail-stat">评分 ${score}</span>`:''}</div>
        <div class="book-detail-actions">
          <button class="btn-primary" onclick="navigate('reader?book_id=${bid}&chapter_idx=${resumeIdx>=0?resumeIdx:0}')">${resumeIdx>=0?'继续阅读':'开始阅读'}</button>
          <button class="btn-outline" onclick="navigate('comments?book_id=${bid}')">评论</button>
          <button class="btn-outline ${inShelf?'active':''}" onclick="doToggleShelf('${bid}')">${inShelf?'<i data-lucide="check" width="14" height="14" style="vertical-align:-2px"></i> 已收藏':'<i data-lucide="bookmark" width="14" height="14" style="vertical-align:-2px"></i> 收藏'}</button>
          <button class="btn-outline" onclick="shareLink('${escapeHtml(title)}','/#detail?book_id=${bid}')">分享</button>
        </div>
      </div></div>`;
    if (desc) html += `<div class="book-detail-desc collapsed" id="bookDesc">${escapeHtml(desc)}</div><button class="book-detail-desc-toggle" id="descToggle" onclick="toggleDesc()">展开简介 <i data-lucide="chevron-down" width="12" height="12" style="vertical-align:-1px"></i></button>`;
  } else { html += errorHtml('加载失败', `detail?book_id=${bid}`); }
  html += '</div>';

  const searchInput = chapters.length > 10 ? `<input type="text" class="chapter-search-input" placeholder="筛选..." oninput="debouncedFilter(this.value,'${bid}')">` : '';
  const slider = '';
  html += `<div class="chapter-section view"><div class="chapter-section-title"><span>章节目录 · ${chapters.length} 章</span>${searchInput}</div>${slider}<div class="chapter-list" id="chapterList">`;
  if (!chapters.length) html += '<div class="loading" style="padding:20px">暂无章节</div>';
  else html += renderChapterItems(chapters, bid, resumeIdx);
  html += '</div></div>';
  if (data.stats.chaptersRead > 0) html += `<div class="stats-bar view">已读 ${data.stats.chaptersRead} 章</div>`;
  if (detail) html += `<div class="detail-sticky-spacer"></div><div class="detail-sticky"><button class="btn-primary" onclick="navigate('reader?book_id=${bid}&chapter_idx=${resumeIdx>=0?resumeIdx:0}')">${resumeIdx>=0?'继续阅读':'开始阅读'}</button></div>`;

  app.innerHTML = html;
  // Setup cover flip for aliased books
  if (hasAlias && d.authorId) {
    fetchOriginalCover(d.authorId, bid);
  }
  refreshIcons(app);
  // Hide toggle if description is short enough (no overflow)
  const desc = $('bookDesc');
  const toggle = $('descToggle');
  if (desc && toggle && desc.scrollHeight <= desc.clientHeight + 1) {
    desc.classList.remove('collapsed');
    toggle.style.display = 'none';
  }
}

async function fetchAuthorBooks(author, currentBid, authorId) {
  const scroll = $('authorBooksScroll');
  if (!scroll) return;
  try {
    let books = [];
    if (authorId) {
      const r = await fetch(`${API}/api/author_books?author_id=${encodeURIComponent(authorId)}`);
      const data = await r.json();
      books = data.code === 200 ? (data.data || []) : [];
    } else {
      const r = await fetch(`${API}/api/search?key=${encodeURIComponent(author)}&tab_type=3`);
      const data = await r.json();
      books = ((data.code === 200 ? data.data : []) || []).filter(b => b.Author === author);
    }
    const others = books.filter(b => b.BookID !== currentBid).slice(0, 6);
    if (!others.length) {
      const section = $('authorBooksSection');
      if (section) section.style.display = 'none';
      return;
    }
    scroll.innerHTML = others.map(b => `<div class="related-item" onclick="navigate('detail?book_id=${b.BookID}')"><img src="${b.ThumbUrl||FALLBACK_IMG}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'"><div class="name">${escapeHtml(b.Name||'')}</div>${b.ShortName?`<div class="related-short-name">${escapeHtml(b.ShortName)}</div>`:''}</div>`).join('');
  } catch(e) {
    scroll.innerHTML = '<div style="padding:12px 0;color:var(--text-muted);font-size:13px">加载失败</div>';
  }
}

function renderChapterItems(chapters, bid, lastRead) {
  const hasVolumes = chapters.some(ch => ch.volume_name);
  if (!hasVolumes) return chapters.map((ch, i) => chapterItemHtml(ch, i, bid, lastRead)).join('');
  let html = '';
  let currentVol = null;
  for (let i = 0; i < chapters.length; i++) {
    const vol = chapters[i].volume_name || '默认';
    if (vol !== currentVol) {
      currentVol = vol;
      let endI = i;
      for (let j = i+1; j < chapters.length; j++) { if ((chapters[j].volume_name||'默认') === vol) endI = j; else break; }
      html += `<div class="volume-header" onclick="this.nextElementSibling.classList.toggle('collapsed');this.classList.toggle('collapsed')"><span class="arrow"><i data-lucide="chevron-down" width="10" height="10"></i></span>${escapeHtml(vol)}</div><div class="volume-body">`;
      for (let k = i; k <= endI; k++) html += chapterItemHtml(chapters[k], k, bid, lastRead);
      html += '</div>';
      i = endI;
    }
  }
  return html;
}

function chapterItemHtml(ch, i, bid, lastRead) {
  let cls = 'chapter-item';
  if (i < lastRead) cls += ' chapter-item-read';
  if (i === lastRead) cls += ' chapter-item-current';
  const time = ch.UpdateTime ? timeAgo(ch.UpdateTime) : '';
  return `<div class="${cls}" onclick="navigate('reader?book_id=${bid}&chapter_idx=${i}')"><span>${escapeHtml(ch.Name||'第'+(i+1)+'章')}</span>${time?`<span class="chapter-item-time">${time}</span>`:''}</div>`;
}

const debouncedFilter = debounce(filterChapters, 200);

// ====== Render: Author Page ======
async function renderAuthorPage(app, authorId, authorName) {
  const displayName = authorName || '作者';
  if ($('pageTitle')) $('pageTitle').textContent = '作者主页';
  app.innerHTML = `<div class="author-page view">
    <div class="author-header">
      <div class="author-avatar"><i data-lucide="user" width="36" height="36"></i></div>
      <div class="author-info">
        <div class="author-name">${escapeHtml(displayName)}</div>
        <div class="author-meta" id="authorMeta">
          <span class="meta-item"><i data-lucide="book-open" width="13" height="13"></i> 加载中...</span>
        </div>
      </div>
      <button class="author-follow-btn">关注</button>
    </div>
    <div class="author-books" id="authorBooks"><div class="loading" style="padding:40px 0">加载中...</div></div>
  </div>`;
  refreshIcons(app);

  try {
    let books = [];
    if (authorId) {
      const r = await fetch(`${API}/api/author_books?author_id=${encodeURIComponent(authorId)}`);
      const data = await r.json();
      if (data.code === 200) {
        books = data.data || [];
        // Update header with richer info from API
        const meta = $('authorMeta');
        if (meta) {
          const parts = [];
          if (data.author_book_num) parts.push(`<span class="meta-item"><i data-lucide="book-open" width="13" height="13"></i> ${data.author_book_num} 部作品</span>`);
          if (data.author_fans) parts.push(`<span class="meta-item"><i data-lucide="users" width="13" height="13"></i> ${data.author_fans} 粉丝</span>`);
          meta.innerHTML = parts.join(' · ') || '<span class="meta-item"><i data-lucide="book-open" width="13" height="13"></i> 暂无作品</span>';
          refreshIcons(meta);
        }
        const avatar = app.querySelector('.author-avatar');
        if (avatar && data.author_avatar) {
          avatar.innerHTML = `<img src="${data.author_avatar}" onerror="this.parentElement.innerHTML='<i data-lucide=\\'user\\' width=\\'36\\' height=\\'36\\'></i>'">`;
        }
        const nameEl = app.querySelector('.author-name');
        if (nameEl && data.author_name) nameEl.textContent = data.author_name;
        if (data.author_desc) {
          const info = app.querySelector('.author-info');
          if (info) info.insertAdjacentHTML('beforeend', `<div class="author-desc">${escapeHtml(data.author_desc)}</div>`);
        }
      }
    } else {
      // Fallback: search by name
      const r = await fetch(`${API}/api/search?key=${encodeURIComponent(displayName)}&tab_type=3`);
      const data = await r.json();
      books = (data.code === 200 ? (data.data || []) : []).filter(b => b.Author === displayName);
      const meta = $('authorMeta');
      if (meta) meta.innerHTML = `<span class="meta-item"><i data-lucide="book-open" width="13" height="13"></i> ${books.length ? books.length+' 部作品' : '暂无作品'}</span>`;
      refreshIcons(meta);
    }

    const container = $('authorBooks');
    if (!container) return;

    if (!books.length) {
      container.innerHTML = '<div class="shelf-empty"><div class="icon"><i data-lucide="book-open" width="48" height="48"></i></div><div>该作者暂无作品</div></div>';
      refreshIcons(container);
      return;
    }

    container.innerHTML = '<div class="book-list">' + books.map(book => {
      const tags = (book.Tags||'').split(',').map(t=>t.trim()).filter(Boolean);
      const status = book.Status||'';
      const wc = book.WordCount ? (book.WordCount/10000).toFixed(1)+'万字' : '';
      const score = parseFloat(book.Score);
      const stars = score > 0 ? '<i data-lucide="star" width="12" height="12" style="vertical-align:-1px"></i>'+(score > 10 ? (score/10).toFixed(1) : score.toFixed(1)) : '';
      const readText = book.ReadCountText || (book.ReadCount ? book.ReadCount+'人在读' : '');
      return `<div class="book-card" onclick="navigate('detail?book_id=${book.BookID}')">
        <img class="book-cover" src="${book.ThumbUrl||FALLBACK_IMG}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'">
        <div class="book-info">
          <div class="book-title">${escapeHtml(book.Name||'')}${status?`<span class="status-badge ${status==='连载中'?'ongoing':'finished'}">${status}</span>`:''}</div>
          ${book.ShortName?`<div class="book-short-name">又名：${escapeHtml(book.ShortName)}</div>`:''}
          <div class="book-author">${[stars, readText].filter(Boolean).join(' · ')}</div>
          <div class="book-desc">${escapeHtml(book.Desc||'')}</div>
          <div class="book-meta">${[book.ChapterCount?book.ChapterCount+'章':'', wc, ...tags.map(t=>`<span class="tag-pill">${escapeHtml(t)}</span>`)].filter(Boolean).join(' · ')}</div>
        </div></div>`;
    }).join('') + '</div>';
    refreshIcons(container);
  } catch(e) {
    const container = $('authorBooks');
    if (container) container.innerHTML = '<div class="error view">加载失败</div>';
  }
}
function filterChapters(q, bid) {
  const el = $('chapterList'); if (!el) return;
  const d = cache.detail[bid]; if (!d) return;
  q = q.trim().toLowerCase();
  const data = loadData();
  const lastRead = data.readingHistory && data.readingHistory.bookId === bid ? data.readingHistory.chapterIdx : -1;
  if (!q) { el.innerHTML = renderChapterItems(d.chapters, bid, lastRead); return; }
  const matched = d.chapters.map((ch,i)=>({ch,i})).filter(({ch})=>(ch.Name||'').toLowerCase().includes(q));
  if (!matched.length) { el.innerHTML = '<div class="loading" style="padding:20px">无匹配</div>'; return; }
  el.innerHTML = matched.map(({ch,i})=>chapterItemHtml(ch,i,bid,lastRead)).join('');
}

function onChapterSlider(val, bid) {
  const idx = parseInt(val);
  const el = $('chapterSliderLabel');
  if (el) el.textContent = `第${idx+1}章`;
  navigate(`reader?book_id=${bid}&chapter_idx=${idx}`);
}

function doToggleShelf(bid) { const d = cache.detail[bid]; toggleShelf(bid, d.bookName, d.bookAuthor, d.bookThumb); renderDetail($('app'), bid); }

function toggleDesc() {
  const desc = $('bookDesc');
  const btn = $('descToggle');
  if (!desc || !btn) return;
  const collapsed = desc.classList.toggle('collapsed');
  btn.innerHTML = collapsed
    ? '展开简介 <i data-lucide="chevron-down" width="12" height="12" style="vertical-align:-1px"></i>'
    : '收起简介 <i data-lucide="chevron-up" width="12" height="12" style="vertical-align:-1px"></i>';
  refreshIcons(btn);
}

async function fetchOriginalCover(authorId, bid) {
  try {
    const r = await fetch(`${API}/api/author_books?author_id=${encodeURIComponent(authorId)}`);
    const data = await r.json();
    if (data.code === 200 && Array.isArray(data.data)) {
      const book = data.data.find(b => String(b.BookID) === String(bid));
      if (book && book.ThumbUrl) {
        const img = document.getElementById('originalCoverImg');
        if (img) img.src = book.ThumbUrl;
      }
    }
  } catch (e) {}
}

// ====== Render: Comments ======
let commentPage = { offset: 0, hasMore: true };
function renderComments(app, bid) {
  const d = cache.detail[bid];
  const list = d ? d.comments : null;
  if (!list || !list.length) { app.innerHTML = '<div class="error view">暂无评论</div>'; return; }
  commentPage.offset = 0;
  const pageSize = 20;
  const shown = list.slice(0, pageSize);
  let html = `<div class="comments-section view"><h3>全部评论 (${list.length})</h3>`;
  html += renderCommentItems(shown);
  if (list.length > pageSize) html += `<div class="load-more view"><button onclick="loadMoreComments('${bid}')">加载更多评论</button></div>`;
  html += '</div>';
  app.innerHTML = html;
  refreshIcons(app);
}
function renderCommentItems(list) {
  let html = '';
  for (const c of list) {
    const user = c.user_name || (c.user_info && c.user_info.user_name) || c.nick_name || '匿名';
    const avatar = c.avatar_url || (c.user_info && (c.user_info.user_avatar || c.user_info.avatar_url)) || '';
    const text = c.content || c.text || '';
    const time = c.create_time || c.create_timestamp || 0;
    const digg = c.digg_count || 0;
    const imgs = c.images || [];
    const reply = c.reply_list || c.reply_comment || c.child_comments || null;
    const avatarHtml = avatar
      ? `<img class="comment-avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="comment-avatar comment-avatar-placeholder">${escapeHtml((user||'匿')[0])}</div>`;
    html += `<div class="comment-item">${avatarHtml}<div class="comment-body">`;
    html += `<div class="comment-user">${escapeHtml(user)}</div>`;
    html += `<div class="comment-text">${escapeHtml(text)}</div>`;
    if (imgs.length > 0) {
      const imgGridClass = imgs.length === 1 ? 'comment-images single-img' : 'comment-images';
      html += `<div class="${imgGridClass}">`;
      for (const src of imgs) {
        html += `<img class="comment-img" src="${escapeHtml(src)}" alt="评论图片" loading="lazy" onclick="openImageViewer(this.src)">`;
      }
      html += '</div>';
    }
    const timeStr = time ? formatTime(time) : '';
    const diggStr = digg > 0 ? `<span class="comment-digg">${digg}</span>` : '';
    if (timeStr || diggStr) {
      html += `<div class="comment-meta">${timeStr ? `<span>${timeStr}</span>` : ''}${diggStr}</div>`;
    }
    if (reply && Array.isArray(reply) && reply.length > 0) {
      html += '<div class="comment-reply">';
      for (const rc of reply.slice(0,3)) {
        const rcUser = rc.user_name || (rc.user_info && rc.user_info.user_name) || rc.nick_name || '匿名';
        const rcAvatar = rc.avatar_url || (rc.user_info && (rc.user_info.user_avatar || rc.user_info.avatar_url)) || '';
        const rcAvatarHtml = rcAvatar
          ? `<img class="comment-avatar comment-avatar-sm" src="${escapeHtml(rcAvatar)}" alt="" loading="lazy" onerror="this.style.display='none'">`
          : `<div class="comment-avatar comment-avatar-sm comment-avatar-placeholder">${escapeHtml((rcUser||'匿')[0])}</div>`;
        html += `<div class="comment-item">${rcAvatarHtml}<div class="comment-body"><div class="comment-user">${escapeHtml(rcUser)}</div><div class="comment-text">${escapeHtml(rc.content||rc.text||'')}</div></div></div>`;
      }
      html += '</div>';
    }
    html += '</div></div>';
  }
  return html;
}
function loadMoreComments(bid) {
  const d = cache.detail[bid]; if (!d || !d.comments) return;
  commentPage.offset += 20;
  const more = d.comments.slice(commentPage.offset, commentPage.offset + 20);
  if (!more.length) return;
  const section = document.querySelector('.comments-section');
  if (!section) return;
  const btn = section.querySelector('.load-more');
  if (btn) btn.remove();
  section.insertAdjacentHTML('beforeend', renderCommentItems(more));
  if (commentPage.offset + 20 < d.comments.length) {
    section.insertAdjacentHTML('beforeend', `<div class="load-more view"><button onclick="loadMoreComments('${bid}')">加载更多评论</button></div>`);
  }
}
