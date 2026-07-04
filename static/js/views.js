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
      <div class="ring"><svg width="52" height="52"><circle class="ring-bg" cx="26" cy="26" r="22"/><circle class="ring-fg" cx="26" cy="26" r="22" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"/></svg><div class="ring-text">${pct}%</div></div></div>`;
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
    const stars = score > 0 ? '<i data-lucide="star" width="12" height="12" style="vertical-align:-1px"></i>'+(score/10).toFixed(1) : '';
    html += `<div class="book-card" onclick="navigate('detail?book_id=${book.BookID}')">
      <img class="book-cover" src="${book.ThumbUrl||FALLBACK_IMG}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'">
      <div class="book-info">
        <div class="book-title">${escapeHtml(book.Name||'')}${status?`<span class="status-badge ${status==='连载中'?'ongoing':'finished'}">${status}</span>`:''}</div>
        <div class="book-author">${escapeHtml(book.Author||'')} ${stars?'· '+stars:''}</div>
        <div class="book-desc">${escapeHtml(book.Desc||'')}</div>
        <div class="book-meta">${book.ChapterCount?book.ChapterCount+'章':''} ${wc?'· '+wc:''} ${book.Category?'· '+escapeHtml(book.Category):''} ${tags.map(t=>`<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}</div>
      </div></div>`;
  }
  html += '</div>';
  if (td.books.length > 0) html += `<div class="load-more view"><button onclick="loadMore()" ${S.loading?'disabled':''}>${S.loading?'加载中...':td.hasMore?'加载更多':'没有更多了'}</button></div>`;
  app.innerHTML = html;
  refreshIcons(app);
}

// ====== Render: Shelf ======
function renderShelf(app) {
  const data = loadData();
  const rh = data.readingHistory;
  let html = `<div class="home-section view"><div class="section-title">我的书架 (${data.shelf.length})</div>`;
  if (!data.shelf.length) html += '<div class="shelf-empty"><div class="icon"><i data-lucide="book-open" width="48" height="48"></i></div><div>还没有收藏的书籍<br><span style="font-size:12px">在书籍详情页点击收藏即可加入书架</span></div></div>';
  else {
    html += '<div class="shelf-grid">';
    for (const b of data.shelf) {
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
  if (detail) {
    const cover = detail.thumb_url || detail.audio_thumb_uri || '';
    const title = detail.title || detail.book_name || '未知';
    const author = detail.author || detail.writer || '未知';
    const desc = detail.abstract || detail.description || '';
    const cat = detail.category || detail.categories || '';
    const cc = detail.chapter_number || chapters.length || '';
    const wc = detail.word_number ? (detail.word_number/10000).toFixed(0)+'万字' : '';
    const score = detail.score || '';
    html += `<div class="book-detail-header">
      <img class="book-detail-cover" src="${cover||FALLBACK_IMG}" onerror="this.src='${FALLBACK_IMG}'">
      <div class="book-detail-info">
        <div class="book-detail-title">${escapeHtml(title)}</div>
        <div class="book-detail-author">${escapeHtml(author)}</div>
        <div class="book-detail-meta">${cat?`<span class="detail-tag">${escapeHtml(cat)}</span>`:''}${cc?`<span class="detail-stat">${cc}章</span>`:''}${wc?`<span class="detail-stat">${wc}</span>`:''}${score?`<span class="detail-stat">评分 ${score}</span>`:''}</div>
        <div class="book-detail-actions">
          <button class="btn-primary" onclick="navigate('reader?book_id=${bid}&chapter_idx=${resumeIdx>=0?resumeIdx:0}')">${resumeIdx>=0?'继续阅读':'开始阅读'}</button>
          <button class="btn-outline" onclick="navigate('comments?book_id=${bid}')">评论</button>
          <button class="btn-outline ${inShelf?'active':''}" onclick="doToggleShelf('${bid}')">${inShelf?'<i data-lucide="check" width="14" height="14" style="vertical-align:-2px"></i> 已收藏':'+ 收藏'}</button>
          <button class="btn-outline" onclick="shareLink('${escapeHtml(title)}','/#detail?book_id=${bid}')">分享</button>
        </div>
      </div></div>`;
    if (desc) html += `<div class="book-detail-desc">${escapeHtml(desc)}</div>`;
  } else { html += errorHtml('加载失败', `detail?book_id=${bid}`); }
  html += '</div>';

  const searchInput = chapters.length > 10 ? `<input type="text" class="chapter-search-input" placeholder="筛选..." oninput="debouncedFilter(this.value,'${bid}')">` : '';
  const slider = chapters.length > 20 ? `<div class="chapter-slider-wrap"><input type="range" min="0" max="${chapters.length-1}" value="${resumeIdx>=0?resumeIdx:0}" oninput="onChapterSlider(this.value,'${bid}')" id="chapterSlider"><span class="chapter-slider-label" id="chapterSliderLabel">第${(resumeIdx>=0?resumeIdx:0)+1}章</span></div>` : '';
  html += `<div class="chapter-section view"><div class="chapter-section-title"><span>章节目录 · ${chapters.length} 章</span>${searchInput}</div>${slider}<div class="chapter-list" id="chapterList">`;
  if (!chapters.length) html += '<div class="loading" style="padding:20px">暂无章节</div>';
  else html += renderChapterItems(chapters, bid, resumeIdx);
  html += '</div></div>';
  if (data.stats.chaptersRead > 0) html += `<div class="stats-bar view">已读 ${data.stats.chaptersRead} 章</div>`;

  const allBooks = Object.values(cache.detail).filter(x => x.bookAuthor && x.bookAuthor === d.bookAuthor && x.bookName !== d.bookName).slice(0,6);
  if (allBooks.length > 0) {
    html += `<div class="related-section view"><h3>同作者</h3><div class="related-scroll">`;
    for (const rb of allBooks) {
      const rbid = Object.keys(cache.detail).find(k => cache.detail[k] === rb);
      html += `<div class="related-item" onclick="navigate('detail?book_id=${rbid}')"><img src="${rb.bookThumb||FALLBACK_IMG}" loading="lazy" onerror="this.src='${FALLBACK_IMG}'"><div class="name">${escapeHtml(rb.bookName)}</div></div>`;
    }
    html += '</div></div>';
  }
  app.innerHTML = html;
  refreshIcons(app);
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
    const user = c.user_name || c.nick_name || '匿名';
    const text = c.content || c.text || '';
    const time = c.create_time || c.create_timestamp || 0;
    const digg = c.digg_count || 0;
    const reply = c.reply_comment || c.child_comments || null;
    html += `<div class="comment-item"><div class="comment-user">${escapeHtml(user)}</div><div class="comment-text">${escapeHtml(text)}</div><div class="comment-time">${time?formatTime(time):''} ${digg>0?'· 👍 '+digg:''}</div>`;
    if (reply && Array.isArray(reply) && reply.length > 0) {
      html += '<div class="comment-reply">';
      for (const rc of reply.slice(0,3)) html += `<div class="comment-item"><div class="comment-user">${escapeHtml(rc.user_name||rc.nick_name||'匿名')}</div><div class="comment-text">${escapeHtml(rc.content||rc.text||'')}</div></div>`;
      html += '</div>';
    }
    html += '</div>';
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
