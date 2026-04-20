# Tab Workspace Manager

A Chrome extension that organizes browser tabs into named Spaces, each bound to its own window.

![Chrome](https://img.shields.io/badge/Chrome-Extension-4a6fa5?logo=googlechrome)

## Features

- **Named Spaces** — create workspaces with custom names (e.g. "SDD", "稳定性", "离线开发")
- **One window per Space** — each Space opens and manages its own Chrome window
- **Auto tab sync** — tabs are automatically saved when you open, close, or navigate
- **Bookmarks** — pin important URLs to a Space so they persist independently of open tabs
- **Pinned panel tab** — a dedicated panel tab is always the first tab in each Space window, showing the Space favicon (colored initial) and name in Dock
- **Dynamic favicon** — the panel tab icon shows the Space's initial letter with a unique color, making it easy to identify in the Dock right-click menu

## Screenshots

| Sidebar | Dock menu |
|--------|-----------|
| Light theme, Space list with online indicator | Window title shows Space name |

## Installation

1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the project folder

## Usage

1. Click the extension icon in any window to open the panel tab
2. Click **＋** to create a new Space
3. Click a Space name to switch to (or open) that Space's window
4. In the Tabs section, click **★** to bookmark a tab, **✕** to close it
5. Click a bookmarked URL to open it in the Space's window

## Project Structure

```
├── background/
│   ├── service-worker.js   # Core logic: space activation, tab sync, message handling
│   ├── storage.js          # Space CRUD via chrome.storage.local
│   └── windowMap.js        # Window↔Space mapping via chrome.storage.session
├── panel/
│   ├── index.html          # Panel UI entry point
│   ├── index.js            # Panel rendering and event handling
│   └── index.css           # Light theme styles
├── icons/                  # Extension icons
└── manifest.json
```

## Tech Notes

- Uses `chrome.storage.session` for window mapping (cleared on browser restart — Spaces return to suspended state)
- Uses `chrome.storage.local` for persistent Space and bookmark data
- Panel tab is always pinned and filtered out of the tab list display
