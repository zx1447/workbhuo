#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
wake_cloudstudio.py — 通过 CloudStudio 控制台用无头浏览器点击「启动」唤醒休眠的沙箱。

原理（已实测确认）：
  - 死端点 `?restart=true` 永远返回 404/304 "工作空间没有找到"，无法唤醒。
  - 真正能启动沙箱的是 CloudStudio 控制台的「启动」按钮（调用鉴权后的启动 API）。
  - 所以本脚本用 Playwright 登录控制台（注入会话 Cookie 或表单登录），
    找到本工作空间（按 SPACE_KEY 识别），点击「启动」，然后轮询直到桌面回到 302。

鉴权（二选一，优先 Cookie）：
  - CLOUDSTUDIO_COOKIE : 登录控制台后从浏览器复制的全部 Cookie（推荐，无需存密码）
  - CLOUDSTUDIO_USER / CLOUDSTUDIO_PASS : 仅当控制台是普通表单登录时可用（SSO/OAuth 不适用）

其他环境变量：
  - CONSOLE_URL : 控制台地址（你点「启动」那个页面），默认 https://cloudstudio.club
  - SPACE_KEY   : 工作空间 key，默认 affbdd3a0a5c400597ee8e858a624486
  - WEBTOP_URL  : 规范访问地址（带 x-cs-sandbox-id 参数），用于轮询 302
"""
import os
import sys
import time
import subprocess
from playwright.sync_api import sync_playwright

CONSOLE_URL = os.environ.get("CONSOLE_URL", "https://cloudstudio.club").rstrip("/")
SPACE_KEY = os.environ.get("SPACE_KEY", "affbdd3a0a5c400597ee8e858a624486")
WEBTOP_URL = os.environ.get(
    "WEBTOP_URL",
    "https://webview.e2b.gz3.sandbox.cloudstudio.club/?x-cs-sandbox-id=affbdd3a0a5c400597ee8e858a624486&x-cs-sandbox-port=3000",
)
COOKIE = os.environ.get("CLOUDSTUDIO_COOKIE", "")
USER = os.environ.get("CLOUDSTUDIO_USER", "")
PASS = os.environ.get("CLOUDSTUDIO_PASS", "")
# 会话 Cookie 可能落在这些域上
DOMAINS = [".cloudstudio.club", "cloudstudio.club",
           "codingcorp.cloudstudio.net", ".codingcorp.cloudstudio.net"]

START_SELECTORS = [
    "button:has-text('启动')", "button:has-text('运行')", "button:has-text('Start')",
    "button:has-text('立即启动')", ".start-btn", "#startBtn",
    "a:has-text('启动')", "[data-action='start']",
]


def log(m):
    print(f"[wake] {m}", flush=True)


def is_online():
    try:
        r = subprocess.run(
            ["curl", "-sS", "-m", "30", "-o", "/dev/null", "-w", "%{http_code}",
             "-u", "admin:x", WEBTOP_URL],
            capture_output=True, text=True, timeout=40,
        )
        return r.stdout.strip() == "302"
    except Exception as e:
        log(f"探测异常: {e}")
        return False


def inject_cookies(ctx):
    if not COOKIE:
        return False
    n = 0
    for part in COOKIE.split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            for d in DOMAINS:
                try:
                    ctx.add_cookies([{"name": k.strip(), "value": v.strip(),
                                      "domain": d, "path": "/"}])
                    n += 1
                except Exception:
                    pass
    log(f"已注入 {n} 个 Cookie")
    return n > 0


def try_login(page):
    if not (USER and PASS):
        log("未提供账号密码，跳过表单登录")
        return False
    filled = False
    for sel in ["input[type=text]", "input[name=username]", "input[name=account]",
                "#username", "#account", "input[autocomplete=username]"]:
        try:
            if page.locator(sel).count() > 0:
                page.fill(sel, USER)
                filled = True
                break
        except Exception:
            pass
    for sel in ["input[type=password]", "input[name=password]", "#password",
                "input[autocomplete=current-password]"]:
        try:
            if page.locator(sel).count() > 0:
                page.fill(sel, PASS)
                break
        except Exception:
            pass
    if not filled:
        log("未找到登录表单用户名框")
        return False
    for sel in ["button:has-text('登录')", "button:has-text('Sign in')",
                "button[type=submit]", "input[type=submit]"]:
        try:
            if page.locator(sel).count() > 0:
                page.click(sel)
                log("已提交登录表单")
                return True
        except Exception:
            pass
    return False


def click_start(page):
    # 策略1：在含 SPACE_KEY 的行/卡片内点启动
    try:
        row = page.locator(f"*:has-text('{SPACE_KEY}')").first
        for ss in START_SELECTORS:
            btn = row.locator(ss)
            if btn.count() > 0:
                btn.first.click()
                log(f"✅ 已在工作空间卡片内点击启动 ({ss})")
                return True
    except Exception as e:
        log(f"卡片内点击失败: {e}")
    # 策略2：页面上第一个启动按钮
    for ss in START_SELECTORS:
        try:
            if page.locator(ss).count() > 0:
                page.locator(ss).first.click()
                log(f"✅ 已点击页面启动按钮 ({ss})")
                return True
        except Exception:
            pass
    log("⚠️ 未定位到「启动」按钮（可能未登录成功或页面结构不同）")
    return False


def main():
    if is_online():
        log("✅ 沙箱已在线 (302)，无需唤醒")
        sys.exit(0)
    log("⚠️ 沙箱离线，尝试通过控制台启动…")

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context()
        injected = inject_cookies(ctx)
        page = ctx.new_page()
        page.goto(CONSOLE_URL, wait_until="domcontentloaded", timeout=60000)
        time.sleep(4)
        if not injected:
            try_login(page)
            time.sleep(4)
        # 若控制台首页不是工作空间列表，可在此额外导航
        clicked = click_start(page)
        if not clicked:
            time.sleep(5)
            click_start(page)
        # 轮询恢复
        for i in range(18):
            time.sleep(10)
            if is_online():
                log("✅ 沙箱已恢复在线 (302)")
                b.close()
                sys.exit(0)
            log(f"[{i + 1}] 尚未在线，继续等待…")
        log("⚠️ 已发出启动请求但暂未恢复（可能需更久，或鉴权/选择器不匹配）")
        b.close()
        sys.exit(2)


if __name__ == "__main__":
    main()
