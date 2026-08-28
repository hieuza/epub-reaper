/**
 * EPUB Reaper – Standalone macOS Desktop App Controller
 */
(function() {
  'use strict';

  // ── Global References & State ──────────────────────────────────────────
  let book               = null;
  let rendition          = null;
  let bookKey            = null;
  let tocItems           = [];
  let currentTheme       = 'dark';
  let currentFontSize    = 100;
  let currentSpread      = 'single';
  let currentColumnWidth = 760;
  let isScrubbing        = false;
  let currentFileName    = null;
  let currentBookTitle   = null;

  const FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif';
  const FAV_KEY = 'epubrex_favorites';

  // ── DOM Elements ───────────────────────────────────────────────────────
  const byId = (id) => document.getElementById(id);

  const bookTitleEl       = byId('bookTitle');
  const bookAuthorEl      = byId('bookAuthor');
  const topBar            = byId('topBar');
  const bottomBar         = byId('bottomBar');
  const dropZone          = byId('dropZone');
  const recentSection     = byId('recentBooksSection');
  const recentListEl      = byId('recentBooksList');
  const viewerArea        = byId('viewerArea');
  const prevBtn           = byId('prevBtn');
  const nextBtn           = byId('nextBtn');
  const sidebarOverlay    = byId('sidebarOverlay');
  const tocSidebar        = byId('tocSidebar');
  const tocToggleBtn      = byId('tocToggleBtn');
  const closeTocBtn       = byId('closeTocBtn');
  const tocNav            = byId('tocNav');
  const tocFilterInput    = byId('tocFilterInput');
  const searchSidebar     = byId('searchSidebar');
  const searchToggleBtn   = byId('searchToggleBtn');
  const closeSearchBtn    = byId('closeSearchBtn');
  const searchForm        = byId('searchForm');
  const searchInput       = byId('searchInput');
  const searchResults     = byId('searchResults');
  const bookmarkSidebar   = byId('bookmarkSidebar');
  const bookmarkToggleBtn = byId('bookmarkToggleBtn');
  const addBookmarkBtn    = byId('addBookmarkBtn');
  const closeBookmarkBtn  = byId('closeBookmarkBtn');
  const bookmarkListEl    = byId('bookmarkList');
  const historySidebar    = byId('historySidebar');
  const historyToggleBtn  = byId('historyToggleBtn');
  const closeHistoryBtn   = byId('closeHistoryBtn');
  const historyListEl     = byId('historyList');
  const favoriteBtn       = byId('favoriteBtn');
  const favoritesSidebar  = byId('favoritesSidebar');
  const favoritesToggleBtn= byId('favoritesToggleBtn');
  const closeFavoritesBtn = byId('closeFavoritesBtn');
  const favoritesListEl   = byId('favoritesList');
  const spreadSingleBtn   = byId('spreadSingleBtn');
  const spreadDoubleBtn   = byId('spreadDoubleBtn');
  const widthNarrowBtn    = byId('widthNarrowBtn');
  const widthNormalBtn    = byId('widthNormalBtn');
  const widthWideBtn      = byId('widthWideBtn');
  const fontSizeDecBtn    = byId('fontSizeDecBtn');
  const fontSizeIncBtn    = byId('fontSizeIncBtn');
  const fontSizeDisplay   = byId('fontSizeDisplay');
  const themeBtns         = document.querySelectorAll('.theme-btn');
  const fileInput         = byId('fileInput');
  const openFileBtn       = byId('openFileBtn');
  const welcomeOpenBtn    = byId('welcomeOpenBtn');
  const progressSlider    = byId('progressSlider');
  const progressPercentage= byId('progressPercentage');
  const currentChapterName= byId('currentChapterName');
  const jumpBtn           = byId('jumpLocationBtn');

  // ── Unified Storage Wrapper ────────────────────────────────────────────
  const S = {
    get(k, cb) {
      try {
        const raw = localStorage.getItem(k);
        cb(raw !== null ? JSON.parse(raw) : undefined);
      } catch {
        cb(undefined);
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch(e) {}
    }
  };

  // ── IndexedDB (recent books cache) ─────────────────────────────────────
  const MAX_RECENT = 10;
  const DB = {
    _conn: null,
    async _open() {
      if (this._conn) return this._conn;
      return new Promise((ok, fail) => {
        const r = indexedDB.open('epubreaper_db', 1);
        r.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('books'))
            db.createObjectStore('books', { keyPath: 'name' });
        };
        r.onsuccess = () => { this._conn = r.result; ok(r.result); };
        r.onerror = () => fail(r.error);
      });
    },
    async save(name, title, buf) {
      try {
        const db = await this._open();
        const tx = db.transaction('books', 'readwrite');
        const store = tx.objectStore('books');
        store.put({ name, title, buffer: buf, ts: Date.now() });
        const count = await new Promise(ok => {
          const r = store.count();
          r.onsuccess = () => ok(r.result);
          r.onerror = () => ok(0);
        });
        if (count > MAX_RECENT) {
          const entries = [];
          await new Promise(ok => {
            store.openCursor().onsuccess = (e) => {
              const c = e.target.result;
              if (c) { entries.push({ name: c.value.name, ts: c.value.ts }); c.continue(); }
              else ok();
            };
          });
          entries.sort((a, b) => a.ts - b.ts);
          for (let i = 0; i < entries.length - MAX_RECENT; i++) {
            store.delete(entries[i].name);
          }
        }
      } catch(e) {}
    },
    async list() {
      try {
        const db = await this._open();
        return new Promise((ok) => {
          const tx = db.transaction('books', 'readonly');
          const store = tx.objectStore('books');
          const results = [];
          const req = store.openCursor();
          req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              results.push({ name: cursor.value.name, title: cursor.value.title, ts: cursor.value.ts });
              cursor.continue();
            } else {
              results.sort((a, b) => (b.ts || 0) - (a.ts || 0));
              ok(results);
            }
          };
          req.onerror = () => ok([]);
        });
      } catch { return []; }
    },
    async get(name) {
      try {
        const db = await this._open();
        return new Promise((ok) => {
          const req = db.transaction('books', 'readonly').objectStore('books').get(name);
          req.onsuccess = () => ok(req.result);
          req.onerror = () => ok(null);
        });
      } catch { return null; }
    },
    async del(name) {
      try {
        const db = await this._open();
        db.transaction('books', 'readwrite').objectStore('books').delete(name);
      } catch(e) {}
    }
  };

  // ── Initialization ─────────────────────────────────────────────────────
  async function init() {
    S.get('epubrex_theme', (t) => { if (t) applyTheme(t); });
    S.get('epubrex_font_size', (sz) => {
      if (sz) { currentFontSize = sz; fontSizeDisplay && (fontSizeDisplay.textContent = sz + '%'); }
    });
    S.get('epubrex_spread', (sp) => {
      if (sp) { currentSpread = sp; updateSpreadBtns(); }
    });
    S.get('epubrex_width', (w) => {
      if (w) { currentColumnWidth = w; updateWidthBtns(); }
    });

    renderRecentList();
    bindEvents();
  }

  function bindEvents() {
    spreadSingleBtn?.addEventListener('click', () => setSpread('single'));
    spreadDoubleBtn?.addEventListener('click', () => setSpread('double'));

    widthNarrowBtn?.addEventListener('click', () => setColumnWidth(580));
    widthNormalBtn?.addEventListener('click', () => setColumnWidth(760));
    widthWideBtn?.addEventListener('click',   () => setColumnWidth(960));

    themeBtns.forEach((b) => b.addEventListener('click', () => applyTheme(b.dataset.theme)));
    fontSizeIncBtn?.addEventListener('click', () => changeFontSize(10));
    fontSizeDecBtn?.addEventListener('click', () => changeFontSize(-10));

    openFileBtn?.addEventListener('click', requestOpenFile);
    welcomeOpenBtn?.addEventListener('click', requestOpenFile);
    fileInput?.addEventListener('change', onFile);

    prevBtn?.addEventListener('click', () => rendition?.prev());
    nextBtn?.addEventListener('click',  () => rendition?.next());
    tocToggleBtn?.addEventListener('click', () => toggleDrawer(tocSidebar));
    closeTocBtn?.addEventListener('click', closeDrawers);
    tocFilterInput?.addEventListener('input', filterToc);
    searchToggleBtn?.addEventListener('click', () => { toggleDrawer(searchSidebar); searchInput?.focus(); });
    closeSearchBtn?.addEventListener('click', closeDrawers);
    searchForm?.addEventListener('submit', doSearch);
    bookmarkToggleBtn?.addEventListener('click', () => { toggleDrawer(bookmarkSidebar); renderBookmarks(); });
    addBookmarkBtn?.addEventListener('click', addBookmark);
    closeBookmarkBtn?.addEventListener('click', closeDrawers);
    historyToggleBtn?.addEventListener('click', () => { toggleDrawer(historySidebar); renderHistory(); });
    closeHistoryBtn?.addEventListener('click', closeDrawers);
    favoriteBtn?.addEventListener('click', toggleFavorite);
    favoritesToggleBtn?.addEventListener('click', () => { toggleDrawer(favoritesSidebar); renderFavorites(); });
    closeFavoritesBtn?.addEventListener('click', closeDrawers);
    sidebarOverlay?.addEventListener('click', closeDrawers);
    progressSlider?.addEventListener('input', onScrub);
    progressSlider?.addEventListener('change', onScrubEnd);
    jumpBtn?.addEventListener('click', jumpPct);

    window.addEventListener('dragover', (e) => { e.preventDefault(); dropZone?.classList.add('drag-over'); });
    window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) dropZone?.classList.remove('drag-over'); });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone?.classList.remove('drag-over');
      if (e.dataTransfer?.files.length) loadFile(e.dataTransfer.files[0]);
    });
    document.addEventListener('keydown', onKey);

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!rendition) return;
        const pos = capturePosition();
        createRendition(pos);
      }, 200);
    });
  }

  function requestOpenFile() {
    if (window.webkit?.messageHandlers?.openFileDialog) {
      window.webkit.messageHandlers.openFileDialog.postMessage({});
    } else {
      fileInput?.click();
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') { closeDrawers(); e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault(); toggleDrawer(searchSidebar); searchInput?.focus(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault(); requestOpenFile(); return;
    }
    if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (!rendition) return;
    if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   { rendition.prev(); e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { rendition.next(); e.preventDefault(); }
  }

  function toggleDrawer(d) {
    if (!d) return;
    const open = d.classList.contains('open');
    closeDrawers();
    if (!open) { d.classList.add('open'); sidebarOverlay?.classList.add('active'); }
  }
  function closeDrawers() {
    [tocSidebar, searchSidebar, bookmarkSidebar, historySidebar, favoritesSidebar].forEach((d) => d?.classList.remove('open'));
    sidebarOverlay?.classList.remove('active');
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      document.activeElement.blur();
    }
  }

  function onFile(e) { if (e.target.files?.length) loadFile(e.target.files[0]); }
  function loadFile(f) {
    if (!f.name.toLowerCase().endsWith('.epub')) { alert('Select a .epub file.'); return; }
    const r = new FileReader();
    r.onload = (ev) => openBook(ev.target.result, f.name, true);
    r.readAsArrayBuffer(f);
  }

  async function renderRecentList() {
    if (!recentListEl || !recentSection) return;
    const items = await DB.list();
    if (!items.length) { recentSection.style.display = 'none'; return; }
    recentSection.style.display = 'block';
    recentListEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    items.forEach((it) => {
      const el = document.createElement('div');
      el.className = 'recent-item';
      el.innerHTML = `<span class="recent-item-title">${esc(it.title||it.name)}</span><button class="recent-item-del" title="Remove">✕</button>`;
      el.addEventListener('click', async () => {
        const record = await DB.get(it.name);
        if (record?.buffer) openBook(record.buffer, record.name, false);
      });
      el.querySelector('.recent-item-del').addEventListener('click', async (ev) => {
        ev.stopPropagation(); await DB.del(it.name); renderRecentList();
      });
      frag.appendChild(el);
    });
    recentListEl.appendChild(frag);
  }

  async function renderHistory() {
    if (!historyListEl) return;
    const items = await DB.list();
    if (!items.length) {
      historyListEl.innerHTML = '<p class="drawer-empty">No books opened yet.</p>';
      return;
    }
    historyListEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    items.forEach((it) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `<span class="history-title">${esc(it.title || it.name)}</span>`;
      el.addEventListener('click', async () => {
        const record = await DB.get(it.name);
        if (record?.buffer) {
          closeDrawers();
          openBook(record.buffer, record.name, false);
        }
      });
      frag.appendChild(el);
    });
    historyListEl.appendChild(frag);
  }

  // ── Favorites ──────────────────────────────────────────────────────────
  function isFavorited(name, cb) {
    if (!name) { cb(false); return; }
    S.get(FAV_KEY, (list = []) => {
      cb(Array.isArray(list) && list.some((f) => f.name === name));
    });
  }

  function updateFavoriteButtonState() {
    if (!favoriteBtn) return;
    if (!currentFileName) {
      favoriteBtn.classList.remove('active');
      favoriteBtn.title = 'Add book to Favorites (Star)';
      return;
    }
    isFavorited(currentFileName, (fav) => {
      favoriteBtn.classList.toggle('active', fav);
      favoriteBtn.title = fav ? 'Remove from Favorites (Unstar)' : 'Add book to Favorites (Star)';
    });
  }

  function toggleFavorite() {
    if (!currentFileName) { alert('Load an EPUB first.'); return; }
    S.get(FAV_KEY, (list = []) => {
      list = Array.isArray(list) ? list : [];
      const idx = list.findIndex((f) => f.name === currentFileName);
      if (idx > -1) {
        list.splice(idx, 1);
        S.set(FAV_KEY, list);
        updateFavoriteButtonState();
      } else {
        const title = currentBookTitle || bookTitleEl?.textContent || currentFileName;
        list.unshift({ name: currentFileName, title, ts: Date.now() });
        S.set(FAV_KEY, list);
        updateFavoriteButtonState();
      }
      renderFavorites();
    });
  }

  function renderFavorites() {
    if (!favoritesListEl) return;
    S.get(FAV_KEY, (list = []) => {
      favoritesListEl.innerHTML = '';
      if (!list?.length) {
        favoritesListEl.innerHTML = '<p class="drawer-empty">No favorite books yet. Click the ⭐ star button while reading to add one.</p>';
        return;
      }
      const frag = document.createDocumentFragment();
      list.forEach((it, i) => {
        const el = document.createElement('div');
        el.className = 'favorite-item';
        el.innerHTML = `<span class="favorite-item-title">${esc(it.title || it.name)}</span><button class="favorite-item-del" title="Remove from favorites">✕</button>`;
        el.addEventListener('click', async () => {
          const record = await DB.get(it.name);
          if (record?.buffer) {
            closeDrawers();
            openBook(record.buffer, record.name, false);
          }
        });
        el.querySelector('.favorite-item-del').addEventListener('click', (ev) => {
          ev.stopPropagation();
          list.splice(i, 1);
          S.set(FAV_KEY, list);
          updateFavoriteButtonState();
          renderFavorites();
        });
        frag.appendChild(el);
      });
      favoritesListEl.appendChild(frag);
    });
  }

  // Fix non-linear spine items (e.g. coverPage with linear="no")
  function fixSpineNavigation(spine) {
    if (!spine?.spineItems) return;
    const items = spine.spineItems;
    items.forEach((item, index) => {
      item.linear = true;
      item.prev = function() { return index > 0 ? items[index - 1] : null; };
      item.next = function() { return index < items.length - 1 ? items[index + 1] : null; };
    });
  }

  // ── Book loading ──────────────────────────────────────────────────────
  function openBook(data, fileName, saveToRecent) {
    if (book) { try { book.destroy(); } catch(e){} }
    if (!viewerArea) return;

    dropZone && (dropZone.style.display = 'none');
    viewerArea.style.display = 'block';
    prevBtn && (prevBtn.style.display = 'flex');
    nextBtn && (nextBtn.style.display = 'flex');
    bottomBar && (bottomBar.style.display = 'flex');

    currentFileName = fileName;
    currentBookTitle = fileName;
    updateFavoriteButtonState();

    bookKey = 'epubrex_pos_' + fileName.replace(/\s+/g, '_');
    book = ePub(data);

    book.loaded.spine.then(fixSpineNavigation);
    S.get(bookKey, (cfi) => createRendition(cfi || undefined));

    book.loaded.metadata.then((m) => {
      currentBookTitle = m.title || fileName;
      bookTitleEl && (bookTitleEl.textContent = m.title || fileName);
      bookAuthorEl && (bookAuthorEl.textContent = m.creator ? 'by ' + m.creator : 'Unknown Author');
      document.title = (m.title || fileName) + ' – EPUB Reaper';
      if (saveToRecent) DB.save(fileName, m.title || fileName, data);
      updateFavoriteButtonState();
    });
    book.loaded.navigation.then((nav) => { tocItems = nav.toc || []; buildToc(tocItems); });
    book.ready.then(() => book.locations.generate(1024)).then(() => updateProgress());
  }

  // ── Rendition (re-)creation ───────────────────────────────────────────
  function getBarHeights() {
    const style = getComputedStyle(document.documentElement);
    const headerH = parseInt(style.getPropertyValue('--header-height')) || 52;
    const footerH = parseInt(style.getPropertyValue('--footer-height')) || 48;
    return { headerH, footerH };
  }

  function capturePosition() {
    if (!rendition) return {};
    const loc = rendition.currentLocation();
    const cfi = loc?.start?.cfi || null;
    let pct = null;
    if (cfi && book?.locations?.length()) {
      pct = book.locations.percentageFromCfi(cfi);
    }
    return { cfi, pct };
  }

  function createRendition(target) {
    if (!book || !viewerArea) return;
    if (rendition) { try { rendition.destroy(); } catch(e){} }
    viewerArea.innerHTML = '';
    if (book.spine) fixSpineNavigation(book.spine);

    const isDouble = currentSpread === 'double';
    const { headerH, footerH } = getBarHeights();

    const maxW = window.innerWidth - 120;
    const h    = window.innerHeight - headerH - footerH - 20;

    let w = isDouble ? currentColumnWidth * 2 : currentColumnWidth;
    w = Math.min(w, maxW);

    viewerArea.style.width  = w + 'px';
    viewerArea.style.height = h + 'px';

    rendition = book.renderTo(viewerArea, {
      width:  w,
      height: h,
      spread: isDouble ? 'always' : 'none',
      minSpreadWidth: isDouble ? 0 : 99999,
      flow: 'paginated'
    });

    applyRenditionTheme();

    let cfi;
    if (typeof target === 'string') {
      cfi = target;
    } else if (target?.cfi) {
      cfi = target.cfi;
    } else if (target?.pct != null && book?.locations?.length()) {
      cfi = book.locations.cfiFromPercentage(target.pct);
    }

    if (cfi) {
      let sectionHref;
      try {
        const section = book.spine.get(cfi);
        sectionHref = section?.href;
      } catch(e) {}

      if (sectionHref) {
        rendition.display(sectionHref).then(() => {
          requestAnimationFrame(() => {
            scrollToCfi(cfi);
          });
        });
      } else {
        rendition.display(cfi);
      }
    } else {
      rendition.display();
    }

    rendition.on('relocated', (loc) => {
      if (!loc?.start) return;
      S.set(bookKey, loc.start.cfi);
      updateProgress();
      updateChapter(loc.start.href);
    });
    rendition.on('keydown', onKey);
  }

  function scrollToCfi(cfi) {
    if (!rendition?.manager) return;
    const manager = rendition.manager;
    const delta = manager.layout?.delta;
    if (!delta || delta <= 0) return;

    const contents = rendition.getContents();
    if (!contents?.length) return;

    try {
      const loc = contents[0].locationOf(cfi);
      const left = loc?.left || 0;
      if (left <= 0) return;
      const pageIndex = Math.round(left / delta);
      const scrollTarget = Math.min(pageIndex * delta, manager.container.scrollWidth - delta);
      manager.scrollTo(scrollTarget, 0, true);
    } catch(e) {}
  }

  // ── Spread & Column Width ─────────────────────────────────────────────
  function setSpread(mode) {
    if (currentSpread === mode) return;
    const pos = capturePosition();
    currentSpread = mode;
    updateSpreadBtns();
    S.set('epubrex_spread', mode);
    if (book) createRendition(pos);
  }
  function updateSpreadBtns() {
    spreadSingleBtn?.classList.toggle('active', currentSpread === 'single');
    spreadDoubleBtn?.classList.toggle('active', currentSpread === 'double');
  }

  function setColumnWidth(px) {
    if (currentColumnWidth === px) return;
    const pos = capturePosition();
    currentColumnWidth = px;
    updateWidthBtns();
    S.set('epubrex_width', px);
    if (book) createRendition(pos);
  }
  function updateWidthBtns() {
    widthNarrowBtn?.classList.toggle('active', currentColumnWidth <= 600);
    widthNormalBtn?.classList.toggle('active', currentColumnWidth > 600 && currentColumnWidth <= 800);
    widthWideBtn?.classList.toggle('active',   currentColumnWidth > 800);
  }

  // ── Themes ────────────────────────────────────────────────────────────
  function applyRenditionTheme() {
    if (!rendition) return;

    rendition.themes.register('dark', {
      '*': { color: '#e2e8f0 !important' },
      body: { background: '#0f172a !important', 'font-family': FONT_STACK + ' !important', 'line-height': '1.75 !important' },
      'p,div,span,li,td,th,dt,dd,blockquote,figcaption': { color: '#e2e8f0 !important', background: 'transparent !important' },
      img: { 'max-width': '100% !important', 'max-height': '100% !important', 'object-fit': 'contain !important', 'box-sizing': 'border-box !important' },
      a: { color: '#38bdf8 !important' },
      'h1,h2,h3,h4,h5,h6': { color: '#f8fafc !important' }
    });
    rendition.themes.register('light', {
      '*': { color: '#1e293b !important' },
      body: { background: '#ffffff !important', 'font-family': FONT_STACK + ' !important', 'line-height': '1.75 !important' },
      'p,div,span,li,td,th,dt,dd,blockquote,figcaption': { color: '#1e293b !important', background: 'transparent !important' },
      img: { 'max-width': '100% !important', 'max-height': '100% !important', 'object-fit': 'contain !important', 'box-sizing': 'border-box !important' },
      a: { color: '#0284c7 !important' },
      'h1,h2,h3,h4,h5,h6': { color: '#0f172a !important' }
    });
    rendition.themes.register('sepia', {
      '*': { color: '#433422 !important' },
      body: { background: '#fbf0d9 !important', 'font-family': 'Georgia, serif !important', 'line-height': '1.75 !important' },
      'p,div,span,li,td,th,dt,dd,blockquote,figcaption': { color: '#433422 !important', background: 'transparent !important' },
      img: { 'max-width': '100% !important', 'max-height': '100% !important', 'object-fit': 'contain !important', 'box-sizing': 'border-box !important' },
      a: { color: '#a06d3b !important' },
      'h1,h2,h3,h4,h5,h6': { color: '#2c2014 !important' }
    });

    rendition.themes.select(currentTheme);
    rendition.themes.fontSize(currentFontSize + '%');
  }

  function applyTheme(t) {
    currentTheme = t;
    document.documentElement.setAttribute('data-theme', t);
    themeBtns.forEach((b) => b.classList.toggle('active', b.dataset.theme === t));
    rendition?.themes.select(t);
    S.set('epubrex_theme', t);
  }

  function changeFontSize(delta) {
    currentFontSize = Math.min(200, Math.max(60, currentFontSize + delta));
    fontSizeDisplay && (fontSizeDisplay.textContent = currentFontSize + '%');
    rendition?.themes.fontSize(currentFontSize + '%');
    S.set('epubrex_font_size', currentFontSize);
  }

  // ── Scrubber & Progress ───────────────────────────────────────────────
  function updateProgress() {
    if (!rendition || isScrubbing) return;
    const loc = rendition.currentLocation();
    if (!loc?.start?.cfi || !book?.locations?.length()) return;
    const pct = book.locations.percentageFromCfi(loc.start.cfi);
    if (pct !== null && !isNaN(pct)) {
      const rounded = Math.round(pct * 100);
      progressSlider && (progressSlider.value = rounded);
      progressPercentage && (progressPercentage.textContent = rounded + '%');
    }
  }

  function onScrub(e) {
    isScrubbing = true;
    progressPercentage && (progressPercentage.textContent = e.target.value + '%');
  }
  function onScrubEnd(e) {
    isScrubbing = false;
    goToPercentage(parseInt(e.target.value, 10));
  }
  function jumpPct() {
    const val = prompt('Jump to percentage (0–100):', progressSlider?.value || '0');
    if (val !== null) {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 0 && n <= 100) goToPercentage(n);
    }
  }
  function goToPercentage(pct) {
    if (!book?.locations?.length()) return;
    const cfi = book.locations.cfiFromPercentage(pct / 100);
    if (cfi) rendition?.display(cfi);
  }

  // ── Table of Contents ─────────────────────────────────────────────────
  function resolveTocHref(href) {
    if (!href || !book?.spine) return href;
    const clean = href.split('#')[0].split('?')[0];
    if (book.spine.get(clean)) return href;
    const normalized = clean.replace(/^(?:\.\.\/)+/, '');
    if (book.spine.get(normalized)) {
      return href.replace(clean, normalized);
    }
    const filename = clean.split('/').pop();
    for (const item of book.spine.spineItems) {
      if (item.href && item.href.split('/').pop() === filename) {
        return href.replace(clean, item.href);
      }
    }
    return href;
  }

  function buildToc(items) {
    if (!tocNav) return;
    tocNav.innerHTML = '';
    if (!items?.length) {
      tocNav.innerHTML = '<p class="drawer-empty">No table of contents found.</p>';
      return;
    }
    const ul = document.createElement('div');
    items.forEach((item) => {
      const a = document.createElement('a');
      a.className = 'toc-item';
      a.textContent = item.label ? item.label.trim() : 'Chapter';
      a.dataset.href = item.href;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        closeDrawers();
        const targetHref = resolveTocHref(item.href);
        rendition?.display(targetHref);
      });
      ul.appendChild(a);
    });
    tocNav.appendChild(ul);
  }

  function filterToc(e) {
    const q = e.target.value.toLowerCase();
    tocNav?.querySelectorAll('.toc-item').forEach((el) => {
      el.style.display = el.textContent.toLowerCase().includes(q) ? 'block' : 'none';
    });
  }

  function updateChapter(href) {
    if (!href || !tocItems.length) return;
    const match = tocItems.find((it) => it.href && (href.endsWith(it.href) || it.href.endsWith(href)));
    if (match && currentChapterName) {
      currentChapterName.textContent = match.label.trim();
    }
  }

  // ── Bookmarks ──────────────────────────────────────────────────────────
  const bmKey = () => (bookKey ? 'bm_' + bookKey : null);

  function addBookmark() {
    const k = bmKey();
    if (!k || !rendition) { alert('Load a book first.'); return; }
    const loc = rendition.currentLocation();
    if (!loc?.start?.cfi) return;

    S.get(k, (list = []) => {
      list = Array.isArray(list) ? list : [];
      if (list.some((b) => b.cfi === loc.start.cfi)) {
        alert('Location already bookmarked.');
        return;
      }
      const title = currentChapterName?.textContent || 'Bookmark ' + (list.length + 1);
      list.push({ cfi: loc.start.cfi, title, ts: Date.now() });
      S.set(k, list);
      alert('Bookmark added!');
    });
  }

  function renderBookmarks() {
    if (!bookmarkListEl) return;
    const k = bmKey();
    if (!k) return;
    S.get(k, (list = []) => {
      bookmarkListEl.innerHTML = '';
      if (!list?.length) {
        bookmarkListEl.innerHTML = '<p class="drawer-empty">No bookmarks saved yet.</p>';
        return;
      }
      const frag = document.createDocumentFragment();
      list.forEach((b, i) => {
        const el = document.createElement('div');
        el.className = 'bookmark-item';
        el.innerHTML = `<span class="bookmark-title">${esc(b.title)}</span><button class="bookmark-del" title="Delete">✕</button>`;
        el.addEventListener('click', () => { closeDrawers(); rendition?.display(b.cfi); });
        el.querySelector('.bookmark-del').addEventListener('click', (ev) => {
          ev.stopPropagation();
          list.splice(i, 1);
          S.set(k, list);
          renderBookmarks();
        });
        frag.appendChild(el);
      });
      bookmarkListEl.appendChild(frag);
    });
  }

  // ── Search ─────────────────────────────────────────────────────────────
  async function doSearch(e) {
    e.preventDefault();
    const q = searchInput?.value?.trim();
    if (!q || !book) return;
    searchResults.innerHTML = '<p class="drawer-empty">Searching book...</p>';

    const hits = [];
    for (const si of book.spine.spineItems) {
      try {
        await si.load(book.load.bind(book));
        const m = si.find(q);
        si.unload();
        if (m?.length) hits.push(...m);
      } catch(err) {}
      await new Promise((r) => setTimeout(r, 0));
    }

    searchResults.innerHTML = '';
    if (!hits.length) {
      searchResults.innerHTML = `<p class="drawer-empty">No matches found for "${esc(q)}".</p>`;
      return;
    }

    const frag = document.createDocumentFragment();
    hits.slice(0, 50).forEach((h) => {
      const el = document.createElement('div');
      el.className = 'search-result-item';
      const cleanExcerpt = h.excerpt.replace(new RegExp(`(${escapeRegex(q)})`, 'gi'), '<mark>$1</mark>');
      el.innerHTML = `<span>...${cleanExcerpt}...</span>`;
      el.addEventListener('click', () => { closeDrawers(); rendition?.display(h.cfi); });
      frag.appendChild(el);
    });
    searchResults.appendChild(frag);
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // ── Native Bridge Functions (Callable from Swift) ──────────────────────
  window.openBookFromBase64 = function(base64Data, fileName) {
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      openBook(bytes.buffer, fileName, true);
    } catch(e) {
      alert('Failed to load EPUB: ' + e.message);
    }
  };

  window.triggerAction = function(action) {
    switch (action) {
      case 'toggle-spread':
        setSpread(currentSpread === 'single' ? 'double' : 'single');
        break;
      case 'next-theme': {
        const themes = ['dark', 'light', 'sepia'];
        const next = themes[(themes.indexOf(currentTheme) + 1) % themes.length];
        applyTheme(next);
        break;
      }
      case 'zoom-in': changeFontSize(10); break;
      case 'zoom-out': changeFontSize(-10); break;
      case 'open-file': requestOpenFile(); break;
    }
  };

  // Start app
  document.addEventListener('DOMContentLoaded', init);
})();
