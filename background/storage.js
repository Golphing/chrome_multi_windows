// Space data model:
// {
//   id: string,
//   name: string,
//   tabs: SavedTab[],       // auto-synced from window
//   bookmarks: SavedTab[]   // manually added, persists independently
// }
//
// SavedTab: { url, title, pinned, index }

const SPACES_KEY = 'spaces';

async function getAllSpaces() {
  const result = await chrome.storage.local.get(SPACES_KEY);
  return result[SPACES_KEY] || [];
}

async function getSpace(id) {
  const spaces = await getAllSpaces();
  return spaces.find(s => s.id === id) || null;
}

async function saveAllSpaces(spaces) {
  await chrome.storage.local.set({ [SPACES_KEY]: spaces });
}

async function createSpace(name) {
  const spaces = await getAllSpaces();
  if (spaces.some(s => s.name === name)) {
    throw new Error(`Space "${name}" already exists`);
  }
  const space = {
    id: crypto.randomUUID(),
    name,
    tabs: [],
    bookmarks: [],
  };
  spaces.push(space);
  await saveAllSpaces(spaces);
  return space;
}

async function deleteSpace(id) {
  const spaces = await getAllSpaces();
  await saveAllSpaces(spaces.filter(s => s.id !== id));
}

async function updateSpace(id, updates) {
  const spaces = await getAllSpaces();
  const idx = spaces.findIndex(s => s.id === id);
  if (idx === -1) return;
  spaces[idx] = { ...spaces[idx], ...updates };
  await saveAllSpaces(spaces);
  return spaces[idx];
}

async function reorderSpaces(orderedIds) {
  const spaces = await getAllSpaces();
  const map = Object.fromEntries(spaces.map(s => [s.id, s]));
  const reordered = orderedIds.map(id => map[id]).filter(Boolean);
  await saveAllSpaces(reordered);
}

export { getAllSpaces, getSpace, createSpace, deleteSpace, updateSpace, reorderSpaces };
