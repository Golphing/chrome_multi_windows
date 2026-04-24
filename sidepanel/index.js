// Side Panel main script

let state = {
  spaces: [],       // all spaces from storage
  windowMap: {},    // windowId -> spaceId (runtime)
  currentSpaceId: null,
  currentWindowId: null,
};

// ─── init ─────────────────────────────────────────────────────────────────────

async function init() {
  await refreshState();

  const win = await chrome.windows.getCurrent();
  if (win) {
    state.currentWindowId = win.id;
    state.currentSpaceId = state.windowMap[win.id] || null;
  }

  if (!state.currentSpaceId) {
    const { lastSpaceId } = await chrome.storage.local.get('lastSpaceId');
    if (lastSpaceId && state.spaces.some(s => s.id === lastSpaceId)) {
      state.currentSpaceId = lastSpaceId;
    } else if (state.spaces.length > 0) {
      state.currentSpaceId = state.spaces[state.spaces.length - 1].id;
    }
  }

  render();
  bindEvents();
  bindBookmarkNameModal();

  chrome.runtime.onMessage.addListener(onServiceWorkerMessage);
}

async function refreshState() {
  const [spacesRes, mapRes] = await Promise.all([
    sendMsg({ type: 'GET_ALL_SPACES' }),
    sendMsg({ type: 'GET_WINDOW_MAP' }),
  ]);
  state.spaces = spacesRes.spaces || [];
  state.windowMap = mapRes.map || {};
}

// ─── messaging ────────────────────────────────────────────────────────────────

function sendMsg(message) {
  return chrome.runtime.sendMessage(message);
}

// ─── render ───────────────────────────────────────────────────────────────────

function render() {
  renderSpaceSelector();
  renderContent();
}

function renderSpaceSelector() {
  const list = document.getElementById('spaces-list');
  list.innerHTML = '';
  for (const space of state.spaces) {
    const windowId = getWindowIdForSpace(space.id);
    const isActive = windowId !== null;
    const isCurrent = space.id === state.currentSpaceId;

    const chip = document.createElement('div');
    chip.className = 'space-chip' + (isCurrent ? ' active' : '');
    chip.dataset.spaceId = space.id;
    chip.innerHTML = `
      <span class="status-dot">${isActive ? '●' : '○'}</span>
      <span class="space-name">${escHtml(space.name)}</span>
      <span class="delete-space" data-space-id="${space.id}" title="删除">✕</span>
    `;
    list.appendChild(chip);
  }

  // show current space name at bottom of sidebar
  const indicator = document.getElementById('current-space-indicator');
  const label = document.getElementById('current-space-label');
  const current = state.spaces.find(s => s.id === state.currentSpaceId);
  if (current) {
    label.textContent = current.name;
    indicator.classList.remove('hidden');
  } else {
    indicator.classList.add('hidden');
  }
}

function renderContent() {
  const noHint = document.getElementById('no-space-hint');
  const secBookmarks = document.getElementById('section-bookmarks');
  const secTabs = document.getElementById('section-tabs');

  if (!state.currentSpaceId) {
    noHint.classList.remove('hidden');
    secBookmarks.classList.add('hidden');
    secTabs.classList.add('hidden');
    return;
  }

  noHint.classList.add('hidden');
  secBookmarks.classList.remove('hidden');
  secTabs.classList.remove('hidden');

  const space = state.spaces.find(s => s.id === state.currentSpaceId);
  if (!space) return;

  renderBookmarks(space);
  renderTabs(space);
}

