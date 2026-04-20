const PANEL_URL = chrome.runtime.getURL('panel/index.html');

let state = {
  spaces: [],
  windowMap: {},       // { windowId: spaceId }
  currentSpaceId: null,
  myWindowId: null,
};

// ─── init ─────────────────────────────────────────────────────────────────────

async function init() {
  const win = await chrome.windows.getCurrent();
  state.myWindowId = win.id;

  await refreshState();
  state.currentSpaceId = state.windowMap[String(state.myWindowId)] || null;

  render();
  bindEvents();
  bindBookmarkNameModal();
  chrome.runtime.onMessage.addListener(onBgMessage);
}

async function refreshState() {
  const localRes = await chrome.storage.local.get('spaces');
  const sessionRes = await chrome.storage.session.get('windowMap');
  state.spaces = (localRes && localRes.spaces) || [];
  state.windowMap = (sessionRes && sessionRes.windowMap) || {};
}

async function sendMsg(msg, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await chrome.runtime.sendMessage(msg);
      if (res !== undefined) return res;
    } catch (e) {
      if (i === retries - 1) throw e;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return {};
}

function sendMsgOnce(msg) {
  return chrome.runtime.sendMessage(msg).catch(() => {});
}

// ─── render ───────────────────────────────────────────────────────────────────

function render() {
  renderSidebar();
  renderContent();
}

function renderSidebar() {
  const list = document.getElementById('spaces-list');
  list.innerHTML = '';

  for (const space of state.spaces) {
    const isOnline = getWindowIdForSpace(space.id) !== null;
    const isCurrent = space.id === state.currentSpaceId;

    const li = document.createElement('li');
    li.className = 'space-item' + (isCurrent ? ' active' : '') + (isOnline ? ' online' : '');
    li.dataset.spaceId = space.id;
    li.innerHTML = `
      <span class="space-dot">●</span>
      <span class="space-name">${esc(space.name)}</span>
      <span class="space-actions">
        <button class="spc-btn del" data-action="delete" data-space-id="${space.id}" title="删除">✕</button>
      </span>
    `;
    list.appendChild(li);
  }

  // show current space name at bottom of sidebar
  const indicator = document.getElementById('current-space-indicator');
  const label = document.getElementById('current-space-label');
  const current = state.spaces.find(s => s.id === state.currentSpaceId);
  if (current) {
    label.textContent = current.name;
    indicator.classList.remove('hidden');
    document.title = current.name;
    setFavicon(current.name);
  } else {
    indicator.classList.add('hidden');
    document.title = 'Tab Workspace Manager';
    setFavicon(null);
  }
}

function renderContent() {
  const hint = document.getElementById('no-space-hint');
  const detail = document.getElementById('space-detail');

  if (!state.currentSpaceId) {
    hint.classList.remove('hidden');
    detail.classList.add('hidden');
    return;
  }

  hint.classList.add('hidden');
  detail.classList.remove('hidden');

  const space = state.spaces.find(s => s.id === state.currentSpaceId);
  if (!space) return;

  renderBookmarks(space);
  renderTabs(space);
}

