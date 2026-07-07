(function () {
  const vscode = window.bookNookVsCode || (window.bookNookVsCode = acquireVsCodeApi());

  const els = {
    shelfUi: document.getElementById('shelf-ui'),
    grid: document.getElementById('shelf-grid'),
    empty: document.getElementById('shelf-empty'),
    btnImport: document.getElementById('btn-import'),
    btnRefresh: document.getElementById('btn-refresh'),
    btnEmptyImport: document.getElementById('btn-empty-import')
  };

  function post(msg) {
    vscode.postMessage(msg);
  }

  function progressLabel(pct) {
    if (pct <= 0) return '未读';
    if (pct >= 99) return '已读完';
    return pct + '%';
  }

  function createCoverPlaceholder(format) {
    const ph = document.createElement('div');
    ph.className = 'book-cover-placeholder';
    ph.textContent = format === 'epub' ? '📖' : '📄';
    return ph;
  }

  function createCoverSkeleton() {
    const sk = document.createElement('div');
    sk.className = 'skeleton-cover';
    sk.setAttribute('aria-hidden', 'true');
    return sk;
  }

  function setCardCover(coverWrap, coverDataUrl, format) {
    coverWrap.querySelectorAll('.book-cover, .book-cover-placeholder, .skeleton-cover').forEach((n) => n.remove());
    if (coverDataUrl) {
      const img = document.createElement('img');
      img.className = 'book-cover';
      img.src = coverDataUrl;
      img.alt = '';
      coverWrap.insertBefore(img, coverWrap.firstChild);
    } else {
      coverWrap.insertBefore(createCoverPlaceholder(format), coverWrap.firstChild);
    }
  }

  function renderSkeleton(count) {
    els.grid.innerHTML = '';
    els.grid.classList.remove('hidden');
    els.empty.classList.add('hidden');
    for (let i = 0; i < count; i++) {
      const card = document.createElement('div');
      card.className = 'book-card book-card-skeleton';
      card.innerHTML =
        '<div class="book-cover-wrap"><div class="skeleton-cover"></div></div>'
        + '<div class="skeleton-line"></div>'
        + '<div class="skeleton-line short"></div>';
      els.grid.appendChild(card);
    }
  }

  function updateCardProgress(card, pct) {
    const meta = card.querySelector('.book-meta');
    if (meta) meta.textContent = progressLabel(pct);

    let track = card.querySelector('.book-progress');
    if (pct > 0) {
      if (!track) {
        const coverWrap = card.querySelector('.book-cover-wrap');
        if (!coverWrap) return;
        track = document.createElement('div');
        track.className = 'book-progress';
        const fill = document.createElement('div');
        fill.className = 'book-progress-fill';
        track.appendChild(fill);
        coverWrap.appendChild(track);
      }
      const fill = track.querySelector('.book-progress-fill');
      if (fill) fill.style.width = pct + '%';
    } else if (track) {
      track.remove();
    }
  }

  function buildCard(book) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'book-card';
    card.dataset.bookId = book.id;
    card.dataset.format = book.format;
    card.title = book.title;

    const coverWrap = document.createElement('div');
    coverWrap.className = 'book-cover-wrap';

    if (book.coverDataUrl) {
      setCardCover(coverWrap, book.coverDataUrl, book.format);
    } else if (book.coverLoading !== false) {
      coverWrap.appendChild(createCoverSkeleton());
    } else {
      coverWrap.appendChild(createCoverPlaceholder(book.format));
    }

    if (book.progressPercent > 0) {
      const track = document.createElement('div');
      track.className = 'book-progress';
      const fill = document.createElement('div');
      fill.className = 'book-progress-fill';
      fill.style.width = book.progressPercent + '%';
      track.appendChild(fill);
      coverWrap.appendChild(track);
    }

    const title = document.createElement('p');
    title.className = 'book-title';
    title.textContent = book.title;

    const meta = document.createElement('p');
    meta.className = 'book-meta';
    meta.textContent = progressLabel(book.progressPercent);

    card.appendChild(coverWrap);
    card.appendChild(title);
    card.appendChild(meta);

    card.addEventListener('click', () => post({ type: 'open', bookId: book.id }));
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      post({ type: 'remove', bookId: book.id });
    });

    return card;
  }

  function renderBooks(books) {
    els.grid.innerHTML = '';
    const isEmpty = !books.length;
    els.empty.classList.toggle('hidden', !isEmpty);
    els.grid.classList.toggle('hidden', isEmpty);

    books.forEach((book) => {
      els.grid.appendChild(buildCard(book));
    });
  }

  function patchCover(bookId, coverDataUrl) {
    const card = els.grid.querySelector('[data-book-id="' + bookId + '"]');
    if (!card) return;
    const coverWrap = card.querySelector('.book-cover-wrap');
    const format = card.dataset.format || 'epub';
    if (coverWrap) setCardCover(coverWrap, coverDataUrl, format);
  }

  function patchBooks(books) {
    books.forEach((book) => {
      const card = els.grid.querySelector('[data-book-id="' + book.id + '"]');
      if (card) updateCardProgress(card, book.progressPercent);
    });
  }

  function showShelf() {
    els.shelfUi.classList.remove('hidden');
    const readerRoot = document.getElementById('reader-root');
    if (readerRoot) readerRoot.classList.add('hidden');
  }

  function showReader() {
    els.shelfUi.classList.add('hidden');
    const readerRoot = document.getElementById('reader-root');
    if (readerRoot) readerRoot.classList.remove('hidden');
  }

  els.btnImport.addEventListener('click', () => post({ type: 'import' }));
  els.btnEmptyImport.addEventListener('click', () => post({ type: 'import' }));
  els.btnRefresh.addEventListener('click', () => {
    const count = Math.max(els.grid.querySelectorAll('.book-card').length, 4);
    renderSkeleton(count);
    post({ type: 'refresh' });
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'update') {
      renderBooks(msg.books || []);
    } else if (msg.type === 'patchCover') {
      patchCover(msg.bookId, msg.coverDataUrl);
    } else if (msg.type === 'patchBooks') {
      patchBooks(msg.books || []);
    } else if (msg.type === 'showShelf') {
      showShelf();
    } else if (msg.type === 'showReader') {
      showReader();
    }
  });

  renderSkeleton(4);
  post({ type: 'shelfReady' });
})();
