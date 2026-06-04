// Script test nhanh hàm _clickUsePwd mới - timeout tăng lên
// Chạy: node test_ms_click.js

const path = require('path');
const fs = require('fs');

const EMAIL = 'LobosElfreda26@hotmail.com';
const PASS = '4J4jP51n971c';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function _clickUsePwd(page, log) {
  const coords = await page.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('*'));
    for (const el of allEls) {
      if (el.children.length > 0) continue;
      const text = el.textContent.trim().toLowerCase();
      if (text === 'use your password' || text === 'sử dụng mật khẩu' || text === 'use password') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          el.click();
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
          el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true, view: window, buttons: 1 }));
          el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true, view: window, buttons: 1 }));
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, tag: el.tagName, text: el.textContent.trim() };
        }
      }
    }
    return null;
  });

  if (!coords) { if (log) log('[_clickUsePwd] Không tìm thấy nút.'); return false; }
  if (log) log(`[_clickUsePwd] ✅ Tìm thấy "${coords.text}" (${coords.tag}), mouse click tại (${Math.round(coords.x)}, ${Math.round(coords.y)})`);
  await page.mouse.move(coords.x, coords.y, { steps: 8 });
  await sleep(80);
  await page.mouse.down({ button: 'left' });
  await sleep(80);
  await page.mouse.up({ button: 'left' });
  return true;
}

async function run() {
  const userDataDir = path.join(__dirname, '.profiles', 'test_ms_' + Date.now());
  let context;
  try {
    const { launchPersistentContext } = await import('cloakbrowser');
    context = await launchPersistentContext({ userDataDir, headless: false, humanize: true, geoip: false });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(90000);

    console.log('[1] Đi vào trang Microsoft login...');
    await page.goto('https://login.live.com/', { waitUntil: 'domcontentloaded' });
    // Chờ thêm để CloakBrowser load xong
    await sleep(5000);
    console.log('    URL:', page.url());

    console.log('[2] Nhập email...');
    await page.waitForSelector('#i0116, input[name="loginfmt"], input[type="email"]', { timeout: 30000 });
    await sleep(500);
    await page.fill('#i0116, input[name="loginfmt"], input[type="email"]', EMAIL);
    await sleep(700);
    await page.keyboard.press('Enter');
    await sleep(4000);
    console.log('    URL sau nhập email:', page.url());

    console.log('[3] Thử click "Use your password"...');
    // Thử tối đa 5 lần
    let clicked = false;
    for (let i = 0; i < 5; i++) {
      clicked = await _clickUsePwd(page, console.log);
      if (clicked) break;
      console.log(`    Lần ${i+1}: chưa thấy nút, chờ thêm 2s...`);
      await sleep(2000);
    }

    if (!clicked) {
      console.log('❌ KHÔNG click được. Lưu screenshot...');
      await page.screenshot({ path: path.join(__dirname, 'debug_fail.png'), fullPage: true });
      console.log('    URL:', page.url());
      await sleep(8000);
      return;
    }

    await sleep(2500);

    console.log('[4] Kiểm tra ô password...');
    const hasPwd = await page.locator('input[name="passwd"], input[type="password"]').count().catch(() => 0);
    if (hasPwd > 0) {
      console.log('✅ THÀNH CÔNG! Đang nhập password...');
      await page.fill('input[name="passwd"], input[type="password"]', PASS);
      await sleep(500);
      await page.keyboard.press('Enter');
      await sleep(5000);
      console.log('    URL sau nhập pass:', page.url());
    } else {
      console.log('⚠️ Click xong nhưng chưa thấy ô password. URL:', page.url());
      await page.screenshot({ path: path.join(__dirname, 'debug_after_click.png'), fullPage: true });
    }

    await sleep(5000);
  } catch (err) {
    console.error('❌ Lỗi:', err.message);
  } finally {
    if (context) await context.close().catch(() => {});
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch(e){}
    console.log('Done.');
  }
}

run();
