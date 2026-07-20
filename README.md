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

## 二、 关于“Discord 登录 (Token)”与挂机说明

该网站使用 **Discord OAuth2** 进行登录（Heliactyl 面板的标准认证方式）。

### 为什么填了 `connect.sid` 就可以“不用管了”？
1. 当您在浏览器通过 Discord 授权登录网站后，网站会下发一个名为 `connect.sid` 的会话 Cookie。
2. 这个 Cookie 实际上就是您的**登录凭证/会话 Token**。
3. 我们的脚本 (`afk_bot.js`) 使用了这个 `connect.sid` 后，就等于**代替了您的浏览器登录状态**。
4. 只要 `connect.sid` 未过期（通常可持续数周甚至数月），脚本就可以：
   - 24 小时保持 WebSocket 挂机累积积分。
   - 每 2 分钟自动检查一次积分。
   - **积分达到 700 时自动调用续期接口完成服务器续期**。
5. **全程全自动，您只需要填一次凭证，就可以挂机不管了！**
1. **自动建立 WebSocket 连接**：模拟浏览器挂机，维持心跳，防止掉线。
2. **自动检测积分**：每 2 分钟请求一次 `/api/afk/streak` 检查当前积分/金币。
3. **达到 700 积分自动续期**：当积分达到设定阈值（默认 700）时，自动触发续期请求。
4. **断线自动重连**：网络波动或连接关闭时自动重试并指数退避重连。

---

## 四、 Discord Token 一键自动登录与挂机 (`login_and_afk.js`)

如果您使用的是 **Discord Token** 登录，我们也为您编写了自动化一键登录脚本 `login_and_afk.js`。

### 使用方法：
1. 在 `.env` 文件中填入您的 Discord Token：
   ```env
   DISCORD_TOKEN=填入你的Discord Token
   ```
2. 运行一键登录与挂机脚本：
   ```bash
   node login_and_afk.js
   ```
3. 脚本会自动使用 Puppeteer 模拟浏览器使用 Token 登录 Discord、自动授权面板、抓取 `connect.sid` 并自动写入 `.env`，随后无缝启动 24 小时挂机与自动续期机器人！

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
