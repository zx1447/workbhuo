# WorkBuddy DevTop 真实访问地址

> ⚠️ 必须用**带参数的完整地址**。裸地址 `https://webview.e2b.gz3.sandbox.cloudstudio.club/` 会被网关拒（404 工作空间没有找到），因为缺 `x-cs-sandbox-id` 参数，网关不知道路由到哪个沙箱。

## ✅ 真正的地址（广州 gz3，装好桌面的工作空间）

```
https://webview.e2b.gz3.sandbox.cloudstudio.club/?x-cs-sandbox-id=affbdd3a0a5c400597ee8e858a624486&x-cs-sandbox-port=3000
```

## 登录账号

- 用户名：`admin`
- 密码：`gyrtvMm6USCCyigZncEp`

## 使用方法

1. 把上面**整行地址**复制到浏览器打开（不要手输裸域名）。
2. 网关会下发路由 Cookie，并跳到桌面登录页。
3. 输入 `admin` + 密码 `gyrtvMm6USCCyigZncEp` → 进入中文桌面。

## 注意事项

- 那个"东南亚平台 / 国际版"是 **CloudStudio 的另一个空工作空间**，跟这个装桌面的 gz3 工作空间无关，忽略即可。
- 桌面浏览器已设为中文（之前部署时配置）。
- 哪吒探针面板目前**误报离线**（agent 的 client_secret 被面板拒绝），与地址无关；需提供面板里该 agent 的当前密钥才能修复。

## GitHub 自动保活 / 唤醒

- 仓库：`zx1447/workbhuo`，工作流 `auto-wake.yml` / `keepalive.yml`
- 唤醒核心（用户实测）：**带真实鉴权访问上面这个带参地址**，即可拉起已停止的工作空间。
  - `?restart=true` 是**死端点**（已用 curl 现网证实：裸地址 404、带参只是普通 302 跳转，不会触发启动），不要依赖它。
- `auto-wake.yml` 每 30 分钟：带 `admin`/密码访问带参地址 → 200/302 即在线；否则反复带鉴权访问以唤醒。
- 仓库 Secrets 需配：`WEBTOP_USER`(=admin)、`WEBTOP_PASSWORD`(=上方密码)。
- 兜底（可选）：若仅 webtop 鉴权不足以唤醒（唤醒实际依赖控制台会话 / 本机 10808 代理注入的会话），再补 `START_API_CURL`（控制台「启动」请求 cURL）或 `CLOUDSTUDIO_COOKIE`。
