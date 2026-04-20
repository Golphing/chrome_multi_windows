// windowId -> spaceId mapping in chrome.storage.session
// Cleared on browser restart; spaces fall back to "suspended" state.

const MAP_KEY = 'windowMap';

async function getWindowMap() {
  const result = await chrome.storage.session.get(MAP_KEY);
  return result[MAP_KEY] || {};
}

async function getSpaceByWindowId(windowId) {
  const map = await getWindowMap();
  return map[windowId] || null;
}

async function setWindowMapping(windowId, spaceId) {
  const map = await getWindowMap();
  map[windowId] = spaceId;
  await chrome.storage.session.set({ [MAP_KEY]: map });
}

async function removeWindowMapping(windowId) {
  const map = await getWindowMap();
  delete map[windowId];
  await chrome.storage.session.set({ [MAP_KEY]: map });
}

async function getWindowIdBySpaceId(spaceId) {
  const map = await getWindowMap();
  const entry = Object.entries(map).find(([, sid]) => sid === spaceId);
  return entry ? parseInt(entry[0]) : null;
}

export { getWindowMap, getSpaceByWindowId, setWindowMapping, removeWindowMapping, getWindowIdBySpaceId };
