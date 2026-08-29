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
  const jumpBtn           = byId('jumpLocationBtn');
  const rsvpToggleBtn      = byId('rsvpToggleBtn');
  const speedTargetBar     = byId('speedTargetBar');
  const speedStartBtn      = byId('speedStartBtn');
  const speedExitBtn       = byId('speedExitBtn');
  const rsvpModal          = byId('rsvpModal');
  const closeRsvpBtn       = byId('closeRsvpBtn');
  const rsvpProgressText   = byId('rsvpProgressText');
  const rsvpWordLeft       = byId('rsvpWordLeft');
  const rsvpWordOrp        = byId('rsvpWordOrp');
  const rsvpWordRight      = byId('rsvpWordRight');
  const rsvpPlayBtn        = byId('rsvpPlayBtn');
  const rsvpBackBtn        = byId('rsvpBackBtn');
  const rsvpFwdBtn         = byId('rsvpFwdBtn');
  const rsvpSpeedDec       = byId('rsvpSpeedDec');
  const rsvpSpeedInc       = byId('rsvpSpeedInc');
  const rsvpWpmDisplay     = byId('rsvpWpmDisplay');

  let isSpeedTargeting = false;
  let targetedWordIndex= 0;
  let isRsvpOpen       = false;
  let rsvpWords        = [];
  let rsvpIndex        = 0;
  let rsvpWpm          = 350;
  let rsvpPlaying      = false;
  let rsvpTimer        = null;

  const _logHandler = window.webkit?.messageHandlers?.logHandler || null;

  function logApp(...args) {
    const msg = '[EPUB Reaper] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    console.log(msg);
    if (_logHandler) { try { _logHandler.postMessage(msg); } catch(e) {} }
  }

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
    logApp('App initializing...');
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

    try {
      const recent = await DB.list();
      if (!currentFileName && recent?.length && recent[0].name) {
        const rec = await DB.get(recent[0].name);
        if (!currentFileName && rec?.buffer) {
          logApp('Auto-loading most recent book:', rec.name);
          openBook(rec.buffer, rec.name, false);
        }
      }
    } catch(e) {}

    logApp('App ready');
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

    rsvpToggleBtn?.addEventListener('click', toggleSpeedReadingMode);
    speedTargetBar?.addEventListener('click', (e) => e.stopPropagation());
    speedStartBtn?.addEventListener('click', (e) => { e.stopPropagation(); startRsvpPlayback(targetedWordIndex); });
    speedExitBtn?.addEventListener('click', (e) => { e.stopPropagation(); exitSpeedTargetingMode(); });
    closeRsvpBtn?.addEventListener('click', closeRsvp);
    rsvpPlayBtn?.addEventListener('click', closeRsvp);
    rsvpBackBtn?.addEventListener('click', () => stepRsvpWords(-10));
    rsvpFwdBtn?.addEventListener('click', () => stepRsvpWords(10));
    rsvpSpeedDec?.addEventListener('click', () => changeRsvpSpeed(-25));
    rsvpSpeedInc?.addEventListener('click', () => changeRsvpSpeed(25));

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
    jumpBtn?.addEventListener('click', jumpPct);

    window.addEventListener('dragover', (e) => { e.preventDefault(); dropZone?.classList.add('drag-over'); });
    window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) dropZone?.classList.remove('drag-over'); });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone?.classList.remove('drag-over');
      if (e.dataTransfer?.files.length) loadFile(e.dataTransfer.files[0]);
    });
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('keydown', onKey, true);
    makeDraggable(speedTargetBar);

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

  function makeDraggable(el) {
    if (!el) return;
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      isDragging = true;
      el.classList.add('is-dragging');
      try { el.setPointerCapture(e.pointerId); } catch(err) {}
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      el.style.left = initialLeft + 'px';
      el.style.top = initialTop + 'px';
      el.style.transform = 'none';
      e.preventDefault();
      e.stopPropagation();
    });

    el.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = Math.max(10, Math.min(window.innerWidth - el.offsetWidth - 10, initialLeft + dx)) + 'px';
      el.style.top = Math.max(10, Math.min(window.innerHeight - el.offsetHeight - 10, initialTop + dy)) + 'px';
    });

    function endDrag(e) {
      if (isDragging) {
        isDragging = false;
        el.classList.remove('is-dragging');
        try { el.releasePointerCapture(e.pointerId); } catch(err) {}
      }
    }

    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  }

  function requestOpenFile() {
    if (window.webkit?.messageHandlers?.openFileDialog) {
      window.webkit.messageHandlers.openFileDialog.postMessage({});
    } else {
      fileInput?.click();
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      if (isRsvpOpen) { closeRsvp(); e.preventDefault(); return; }
      if (isSpeedTargeting) { exitSpeedTargetingMode(); e.preventDefault(); return; }
      closeDrawers();
      e.preventDefault();
      return;
    }

    if (isRsvpOpen) {
      if (e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        closeRsvp();
        return;
      }
      if (e.key === 'ArrowUp' || e.key === '+' || e.key === '=') { e.preventDefault(); changeRsvpSpeed(25); return; }
      if (e.key === 'ArrowDown' || e.key === '-') { e.preventDefault(); changeRsvpSpeed(-25); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepRsvpWords(-10); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); stepRsvpWords(10); return; }
      return;
    }

    if (isSpeedTargeting) {
      if (e.key === ' ') {
        e.preventDefault();
        startRsvpPlayback(targetedWordIndex);
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault(); toggleDrawer(searchSidebar); searchInput?.focus(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault(); requestOpenFile(); return;
    }
    if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;

    if (e.key.toLowerCase() === 'v') {
      toggleSpeedReadingMode();
      return;
    }

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
    logApp('openBook loading file:', fileName);
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

    rendition.on('selected', (cfiRange, contents) => {
      lastSelectedCfi = cfiRange;
      const win = contents?.window || window;
      const doc = contents?.document || document;
      const sel = win.getSelection ? win.getSelection() : null;
      lastSelectedText = sel ? sel.toString().trim() : '';

      if (isRsvpOpen) return;

      if (!rsvpWords.length) rsvpWords = extractSectionWords();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const selIdx = findWordFromRangeOrSelection(doc, sel);
        if (selIdx !== -1) {
          targetedWordIndex = selIdx;
          lastResumeWordIndex = selIdx;
          if (isSpeedTargeting) {
            highlightResumeWord(rsvpWords[targetedWordIndex], false);
          }
        }
      }
    });
    rendition.on('click', (event, contents) => {
      if (isRsvpOpen) return;

      const cnt = contents || rendition.getContents()?.[0];
      const doc = cnt?.document;
      if (!doc) return;
      if (!rsvpWords.length) rsvpWords = extractSectionWords();
      const clickedIdx = findWordAtPoint(doc, event.clientX, event.clientY);
      if (clickedIdx !== -1) {
        targetedWordIndex = clickedIdx;
        lastResumeWordIndex = clickedIdx;
        if (isSpeedTargeting) {
          highlightResumeWord(rsvpWords[targetedWordIndex], false);
        }
      }
    });
    rendition.on('relocated', (loc) => {
      if (!loc?.start) return;
      S.set(bookKey, loc.start.cfi);
      updateProgress();
      updateChapter(loc.start.href);
    });
    rendition.on('rendered', () => {
      rendition.getContents()?.forEach(attachContentsListeners);
    });
    rendition.hooks.content.register((contents) => {
      attachContentsListeners(contents);
    });
    rendition.on('keydown', onKey);

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
  }

  function findWordFromRangeOrSelection(doc, sel) {
    if (!sel || sel.rangeCount === 0 || !rsvpWords.length) return -1;
    const range = sel.getRangeAt(0);
    let startNode = range.startContainer;
    let startOffset = range.startOffset;


    // If startNode is an Element node (e.g. <p> or <div>), resolve to first TextNode inside
    if (startNode && startNode.nodeType === Node.ELEMENT_NODE) {
      const child = startNode.childNodes[startOffset] || startNode.firstChild;
      if (child && child.nodeType === Node.TEXT_NODE) {
        startNode = child;
        startOffset = 0;
      } else if (child) {
        const walker = doc.createTreeWalker(child, NodeFilter.SHOW_TEXT);
        const firstText = walker.nextNode();
        if (firstText) {
          startNode = firstText;
          startOffset = 0;
        }
      }
    }

    // 1. Direct match by text node and character offset
    if (startNode && startNode.nodeType === Node.TEXT_NODE) {
      const idx = rsvpWords.findIndex(w =>
        w.node === startNode && startOffset >= w.startOffset && startOffset <= w.endOffset
      );
      if (idx !== -1) {
        return idx;
      }

      // Match first word in startNode
      const firstInNode = rsvpWords.findIndex(w => w.node === startNode);
      if (firstInNode !== -1) {
        return firstInNode;
      }
    }

    // 2. Fallback: match by selected text prefix on currently visible page
    const selText = sel.toString().trim();
    const firstWord = selText.split(/\s+/)[0];
    if (firstWord) {
      const manager = rendition?.manager;
      const currentScroll = manager?.container?.scrollLeft || 0;
      const viewportWidth = manager?.layout?.delta || viewerArea?.clientWidth || 800;

      for (let i = 0; i < rsvpWords.length; i++) {
        const w = rsvpWords[i];
        if (w.word === firstWord || w.word.startsWith(firstWord) || firstWord.startsWith(w.word)) {
          if (w.doc && w.node) {
            try {
              const wRange = doc.createRange();
              wRange.setStart(w.node, w.startOffset);
              wRange.setEnd(w.node, w.endOffset);
              const rect = wRange.getBoundingClientRect();
              if (rect.left >= currentScroll - 20 && rect.left < currentScroll + viewportWidth + 20) {
                return i;
              }
            } catch(e) {}
          }
        }
      }
    }

    return -1;
  }

  function findWordAtDocCoordinates(doc, docX, docY) {
    if (!rsvpWords.length) {
      return -1;
    }

    // 1. Direct bounding box hit test
    for (let i = 0; i < rsvpWords.length; i++) {
      const w = rsvpWords[i];
      if (w.doc === doc && w.node) {
        try {
          const range = doc.createRange();
          range.setStart(w.node, w.startOffset);
          range.setEnd(w.node, w.endOffset);
          const rect = range.getBoundingClientRect();
          if (
            docX >= rect.left - 10 &&
            docX <= rect.right + 10 &&
            docY >= rect.top - 8 &&
            docY <= rect.bottom + 8
          ) {
            return i;
          }
        } catch(e) {}
      }
    }

    // 2. Proximity fallback to closest word on same line / paragraph
    let closestIdx = -1;
    let minDistance = Infinity;
    for (let i = 0; i < rsvpWords.length; i++) {
      const w = rsvpWords[i];
      if (w.doc === doc && w.node) {
        try {
          const range = doc.createRange();
          range.setStart(w.node, w.startOffset);
          range.setEnd(w.node, w.endOffset);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const centerX = (rect.left + rect.right) / 2;
            const centerY = (rect.top + rect.bottom) / 2;
            const dx = docX - centerX;
            const dy = (docY - centerY) * 2;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDistance) {
              minDistance = dist;
              closestIdx = i;
            }
          }
        } catch(e) {}
      }
    }

    if (minDistance < 350) {
      return closestIdx;
    }
    return -1;
  }

  function findWordAtPoint(doc, clientX, clientY) {
    if (!rsvpWords.length) {
      rsvpWords = extractSectionWords();
    }
    if (!rsvpWords.length) {
      return -1;
    }

    // 1. Direct WebKit caretRangeFromPoint for 100% precision hit testing
    if (doc && doc.caretRangeFromPoint) {
      try {
        const range = doc.caretRangeFromPoint(clientX, clientY);
        if (range && range.startContainer) {
          let node = range.startContainer;
          let offset = range.startOffset;

          if (node.nodeType === Node.ELEMENT_NODE) {
            const child = node.childNodes[offset] || node.firstChild;
            if (child && child.nodeType === Node.TEXT_NODE) {
              node = child;
              offset = 0;
            } else if (child) {
              const walker = doc.createTreeWalker(child, NodeFilter.SHOW_TEXT);
              const firstText = walker.nextNode();
              if (firstText) {
                node = firstText;
                offset = 0;
              }
            }
          }

          if (node && node.nodeType === Node.TEXT_NODE) {
            // Exact match in text node
            const matchIdx = rsvpWords.findIndex(w =>
              w.node === node && offset >= w.startOffset && offset <= w.endOffset
            );
            if (matchIdx !== -1) {
              return matchIdx;
            }

            // Closest word in same text node
            let closestInNode = -1;
            let minDiff = Infinity;
            for (let i = 0; i < rsvpWords.length; i++) {
              const w = rsvpWords[i];
              if (w.node === node) {
                const diff = Math.min(Math.abs(offset - w.startOffset), Math.abs(offset - w.endOffset));
                if (diff < minDiff) {
                  minDiff = diff;
                  closestInNode = i;
                }
              }
            }
            if (closestInNode !== -1) {
              return closestInNode;
            }
          }
        }
      } catch(err) {
      }
    }

    // 2. Element hit-testing via elementFromPoint
    if (doc && doc.elementFromPoint) {
      try {
        const el = doc.elementFromPoint(clientX, clientY);
        if (el) {
          for (let i = 0; i < rsvpWords.length; i++) {
            const w = rsvpWords[i];
            if (w.doc === doc && w.node && (el === w.node.parentElement || el.contains(w.node))) {
              try {
                const r = doc.createRange();
                r.setStart(w.node, w.startOffset);
                r.setEnd(w.node, w.endOffset);
                const rect = r.getBoundingClientRect();
                if (
                  clientX >= rect.left - 12 &&
                  clientX <= rect.right + 12 &&
                  clientY >= rect.top - 8 &&
                  clientY <= rect.bottom + 8
                ) {
                  return i;
                }
              } catch(e) {}
            }
          }
        }
      } catch(err) {
      }
    }

    // 3. Coordinate fallback
    const manager = rendition?.manager;
    const currentScroll = manager?.container?.scrollLeft || 0;
    return findWordAtDocCoordinates(doc, clientX + currentScroll, clientY);
  }

  function attachContentsListeners(contents) {
    if (!contents) return;
    const doc = contents.document;
    const win = contents.window || doc?.defaultView;
    if (!doc || !doc.body) return;

    if (doc.__epubReaperBound) return;
    doc.__epubReaperBound = true;


    // Inject user-select styles into chapter XHTML
    try {
      const style = doc.createElementNS('http://www.w3.org/1999/xhtml', 'style');
      style.textContent = `
        * { user-select: text !important; -webkit-user-select: text !important; }
        .rsvp-target-marker, .rsvp-resume-marker { pointer-events: none !important; }
      `;
      (doc.head || doc.body || doc.documentElement).appendChild(style);
    } catch(e) {}

    function handleInteraction(e) {
      if (isRsvpOpen) return;

      if (!rsvpWords.length) rsvpWords = extractSectionWords();

      // Drag selection
      const sel = win?.getSelection?.() || doc?.getSelection?.();
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
        const selIdx = findWordFromRangeOrSelection(doc, sel);
        if (selIdx !== -1) {
          targetedWordIndex = selIdx;
          lastResumeWordIndex = selIdx;
          lastResumePageScroll = rendition?.manager?.container?.scrollLeft || 0;
          if (isSpeedTargeting) highlightResumeWord(rsvpWords[selIdx], false);
          return;
        }
      }

      // Single click
      if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
        const clickedIdx = findWordAtPoint(doc, e.clientX, e.clientY);
        if (clickedIdx !== -1) {
          targetedWordIndex = clickedIdx;
          lastResumeWordIndex = clickedIdx;
          lastResumePageScroll = rendition?.manager?.container?.scrollLeft || 0;
          if (isSpeedTargeting) highlightResumeWord(rsvpWords[clickedIdx], false);
        }
      }
    }

    doc.addEventListener('click', handleInteraction, true);
    doc.addEventListener('mouseup', handleInteraction, true);
    doc.addEventListener('keydown', onKey, true);
    if (win) win.addEventListener('keydown', onKey, true);
  }

  // ── 2-Phase Speed Reading Engine ──────────────────────────────────────────
  let lastSelectedCfi = null;
  let lastSelectedText = null;
  let lastResumeMarkerCfi = null;
  let lastResumeWordIndex = null;
  let lastResumePageScroll = null;

  function toggleSpeedReadingMode() {
    if (isRsvpOpen) {
      closeRsvp();
    } else if (isSpeedTargeting) {
      exitSpeedTargetingMode();
    } else {
      enterSpeedTargetingMode();
    }
  }

  // ── Click-capture overlay for word targeting ────────────────────────────
  let targetOverlay = null;

  function getTargetOverlay() {
    if (targetOverlay) return targetOverlay;
    targetOverlay = document.createElement('div');
    targetOverlay.id = 'speedTargetOverlay';
    targetOverlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;z-index:10;cursor:crosshair;display:none;';
    viewerArea?.appendChild(targetOverlay);

    targetOverlay.addEventListener('click', (e) => {
      if (!isSpeedTargeting || isRsvpOpen) return;

      const iframes = viewerArea.querySelectorAll('iframe');
      for (const ifr of iframes) {
        try {
          const doc = ifr.contentDocument;
          if (!doc) continue;
          const rect = ifr.getBoundingClientRect();
          const docX = e.clientX - rect.left;
          const docY = e.clientY - rect.top;
          if (docX < 0 || docX > rect.width || docY < 0 || docY > rect.height) continue;

          if (!rsvpWords.length) rsvpWords = extractSectionWords();
          const idx = findWordAtPoint(doc, docX, docY);
          if (idx !== -1) {
            targetedWordIndex = idx;
            lastResumeWordIndex = idx;
            lastResumePageScroll = rendition?.manager?.container?.scrollLeft || 0;
            highlightResumeWord(rsvpWords[idx], false);
          }
          break;
        } catch(err) {
        }
      }
    });

    return targetOverlay;
  }

  function enterSpeedTargetingMode(forcedIdx) {
    if (!book || !rendition) { alert('Load an EPUB book first.'); return; }
    closeDrawers();
    isSpeedTargeting = true;
    rsvpToggleBtn?.classList.add('active');
    viewerArea?.classList.add('speed-targeting-active');
    if (speedTargetBar) speedTargetBar.style.display = 'flex';

    const overlay = getTargetOverlay();
    overlay.style.display = 'block';

    rsvpWords = extractSectionWords();
    if (!rsvpWords.length) {
      alert('No text found on this page.');
      exitSpeedTargetingMode();
      return;
    }

    const manager = rendition?.manager;
    const currentScroll = manager?.container?.scrollLeft || 0;

    rendition.getContents()?.forEach(attachContentsListeners);

    if (typeof forcedIdx === 'number' && forcedIdx >= 0 && forcedIdx < rsvpWords.length) {
      targetedWordIndex = forcedIdx;
      lastResumeWordIndex = forcedIdx;
      lastResumePageScroll = currentScroll;
      highlightResumeWord(rsvpWords[targetedWordIndex], true);
    } else if (
      lastResumeWordIndex !== null &&
      lastResumeWordIndex >= 0 &&
      lastResumeWordIndex < rsvpWords.length
    ) {
      targetedWordIndex = lastResumeWordIndex;
      highlightResumeWord(rsvpWords[targetedWordIndex], true);
    } else {
      targetedWordIndex = findStartWordIndex(rsvpWords);
      if (targetedWordIndex < 0 || targetedWordIndex >= rsvpWords.length) {
        targetedWordIndex = 0;
      }
      lastResumeWordIndex = targetedWordIndex;
      lastResumePageScroll = currentScroll;
      highlightResumeWord(rsvpWords[targetedWordIndex], false);
    }
  }

  function exitSpeedTargetingMode() {
    isSpeedTargeting = false;
    rsvpToggleBtn?.classList.remove('active');
    viewerArea?.classList.remove('speed-targeting-active');
    if (speedTargetBar) speedTargetBar.style.display = 'none';
    if (targetOverlay) targetOverlay.style.display = 'none';

    // Clear all in-DOM and CFI markers
    if (lastResumeMarkerCfi) {
      try { rendition.annotations.remove(lastResumeMarkerCfi, 'highlight'); } catch(e) {}
      lastResumeMarkerCfi = null;
    }
    document.querySelectorAll('#viewerArea iframe').forEach(ifr => {
      try {
        ifr.contentDocument?.querySelectorAll('.rsvp-target-marker, .rsvp-resume-marker')?.forEach(el => el.remove());
      } catch(e) {}
    });

    lastSelectedText = null;
    lastSelectedCfi = null;
  }

  function startRsvpPlayback(startIdx) {
    if (!rsvpWords.length) {
      rsvpWords = extractSectionWords();
    }
    if (!rsvpWords.length) return;

    isRsvpOpen = true;
    if (speedTargetBar) speedTargetBar.style.display = 'none';
    if (rsvpModal) rsvpModal.style.display = 'flex';

    rsvpIndex = typeof startIdx === 'number' ? startIdx : targetedWordIndex;

    // Rewind to the beginning of the sentence
    while (rsvpIndex > 0 && !rsvpWords[rsvpIndex - 1].isSentenceEnd) {
      rsvpIndex--;
    }

    playRsvp();
  }

  function closeRsvp() {
    if (!isRsvpOpen) return;
    isRsvpOpen = false;
    pauseRsvp();
    if (rsvpModal) rsvpModal.style.display = 'none';

    // Return to Phase 1 targeting mode with red highlight at last read word
    if (rsvpWords.length && rsvpIndex < rsvpWords.length) {
      targetedWordIndex = rsvpIndex;
      lastResumeWordIndex = rsvpIndex;
      const manager = rendition?.manager;
      lastResumePageScroll = manager?.container?.scrollLeft || 0;
      highlightResumeWord(rsvpWords[targetedWordIndex]);
    }

    if (isSpeedTargeting && speedTargetBar) {
      speedTargetBar.style.display = 'flex';
    }
  }

  function extractSectionWords() {
    if (!rendition) return [];
    const contents = rendition.getContents();
    if (!contents?.length) return [];

    const wordList = [];
    contents.forEach((cnt) => {
      const doc = cnt.document;
      if (!doc || !doc.body) return;

      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const parent = node.parentElement?.tagName?.toLowerCase();
          if (['script', 'style', 'noscript'].includes(parent)) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.nodeValue.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });

      let textNode;
      while ((textNode = walker.nextNode())) {
        const text = textNode.nodeValue;
        const regex = /\S+/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
          const rawWord = match[0];
          const startOffset = match.index;
          const endOffset = startOffset + rawWord.length;

          let cfi = null;
          try {
            const range = doc.createRange();
            range.setStart(textNode, startOffset);
            range.setEnd(textNode, endOffset);
            cfi = cnt.cfiFromRange(range);
          } catch(e) {}

          const isSentenceEnd = /[.!?…][)"'”’]?$/.test(rawWord);
          const isClauseEnd   = /[,:;—–-]$/.test(rawWord);

          wordList.push({
            word: rawWord,
            node: textNode,
            doc: doc,
            cnt: cnt,
            startOffset: startOffset,
            endOffset: endOffset,
            cfi: cfi,
            isSentenceEnd: isSentenceEnd,
            isClauseEnd: isClauseEnd
          });
        }
      }
    });

    return wordList;
  }

  function findStartWordIndex(words) {
    if (!words.length) return 0;

    const manager = rendition?.manager;
    const currentScroll = manager?.container?.scrollLeft || 0;
    const viewportWidth = manager?.layout?.delta || viewerArea?.clientWidth || 800;


    // 1. Check if user made an active selection in any iframe
    const contents = rendition.getContents();
    if (contents?.length) {
      for (const cnt of contents) {
        const doc = cnt.document;
        const win = doc?.defaultView || cnt.window;
        const sel = win?.getSelection ? win.getSelection() : null;
        if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
          const idx = findWordFromRangeOrSelection(doc, sel);
          if (idx !== -1) {
            return idx;
          }
        }
      }
    }

    // 2. Fallback: Find first word currently visible on this exact page
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.doc && w.node) {
        try {
          const range = w.doc.createRange();
          range.setStart(w.node, w.startOffset);
          range.setEnd(w.node, w.endOffset);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            if (rect.left >= currentScroll - 5 && rect.left < currentScroll + viewportWidth - 20) {
              return i;
            }
          }
        } catch(e) {}
      }
    }

    return 0;
  }

  function scrollToWord(wordObj) {
    if (!wordObj || !rendition?.manager) return;
    const manager = rendition.manager;
    const delta = manager.layout?.delta;
    if (!delta || delta <= 0) return;

    const doc = wordObj.doc;
    if (!doc || !wordObj.node) return;

    try {
      const range = doc.createRange();
      range.setStart(wordObj.node, wordObj.startOffset);
      range.setEnd(wordObj.node, wordObj.endOffset);
      const rect = range.getBoundingClientRect();

      const pageIndex = Math.max(0, Math.floor(rect.left / delta));
      const maxScroll = Math.max(0, (manager.container.scrollWidth || 0) - delta);
      const targetScroll = Math.min(pageIndex * delta, maxScroll);

      manager.scrollTo(targetScroll, 0, true);
    } catch(e) {
    }
  }

  function highlightResumeWord(wordObj, shouldScroll = true) {
    if (!wordObj || !rendition) return;

    if (shouldScroll) {
      scrollToWord(wordObj);
    }

    // 1. Clear previous native CFI annotation and in-DOM markers
    if (lastResumeMarkerCfi) {
      try { rendition.annotations.remove(lastResumeMarkerCfi, 'highlight'); } catch(e) {}
      lastResumeMarkerCfi = null;
    }
    document.querySelectorAll('#viewerArea iframe').forEach(ifr => {
      try {
        ifr.contentDocument?.querySelectorAll('.rsvp-target-marker, .rsvp-resume-marker')?.forEach(el => el.remove());
      } catch(e) {}
    });

    // 2. Apply native EPUB.js CFI highlight
    if (wordObj.cfi) {
      try {
        lastResumeMarkerCfi = wordObj.cfi;
        rendition.annotations.highlight(wordObj.cfi, {}, null, 'rsvp-resume-marker', {
          fill: 'rgba(239, 68, 68, 0.35)'
        });
      } catch(err) {
      }
    }

    // 3. In-DOM marker attached directly inside iframe document body
    const doc = wordObj.doc;
    if (doc && wordObj.node && doc.body) {
      try {
        const range = doc.createRange();
        range.setStart(wordObj.node, wordObj.startOffset);
        range.setEnd(wordObj.node, wordObj.endOffset);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          let marker = doc.getElementById('rsvp-target-marker');
          if (!marker) {
            marker = doc.createElement('div');
            marker.id = 'rsvp-target-marker';
            marker.className = 'rsvp-target-marker';
            doc.body.appendChild(marker);
          }
          marker.style.position = 'absolute';
          marker.style.left = (rect.left - 2) + 'px';
          marker.style.top = (rect.top - 1) + 'px';
          marker.style.width = (rect.width + 4) + 'px';
          marker.style.height = (rect.height + 2) + 'px';
          marker.style.pointerEvents = 'none';
          marker.style.zIndex = '99999';
          marker.style.borderRadius = '3px';
          marker.style.backgroundColor = 'rgba(239, 68, 68, 0.28)';
          marker.style.outline = '2px solid #ef4444';
          marker.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.6)';
          marker.style.display = 'block';
        }
      } catch(err) {
      }
    }
  }

  function getOrpIndex(len) {
    if (len <= 1) return 0;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    if (len <= 13) return 3;
    return 4;
  }

  function updateRsvpDisplay() {
    if (rsvpIndex < 0) rsvpIndex = 0;
    if (rsvpIndex >= rsvpWords.length) {
      pauseRsvp();
      rsvpIndex = rsvpWords.length - 1;
    }

    const wordObj = rsvpWords[rsvpIndex];
    const word = wordObj ? wordObj.word : '';
    const orpIdx = getOrpIndex(word.length);
    const left = word.slice(0, orpIdx);
    const orp = word.slice(orpIdx, orpIdx + 1);
    const right = word.slice(orpIdx + 1);

    if (rsvpWordLeft) rsvpWordLeft.textContent = left;
    if (rsvpWordOrp) rsvpWordOrp.textContent = orp;
    if (rsvpWordRight) rsvpWordRight.textContent = right;
    if (rsvpProgressText) rsvpProgressText.textContent = `Word ${rsvpIndex + 1} / ${rsvpWords.length}`;
    if (rsvpWpmDisplay) rsvpWpmDisplay.textContent = rsvpWpm + ' WPM';
  }

  function playRsvp() {
    rsvpPlaying = true;
    if (rsvpPlayBtn) rsvpPlayBtn.textContent = '⏸ Pause';
    runRsvpStep();
  }

  function pauseRsvp() {
    rsvpPlaying = false;
    clearTimeout(rsvpTimer);
    if (rsvpPlayBtn) rsvpPlayBtn.textContent = '▶ Play';
  }

  function toggleRsvpPlayback() {
    if (rsvpPlaying) pauseRsvp();
    else playRsvp();
  }

  function runRsvpStep() {
    if (!rsvpPlaying || !isRsvpOpen) return;
    if (rsvpIndex >= rsvpWords.length) {
      pauseRsvp();
      return;
    }

    updateRsvpDisplay();

    const wordObj = rsvpWords[rsvpIndex];
    const prevWordObj = rsvpIndex > 0 ? rsvpWords[rsvpIndex - 1] : null;
    let delay = (60 / rsvpWpm) * 1000;

    // Natural breathing pauses:
    if (prevWordObj && wordObj.node?.parentElement !== prevWordObj.node?.parentElement) {
      delay *= 2.0;
    } else if (wordObj.isSentenceEnd) {
      delay *= 2.2;
    } else if (wordObj.isClauseEnd) {
      delay *= 1.5;
    } else if (wordObj.word.length > 10) {
      delay *= 1.2;
    }

    // Keep background book page in sync
    if (rsvpIndex % 15 === 0) {
      scrollToWord(wordObj);
    }

    rsvpTimer = setTimeout(() => {
      rsvpIndex++;
      runRsvpStep();
    }, delay);
  }

  function changeRsvpSpeed(delta) {
    rsvpWpm = Math.max(150, Math.min(900, rsvpWpm + delta));
    if (rsvpWpmDisplay) rsvpWpmDisplay.textContent = rsvpWpm + ' WPM';
  }

  function stepRsvpWords(delta) {
    rsvpIndex = Math.max(0, Math.min(rsvpWords.length - 1, rsvpIndex + delta));
    updateRsvpDisplay();
    if (rsvpWords[rsvpIndex]) {
      scrollToWord(rsvpWords[rsvpIndex]);
    }
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
      body: { background: '#0f172a !important', 'font-family': FONT_STACK + ' !important', 'line-height': '1.75 !important', 'user-select': 'text !important', '-webkit-user-select': 'text !important' },
      'p,div,span,li,td,th,dt,dd,blockquote,figcaption': { color: '#e2e8f0 !important', background: 'transparent !important', 'user-select': 'text !important', '-webkit-user-select': 'text !important' },
      img: { 'max-width': '100% !important', 'max-height': '100% !important', 'object-fit': 'contain !important', 'box-sizing': 'border-box !important' },
      a: { color: '#38bdf8 !important' },
      'h1,h2,h3,h4,h5,h6': { color: '#f8fafc !important' },
      '.rsvp-resume-marker': { 'background-color': 'rgba(239, 68, 68, 0.35) !important', 'color': '#ef4444 !important', 'border-radius': '3px !important', 'outline': '2px solid #ef4444 !important' },
      '.rsvp-target-marker': { 'background-color': 'rgba(239, 68, 68, 0.35) !important', 'outline': '2px solid #ef4444 !important', 'border-radius': '3px !important' }
    });
    rendition.themes.register('light', {
      '*': { color: '#1e293b !important' },
      body: { background: '#ffffff !important', 'font-family': FONT_STACK + ' !important', 'line-height': '1.75 !important', 'user-select': 'text !important', '-webkit-user-select': 'text !important' },
      'p,div,span,li,td,th,dt,dd,blockquote,figcaption': { color: '#1e293b !important', background: 'transparent !important', 'user-select': 'text !important', '-webkit-user-select': 'text !important' },
      img: { 'max-width': '100% !important', 'max-height': '100% !important', 'object-fit': 'contain !important', 'box-sizing': 'border-box !important' },
      a: { color: '#0284c7 !important' },
      'h1,h2,h3,h4,h5,h6': { color: '#0f172a !important' },
      '.rsvp-resume-marker': { 'background-color': 'rgba(239, 68, 68, 0.35) !important', 'color': '#ef4444 !important', 'border-radius': '3px !important', 'outline': '2px solid #ef4444 !important' },
      '.rsvp-target-marker': { 'background-color': 'rgba(239, 68, 68, 0.35) !important', 'outline': '2px solid #ef4444 !important', 'border-radius': '3px !important' }
    });
    rendition.themes.register('sepia', {
      '*': { color: '#433422 !important' },
      body: { background: '#fbf0d9 !important', 'font-family': 'Georgia, serif !important', 'line-height': '1.75 !important', 'user-select': 'text !important', '-webkit-user-select': 'text !important' },
      'p,div,span,li,td,th,dt,dd,blockquote,figcaption': { color: '#433422 !important', background: 'transparent !important', 'user-select': 'text !important', '-webkit-user-select': 'text !important' },
      img: { 'max-width': '100% !important', 'max-height': '100% !important', 'object-fit': 'contain !important', 'box-sizing': 'border-box !important' },
      a: { color: '#a06d3b !important' },
      'h1,h2,h3,h4,h5,h6': { color: '#2c2014 !important' },
      '.rsvp-resume-marker': { 'background-color': 'rgba(239, 68, 68, 0.35) !important', 'color': '#ef4444 !important', 'border-radius': '3px !important', 'outline': '2px solid #ef4444 !important' },
      '.rsvp-target-marker': { 'background-color': 'rgba(239, 68, 68, 0.35) !important', 'outline': '2px solid #ef4444 !important', 'border-radius': '3px !important' }
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
      case 'open-rsvp': (isRsvpOpen ? closeRsvp() : toggleSpeedReadingMode()); break;
    }
  };

  // Start app
  document.addEventListener('DOMContentLoaded', init);
})();
