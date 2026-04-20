# Tab Workspace Manager

一个 Chrome 扩展，将浏览器标签页组织成命名的 Space，每个 Space 绑定独立的浏览器窗口。

![Chrome](https://img.shields.io/badge/Chrome-扩展程序-4a6fa5?logo=googlechrome)

## 功能特性

- **命名 Space** — 创建自定义名称的工作空间（如「SDD」「稳定性」「离线开发」）
- **一个 Space 一个窗口** — 每个 Space 拥有独立的 Chrome 窗口
- **标签页自动同步** — 打开、关闭、导航时标签页自动保存
- **收藏夹** — 将重要 URL 收藏到 Space，独立于当前打开的标签页持久保存
- **固定面板标签** — 每个 Space 窗口第一个标签始终是面板页，显示 Space 名称和专属图标
- **动态图标** — 面板标签图标显示 Space 首字母及专属颜色，在 Dock 右键菜单中一眼识别

## 安装方法

1. 克隆本仓库
2. 打开 `chrome://extensions`
3. 开启右上角**开发者模式**
4. 点击**加载已解压的扩展程序**，选择项目文件夹

## 使用方式

1. 在任意窗口点击扩展图标，打开面板标签页
2. 点击 **＋** 创建新 Space
3. 点击 Space 名称，切换到（或打开）该 Space 的窗口
4. 在「当前 Tabs」区域，点击 **★** 收藏标签，点击 **✕** 关闭标签
5. 点击收藏的 URL，在该 Space 窗口中打开

## 项目结构

```
├── background/
│   ├── service-worker.js   # 核心逻辑：Space 激活、标签同步、消息处理
│   ├── storage.js          # Space 增删改查，使用 chrome.storage.local
│   └── windowMap.js        # 窗口↔Space 映射，使用 chrome.storage.session
├── panel/
│   ├── index.html          # 面板页入口
│   ├── index.js            # 面板渲染与事件处理
│   └── index.css           # 浅色主题样式
├── icons/                  # 扩展图标
└── manifest.json
```

## 技术说明

- 窗口映射使用 `chrome.storage.session` 存储，浏览器重启后清空，Space 回到未激活状态
- Space 数据和收藏夹使用 `chrome.storage.local` 持久存储
- 面板标签页始终固定（pinned）且不计入标签列表展示
