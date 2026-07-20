import WebSocket from 'ws';
import 'dotenv/config';

const PANEL_URL = process.env.PANEL_URL || 'https://dashboard.bulknodes.xyz';
const WS_URL = process.env.WS_URL || 'wss://dashboard.bulknodes.xyz/ws';
const CONNECT_SID = process.env.CONNECT_SID;
const CF_CLEARANCE = process.env.CF_CLEARANCE;
const RENEW_THRESHOLD = parseInt(process.env.RENEW_THRESHOLD || '700', 10);

if (!CONNECT_SID) {
  console.error('❌ 错误: 未配置 CONNECT_SID 环境变量！请在 .env 文件中填写您的 connect.sid Cookie。');
  console.error('💡 提示: 请复制 .env.example 为 .env 并填入从浏览器抓包获取的 Cookie。');
  process.exit(1);
}

const cookieHeader = `connect.sid=${CONNECT_SID}${CF_CLEARANCE ? `; cf_clearance=${CF_CLEARANCE}` : ''}`;

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
  'Origin': PANEL_URL,
  'Cookie': cookieHeader
};

let ws = null;
let reconnectAttempts = 0;

function log(msg) {
  const time = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${time}] ${msg}`);
}

// 检查积分/Streak
async function checkStreakAndBalance() {
  try {
    const res = await fetch(`${PANEL_URL}/api/afk/streak`, {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': headers['User-Agent'],
        'Accept': 'application/json'
      }
    });
    
    if (!res.ok) {
      log(`⚠️ 获取 AFK 状态失败: HTTP ${res.status}`);
      return null;
    }
    
    const data = await res.json();
    log(`📊 当前 AFK 状态 / 积分信息: ${JSON.stringify(data)}`);
    return data;
  } catch (err) {
    log(`❌ 检查积分异常: ${err.message}`);
    return null;
  }
}

// 尝试续期
async function renewServers() {
  try {
    log(`🔄 积分已达到或超过 ${RENEW_THRESHOLD}，正在尝试自动续期服务器...`);
    const res = await fetch(`${PANEL_URL}/renew`, {
      method: 'POST',
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': headers['User-Agent'],
        'Content-Type': 'application/json'
      }
    });

    log(`✨ 续期请求响应状态码: ${res.status}`);
    const text = await res.text();
    log(`📦 续期响应内容: ${text.substring(0, 200)}`);
  } catch (err) {
    log(`❌ 续期操作异常: ${err.message}`);
  }
}

// 连接 WebSocket 挂机
function connectWebSocket() {
  log(`🔌 正在连接 WebSocket: ${WS_URL}`);
  
  ws = new WebSocket(WS_URL, {
    headers: {
      'User-Agent': headers['User-Agent'],
      'Origin': PANEL_URL,
      'Cookie': cookieHeader
    }
  });

  ws.on('open', () => {
    log('🟢 WebSocket 挂机连接成功！正在保持在线...');
    reconnectAttempts = 0;
  });

  ws.on('message', (data) => {
    log(`📥 收到服务器消息: ${data.toString()}`);
  });

  ws.on('error', (err) => {
    log(`⚠️ WebSocket 错误: ${err.message}`);
  });

  ws.on('close', (code, reason) => {
    log(`🔴 WebSocket 连接关闭 (代码: ${code}, 原因: ${reason || '未知'})。准备重连...`);
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  reconnectAttempts++;
  const delay = Math.min(10000 * reconnectAttempts, 60000);
  log(`⏳ 将在 ${delay / 1000} 秒后尝试重新连接 WebSocket...`);
  setTimeout(connectWebSocket, delay);
}

// 定时任务：每 2 分钟检查一次积分，并发送 WebSocket 心跳
async function mainLoop() {
  connectWebSocket();

  // 定期检查积分和续期
  setInterval(async () => {
    const data = await checkStreakAndBalance();
    if (data) {
      const points = data.coins || data.points || data.streak || 0;
      if (typeof points === 'number' && points >= RENEW_THRESHOLD) {
        await renewServers();
      }
    }
  }, 120 * 1000);

  // 定期发送 WebSocket 心跳保持活跃
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.ping();
      log('💓 发送 WebSocket 心跳 Ping...');
    }
  }, 30 * 1000);
}

log('🚀 启动 Heliactyl 挂机与自动续期机器人...');
mainLoop();
