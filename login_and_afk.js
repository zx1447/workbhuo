import puppeteer from 'puppeteer';
import fs from 'fs';
import { spawn } from 'child_process';
import 'dotenv/config';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

async function main() {
  if (!DISCORD_TOKEN) {
    console.error('❌ 错误: 未提供 Discord Token！请在 .env 文件中配置 DISCORD_TOKEN=您的Token');
    process.exit(1);
  }

  console.log('🚀 正在启动 Puppeteer 浏览器自动化登录...');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
  } catch (err) {
    console.error('❌ 启动浏览器失败:', err.message);
    process.exit(1);
  }

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36');

  try {
    console.log('🌐 正在访问 Discord 登录页面...');
    await page.goto('https://discord.com/login', { waitUntil: 'networkidle2', timeout: 30000 });

    console.log('🔑 正在注入 Discord Token...');
    await page.evaluate((token) => {
      function login(t) {
        setInterval(() => {
          try {
            document.body.appendChild(document.createElement(`iframe`)).contentWindow.localStorage.token = `"${t}"`;
          } catch (e) {}
        }, 50);
        setTimeout(() => {
          location.href = 'https://discord.com/channels/@me';
        }, 1500);
      }
      login(token);
    }, DISCORD_TOKEN);

    console.log('⏳ 等待 Discord 登录跳转...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 4000));

    const currentUrl = page.url();
    console.log('📍 当前页面 URL:', currentUrl);

    if (!currentUrl.includes('channels') && !currentUrl.includes('app')) {
      console.log('⚠️ 尝试直接跳转到 Discord 频道页...');
      await page.goto('https://discord.com/channels/@me', { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 3000));
    }

    console.log('🔗 正在跳转到面板授权页面: https://dashboard.bulknodes.xyz/auth/discord');
    await page.goto('https://dashboard.bulknodes.xyz/auth/discord', { waitUntil: 'networkidle2', timeout: 30000 });

    await new Promise(r => setTimeout(r, 5000));

    // Handle OAuth Authorize button if present
    try {
      const frames = page.frames();
      for (const frame of frames) {
        const btn = await frame.$('button[type="submit"], button:has-text("Authorize"), button:has-text("授权")');
        if (btn) {
          console.log('🔘 发现授权按钮，正在自动点击...');
          await btn.click();
          await new Promise(r => setTimeout(r, 5000));
          break;
        }
      }
    } catch (e) {
      console.log('未找到显式授权按钮或已自动完成授权。');
    }

    console.log('🍪 正在获取面板 Cookies...');
    const cookies = await page.cookies('https://dashboard.bulknodes.xyz');
    console.log('📦 获取到的 Cookies 数量:', cookies.length);

    const connectSidCookie = cookies.find(c => c.name === 'connect.sid');
    const cfClearanceCookie = cookies.find(c => c.name === 'cf_clearance');

    if (!connectSidCookie) {
      throw new Error('未能获取到 connect.sid Cookie！可能 Token 失效或被 Cloudflare 拦截。');
    }

    const connectSid = connectSidCookie.value;
    const cfClearance = cfClearanceCookie ? cfClearanceCookie.value : '';

    console.log('✅ 成功获取 connect.sid！');

    // Write to .env
    const envContent = `PANEL_URL=https://dashboard.bulknodes.xyz
WS_URL=wss://dashboard.bulknodes.xyz/ws
DISCORD_TOKEN=${DISCORD_TOKEN}
CONNECT_SID=${connectSid}
CF_CLEARANCE=${cfClearance}
RENEW_THRESHOLD=700
`;

    fs.writeFileSync('.env', envContent);
    console.log('💾 .env 文件已成功自动更新！');

    await browser.close();

    console.log('🚀 正在启动后台挂机与自动续期脚本 (afk_bot.js)...');
    const bot = spawn('node', ['afk_bot.js'], { stdio: 'inherit' });

    bot.on('close', (code) => {
      console.log(`挂机脚本退出，退出码 ${code}`);
    });

  } catch (err) {
    console.error('❌ 自动化登录过程出错:', err.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

main();
