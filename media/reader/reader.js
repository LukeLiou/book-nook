/* global ePub */
(function () {
  const vscode = acquireVsCodeApi();

  const els = {
    txt: document.getElementById('txt-reader'),
    epub: document.getElementById('epub-view'),
    toc: document.getElementById('toc-select'),
    prev: document.getElementById('btn-prev'),
    next: document.getElementById('btn-next'),
    progress: document.getElementById('progress-text'),
    status: document.getElementById('status')
  };

  let state = {
    bookId: '',
    format: '',
    fontSize: 16,
    lineHeight: 1.8,
    progress: null,
    epubBook: null,
    epubRendition: null,
    spineLength: 0,
    saving: false
  };

  function post(message) {
    vscode.postMessage(message);
  }

  function setStatus(text) {
    els.status.textContent = text;
    els.status.classList.remove('hidden');
  }

  function clearStatus() {
    els.status.classList.add('hidden');
  }

  function applyTypography() {
    document.documentElement.style.setProperty('--bn-font-size', state.fontSize + 'px');
    document.documentElement.style.setProperty('--bn-line-height', String(state.lineHeight));
  }

  function updateProgressText(percent) {
    const pct = Math.round(Math.min(100, Math.max(0, percent * 100)));
    els.progress.textContent = pct + '%';
  }

  function saveTxtProgress() {
    if (!els.txt || state.format !== 'txt') {
      return;
    }
    const el = els.txt;
    const max = el.scrollHeight - el.clientHeight;
    const scrollPercent = max <= 0 ? 0 : el.scrollTop / max;
    state.progress = { type: 'txt', scrollPercent };
    updateProgressText(scrollPercent);
    post({ type: 'progress', bookId: state.bookId, progress: state.progress });
  }

  function saveEpubProgress(location) {
    if (!location || state.format !== 'epub') {
      return;
    }
    const spineIndex = location.start?.index ?? 0;
    const displayed = location.start?.displayed;
    let scrollPercent = 0;
    if (displayed && displayed.total > 0) {
      scrollPercent = (displayed.page - 1) / displayed.total;
    }
    const chapterHref = location.start?.href;
    state.progress = {
      type: 'epub',
      spineIndex,
      scrollPercent,
      chapterHref
    };
    const overall = state.spineLength > 0
      ? (spineIndex + scrollPercent) / state.spineLength
      : scrollPercent;
    updateProgressText(overall);
    post({ type: 'progress', bookId: state.bookId, progress: state.progress });
  }

  function bindTxtScroll() {
    els.txt.removeEventListener('scroll', onTxtScroll);
    els.txt.addEventListener('scroll', onTxtScroll);
  }

  let txtScrollTimer;
  function onTxtScroll() {
    clearTimeout(txtScrollTimer);
    txtScrollTimer = setTimeout(saveTxtProgress, 300);
  }

  async function loadTxt(payload) {
    els.epub.classList.add('hidden');
    els.txt.classList.remove('hidden');
    els.toc.innerHTML = '';
    els.toc.disabled = true;
    els.prev.disabled = true;
    els.next.disabled = true;

    els.txt.textContent = payload.textContent || '';
    bindTxtScroll();

    const pct = payload.progress?.scrollPercent ?? 0;
    requestAnimationFrame(() => {
      const max = els.txt.scrollHeight - els.txt.clientHeight;
      els.txt.scrollTop = max * pct;
      updateProgressText(pct);
    });
  }

  async function destroyEpub() {
    if (state.epubRendition) {
      try {
        state.epubRendition.destroy();
      } catch (_) { /* ignore */ }
      state.epubRendition = null;
    }
    state.epubBook = null;
    els.epub.innerHTML = '';
  }

  async function loadEpub(payload) {
    if (typeof ePub === 'undefined') {
      setStatus('EPUB 引擎加载失败');
      post({ type: 'error', message: 'EPUB 引擎未加载' });
      return;
    }

    els.txt.classList.add('hidden');
    els.epub.classList.remove('hidden');
    await destroyEpub();

    setStatus('正在打开 EPUB…');
    const book = ePub(payload.bookUri);
    state.epubBook = book;

    try {
      await book.ready;
    } catch (err) {
      setStatus('无法打开 EPUB');
      post({ type: 'error', message: err?.message || 'EPUB 打开失败' });
      return;
    }

    clearStatus();
    state.spineLength = book.spine?.length || 0;

    const rendition = book.renderTo('epub-view', {
      width: '100%',
      height: '100%',
      flow: 'scrolled-doc',
      allowScriptedContent: false
    });
    state.epubRendition = rendition;

    rendition.themes.default({
      body: {
        color: 'var(--vscode-editor-foreground, #ccc) !important',
        background: 'var(--vscode-editor-background, #1e1e1e) !important',
        'font-size': state.fontSize + 'px !important',
        'line-height': String(state.lineHeight) + ' !important',
        padding: '16px !important'
      }
    });

    rendition.on('relocated', (location) => {
      saveEpubProgress(location);
    });

    await populateToc(book);

    const prog = payload.progress || {};
    let target = prog.chapterHref;
    if (!target && typeof prog.spineIndex === 'number') {
      const item = book.spine.get(prog.spineIndex);
      target = item?.href;
    }
    try {
      if (target) {
        await rendition.display(target);
      } else {
        await rendition.display();
      }
    } catch (_) {
      await rendition.display();
    }

    els.prev.disabled = false;
    els.next.disabled = false;
    saveEpubProgress(rendition.currentLocation());
  }

  async function populateToc(book) {
    els.toc.innerHTML = '';
    let toc = [];
    try {
      toc = await book.loaded.navigation;
      toc = toc?.toc || [];
    } catch (_) {
      toc = [];
    }

    if (!toc.length && book.spine) {
      book.spine.each((item, index) => {
        const opt = document.createElement('option');
        opt.value = item.href;
        opt.textContent = '章节 ' + (index + 1);
        els.toc.appendChild(opt);
      });
    } else {
      const walk = (items, depth) => {
        items.forEach((item) => {
          const opt = document.createElement('option');
          opt.value = item.href;
          opt.textContent = (depth ? '  '.repeat(depth) : '') + (item.label || item.href);
          els.toc.appendChild(opt);
          if (item.subitems?.length) {
            walk(item.subitems, depth + 1);
          }
        });
      };
      walk(toc, 0);
    }
    els.toc.disabled = els.toc.options.length === 0;
  }

  els.toc.addEventListener('change', async () => {
    if (!state.epubRendition || !els.toc.value) {
      return;
    }
    try {
      await state.epubRendition.display(els.toc.value);
    } catch (err) {
      post({ type: 'error', message: err?.message || '跳转章节失败' });
    }
  });

  els.prev.addEventListener('click', async () => {
    if (state.epubRendition) {
      await state.epubRendition.prev();
    }
  });

  els.next.addEventListener('click', async () => {
    if (state.epubRendition) {
      await state.epubRendition.next();
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
      clearStatus();

      if (payload.format === 'txt') {
        loadTxt(payload);
      } else if (payload.format === 'epub') {
        loadEpub(payload);
      }
    } else if (msg.type === 'updateSettings') {
      state.fontSize = msg.fontSize;
      state.lineHeight = msg.lineHeight;
      applyTypography();
      if (state.epubRendition) {
        state.epubRendition.themes.default({
          body: {
            'font-size': state.fontSize + 'px !important',
            'line-height': String(state.lineHeight) + ' !important'
          }
        });
      }
    }
  });

  post({ type: 'ready' });
})();
