import WebSocket from 'ws';
import 'dotenv/config';

const PANEL_URL = process.env.PANEL_URL || 'https://dashboard.bulknodes.xyz';
const WS_URL = process.env.WS_URL || 'wss://dashboard.bulknodes.xyz/ws';
const CONNECT_SID = process.env.CONNECT_SID;
const CF_CLEARANCE = process.env.CF_CLEARANCE;
const SERVER_ID = process.env.SERVER_ID || '110';

// 积分(币)达到该值就自动续期
const RENEW_THRESHOLD = parseInt(process.env.RENEW_THRESHOLD || '700', 10);
// 单次续期天数（实际不会超过 余额/每天花费）
const RENEW_DAYS = parseInt(process.env.RENEW_DAYS || '7', 10);
// 续期每天花费（来自站点 renewalCostPerDay，默认 100）
const COST_PER_DAY = parseInt(process.env.COST_PER_DAY || '100', 10);

const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL || '120', 10) * 1000;     // 多久查一次余额
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL || '30', 10) * 1000; // WS 心跳
const RUN_MINUTES = Math.min(parseInt(process.env.RUN_MINUTES || '340', 10), 350);    // 单次运行时长(<=GitHub 6h 上限)
const WATCHDOG_MIN = parseInt(process.env.WATCHDOG_MIN || '10', 10);                  // 多久币不涨就判定掉线重连

if (!CONNECT_SID) {
  console.error('❌ 未配置 CONNECT_SID 环境变量！请在仓库 Secrets 中填写 connect.sid Cookie。');
  process.exit(1);
}

const cookieHeader = `connect.sid=${CONNECT_SID}${CF_CLEARANCE ? `; cf_clearance=${CF_CLEARANCE}` : ''}`;
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
  'Origin': PANEL_URL,
  'Cookie': cookieHeader,
};

let ws = null;
let reconnectAttempts = 0;
let lastCoins = null;
let lastCoinTime = Date.now();
let deadline = Date.now() + RUN_MINUTES * 60 * 1000;

function log(msg) {
  const t = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${t}] ${msg}`);
}

// 读取余额：优先从 /servers 解析 userCoins（续期消耗的就是它），
// 失败则回退到 /api/afk/streak 的 streak 字段。
async function getBalance() {
  try {
    const res = await fetch(`${PANEL_URL}/servers`, {
      headers: { 'Cookie': cookieHeader, 'User-Agent': headers['User-Agent'], 'Accept': 'text/html' },
    });
    if (res.ok) {
      const text = await res.text();
      const m = text.match(/userCoins\s*=\s*(\d+)/);
      if (m) return { coins: parseInt(m[1], 10), source: 'userCoins' };
    } else {
      log(`⚠️ /servers 读取失败 HTTP ${res.status}`);
    }
  } catch (e) {
    log(`⚠️ /servers 读取异常: ${e.message}`);
  }
  try {
    const res = await fetch(`${PANEL_URL}/api/afk/streak`, {
      headers: { 'Cookie': cookieHeader, 'User-Agent': headers['User-Agent'], 'Accept': 'application/json' },
    });
    if (res.ok) {
      const d = await res.json();
      if (typeof d.streak === 'number') return { coins: d.streak, source: 'streak' };
    }
  } catch (e) { /* ignore */ }
  return null;
}

// 自动续期
async function renew() {
  const bal = await getBalance();
  const coins = bal ? bal.coins : RENEW_THRESHOLD;
  let days = Math.max(1, Math.min(RENEW_DAYS, Math.floor(coins / COST_PER_DAY)));
  log(`🔄 余额 ${coins}（来源 ${bal ? bal.source : '未知'}），尝试续期 server ${SERVER_ID} ${days} 天（花费约 ${days * COST_PER_DAY} 币）...`);
  try {
    const res = await fetch(`${PANEL_URL}/api/servers/renew`, {
      method: 'POST',
      headers: { 'Cookie': cookieHeader, 'User-Agent': headers['User-Agent'], 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverId: SERVER_ID, days }),
    });
    const text = await res.text();
    log(`✨ 续期响应 ${res.status}: ${text.substring(0, 200)}`);
  } catch (e) {
    log(`❌ 续期异常: ${e.message}`);
  }
}

// WebSocket 挂机（保持连接即可让服务端按 60s/币 发币）
function connectWebSocket() {
  log(`🔌 连接 WebSocket: ${WS_URL}`);
  ws = new WebSocket(WS_URL, {
    headers: { 'User-Agent': headers['User-Agent'], 'Origin': PANEL_URL, 'Cookie': cookieHeader },
  });

  ws.on('open', () => {
    log('🟢 WebSocket 挂机连接成功，保持在线中...');
    reconnectAttempts = 0;
  });
  ws.on('message', (data) => log(`📥 收到服务器消息: ${data.toString().substring(0, 200)}`));
  ws.on('error', (err) => log(`⚠️ WebSocket 错误: ${err.message}`));
  ws.on('close', (code, reason) => {
    log(`🔴 WebSocket 关闭 (${code}, ${reason || '未知'})，准备重连...`);
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  reconnectAttempts++;
  const delay = Math.min(10000 * reconnectAttempts, 60000);
  log(`⏳ ${delay / 1000}s 后重连 WebSocket...`);
  setTimeout(connectWebSocket, delay);
}

async function mainLoop() {
  connectWebSocket();

  // 定时查余额 + 看门狗 + 续期
  setInterval(async () => {
    if (Date.now() > deadline) {
      log('⏰ 到达运行时长，正常退出（下次 cron/dispatch 会重新拉起）');
      process.exit(0);
    }
    const bal = await getBalance();
    if (bal) {
      log(`📊 当前币: ${bal.coins}（来源 ${bal.source}，阈值 ${RENEW_THRESHOLD}）`);
      if (lastCoins !== null && bal.coins === lastCoins) {
        if (Date.now() - lastCoinTime > WATCHDOG_MIN * 60 * 1000) {
          log(`⚠️ ${WATCHDOG_MIN} 分钟内币未增长，疑似 WS 掉线，强制重连`);
          try { if (ws) ws.terminate(); } catch {}
        }
      } else {
        lastCoins = bal.coins;
        lastCoinTime = Date.now();
      }
      if (bal.coins >= RENEW_THRESHOLD) await renew();
    } else {
      log('⚠️ 本次未能读取到余额，跳过续期检查（继续挂机）');
    }
  }, CHECK_INTERVAL);

  // 心跳保活
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.ping();
      log('💓 发送 WebSocket 心跳 Ping');
    }
  }, HEARTBEAT_INTERVAL);
}

log('🚀 启动 BulkNodes 挂机与自动续期机器人...');
log(`   续期阈值=${RENEW_THRESHOLD} 币 | 单次续期上限=${RENEW_DAYS} 天 | 每天花费=${COST_PER_DAY} 币 | 运行=${RUN_MINUTES} 分钟`);
mainLoop();
