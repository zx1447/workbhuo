#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
wake_cloudstudio.py — 通过"带鉴权访问桌面地址"唤醒休眠的沙箱（轻量版，无需浏览器）。

用户实测发现：访问带参桌面地址并携带 Basic Auth(admin/密码)，即可唤醒已停止的工作空间。
本脚本据此实现唤醒 = 带真实鉴权访问 WEBTOP_URL，并轮询直到返回 200/302。

判定在线：带真实鉴权访问 WEBTOP_URL → 200 或 302 即在线。
唤醒方式（优先级）：
  1) 若设置了 START_API_CURL（控制台启动 API 的 cURL）→ 优先调用它
     （适用于"仅 webtop 鉴权不足以唤醒"的情况，例如唤醒依赖控制台会话）
  2) 否则用 webtop 真实鉴权反复访问该地址（用户实测有效）

环境变量：
  WEBTOP_URL       规范访问地址(带 x-cs-sandbox-id 参数)
  WEBTOP_USER      webtop 用户名(默认 admin)
  WEBTOP_PASSWORD  webtop 密码
  START_API_CURL   可选：控制台「启动」请求的 cURL 原文（兜底）
"""
import os
import sys
import time
import subprocess

WEBTOP_URL = os.environ.get(
    "WEBTOP_URL",
    "https://webview.e2b.gz3.sandbox.cloudstudio.club/?x-cs-sandbox-id=affbdd3a0a5c400597ee8e858a624486&x-cs-sandbox-port=3000",
)
WEBTOP_USER = os.environ.get("WEBTOP_USER", "admin")
WEBTOP_PASSWORD = os.environ.get("WEBTOP_PASSWORD", "")
START_API_CURL = os.environ.get("START_API_CURL", "").strip()


def log(m):
    print(f"[wake] {m}", flush=True)


def _curl_code(extra=None):
    cmd = ["curl", "-sS", "-m", "30", "-o", "/dev/null", "-w", "%{http_code}",
           "-u", f"{WEBTOP_USER}:{WEBTOP_PASSWORD}", WEBTOP_URL]
    if extra:
        cmd += extra
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=40)
        return r.stdout.strip()
    except Exception as e:
        log(f"访问异常: {e}")
        return "000"


def is_online():
    return _curl_code() in ("200", "302")


def visit():
    """带鉴权访问桌面地址（用户实测可唤醒）。"""
    return _curl_code()


def run_start_api():
    if not START_API_CURL:
        return False
    log("优先调用控制台启动 API (START_API_CURL)")
    try:
        cmd = START_API_CURL.replace("\n", " ").strip()
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
        log(f"API 返回码={r.returncode}")
        return r.returncode == 0
    except Exception as e:
        log(f"API 调用失败: {e}")
        return False


def main():
    if is_online():
        log("✅ 沙箱已在线 (200/302)，无需唤醒")
        sys.exit(0)
    log("⚠️ 沙箱离线，尝试用鉴权访问唤醒…")

    # 兜底：若提供了控制台启动 API，先调它
    if START_API_CURL:
        run_start_api()

    # 主唤醒：带 webtop 鉴权反复访问桌面地址（用户实测有效）
    code = visit()
    log(f"首次鉴权访问状态码: {code}")
    for i in range(18):
        time.sleep(10)
        if is_online():
            log("✅ 沙箱已恢复在线 (200/302)")
            sys.exit(0)
        log(f"[{i + 1}] 尚未在线，继续鉴权访问…")
        visit()
    log("⚠️ 已多次鉴权访问但暂未恢复")
    log("   若确认工作空间仍未起：很可能是唤醒依赖控制台会话（10808 代理注入），")
    log("   请提供 START_API_CURL（控制台启动请求 cURL）或 CLOUDSTUDIO_COOKIE 作为兜底。")
    sys.exit(2)


if __name__ == "__main__":
    main()
