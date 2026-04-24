import {
  getAllSpaces,
  getSpace,
  createSpace,
  deleteSpace,
  updateSpace,
  reorderSpaces,
} from './storage.js';
import {
  getSpaceByWindowId,
  setWindowMapping,
  removeWindowMapping,
  getWindowIdBySpaceId,
  getWindowMap,
} from './windowMap.js';

const PANEL_PATH = 'panel/index.html';

function getPanelUrl() {
  return chrome.runtime.getURL(PANEL_PATH);
}

function isPanelTab(tab) {
  return tab.url && tab.url.startsWith(chrome.runtime.getURL(PANEL_PATH));
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function toSavedTab(tab) {
  return { url: tab.url, title: tab.title || '', pinned: tab.pinned, index: tab.index };
}

async function syncWindowTabs(windowId) {
  const spaceId = await getSpaceByWindowId(windowId);
  if (!spaceId) return;
  const tabs = await chrome.tabs.query({ windowId });
  const savedTabs = tabs.filter(t => !isPanelTab(t)).map(toSavedTab);
  await updateSpace(spaceId, { tabs: savedTabs });
  notifyPanel({ type: 'TABS_UPDATED', spaceId });
}

function notifyPanel(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

// ─── tab events ──────────────────────────────────────────────────────────────

chrome.tabs.onCreated.addListener(async (tab) => {
  if (isPanelTab(tab)) return;
  await syncWindowTabs(tab.windowId);
});

chrome.tabs.onRemoved.addListener(async (_tabId, removeInfo) => {
  if (removeInfo.isWindowClosing) return;
  await syncWindowTabs(removeInfo.windowId);
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (!changeInfo.url && !changeInfo.title) return;
  if (isPanelTab(tab)) return;
  await syncWindowTabs(tab.windowId);
});

// ─── window events ───────────────────────────────────────────────────────────

chrome.windows.onRemoved.addListener(async (windowId) => {
  await removeWindowMapping(windowId);
  notifyPanel({ type: 'WINDOW_CLOSED', windowId });
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const spaceId = await getSpaceByWindowId(windowId);
  if (spaceId) await syncWindowTabs(windowId);
  notifyPanel({ type: 'FOCUS_CHANGED', windowId, spaceId });
});

// ─── activateSpace ───────────────────────────────────────────────────────────

async function activateSpace(spaceId) {
  const existingWindowId = await getWindowIdBySpaceId(spaceId);
  if (existingWindowId !== null) {
    try {
      await chrome.windows.update(existingWindowId, { focused: true });
      return;
    } catch (e) {
      console.log('[activateSpace] existingWindow failed, removing mapping', e);
      await removeWindowMapping(existingWindowId);
    }
  }

  const space = await getSpace(spaceId);
  if (!space) return;

  const panelUrl = getPanelUrl();
  const restoreUrls = space.tabs.length > 0
    ? space.tabs.map(t => t.url)
    : ['chrome://newtab'];

  const win = await chrome.windows.create({ url: panelUrl, focused: true });
  await setWindowMapping(win.id, spaceId);

  for (const url of restoreUrls) {
    await chrome.tabs.create({ windowId: win.id, url, active: false });
  }

  // pin panel tab and activate the first content tab
  const [panelTab] = await chrome.tabs.query({ windowId: win.id, url: panelUrl });
  if (panelTab) await chrome.tabs.update(panelTab.id, { pinned: true });

  const [firstContentTab] = await chrome.tabs.query({ windowId: win.id, pinned: false });
  if (firstContentTab) await chrome.tabs.update(firstContentTab.id, { active: true });

  await syncWindowTabs(win.id);
  notifyPanel({ type: 'SPACE_ACTIVATED', spaceId, windowId: win.id });
}

// ─── action: focus/open panel tab ────────────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  const windowId = tab.windowId;
  const panelUrl = getPanelUrl();
  const [existing] = await chrome.tabs.query({ windowId, url: panelUrl });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
  } else {
    await chrome.tabs.create({ windowId, url: panelUrl, index: 0, pinned: true, active: true });
  }
});

// ─── message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case 'ACTIVATE_SPACE': {
      await activateSpace(message.spaceId);
      return { ok: true };
    }
    case 'CREATE_SPACE': {
      const space = await createSpace(message.name);
      await activateSpace(space.id);
      return { ok: true, space };
    }
    case 'DELETE_SPACE': {
      const windowId = await getWindowIdBySpaceId(message.spaceId);
      if (windowId !== null) {
        await removeWindowMapping(windowId);
        await chrome.windows.remove(windowId).catch(() => {});
      }
      await deleteSpace(message.spaceId);
      return { ok: true };
    }
    case 'ADD_BOOKMARK': {
      const space = await getSpace(message.spaceId);
      if (!space) return { error: 'Space not found' };
      if (space.bookmarks.some(b => b.url === message.tab.url)) return { ok: true, duplicate: true };
      await updateSpace(message.spaceId, { bookmarks: [...space.bookmarks, message.tab] });
      return { ok: true };
    }
    case 'REMOVE_BOOKMARK': {
      const space = await getSpace(message.spaceId);
      if (!space) return { error: 'Space not found' };
      await updateSpace(message.spaceId, { bookmarks: space.bookmarks.filter(b => b.url !== message.url) });
      return { ok: true };
    }
    case 'OPEN_BOOKMARK': {
      const windowId = await getWindowIdBySpaceId(message.spaceId);
      if (windowId !== null) {
        await chrome.tabs.create({ windowId, url: message.url });
      } else {
        await activateSpace(message.spaceId);
      }
      return { ok: true };
    }
    case 'CLOSE_TAB': {
      await chrome.tabs.remove(message.tabId);
      return { ok: true };
    }
    case 'REORDER_SPACES': {
      await reorderSpaces(message.orderedIds);
      return { ok: true };
    }
    case 'GET_ALL_SPACES': {
      return { ok: true, spaces: await getAllSpaces() };
    }
    case 'GET_WINDOW_MAP': {
      return { ok: true, map: await getWindowMap() };
    }
    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}
