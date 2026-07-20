# Bulknodes / Heliactyl 挂机与自动续期助手

本项目为您提供了一套完整的 **`dashboard.bulknodes.xyz` (Heliactyl 面板)** 挂机原理说明及自动化挂机/续期脚本。

---

## 一、 网站挂机原理分析

该网站 (`dashboard.bulknodes.xyz`) 是基于 **Heliactyl**（Pterodactyl 托管计费面板的一个分支）构建的。

1. **AFK 页面挂机 (`/afk`)**:
   - 当用户在浏览器中打开 `/afk` 页面时，前端网页会通过 WebSocket 连接到服务器 `wss://dashboard.bulknodes.xyz/ws`（或 `/api/afk/ws`）。
   - 服务器会通过此 WebSocket 会话持续维持用户的“挂机在线状态”（AFK Session）。
   - 只要 WebSocket 保持连接且 Cookie 有效，服务器就会定期（例如每 60 秒）给用户的账户增加积分（Coins / Points / Streak）。

2. **积分与续期 (`/api/afk/streak`)**:
   - 您可以通过 `/api/afk/streak` API 接口实时获取当前的挂机状态、连续天数或积分数据。
   - 当积分累积到足够数量（例如您要求的 **700积分**）时，可以通过调用服务器的续期接口完成服务器续期。

---

## 二、 仓库中提供的自动化脚本

我们在仓库中为您编写了 `afk_bot.js` 自动化脚本，它可以：
1. **自动建立 WebSocket 连接**：模拟浏览器挂机，维持心跳，防止掉线。
2. **自动检测积分**：每 2 分钟请求一次 `/api/afk/streak` 检查当前积分/金币。
3. **达到 700 积分自动续期**：当积分达到设定阈值（默认 700）时，自动触发续期请求。
4. **断线自动重连**：网络波动或连接关闭时自动重试并指数退避重连。

---

## 三、 如何使用与配置

### 1. 准备工作
确保您的服务器或本地环境已安装 **Node.js** (推荐 v18 或更高版本)。

### 2. 安装依赖
在仓库目录下运行以下命令安装所需依赖（`ws`）：
```bash
npm install
```

### 3. 配置环境变量
将 `.env.example` 复制一份并重命名为 `.env`：
```bash
cp .env.example .env
```

编辑 `.env` 文件，填入您从浏览器抓包获取的 Cookie 信息：
```env
PANEL_URL=https://dashboard.bulknodes.xyz
WS_URL=wss://dashboard.bulknodes.xyz/ws
CONNECT_SID=填入你的 connect.sid Cookie 值
CF_CLEARANCE=填入你的 cf_clearance Cookie 值（如果有的话）
RENEW_THRESHOLD=700
```

> **如何获取 Cookie？**
> 1. 在浏览器中登录 `https://dashboard.bulknodes.xyz`。
> 2. 按 `F12` 打开开发者工具，切换到 **Application (应用)** -> **Cookies** -> `https://dashboard.bulknodes.xyz`。
> 3. 复制 `connect.sid` 的值，以及 Cloudflare 的 `cf_clearance` 值（如果受 Cloudflare 保护）。

### 4. 运行脚本
使用 Node.js 运行挂机脚本：
```bash
node afk_bot.js
```

若希望长期在后台挂机（例如在 Linux 服务器上使用 PM2）：
```bash
npm install -g pm2
pm2 start afk_bot.js --name "bulknodes-afk"
pm2 save
pm2 startup
```