function renderBookmarks(space) {
  const list = document.getElementById('bookmark-list');
  const empty = document.getElementById('bookmark-empty');
  list.innerHTML = '';

  if (!space.bookmarks.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  for (const bm of space.bookmarks) {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.dataset.url = bm.url;
    li.innerHTML = `
      ${favicon(bm.url)}
      <span class="item-title" title="${esc(bm.url)}">${esc(bm.title || bm.url)}</span>
      <span class="item-actions">
        <button class="action-btn remove-btn" data-action="remove-bookmark" data-url="${esc(bm.url)}" title="移除">✕</button>
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

  const bmUrls = new Set(space.bookmarks.map(b => b.url));
  const isOnline = getWindowIdForSpace(space.id) !== null;

  // filter out the panel tab itself from display
  const tabs = space.tabs.filter(t => !t.url.startsWith(PANEL_URL));

  if (!tabs.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  for (const tab of tabs) {
    const isBm = bmUrls.has(tab.url);
    const li = document.createElement('li');
    li.className = 'list-item';
    li.dataset.url = tab.url;
    li.innerHTML = `
      ${favicon(tab.url)}
      <span class="item-title" title="${esc(tab.url)}">${esc(tab.title || tab.url)}</span>
      <span class="item-actions">
        ${isOnline ? `
          <button class="action-btn bookmark-btn ${isBm ? 'bookmarked' : ''}"
            data-action="toggle-bookmark"
            data-url="${esc(tab.url)}"
            data-title="${esc(tab.title || '')}"
            title="${isBm ? '取消收藏' : '收藏'}">★</button>
          <button class="action-btn remove-btn"
            data-action="close-tab"
            data-url="${esc(tab.url)}"
            title="关闭">✕</button>
        ` : ''}
      </span>
    `;
    list.appendChild(li);
  }
  bindFavicons(list);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function getWindowIdForSpace(spaceId) {
  const e = Object.entries(state.windowMap).find(([, sid]) => sid === spaceId);
  return e ? parseInt(e[0]) : null;
}

function setFavicon(spaceName) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (spaceName) {
    const hue = [...spaceName].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
    ctx.fillStyle = `hsl(${hue}, 70%, 55%)`;
    ctx.beginPath();
    ctx.arc(16, 16, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spaceName[0].toUpperCase(), 16, 17);
  } else {
    ctx.fillStyle = '#4a90d9';
    ctx.beginPath();
    ctx.arc(16, 16, 16, 0, Math.PI * 2);
    ctx.fill();
  }
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = canvas.toDataURL();
}

function favicon(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith('http')) return `<span class="favicon-fallback">🔗</span>`;
    return `<img class="favicon" data-favicon-src="${parsed.origin}/favicon.ico" />
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

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── events ───────────────────────────────────────────────────────────────────

function bindEvents() {
  // sidebar: click space or delete
  document.getElementById('spaces-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn && btn.dataset.action === 'delete') {
      const spaceId = btn.dataset.spaceId;
      const space = state.spaces.find(s => s.id === spaceId);
      if (!space || !confirm(`删除 Space "${space.name}"？`)) return;
      await sendMsgOnce({ type: 'DELETE_SPACE', spaceId });
      if (state.currentSpaceId === spaceId) state.currentSpaceId = null;
      await refreshState();
      render();
      return;
    }
    const item = e.target.closest('.space-item');
    if (!item) return;
    await sendMsgOnce({ type: 'ACTIVATE_SPACE', spaceId: item.dataset.spaceId });
    // activateSpace will focus the right window; if it's this window update currentSpaceId
    await refreshState();
    state.currentSpaceId = state.windowMap[String(state.myWindowId)] || null;
    render();
  });

  // new space button
  document.getElementById('btn-new-space').addEventListener('click', () => {
    document.getElementById('new-space-form').classList.remove('hidden');
    document.getElementById('new-space-input').focus();
  });
  document.getElementById('btn-cancel').addEventListener('click', cancelNewSpace);
  document.getElementById('btn-confirm').addEventListener('click', confirmNewSpace);
  document.getElementById('new-space-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmNewSpace();
    if (e.key === 'Escape') cancelNewSpace();
  });

  // content: bookmark / tab actions
  document.getElementById('content').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) { await handleContentAction(btn); return; }

    // clicking bookmark item row opens url
    const li = e.target.closest('#bookmark-list .list-item');
    if (li) {
      sendMsgOnce({ type: 'OPEN_BOOKMARK', spaceId: state.currentSpaceId, url: li.dataset.url });
    }
  });
}

async function handleContentAction(btn) {
  const action = btn.dataset.action;
  if (action === 'remove-bookmark') {
    await sendMsgOnce({ type: 'REMOVE_BOOKMARK', spaceId: state.currentSpaceId, url: btn.dataset.url });
    await refreshState(); render();
  }
  if (action === 'toggle-bookmark') {
    const isBm = btn.classList.contains('bookmarked');
    if (isBm) {
      await sendMsgOnce({ type: 'REMOVE_BOOKMARK', spaceId: state.currentSpaceId, url: btn.dataset.url });
      await refreshState(); render();
    } else {
      const defaultTitle = btn.dataset.title || btn.dataset.url;
      const editedTitle = await promptBookmarkName(defaultTitle);
      if (editedTitle === null) return;
      await sendMsgOnce({ type: 'ADD_BOOKMARK', spaceId: state.currentSpaceId, tab: { url: btn.dataset.url, title: editedTitle || defaultTitle } });
      await refreshState(); render();
    }
  }
  if (action === 'close-tab') {
    const winId = getWindowIdForSpace(state.currentSpaceId);
    if (winId === null) return;
    const [liveTab] = await chrome.tabs.query({ url: btn.dataset.url, windowId: winId });
    if (liveTab) await sendMsgOnce({ type: 'CLOSE_TAB', tabId: liveTab.id });
  }
}

function cancelNewSpace() {
  document.getElementById('new-space-form').classList.add('hidden');
  document.getElementById('new-space-input').value = '';
}

async function confirmNewSpace() {
  const input = document.getElementById('new-space-input');
  const name = input.value.trim();
  if (!name) return;
  const res = await sendMsg({ type: 'CREATE_SPACE', name });
  if (res.error) { alert(res.error); return; }
  input.value = '';
  document.getElementById('new-space-form').classList.add('hidden');
  await refreshState();
  state.currentSpaceId = state.windowMap[String(state.myWindowId)] || null;
  render();
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

// ─── background messages ──────────────────────────────────────────────────────

async function onBgMessage(msg) {
  if (msg.type === 'TABS_UPDATED' || msg.type === 'WINDOW_CLOSED' || msg.type === 'SPACE_ACTIVATED') {
    await refreshState();
    state.currentSpaceId = state.windowMap[String(state.myWindowId)] || state.currentSpaceId;
    render();
  }
  if (msg.type === 'FOCUS_CHANGED') {
    // panel tab stays in same window; update if this window's space changed
    if (msg.windowId === state.myWindowId) {
      state.currentSpaceId = msg.spaceId || null;
      await refreshState();
      render();
    }
  }
}

init();