function renderBookmarks(space) {
  const list = document.getElementById('bookmark-list');
  const empty = document.getElementById('bookmark-empty');
  list.innerHTML = '';

  if (!space.bookmarks.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  for (const bm of space.bookmarks) {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.dataset.url = bm.url;
    li.innerHTML = `
      ${faviconImg(bm.url)}
      <span class="item-title" title="${escHtml(bm.url)}">${escHtml(bm.title || bm.url)}</span>
      <span class="item-actions">
        <button class="action-btn remove-btn" data-action="remove-bookmark" data-url="${escHtml(bm.url)}" title="移除收藏">✕</button>
      </span>
    `;
    list.appendChild(li);
  }
  bindFavicons(list);
}

function renderTabs(space) {
  const list = document.getElementById('tab-list');
  const empty = document.getElementById('tabs-empty');
  list.innerHTML = '';

  const bookmarkedUrls = new Set(space.bookmarks.map(b => b.url));
  const windowId = getWindowIdForSpace(space.id);
  const isActive = windowId !== null;

  const tabs = space.tabs;
  if (!tabs.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  for (const tab of tabs) {
    const isBm = bookmarkedUrls.has(tab.url);
    const li = document.createElement('li');
    li.className = 'list-item';
    li.dataset.url = tab.url;
    li.innerHTML = `
      ${faviconImg(tab.url)}
      <span class="item-title" title="${escHtml(tab.url)}">${escHtml(tab.title || tab.url)}</span>
      <span class="item-actions">
        ${isActive ? `
          <button class="action-btn bookmark-btn ${isBm ? 'bookmarked' : ''}"
            data-action="toggle-bookmark"
            data-url="${escHtml(tab.url)}"
            data-title="${escHtml(tab.title || '')}"
            title="${isBm ? '取消收藏' : '加入收藏'}">★</button>
          <button class="action-btn remove-btn" data-action="close-tab" data-url="${escHtml(tab.url)}" title="关闭 Tab">✕</button>
        ` : ''}
      </span>
    `;
    list.appendChild(li);
  }
  bindFavicons(list);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function getWindowIdForSpace(spaceId) {
  const entry = Object.entries(state.windowMap).find(([, sid]) => sid === spaceId);
  return entry ? parseInt(entry[0]) : null;
}

function faviconImg(url) {
  try {
    const origin = new URL(url).origin;
    return `<img class="favicon" data-favicon-src="${origin}/favicon.ico" />
            <span class="favicon-fallback" style="display:none">🔗</span>`;
  } catch {
    return `<span class="favicon-fallback">🔗</span>`;
  }
}

function bindFavicons(container) {
  container.querySelectorAll('img[data-favicon-src]').forEach(img => {
    img.src = img.dataset.faviconSrc;
    img.addEventListener('error', () => {
      img.style.display = 'none';
      const fallback = img.nextElementSibling;
      if (fallback) fallback.style.display = 'inline-block';
    }, { once: true });
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── event binding ────────────────────────────────────────────────────────────

function bindEvents() {
  // space chip click
  document.getElementById('spaces-list').addEventListener('click', async (e) => {
    const chip = e.target.closest('.space-chip');
    if (!chip) return;

    // delete button
    if (e.target.classList.contains('delete-space')) {
      const spaceId = e.target.dataset.spaceId;
      const space = state.spaces.find(s => s.id === spaceId);
      if (!space) return;
      if (!confirm(`删除 Space "${space.name}"？此操作不可撤销。`)) return;
      await sendMsg({ type: 'DELETE_SPACE', spaceId });
      if (state.currentSpaceId === spaceId) {
        state.currentSpaceId = null;
        chrome.storage.local.remove('lastSpaceId').catch(() => {});
      }
      await refreshState();
      render();
      return;
    }

    const spaceId = chip.dataset.spaceId;
    await sendMsg({ type: 'ACTIVATE_SPACE', spaceId });
    state.currentSpaceId = spaceId;
    chrome.storage.local.set({ lastSpaceId: spaceId }).catch(() => {});
    await refreshState();
    render();
  });

  // new space button
  document.getElementById('btn-new-space').addEventListener('click', () => {
    document.getElementById('new-space-form').classList.remove('hidden');
    document.getElementById('new-space-input').focus();
  });

  document.getElementById('btn-new-space-cancel').addEventListener('click', () => {
    document.getElementById('new-space-form').classList.add('hidden');
    document.getElementById('new-space-input').value = '';
  });

  document.getElementById('btn-new-space-confirm').addEventListener('click', createNewSpace);
  document.getElementById('new-space-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createNewSpace();
    if (e.key === 'Escape') document.getElementById('btn-new-space-cancel').click();
  });

  // bookmark / tab actions
  document.getElementById('space-content').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();

    const action = btn.dataset.action;

    if (action === 'remove-bookmark') {
      await sendMsg({ type: 'REMOVE_BOOKMARK', spaceId: state.currentSpaceId, url: btn.dataset.url });
      await refreshState();
      render();
    }

    if (action === 'toggle-bookmark') {
      const isBm = btn.classList.contains('bookmarked');
      if (isBm) {
        await sendMsg({ type: 'REMOVE_BOOKMARK', spaceId: state.currentSpaceId, url: btn.dataset.url });
        await refreshState();
        render();
      } else {
        const defaultTitle = btn.dataset.title || btn.dataset.url;
        const editedTitle = await promptBookmarkName(defaultTitle);
        if (editedTitle === null) return; // cancelled
        await sendMsg({ type: 'ADD_BOOKMARK', spaceId: state.currentSpaceId, tab: { url: btn.dataset.url, title: editedTitle || defaultTitle } });
        await refreshState();
        render();
      }
    }

    if (action === 'close-tab') {
      const space = state.spaces.find(s => s.id === state.currentSpaceId);
      if (!space) return;
      const tab = space.tabs.find(t => t.url === btn.dataset.url);
      if (!tab) return;
      // get actual tab id from chrome
      const [liveTab] = await chrome.tabs.query({ url: btn.dataset.url, windowId: getWindowIdForSpace(state.currentSpaceId) });
      if (liveTab) await sendMsg({ type: 'CLOSE_TAB', tabId: liveTab.id });
    }
  });

  // clicking bookmark list item (not button) opens URL
  document.getElementById('bookmark-list').addEventListener('click', async (e) => {
    if (e.target.closest('[data-action]')) return;
    const li = e.target.closest('.list-item');
    if (!li) return;
    await sendMsg({ type: 'OPEN_BOOKMARK', spaceId: state.currentSpaceId, url: li.dataset.url });
  });
}

async function createNewSpace() {
  const input = document.getElementById('new-space-input');
  const name = input.value.trim();
  if (!name) return;
  try {
    const res = await sendMsg({ type: 'CREATE_SPACE', name });
    if (res.error) { alert(res.error); return; }
    state.currentSpaceId = res.space.id;
    chrome.storage.local.set({ lastSpaceId: res.space.id }).catch(() => {});
    input.value = '';
    document.getElementById('new-space-form').classList.add('hidden');
    await refreshState();
    render();
  } catch (err) {
    alert(err.message);
  }
}

// ─── bookmark name prompt ─────────────────────────────────────────────────────

let _bookmarkNameResolve = null;

function promptBookmarkName(defaultTitle) {
  return new Promise((resolve) => {
    _bookmarkNameResolve = resolve;
    const modal = document.getElementById('bookmark-name-modal');
    const input = document.getElementById('bookmark-name-input');
    input.value = defaultTitle;
    modal.classList.remove('hidden');
    input.focus();
    input.select();
  });
}

function bindBookmarkNameModal() {
  const modal = document.getElementById('bookmark-name-modal');
  const input = document.getElementById('bookmark-name-input');

  function confirm() {
    modal.classList.add('hidden');
    if (_bookmarkNameResolve) { _bookmarkNameResolve(input.value.trim()); _bookmarkNameResolve = null; }
  }
  function cancel() {
    modal.classList.add('hidden');
    if (_bookmarkNameResolve) { _bookmarkNameResolve(null); _bookmarkNameResolve = null; }
  }

  document.getElementById('btn-bookmark-name-confirm').addEventListener('click', confirm);
  document.getElementById('btn-bookmark-name-cancel').addEventListener('click', cancel);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirm();
    if (e.key === 'Escape') cancel();
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) cancel(); });
}

// ─── service worker messages ─────────────────────────────────────────────────

async function onServiceWorkerMessage(message) {
  switch (message.type) {
    case 'TABS_UPDATED':
    case 'WINDOW_CLOSED':
      await refreshState();
      render();
      break;
    case 'SPACE_ACTIVATED':
      state.currentSpaceId = message.spaceId;
      if (message.spaceId) {
        chrome.storage.local.set({ lastSpaceId: message.spaceId }).catch(() => {});
      }
      await refreshState();
      render();
      break;
    case 'FOCUS_CHANGED':
      state.currentWindowId = message.windowId;
      state.currentSpaceId = message.spaceId || null;
      await refreshState();
      render();
      break;
  }
}

init();
