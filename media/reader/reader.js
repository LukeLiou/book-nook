/* global ePub, JSZip */
(function () {
  const vscode = window.bookNookVsCode || (window.bookNookVsCode = acquireVsCodeApi());

  const els = {
    txtPane: document.getElementById('txt-reader'),
    txtContent: document.getElementById('txt-content'),
    epub: document.getElementById('epub-view'),
    homeBtn: document.getElementById('btn-home'),
    btnToc: document.getElementById('btn-toc'),
    btnFind: document.getElementById('btn-find'),
    btnHelp: document.getElementById('btn-help'),
    chapterOverlay: document.getElementById('chapter-overlay'),
    chapterClose: document.getElementById('chapter-close'),
    chapterLabel: document.getElementById('chapter-label'),
    chapterSearchWrap: document.getElementById('chapter-search-wrap'),
    chapterSearch: document.getElementById('chapter-search'),
    chapterList: document.getElementById('chapter-list'),
    searchOverlay: document.getElementById('search-overlay'),
    findInput: document.getElementById('find-input'),
    findCount: document.getElementById('find-count'),
    findPrev: document.getElementById('find-prev'),
    findNext: document.getElementById('find-next'),
    findResults: document.getElementById('find-results'),
    helpOverlay: document.getElementById('help-overlay'),
    prev: document.getElementById('btn-prev'),
    next: document.getElementById('btn-next'),
    pageUp: document.getElementById('btn-page-up'),
    pageDown: document.getElementById('btn-page-down'),
    progressText: document.getElementById('progress-text'),
    progressFill: document.getElementById('progress-fill'),
    status: document.getElementById('status'),
    statusText: document.getElementById('status-text')
  };

  let state = {
    bookId: '',
    format: '',
    fontSize: 16,
    lineHeight: 1.9,
    progress: null,
    epubBook: null,
    epubRendition: null,
    spineLength: 0,
    txtRaw: '',
    restoring: false,
    chapterNav: false,
    preservePosition: false
  };

  let tocItems = [];
  let findState = { query: '', results: [], index: -1 };
  let restoreToken = 0;

  function post(message) {
    vscode.postMessage(message);
  }

  function setStatus(text) {
    els.statusText.textContent = text;
    els.status.classList.remove('hidden');
  }

  function clearStatus() {
    els.status.classList.add('hidden');
  }

  function applyTypography() {
    document.documentElement.style.setProperty('--bn-font-size', state.fontSize + 'px');
    document.documentElement.style.setProperty('--bn-line-height', String(state.lineHeight));
  }

  function readCssVar(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim()
      || getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function isLightTheme() {
    return document.body.classList.contains('vscode-light')
      || (!document.body.classList.contains('vscode-dark')
        && !document.body.classList.contains('vscode-high-contrast')
        && !document.body.classList.contains('vscode-high-contrast-light'));
  }

  function getThemeColors() {
    const light = isLightTheme();
    return {
      bg: readCssVar('--vscode-editor-background') || (light ? '#ffffff' : '#1e1e1e'),
      fg: readCssVar('--vscode-editor-foreground') || (light ? '#333333' : '#d4d4d4'),
      muted: readCssVar('--vscode-descriptionForeground') || (light ? '#717171' : '#999999'),
      border: readCssVar('--vscode-panel-border') || (light ? '#e5e5e5' : '#3c3c3c'),
      sideBg: readCssVar('--vscode-sideBar-background') || readCssVar('--vscode-editor-background'),
      dropdownBg: readCssVar('--vscode-dropdown-background') || readCssVar('--vscode-editor-background'),
      accent: readCssVar('--vscode-textLink-foreground') || (light ? '#0066cc' : '#3794ff')
    };
  }

  function syncThemeVars() {
    const c = getThemeColors();
    const root = document.documentElement;
    root.style.setProperty('--bn-bg', c.bg);
    root.style.setProperty('--bn-fg', c.fg);
    root.style.setProperty('--bn-muted', c.muted);
    root.style.setProperty('--bn-border', c.border);
    root.style.setProperty('--bn-accent', c.accent);
    if (c.sideBg) root.style.setProperty('--bn-side-bg', c.sideBg);
    if (c.dropdownBg) root.style.setProperty('--bn-dropdown-bg', c.dropdownBg);
    applyEpubTheme();
  }

  function epubThemeRules() {
    const c = getThemeColors();
    const lh = String(state.lineHeight);
    const font = '"Source Han Serif SC", "Noto Serif SC", "Songti SC", "PingFang SC", "Microsoft YaHei", serif';
    const base = { color: c.fg + ' !important', 'background-color': 'transparent !important' };
    const heading = {
      ...base,
      'text-indent': '0 !important',
      'font-weight': '600 !important',
      'line-height': '1.4 !important',
      margin: '1.2em 0 0.6em !important'
    };
    return {
      html: { background: c.bg + ' !important' },
      body: {
        color: c.fg + ' !important',
        background: c.bg + ' !important',
        'font-family': font + ' !important',
        'font-size': state.fontSize + 'px !important',
        'line-height': lh + ' !important',
        'max-width': '42em !important',
        margin: '0 auto !important',
        padding: '20px 16px 48px !important',
        'text-align': 'justify !important',
        'letter-spacing': '0.03em !important'
      },
      p: { ...base, 'text-indent': '2em !important', margin: '0 0 0.75em !important', 'line-height': lh + ' !important' },
      div: { ...base, 'line-height': lh + ' !important' },
      span: base, li: { ...base, 'line-height': lh + ' !important' },
      h1: { ...heading, 'font-size': '1.5em !important' },
      h2: { ...heading, 'font-size': '1.3em !important' },
      h3: { ...heading, 'font-size': '1.15em !important' },
      a: { color: c.accent + ' !important', 'text-decoration': 'none !important' }
    };
  }

  function applyEpubTheme() {
    if (!state.epubRendition) return;
    state.epubRendition.themes.default(epubThemeRules());
    const c = getThemeColors();
    try {
      state.epubRendition.views().forEach((view) => {
        const doc = view.document;
        if (!doc) return;
        if (doc.documentElement) doc.documentElement.style.backgroundColor = c.bg;
        if (doc.body) {
          doc.body.style.backgroundColor = c.bg;
          doc.body.style.color = c.fg;
        }
      });
    } catch (_) { /* ignore */ }
  }

  function updateProgress(percent) {
    const pct = Math.round(Math.min(100, Math.max(0, percent * 100)));
    els.progressText.textContent = pct + '%';
    els.progressFill.style.width = pct + '%';
  }

  function isInputFocused() {
    const t = document.activeElement;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function cancelPendingRestore() {
    restoreToken += 1;
  }

  function getEpubScrollContainers() {
    const list = [];
    if (els.epub) list.push(els.epub);
    const iframe = els.epub?.querySelector('iframe');
    const doc = iframe?.contentDocument;
    if (doc) {
      const inner = doc.scrollingElement || doc.documentElement || doc.body;
      if (inner) list.push(inner);
    }
    return list;
  }

  function getScrollTarget() {
    if (state.format === 'txt') return els.txtPane;
    const containers = getEpubScrollContainers();
    let best = els.epub;
    let bestRange = 0;
    for (const el of containers) {
      if (!el) continue;
      const range = el.scrollHeight - el.clientHeight;
      if (range > bestRange) {
        bestRange = range;
        best = el;
      }
    }
    return best;
  }

  function getEpubScrollPercent() {
    const el = getScrollTarget();
    if (!el) return 0;
    const max = el.scrollHeight - el.clientHeight;
    return max <= 0 ? 0 : el.scrollTop / max;
  }

  function restoreScrollPosition(scrollPercent, attempts, token) {
    if (token === undefined) token = restoreToken;
    if (token !== restoreToken || state.chapterNav) return;

    attempts = attempts || 0;
    const el = state.format === 'txt' ? els.txtPane : getScrollTarget();
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0 && attempts < 30) {
      setTimeout(() => restoreScrollPosition(scrollPercent, attempts + 1, token), 100);
      return;
    }
    if (token !== restoreToken || state.chapterNav) return;
    el.style.scrollBehavior = 'auto';
    el.scrollTop = max * scrollPercent;
    if (state.restoring && attempts >= 30) {
      state.restoring = false;
    }
  }

  function resetEpubScrollToTop() {
    getEpubScrollContainers().forEach((el) => {
      if (!el) return;
      el.style.scrollBehavior = 'auto';
      el.scrollTop = 0;
    });
    const iframe = els.epub?.querySelector('iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.scrollTo(0, 0);
    }
    try {
      const contents = state.epubRendition?.getContents?.();
      if (contents) {
        contents.forEach((c) => {
          c.window?.scrollTo(0, 0);
          const doc = c.document;
          if (doc?.documentElement) doc.documentElement.scrollTop = 0;
          if (doc?.body) doc.body.scrollTop = 0;
        });
      }
    } catch (_) { /* ignore */ }
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function pinChapterToTop() {
    for (let i = 0; i < 24; i++) {
      if (!state.chapterNav) return;
      resetEpubScrollToTop();
      await delay(60);
    }
  }

  function resolveSpineIndex(href) {
    if (!state.epubBook?.spine || !href) return undefined;
    const base = href.split('#')[0];
    let index;
    state.epubBook.spine.each((item, i) => {
      if (item.href === href || item.href.split('#')[0] === base) index = i;
    });
    return index;
  }

  async function navigateToChapterStart(href) {
    if (!state.epubRendition) return;
    cancelPendingRestore();
    state.chapterNav = true;
    if (state.progress?.type === 'epub') {
      state.progress = { ...state.progress, cfi: undefined, scrollPercent: 0 };
    }

    const spineIndex = resolveSpineIndex(href);
    const displayTarget = spineIndex ?? findSpineHref(href);
    const rendition = state.epubRendition;
    const onRendered = () => { resetEpubScrollToTop(); };

    rendition.on('rendered', onRendered);
    try {
      await rendition.display(displayTarget);
      await pinChapterToTop();
      resetEpubScrollToTop();
      const loc = rendition.currentLocation();
      if (loc) commitChapterStartProgress(loc);
    } finally {
      if (typeof rendition.off === 'function') {
        rendition.off('rendered', onRendered);
      }
      state.chapterNav = false;
    }
  }

  function findSpineHref(href) {
    if (!state.epubBook?.spine || !href) return href;
    const base = href.split('#')[0];
    let found = href;
    state.epubBook.spine.each((item) => {
      const itemBase = item.href.split('#')[0];
      if (item.href === href || itemBase === base) found = item.href;
    });
    return found;
  }

  function commitChapterStartProgress(loc) {
    if (!loc || state.format !== 'epub') return;
    const spineIndex = loc.start?.index ?? 0;
    const chapterHref = loc.start?.href;
    const overall = state.spineLength > 0 ? spineIndex / state.spineLength : 0;
    state.progress = {
      type: 'epub',
      spineIndex,
      scrollPercent: 0,
      chapterHref,
      overallPercent: overall,
      cfi: loc.start?.cfi
    };
    updateProgress(overall);
    if (chapterHref) updateActiveChapter(chapterHref);
    post({ type: 'progress', bookId: state.bookId, progress: state.progress });
  }

  async function epubSpineNav(method) {
    if (!state.epubRendition || !state.epubBook) return;
    const loc = state.epubRendition.currentLocation();
    const idx = loc?.start?.index ?? 0;
    const targetIdx = method === 'prev' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= state.spineLength) return;
    const item = state.epubBook.spine.get(targetIdx);
    if (!item) return;
    try {
      await navigateToChapterStart(item.href);
    } catch (_) {
      state.chapterNav = false;
    }
  }

  let epubScrollBound = null;
  let epubScrollTimer;

  function bindEpubScroll() {
    const el = getScrollTarget();
    if (!el || el === epubScrollBound) return;
    if (epubScrollBound) {
      epubScrollBound.removeEventListener('scroll', onEpubScroll);
    }
    epubScrollBound = el;
    el.addEventListener('scroll', onEpubScroll, { passive: true });
  }

  function onEpubScroll() {
    clearTimeout(epubScrollTimer);
    epubScrollTimer = setTimeout(() => saveEpubProgressFromScroll(), 300);
  }

  function flushProgress() {
    if (state.format === 'txt') {
      saveTxtProgress();
    } else if (state.format === 'epub') {
      saveEpubProgressFromScroll();
    }
  }

  function saveEpubProgressFromScroll() {
    if (state.restoring || state.chapterNav || !state.epubRendition || state.format !== 'epub') return;
    const loc = state.epubRendition.currentLocation();
    if (!loc) return;
    const spineIndex = loc.start?.index ?? 0;
    const scrollPercent = getEpubScrollPercent();
    const chapterHref = loc.start?.href;
    const cfi = loc.start?.cfi;
    const overall = state.spineLength > 0
      ? (spineIndex + scrollPercent) / state.spineLength
      : scrollPercent;
    state.progress = {
      type: 'epub',
      spineIndex,
      scrollPercent,
      chapterHref,
      overallPercent: overall,
      cfi
    };
    updateProgress(overall);
    if (chapterHref) updateActiveChapter(chapterHref);
    post({ type: 'progress', bookId: state.bookId, progress: state.progress });
  }

  function scrollPage(direction) {
    const el = getScrollTarget();
    if (!el) return;
    const h = el.clientHeight || els.epub.clientHeight || 300;
    const delta = direction * h * 0.88;
    if (typeof el.scrollBy === 'function') {
      el.scrollBy({ top: delta, behavior: 'smooth' });
    } else {
      el.scrollTop += delta;
    }
  }

  function setNavEnabled(enabled) {
    els.prev.disabled = !enabled;
    els.next.disabled = !enabled;
    els.btnToc.disabled = !enabled;
  }

  /* ── Overlays ── */
  function closeAllPanels() {
    els.chapterOverlay.classList.add('hidden');
    els.searchOverlay.classList.add('hidden');
    els.helpOverlay.classList.add('hidden');
  }

  function openPanel(name) {
    closeAllPanels();
    if (name === 'chapter') els.chapterOverlay.classList.remove('hidden');
    else if (name === 'search') {
      els.searchOverlay.classList.remove('hidden');
      els.findInput.focus();
      els.findInput.select();
    } else if (name === 'help') els.helpOverlay.classList.remove('hidden');
  }

  document.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => {
      const target = el.getAttribute('data-close');
      if (target === 'chapter') els.chapterOverlay.classList.add('hidden');
      else if (target === 'search') els.searchOverlay.classList.add('hidden');
      else if (target === 'help') els.helpOverlay.classList.add('hidden');
    });
  });

  /* ── Chapter ── */
  function resetChapterPicker() {
    tocItems = [];
    els.chapterList.innerHTML = '';
    els.chapterLabel.textContent = '';
    els.chapterSearch.value = '';
    els.btnToc.disabled = true;
  }

  function openChapterPanel() {
    openPanel('chapter');
    els.chapterSearch.value = '';
    filterChapterList('');
    const active = els.chapterList.querySelector('.chapter-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function updateActiveChapter(href) {
    if (!href) return;
    const item = tocItems.find((t) => t.href === href);
    if (item) els.chapterLabel.textContent = '· ' + item.label;
    els.chapterList.querySelectorAll('.chapter-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.href === href);
    });
  }

  async function jumpToChapter(href) {
    els.chapterOverlay.classList.add('hidden');
    if (!state.epubRendition || !href) return;
    try {
      await navigateToChapterStart(href);
    } catch (err) {
      state.chapterNav = false;
      post({ type: 'error', message: err?.message || '跳转章节失败' });
    }
  }

  function renderChapterItems(items) {
    els.chapterList.innerHTML = '';
    if (!items.length) {
      const hint = document.createElement('button');
      hint.type = 'button';
      hint.className = 'chapter-item empty-hint';
      hint.textContent = '无匹配章节';
      hint.disabled = true;
      els.chapterList.appendChild(hint);
      return;
    }
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chapter-item';
      btn.dataset.href = item.href;
      btn.style.paddingLeft = (16 + item.depth * 14) + 'px';
      const label = document.createElement('span');
      label.className = 'chapter-item-label';
      label.textContent = item.label;
      btn.title = item.label;
      btn.appendChild(label);
      btn.addEventListener('click', () => void jumpToChapter(item.href));
      els.chapterList.appendChild(btn);
    });
    const current = state.progress?.chapterHref;
    if (current) updateActiveChapter(current);
  }

  function filterChapterList(query) {
    const q = query.trim().toLowerCase();
    renderChapterItems(q ? tocItems.filter((t) => t.label.toLowerCase().includes(q)) : tocItems);
  }

  function buildChapterList(items) {
    tocItems = items;
    renderChapterItems(items);
    els.btnToc.disabled = items.length === 0;
    els.chapterSearchWrap.classList.toggle('hidden', items.length < 6);
  }

  /* ── Full-text search ── */
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderTxtHighlights(activeIdx) {
    const text = state.txtRaw;
    const q = findState.query;
    if (!q) {
      els.txtContent.textContent = text;
      return;
    }
    const lower = text.toLowerCase();
    const qLower = q.toLowerCase();
    let html = '';
    let pos = 0;
    let matchIdx = 0;
    while (pos < text.length) {
      const found = lower.indexOf(qLower, pos);
      if (found === -1) {
        html += escapeHtml(text.slice(pos));
        break;
      }
      html += escapeHtml(text.slice(pos, found));
      const cls = matchIdx === activeIdx ? 'search-hit active' : 'search-hit';
      html += '<mark class="' + cls + '">' + escapeHtml(text.slice(found, found + q.length)) + '</mark>';
      matchIdx++;
      pos = found + q.length;
    }
    els.txtContent.innerHTML = html;
    const mark = els.txtContent.querySelector('mark.active');
    if (mark) mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function buildTxtFindResults(query) {
    const results = [];
    const lower = state.txtRaw.toLowerCase();
    const qLower = query.toLowerCase();
    let pos = 0;
    while (pos < lower.length) {
      const found = lower.indexOf(qLower, pos);
      if (found === -1) break;
      const start = Math.max(0, found - 20);
      const end = Math.min(state.txtRaw.length, found + query.length + 30);
      results.push({
        type: 'txt',
        offset: found,
        chapter: '正文',
        excerpt: (start > 0 ? '…' : '') + state.txtRaw.slice(start, end) + (end < state.txtRaw.length ? '…' : '')
      });
      pos = found + query.length;
    }
    return results;
  }

  async function buildEpubFindResults(query) {
    const results = [];
    if (!state.epubBook) return results;
    const tasks = [];
    state.epubBook.spine.each((section) => {
      tasks.push((async () => {
        try {
          await section.load(state.epubBook.load.bind(state.epubBook));
          const matches = await section.find(query);
          if (!matches?.length) return;
          const chLabel = tocItems.find((t) => t.href === section.href)?.label || section.href;
          matches.forEach((m) => {
            results.push({
              type: 'epub',
              href: section.href,
              cfi: m.cfi,
              chapter: chLabel,
              excerpt: m.excerpt || query
            });
          });
        } catch (_) { /* skip section */ }
      })());
    });
    await Promise.all(tasks);
    return results;
  }

  function renderFindResults() {
    els.findResults.innerHTML = '';
    if (!findState.query) {
      els.findResults.innerHTML = '<div class="find-empty">输入关键词开始搜索</div>';
      return;
    }
    if (!findState.results.length) {
      els.findResults.innerHTML = '<div class="find-empty">未找到匹配内容</div>';
      return;
    }
    findState.results.forEach((r, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'find-result-item' + (i === findState.index ? ' active' : '');
      btn.innerHTML = '<span class="find-result-chapter">' + escapeHtml(r.chapter) + '</span>'
        + '<span class="find-result-excerpt">' + escapeHtml(r.excerpt) + '</span>';
      btn.addEventListener('click', () => {
        findState.index = i;
        void goToFindResult(i);
      });
      els.findResults.appendChild(btn);
    });
  }

  function updateFindUi() {
    const total = findState.results.length;
    const cur = findState.index;
    els.findCount.textContent = total ? (cur + 1) + ' / ' + total : (findState.query ? '0 条' : '');
    els.findPrev.disabled = total === 0;
    els.findNext.disabled = total === 0;
    renderFindResults();
  }

  async function runSearch(query) {
    findState.query = query.trim();
    findState.index = -1;
    if (!findState.query) {
      findState.results = [];
      if (state.format === 'txt') els.txtContent.textContent = state.txtRaw;
      updateFindUi();
      return;
    }
    setStatus('搜索中…');
    if (state.format === 'txt') {
      findState.results = buildTxtFindResults(findState.query);
    } else {
      findState.results = await buildEpubFindResults(findState.query);
    }
    clearStatus();
    if (findState.results.length) {
      findState.index = 0;
      await goToFindResult(0);
    } else if (state.format === 'txt') {
      els.txtContent.textContent = state.txtRaw;
    }
    updateFindUi();
  }

  async function goToFindResult(index) {
    if (index < 0 || index >= findState.results.length) return;
    findState.index = index;
    const r = findState.results[index];
    if (r.type === 'txt') {
      renderTxtHighlights(index);
    } else if (r.cfi) {
      state.preservePosition = true;
      try {
        await state.epubRendition.display(r.cfi);
      } catch (_) {
        try { await state.epubRendition.display(r.href); } catch (e) { /* ignore */ }
      } finally {
        state.preservePosition = false;
      }
    }
    updateFindUi();
  }

  function findNext() {
    if (!findState.results.length) return;
    const next = (findState.index + 1) % findState.results.length;
    void goToFindResult(next);
  }

  function findPrev() {
    if (!findState.results.length) return;
    const prev = (findState.index - 1 + findState.results.length) % findState.results.length;
    void goToFindResult(prev);
  }

  /* ── Progress ── */
  function saveTxtProgress() {
    if (state.restoring || !els.txtPane || state.format !== 'txt') return;
    const max = els.txtPane.scrollHeight - els.txtPane.clientHeight;
    const scrollPercent = max <= 0 ? 0 : els.txtPane.scrollTop / max;
    state.progress = { type: 'txt', scrollPercent };
    updateProgress(scrollPercent);
    post({ type: 'progress', bookId: state.bookId, progress: state.progress });
  }

  function saveEpubProgress(location) {
    if (!location || state.format !== 'epub' || state.restoring) return;
    bindEpubScroll();
    saveEpubProgressFromScroll();
  }

  let txtScrollTimer;
  function onTxtScroll() {
    clearTimeout(txtScrollTimer);
    txtScrollTimer = setTimeout(saveTxtProgress, 300);
  }

  function bindTxtScroll() {
    els.txtPane.removeEventListener('scroll', onTxtScroll);
    els.txtPane.addEventListener('scroll', onTxtScroll);
  }

  /* ── Load ── */
  async function loadTxt(payload) {
    resetChapterPicker();
    setNavEnabled(false);
    findState = { query: '', results: [], index: -1 };
    els.epub.classList.add('hidden');
    els.txtPane.classList.remove('hidden');
    state.txtRaw = payload.textContent || '';
    els.txtContent.textContent = state.txtRaw;
    bindTxtScroll();
    const pct = payload.progress?.scrollPercent ?? 0;
    cancelPendingRestore();
    const token = restoreToken;
    state.restoring = true;
    requestAnimationFrame(() => {
      restoreScrollPosition(pct, 0, token);
      setTimeout(() => {
        if (token === restoreToken) state.restoring = false;
      }, 400);
    });
  }

  async function destroyEpub() {
    if (state.epubRendition) {
      try { state.epubRendition.destroy(); } catch (_) { /* ignore */ }
      state.epubRendition = null;
    }
    state.epubBook = null;
    els.epub.innerHTML = '';
  }

  async function loadEpub(payload) {
    if (typeof JSZip === 'undefined' || typeof ePub === 'undefined') {
      setStatus('引擎加载失败');
      post({ type: 'error', message: '阅读引擎未加载' });
      return;
    }
    resetChapterPicker();
    findState = { query: '', results: [], index: -1 };
    els.txtPane.classList.add('hidden');
    els.epub.classList.remove('hidden');
    await destroyEpub();
    setStatus('正在打开…');

    let source = payload.bookUri;
    if (payload.bookData) {
      const data = payload.bookData;
      source = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    if (!source) {
      setStatus('打开失败');
      return;
    }

    const book = ePub(source);
    state.epubBook = book;
    try {
      await book.ready;
    } catch (err) {
      setStatus('打开失败');
      post({ type: 'error', message: err?.message || 'EPUB 打开失败' });
      return;
    }

    clearStatus();
    state.spineLength = book.spine?.length || 0;
    const rendition = book.renderTo('epub-view', {
      width: '100%', height: '100%', flow: 'scrolled', allowScriptedContent: false
    });
    state.epubRendition = rendition;
    applyEpubTheme();
    rendition.on('relocated', (loc) => {
      bindEpubScroll();
      if (state.preservePosition || state.chapterNav || state.restoring) return;
      saveEpubProgress(loc);
    });
    await populateToc(book);

    const prog = payload.progress || {};
    cancelPendingRestore();
    const token = restoreToken;
    state.restoring = true;
    try {
      if (prog.cfi) {
        await rendition.display(prog.cfi);
      } else {
        let target = prog.chapterHref;
        if (!target && typeof prog.spineIndex === 'number') {
          target = book.spine.get(prog.spineIndex)?.href;
        }
        await rendition.display(target || undefined);
        const savedScroll = prog.scrollPercent ?? 0;
        if (savedScroll > 0) {
          restoreScrollPosition(savedScroll, 0, token);
        }
      }
    } catch (_) {
      try {
        await rendition.display();
      } catch (e) { /* ignore */ }
    }
    bindEpubScroll();
    setNavEnabled(true);
    setTimeout(() => {
      if (token === restoreToken) state.restoring = false;
    }, 600);
  }

  async function populateToc(book) {
    const items = [];
    let toc = [];
    try {
      toc = (await book.loaded.navigation)?.toc || [];
    } catch (_) { /* ignore */ }
    const walk = (entries, depth) => {
      entries.forEach((entry) => {
        items.push({ href: entry.href, label: entry.label || entry.href, depth });
        if (entry.subitems?.length) walk(entry.subitems, depth + 1);
      });
    };
    if (toc.length) walk(toc, 0);
    else if (book.spine) {
      book.spine.each((item, i) => items.push({ href: item.href, label: '第 ' + (i + 1) + ' 章', depth: 0 }));
    }
    buildChapterList(items);
  }

  /* ── Events ── */
  els.homeBtn.addEventListener('click', () => {
    flushProgress();
    post({ type: 'goHome', bookId: state.bookId, progress: state.progress });
  });
  els.btnToc.addEventListener('click', openChapterPanel);
  els.btnFind.addEventListener('click', () => openPanel('search'));
  els.btnHelp.addEventListener('click', () => openPanel('help'));
  els.chapterClose.addEventListener('click', () => els.chapterOverlay.classList.add('hidden'));
  els.chapterSearch.addEventListener('input', () => filterChapterList(els.chapterSearch.value));

  let findDebounce;
  els.findInput.addEventListener('input', () => {
    clearTimeout(findDebounce);
    findDebounce = setTimeout(() => void runSearch(els.findInput.value), 300);
  });
  els.findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) findPrev();
      else findNext();
    }
  });
  els.findPrev.addEventListener('click', findPrev);
  els.findNext.addEventListener('click', findNext);

  els.prev.addEventListener('click', () => { void epubSpineNav('prev'); });
  els.next.addEventListener('click', () => { void epubSpineNav('next'); });
  els.pageUp.addEventListener('click', () => scrollPage(-1));
  els.pageDown.addEventListener('click', () => scrollPage(1));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!els.searchOverlay.classList.contains('hidden')) { els.searchOverlay.classList.add('hidden'); return; }
      if (!els.helpOverlay.classList.contains('hidden')) { els.helpOverlay.classList.add('hidden'); return; }
      if (!els.chapterOverlay.classList.contains('hidden')) { els.chapterOverlay.classList.add('hidden'); return; }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      openPanel('search');
      return;
    }
    if (isInputFocused()) return;

    if (e.key === 't' || e.key === 'T') {
      if (!els.btnToc.disabled) { e.preventDefault(); openChapterPanel(); }
      return;
    }
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      openPanel('help');
      return;
    }
    if (e.key === ' ' && !e.shiftKey) {
      e.preventDefault();
      scrollPage(1);
      return;
    }
    if (e.key === ' ' && e.shiftKey) {
      e.preventDefault();
      scrollPage(-1);
      return;
    }
    if (e.key === 'PageDown') { e.preventDefault(); scrollPage(1); return; }
    if (e.key === 'PageUp') { e.preventDefault(); scrollPage(-1); return; }

    if (state.format === 'epub' && state.epubRendition) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); void epubSpineNav('prev'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); void epubSpineNav('next'); }
    }
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'load') {
      const payload = msg.payload;
      state.bookId = payload.bookId;
      state.format = payload.format;
      state.fontSize = payload.fontSize;
      state.lineHeight = payload.lineHeight;
      state.progress = payload.progress;
      applyTypography();
      syncThemeVars();
      clearStatus();
      closeAllPanels();
      updateProgress(payload.progress?.scrollPercent ?? 0);
      if (payload.format === 'txt') loadTxt(payload);
      else if (payload.format === 'epub') {
        void loadEpub(payload).catch((err) => {
          setStatus('打开失败');
          post({ type: 'error', message: err?.message || 'EPUB 打开失败' });
        });
      }
    } else if (msg.type === 'themeChanged') {
      syncThemeVars();
    } else if (msg.type === 'updateSettings') {
      state.fontSize = msg.fontSize;
      state.lineHeight = msg.lineHeight;
      applyTypography();
      applyEpubTheme();
    } else if (msg.type === 'showReader') {
      const readerRoot = document.getElementById('reader-root');
      const shelfUi = document.getElementById('shelf-ui');
      if (readerRoot) readerRoot.classList.remove('hidden');
      if (shelfUi) shelfUi.classList.add('hidden');
    } else if (msg.type === 'showShelf') {
      const readerRoot = document.getElementById('reader-root');
      const shelfUi = document.getElementById('shelf-ui');
      if (readerRoot) readerRoot.classList.add('hidden');
      if (shelfUi) shelfUi.classList.remove('hidden');
    }
  });

  syncThemeVars();
  let themeSyncTimer;
  new MutationObserver(() => {
    clearTimeout(themeSyncTimer);
    themeSyncTimer = setTimeout(syncThemeVars, 50);
  }).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });

  post({ type: 'ready' });
})();
