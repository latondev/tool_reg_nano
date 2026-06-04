const { app, BrowserWindow, shell, ipcMain, session, clipboard } = require('electron');
const path = require('path');
let createCursor = null;
try {
  const ghostCursor = require('ghost-cursor');
  createCursor = ghostCursor.createCursor;
} catch (e) {
  console.log("ghost-cursor not found, will not use humanized mouse.");
}

let _mainWindowValue = null;

function createDesktopWindow() {
  // Khởi tạo cửa sổ Desktop với kích thước tối ưu
  _mainWindowValue = new BrowserWindow({
    width: 1150,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true, // Ẩn thanh Menu của trình duyệt
    icon: path.join(__dirname, 'icon.png'), // (Tùy chọn) Thêm icon cho app
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Tải file index.html của giao diện Glassmorphism
  _mainWindowValue.loadFile('index.html');

  // Mở DevTools để gỡ lỗi và bắt lỗi console ở Renderer
  // _mainWindowValue.webContents.openDevTools();

  // Đảm bảo các link mở ngoài ứng dụng (như nút Login) sẽ được mở bằng Trình duyệt mặc định của hệ thống
  _mainWindowValue.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  console.log('===================================================');
  console.log('🖥️  Giao diện Desktop App Electron đang được khởi tạo...');
  console.log('===================================================');
}

// Phân tích chuỗi proxy thô thành đối tượng proxy của Playwright (Hỗ trợ cả IPv4 và IPv6)
function _parseProxy(proxyStringValue) {
  if (!proxyStringValue) return null;

  let strValue = proxyStringValue.trim();
  let protocolValue = 'http';

  if (strValue.startsWith('socks5://')) {
    protocolValue = 'socks5';
    strValue = strValue.replace('socks5://', '');
  } else if (strValue.startsWith('http://')) {
    protocolValue = 'http';
    strValue = strValue.replace('http://', '');
  } else if (strValue.startsWith('https://')) {
    protocolValue = 'https';
    strValue = strValue.replace('https://', '');
  }

  const partsValue = strValue.split(':').map(pValue => pValue.trim());
  if (partsValue.length < 2) return null;

  let ipValue = '';
  let portValue = '';
  let usernameValue = undefined;
  let passwordValue = undefined;

  const portIdx4Value = partsValue.length - 3;
  const portIdx2Value = partsValue.length - 1;

  if (partsValue.length >= 4 && /^\d+$/.test(partsValue[portIdx4Value])) {
    // Định dạng: IP...:PORT:USER:PASS
    portValue = partsValue[portIdx4Value];
    usernameValue = partsValue[partsValue.length - 2];
    passwordValue = partsValue[partsValue.length - 1];
    ipValue = partsValue.slice(0, portIdx4Value).join(':');
  } else if (/^\d+$/.test(partsValue[portIdx2Value])) {
    // Định dạng: IP...:PORT
    portValue = partsValue[portIdx2Value];
    ipValue = partsValue.slice(0, portIdx2Value).join(':');
  } else {
    // Fallback nếu không xác định được Port là số
    if (partsValue.length >= 4) {
      ipValue = partsValue.slice(0, partsValue.length - 3).join(':');
      portValue = partsValue[partsValue.length - 3];
      usernameValue = partsValue[partsValue.length - 2];
      passwordValue = partsValue[partsValue.length - 1];
    } else {
      ipValue = partsValue[0];
      portValue = partsValue[1];
    }
  }

  // Nếu là IPv6 (chứa dấu ':') và chưa bọc ngoặc vuông, tự động bọc ngoặc vuông theo chuẩn của Playwright/Chromium
  if (ipValue.includes(':') && !ipValue.startsWith('[')) {
    ipValue = `[${ipValue}]`;
  }

  return {
    server: `${protocolValue}://${ipValue}:${portValue}`,
    username: usernameValue,
    password: passwordValue
  };
}

// Xóa sạch các profile cũ để đảm bảo không bị trùng lặp dữ liệu/fingerprint
const fs = require('fs');
function _clearOldProfiles() {
  const profilesDirValue = path.join(__dirname, '.profiles');
  if (fs.existsSync(profilesDirValue)) {
    try {
      fs.rmSync(profilesDirValue, { recursive: true, force: true });
      console.log('[SYSTEM] Đã dọn dẹp sạch sẽ các profile cũ.');
    } catch (errValue) {
      console.warn('[SYSTEM] Không thể xóa một số file profile (đang bị lock):', errValue.message);
    }
  }
}

// Lưu API Key vào cache file key_nano.txt hoặc key_kie.txt
function _saveKeyToCache(emailValue, apiKeyValue, siteValue) {
  const fileNameValue = siteValue === 'kie' ? 'key_kie.txt' : 'key_nano.txt';
  const filePathValue = path.join(__dirname, 'data', fileNameValue);

  let cacheMapValue = new Map();

  // Đọc file cũ nếu tồn tại
  if (fs.existsSync(filePathValue)) {
    try {
      const contentValue = fs.readFileSync(filePathValue, 'utf-8');
      const linesValue = contentValue.split('\n');
      linesValue.forEach(lineValue => {
        const partsValue = lineValue.trim().split('|');
        if (partsValue.length >= 2) {
          cacheMapValue.set(partsValue[0].trim(), partsValue[1].trim());
        }
      });
    } catch (errValue) {
      console.error('[CACHE LỖI] Đọc file cache thất bại:', errValue.message);
    }
  }

  // Cập nhật hoặc thêm mới
  cacheMapValue.set(emailValue, apiKeyValue);

  // Ghi lại file
  try {
    let newContentValue = '';
    cacheMapValue.forEach((keyValue, emailVal) => {
      newContentValue += `${emailVal}|${keyValue}\n`;
    });
    fs.writeFileSync(filePathValue, newContentValue.trim(), 'utf-8');
    console.log(`[CACHE] Đã lưu key của ${emailValue} vào file: ${fileNameValue}`);
  } catch (errValue) {
    console.error('[CACHE LỖI] Ghi file cache thất bại:', errValue.message);
  }
}

// Hàm helper tìm và click phần tử theo nội dung text (sử dụng DOM & MouseEvent nổi bọt)
async function _clickElementByText(pageValue, textValue) {
  return await pageValue.evaluate((txt) => {
    const elementsValue = Array.from(document.querySelectorAll('button, a, div, span, p, input[type="button"], input[type="submit"]'));
    const foundValue = elementsValue.find(el => {
      if (el.children.length > 0) {
        const childTextsValue = Array.from(el.children).map(c => c.textContent.trim().toLowerCase());
        const hasChildWithSameTextValue = childTextsValue.some(t => t.includes(txt.toLowerCase()));
        if (hasChildWithSameTextValue) return false;
      }
      const elTextValue = el.textContent.trim().toLowerCase();
      return elTextValue.includes(txt.toLowerCase());
    });

    if (foundValue) {
      const clickTargetValue = foundValue.closest('button, a, div[role="button"]') || foundValue;
      clickTargetValue.click();

      const eventValue = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
      });
      clickTargetValue.dispatchEvent(eventValue);
      return true;
    }
    return false;
  }, textValue);
}

// Hèm hỗ trợ sleep/delay
const _waitForTimeout = (msValue) => new Promise(resolveValue => setTimeout(resolveValue, msValue));

// === Evasion helpers (Microsoft consumer account spam avoidance) ===
// These build on top of cloakbrowser's humanize + careful preset (which already patches
// fill/type/mouse/keyboard/click with bezier curves, realistic typing delays, mistypes, idles etc.)
// + our fresh per-account persistent profiles + aggressive storage clear for OTP.
// Additional layers: geoip matching, deliberate pacing, warmup on landing pages,
// extended risk screen detection, micro idles around actions, longer batch backoffs.
function _rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Small human-like idle + micro mouse drift.
 * Leverages the patched page.mouse (from cloak humanize + careful preset) when possible.
 * Keeps actions from looking too "direct bot".
 */
async function _humanMicroIdle(pageValue, logCallbackValue = null) {
  const ms = _rand(280, 850);
  if (logCallbackValue) logCallbackValue(`[Evasion] human micro-idle ~${ms}ms + drift`);
  await _waitForTimeout(ms);
  try {
    // Small natural drift (patched mouse benefits from cloak bezier/wobble if used via higher APIs;
    // here we use low-level move for precision in our bypass flows).
    const cx = 120 + _rand(0, 180);
    const cy = 80 + _rand(0, 120);
    await pageValue.mouse.move(cx, cy, { steps: 4 }).catch(() => {});
  } catch (e) {}
}

/**
 * Helper to detect proxy tunnel / connection errors (common with bad/dead proxies during MS flow).
 * Returns true if this is a tunnel failure (should skip the account).
 */
function _isProxyTunnelError(errOrMsg, logCallbackValue = null) {
  const msg = (errOrMsg && (errOrMsg.message || errOrMsg)) || '';
  const lower = msg.toLowerCase();
  if (lower.includes('err_tunnel_connection_failed') || 
      lower.includes('tunnel') || 
      lower.includes('net::err_') ||
      lower.includes('proxy') && lower.includes('fail')) {
    if (logCallbackValue) {
      logCallbackValue(`[Microsoft LỖI] Proxy tunnel failed during login: ${msg}. Proxy chết, không hỗ trợ HTTPS tunnel, hoặc bị Microsoft chặn. Bỏ qua account này và thử proxy khác.`);
    }
    return true;
  }
  return false;
}

// (Optional warmup can be added later in runners using the above + wheel/scrolls.)

/**
 * Click chuyên biệt cho nút "Use your password" của Microsoft.
 * Lý do: nút này là một SPAN có role="button" (leaf node, không có children),
 * filter({ hasText }) của Playwright sẽ match cả DIV cha to khiến click bị trật tọa độ.
 * Hàm này dùng evaluate() để lấy tọa độ thực của SPAN, sau đó dùng page.mouse để click thật.
 */
async function _clickUsePwd(pageValue, logCallbackValue = null) {
  // Lấy tọa độ trung tâm của SPAN leaf node chứa text "Use your password"
  const coords = await pageValue.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('*'));
    for (const el of allEls) {
      // Chỉ lấy leaf node (không có children)
      if (el.children.length > 0) continue;
      const text = el.textContent.trim().toLowerCase();
      if (text === 'use your password' || text === 'sử dụng mật khẩu' || text === 'use password') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          // Click qua DOM trước
          el.click();
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, buttons: 1 }));
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, tag: el.tagName, text: el.textContent.trim() };
        }
      }
    }
    return null;
  });

  if (!coords) {
    if (logCallbackValue) logCallbackValue('[Microsoft] Không tìm thấy nút "Use your password" trong DOM.');
    return false;
  }

  if (logCallbackValue) logCallbackValue(`[Microsoft] Tìm thấy "${coords.text}" (${coords.tag}), đang mouse click tại (${Math.round(coords.x)}, ${Math.round(coords.y)})...`);

  // Click bằng real mouse để bypass React event handler
  await pageValue.mouse.move(coords.x, coords.y, { steps: 8 });
  await _waitForTimeout(80);
  await pageValue.mouse.down({ button: 'left' });
  await _waitForTimeout(80);
  await pageValue.mouse.up({ button: 'left' });
  await _humanMicroIdle(pageValue, logCallbackValue); // settle like a human after the special click
  return true;
}

/**
 * Force click for stubborn React buttons (like Microsoft's "Use your password")
 * that ignore normal .click() because they use internal event handlers.
 * Uses real mouse simulation + coordinate MouseEvent dispatch.
 */
async function _forceClick(pageValue, locator, logCallbackValue = null) {
  try {
    // Wait for the element to be stable and visible (critical for React)
    await locator.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await _waitForTimeout(120); // small settle time for animations

    // Primary: Playwright's click (good, but sometimes not enough for hidden React handlers)
    let success = false;
    try {
      await locator.click({ force: true, timeout: 4500 });
      success = true;
    } catch (e) {
      if (logCallbackValue) logCallbackValue("[Microsoft] locator.click() didn't register, escalating to real mouse simulation...");
    }

    // Secondary: Real mouse simulation (move + down + up) — very effective
    const box = await locator.boundingBox().catch(() => null);
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      await pageValue.mouse.move(cx, cy, { steps: 12 });
      await _waitForTimeout(35);
      await pageValue.mouse.down({ button: 'left' });
      await _waitForTimeout(55);
      await pageValue.mouse.up({ button: 'left' });

      // Tertiary: Dispatch a *full realistic MouseEvent* with coordinates (what you described)
      // This mimics a real user mouse click so React event system accepts it
      await locator.evaluate((el, coords) => {
        try {
          const rect = el.getBoundingClientRect();
          const eventInit = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: coords.cx,
            clientY: coords.cy,
            screenX: coords.cx,
            screenY: coords.cy,
            button: 0,
            buttons: 1,
            detail: 1,
            composed: true,
          };
          // Dispatch the sequence a real mouse does
          el.dispatchEvent(new MouseEvent('mousedown', eventInit));
          el.dispatchEvent(new MouseEvent('mouseup', eventInit));
          el.dispatchEvent(new MouseEvent('click', eventInit));

          // Extra for modern frameworks
          el.dispatchEvent(new PointerEvent('pointerdown', eventInit));
          el.dispatchEvent(new PointerEvent('pointerup', eventInit));
        } catch (e) {}
      }, { cx, cy }).catch(() => {});
    }

    if (logCallbackValue) logCallbackValue("⚡ [Microsoft] Force-click (real mouse + full MouseEvent dispatch) executed.");
    await _humanMicroIdle(pageValue, logCallbackValue);
    return true;
  } catch (e) {
    if (logCallbackValue) logCallbackValue(`[Microsoft] _forceClick error: ${e.message}`);
    return false;
  }
}

// Robust directory removal for Windows (Chromium leaves LOCK files etc.)
async function _safeRemoveDir(dirValue, logCallbackValue = null) {
  if (!dirValue || !fs.existsSync(dirValue)) return true;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      fs.rmSync(dirValue, { recursive: true, force: true });
      if (logCallbackValue) logCallbackValue(`[Smvmail] Đã dọn dẹp sạch sẽ thư mục profile tạm thời.`);
      return true;
    } catch (e) {
      if (logCallbackValue) logCallbackValue(`[Smvmail] Lần ${attempt + 1} xoá profile thất bại (có thể do file lock), thử lại...`);
      await _waitForTimeout(800);
    }
  }
  if (logCallbackValue) logCallbackValue(`[Smvmail] Không thể xoá hoàn toàn profile (có thể còn file lock). Sẽ được dọn ở lần chạy sau.`);
  return false;
}

// Hàm tự động hóa lấy OTP từ Smvmail.com qua trình duyệt phụ
async function _getOtpFromSmvmail(emailValue, logCallbackValue) {
  logCallbackValue(`[Smvmail] Bắt đầu tự động lấy OTP cho email: ${emailValue}`);

  // Proactively purge any leftover OTP profiles from previous runs (Windows rmSync often fails to clean on close).
  // This ensures we never accidentally reopen a profile that has cached data for an old recovery email.
  try {
    const profilesDirValue = path.join(__dirname, '.profiles');
    if (fs.existsSync(profilesDirValue)) {
      const entriesValue = fs.readdirSync(profilesDirValue);
      for (const entryValue of entriesValue) {
        if (entryValue.startsWith('profile_otp_')) {
          const staleDirValue = path.join(profilesDirValue, entryValue);
          try {
            fs.rmSync(staleDirValue, { recursive: true, force: true });
          } catch (e) {}
        }
      }
    }
  } catch (e) {}

  const userDataDirValue = path.join(__dirname, '.profiles', `profile_otp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  logCallbackValue(`[Smvmail] Sử dụng profile hoàn toàn mới: ${userDataDirValue}`);
  let contextValue;
  
  try {
    const { launchPersistentContext } = await import('cloakbrowser');
    const launchOptionsValue = {
      userDataDir: userDataDirValue,
      headless: false, // Hiển thị trình duyệt lấy OTP để theo dõi trực quan
      humanize: true,
      humanPreset: 'careful',
      geoip: true, // match TZ/locale to the account's proxy/region for full fingerprint consistency (even for OTP browser)
      viewport: { width: 800, height: 600 },
      args: ['--window-size=800,600']
      // Note: OTP browser currently no per-account proxy (speed); add geoip + consider threading proxy for even better consistency if rate issues persist
    };

    logCallbackValue(`[Smvmail] Đang khởi chạy trình duyệt lấy OTP...`);
    contextValue = await launchPersistentContext(launchOptionsValue);
    const pageValue = await contextValue.newPage();
    pageValue.setDefaultNavigationTimeout(45000);

    const directInboxUrlValue = `https://smvmail.com/email/inbox?email=${encodeURIComponent(emailValue)}`;
    logCallbackValue(`[Smvmail] Đi thẳng tới URL Inbox: ${directInboxUrlValue}`);

    // === AGGRESSIVE CLEAN BEFORE ANY NAVIGATION ===
    // Fresh userDataDir + clearCookies is not always enough for sites that use IndexedDB / CacheStorage / Service Workers.
    await contextValue.clearCookies().catch(() => null);
    await contextValue.clearPermissions?.().catch(() => null);

    await pageValue.evaluate(async () => {
      try {
        localStorage.clear();
        sessionStorage.clear();

        // Clear IndexedDB (very important for mail webapps)
        if (indexedDB && typeof indexedDB.databases === 'function') {
          const dbs = await indexedDB.databases();
          for (const db of dbs) {
            try { indexedDB.deleteDatabase(db.name); } catch (e) {}
          }
        }

        // Clear Cache Storage
        if (typeof caches !== 'undefined' && caches.keys) {
          const keys = await caches.keys();
          for (const key of keys) {
            try { await caches.delete(key); } catch (e) {}
          }
        }

        // Unregister any service workers
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) {
            try { await reg.unregister(); } catch (e) {}
          }
        }
      } catch (e) {}
    });

    // Now navigate with the specific email param (this should be a truly clean profile)
    await pageValue.goto(directInboxUrlValue, { waitUntil: 'commit' });

    // Extra safety: clear again after first load (in case the page wrote something on initial JS execution), then re-navigate
    await pageValue.evaluate(async () => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {}
    });

    await pageValue.goto(directInboxUrlValue, { waitUntil: 'commit' });

    logCallbackValue(`[Smvmail] Chờ trang inbox tải xong...`);
    await pageValue.waitForSelector('input[placeholder*="Search mail"]', { timeout: 20000 });
    logCallbackValue(`[Smvmail] Đã tải xong hòm thư.`);
    await _humanMicroIdle(pageValue, logCallbackValue);
    // Light human scroll to "read" the list (more natural than instant action)
    await pageValue.mouse.wheel({ deltaY: _rand(60, 160) }).catch(() => {});
    await _waitForTimeout(1500);

    const firstMailSelectorValue = 'a:has-text("Your single-use code"), a:has-text("code"), a:has-text("Microsoft")';
    let otpCodeValue = null;

    for (let iValue = 0; iValue < 25; iValue++) {
      if (pageValue.isClosed()) {
        logCallbackValue(`[Smvmail] Trình duyệt lấy OTP đã bị đóng.`);
        break;
      }

      logCallbackValue(`[Smvmail] Đang kiểm tra hộp thư lần ${iValue + 1}...`);

      // Thử click nút Retry (làm mới danh sách thư)
      let didRefresh = await pageValue.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        // Cách 1: nút có svg và text rỗng (thường là icon refresh)
        let btn = buttons.find(b => b.querySelector('svg') && b.textContent.trim() === '');
        if (btn) {
          btn.click();
          return true;
        }
        // Cách 2: theo aria-label / title
        btn = buttons.find(b => {
          const label = (b.getAttribute('aria-label') || b.title || b.textContent || '').toLowerCase();
          return label.includes('refresh') || label.includes('retry') || label.includes('làm mới') || label.includes('reload');
        });
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }).catch(() => false);

      if (!didRefresh) {
        // Fallback mạnh: reload trang
        logCallbackValue(`[Smvmail] Không thấy nút Retry, reload trang...`);
        await pageValue.reload({ waitUntil: 'commit' });
        await pageValue.waitForSelector('input[placeholder*="Search mail"]', { timeout: 8000 });
      } else {
        logCallbackValue(`[Smvmail] Đã click làm mới.`);
      }

      await _waitForTimeout(4500); // Chờ server cập nhật mail

      const mailCountValue = await pageValue.locator(firstMailSelectorValue).count().catch(() => 0);

      if (mailCountValue > 0) {
        logCallbackValue(`[Smvmail] Thấy ${mailCountValue} thư. Mở thư đầu tiên...`);
        
        await pageValue.locator(firstMailSelectorValue).first().click().catch(() => null);
        await _humanMicroIdle(pageValue, logCallbackValue);
        // Light scroll as if reading the mail header
        await pageValue.mouse.wheel({ deltaY: _rand(40, 120) }).catch(() => {});
        await _waitForTimeout(1200);

        // Thử chuyển tab Text
        const textTabSelectorValue = 'input[aria-label="Text"]';
        const hasTextTabValue = await pageValue.locator(textTabSelectorValue).count().catch(() => 0);
        if (hasTextTabValue > 0) {
          await pageValue.click(textTabSelectorValue).catch(() => null);
          await _humanMicroIdle(pageValue, logCallbackValue);
          await _waitForTimeout(1200);
        }

        // Lấy text (ưu tiên vùng Text, fallback body)
        let bodyTextValue = await pageValue.locator('input[aria-label="Text"] + div').innerText().catch(() => '');
        if (!bodyTextValue || bodyTextValue.length < 10) {
          bodyTextValue = await pageValue.locator('body').innerText().catch(() => '');
        }

        const matchValue = bodyTextValue.match(/single-use code is:\s*(\d{6})/i) || 
                           bodyTextValue.match(/code is:\s*(\d{6})/i) || 
                           bodyTextValue.match(/\b(\d{6})\b/);

        if (matchValue) {
          otpCodeValue = matchValue[1];
          logCallbackValue(`✅ [Smvmail] Lấy được OTP thành công: ${otpCodeValue}`);
          
          // Xóa email vừa đọc để dọn dẹp inbox, tránh lấy nhầm mã cũ nếu phải lấy lại OTP
          try {
            await pageValue.click('button[title="Delete"], a[title="Delete"], button[aria-label="Delete"], i.fa-trash').catch(() => null);
            await _waitForTimeout(1000);
          } catch(e) {}
          break;
        } else {
          logCallbackValue(`[Smvmail] Mở thư nhưng chưa lấy được mã 6 số. Tiếp tục chờ mail mới...`);
          await pageValue.goto(directInboxUrlValue, { waitUntil: 'commit' });
          await pageValue.waitForSelector('input[placeholder*="Search mail"]', { timeout: 8000 });
        }
      } else {
        logCallbackValue(`[Smvmail] Chưa nhận được email chứa OTP từ Microsoft.`);
      }

      await _waitForTimeout(2500);
    }

    if (contextValue) {
      logCallbackValue(`[Smvmail] Đóng trình duyệt lấy OTP...`);
      await contextValue.close();
      await _waitForTimeout(2500); // Chờ lâu hơn một chút để Chromium nhả file lock trên Windows
    }
    
    // Dọn dẹp profile (with retry - Windows file locks are stubborn)
    await _safeRemoveDir(userDataDirValue, logCallbackValue);

    return otpCodeValue;

  } catch (errValue) {
    logCallbackValue(`❌ [Smvmail LỖI] ${errValue.message}`);
    if (contextValue) {
      await contextValue.close().catch(() => null);
      await _waitForTimeout(2000);
    }
    await _safeRemoveDir(userDataDirValue);
    return null;
  }
}

// Hàm helper kiểm tra trang chính đã đăng nhập thành công hay chưa
async function _checkMainPageLoggedIn(mainPageValue, logCallbackValue) {
  if (!mainPageValue || mainPageValue.isClosed()) return false;
  
  try {
    const urlValue = mainPageValue.url();
    logCallbackValue(`[Microsoft] Đang kiểm tra URL trang chính: ${urlValue}`);
    
    if (urlValue && (urlValue.includes('/dashboard') || urlValue.includes('/api-key') || urlValue.includes('/profile'))) {
      return true;
    }
    
    // Kiểm tra xem trang chính có chứa các phần tử sau đăng nhập không
    const hasLoggedInElementsValue = await mainPageValue.evaluate(() => {
      const textValue = document.body.innerText.toLowerCase();
      return textValue.includes('dashboard') || 
             textValue.includes('api key') || 
             textValue.includes('sign out') || 
             textValue.includes('logout') || 
             textValue.includes('đăng xuất') ||
             !!document.querySelector('a[href*="dashboard"]') ||
             !!document.querySelector('a[href*="api-key"]');
    }).catch(() => false);
    
    return hasLoggedInElementsValue;
  } catch (errValue) {
    return false;
  }
}

// Hàm tự động hóa đăng nhập Microsoft
async function _handleMicrosoftLogin(pageValue, accountValue, logCallbackValue, mainPageValue = null) {
  const emailValue = accountValue.email;
  const passValue = accountValue.pass;
  const recoveryEmailValue = accountValue.recoveryEmail;
  const dongvanApikeyValue = accountValue.dongvanApikey;

  logCallbackValue(`[Microsoft] Đang bắt đầu đăng nhập cho: ${emailValue}`);

  // 1. Quét động màn hình ban đầu (có thể là nhập email, hoặc vào thẳng password, hoặc hỏi xác minh phụ)
  logCallbackValue(`[Microsoft] Đang quét giao diện để tìm hướng đi tiếp...`);
  const startScan = Date.now();
  let emailSubmitted = false;

  while (Date.now() - startScan < 25000) {
    if (pageValue.isClosed()) break;
    
    try {
      // Kiểm tra có nút "Use your password" không
      const clickedPwd = await _clickUsePwd(pageValue, null);
      if (clickedPwd) {
        logCallbackValue(`⚡ [Microsoft] Nhận diện màn hình Verify -> Đã click "Use your password"!`);
        await _waitForTimeout(1000);
        break; // Thoát vòng lặp để xuống phần nhập pass
      }

      // Kiểm tra có ô Email không (loginfmt) - ƯU TIÊN TRƯỚC
      if (!emailSubmitted) {
        const hasEmail = await pageValue.locator('input[name="loginfmt"], input[type="email"]').isVisible().catch(() => false);
        if (hasEmail) {
          logCallbackValue(`[Microsoft] Đang điền email...`);
          await pageValue.fill('input[name="loginfmt"], input[type="email"]', emailValue).catch(() => {});
          await _humanMicroIdle(pageValue, logCallbackValue);
          await pageValue.keyboard.press('Enter').catch(() => {});
          logCallbackValue(`[Microsoft] Đã nhập email và submit.`);
          emailSubmitted = true;
          await _waitForTimeout(2000); // Chờ màn hình tải trang mới
          continue; // Bỏ qua phần check pass ở dưới để vòng lặp quét lại từ đầu
        }
      }

      // Kiểm tra có ô Password không (CHỈ KHI không có màn hình Email)
      const hasPwd = await pageValue.locator('input[name="passwd"], input[type="password"]').isVisible().catch(() => false);
      if (hasPwd) {
        logCallbackValue(`[Microsoft] Đã vào thẳng màn hình Password.`);
        break; // Thoát vòng lặp để xuống luồng nhập pass chính
      }
    } catch (errValue) {
      // Ignore execution context destroyed during navigation to let the loop retry
    }
    
    await _waitForTimeout(500);
  }

  // === POLLING ĐỘNG: Phần nhập Password ===
  logCallbackValue(`[Microsoft] Đang chờ và nhập mật khẩu...`);

  let passwordAttempts = 0;
  const pwdPollStart = Date.now();

  while (Date.now() - pwdPollStart < 15000) { // Tối đa 15s
    if (pageValue.isClosed()) break;

    try {
      const hasPwd = await pageValue.locator('input[name="passwd"], input[type="password"]').isVisible().catch(() => false);
      if (hasPwd) {
        logCallbackValue(`[Microsoft] ✅ Phát hiện ô password, tiến hành nhập...`);
        break;
      }
    } catch(e) {}
    
    // Thử click lại Use your password nếu nó lại hiện ra
    await _clickUsePwd(pageValue, null);
    await _waitForTimeout(300);
  }


  // Nhập mật khẩu (early direct path)
  try {
    await pageValue.waitForSelector('input[name="passwd"], input[type="password"]', { timeout: 8000 });

    // Human-like pause + micro interaction before typing password
    if (!pageValue.isClosed()) {
      await _humanMicroIdle(pageValue, logCallbackValue);
      const box = await pageValue.locator('input[name="passwd"], input[type="password"]').first().boundingBox().catch(() => null);
      if (box) {
        await pageValue.mouse.move(box.x + box.width * 0.4 + _rand(-15, 15), box.y + box.height / 2 + _rand(-8, 8), { steps: 5 }).catch(() => {});
      }
      await _waitForTimeout(_rand(500, 1200));
    }

    await pageValue.fill('input[name="passwd"], input[type="password"]', passValue);
    await _humanMicroIdle(pageValue, logCallbackValue);
    await pageValue.keyboard.press('Enter').catch(() => {});
    await _waitForTimeout(500);
    await pageValue.click('#idSIButton9', { timeout: 5000 }).catch(() => {});
    logCallbackValue(`[Microsoft] Đã nhập mật khẩu → ấn Next/Enter.`);
    passwordAttempts++;
    await _waitForTimeout(2000);

    // Quick error check after early password submit
    try {
      const errText = await pageValue.evaluate(() => document.body.innerText.toLowerCase()).catch(() => '');
      if (errText.includes("too many times") || 
          errText.includes("incorrect account or password") ||
          errText.includes("tried to sign in too many times with an incorrect account or password")) {
        logCallbackValue(`❌ [Microsoft] Lỗi rate limit / sai mật khẩu ngay sau submit password (early path).`);
        return false;
      }
    } catch(e) {}
  } catch (errValue) {
    if (_isProxyTunnelError(errValue, logCallbackValue)) return false;
    logCallbackValue(`[Microsoft] Chưa thấy ô mật khẩu, tiếp tục kiểm tra...`);
  }

  if (passwordAttempts === 0) {
    logCallbackValue(`[Microsoft] Chưa nhập pass được ngay, sẽ thử lại trong vòng lặp phát hiện màn hình.`);
  }

  // 3. Vòng lặp phát hiện các màn hình tiếp theo (Stay signed in, Xác minh email khôi phục, Nhập OTP)
  let startTimeValue = Date.now();
  let codeSentValue = false;
  
  // Cờ trạng thái chống lặp step
  let protectAccountAttempts = 0;
  let proofListAttempts = 0;
  let proofInputAttempts = 0;
  let otpAttempts = 0;

  while (Date.now() - startTimeValue < 300000) {
    await _waitForTimeout(300); // Polling 300ms mỗi vòng

    if (pageValue.isClosed()) {
      logCallbackValue(`[Microsoft] Cửa sổ đăng nhập đã bị đóng. Đang kiểm tra trạng thái trang chính...`);
      if (mainPageValue) {
        let loggedInValue = false;
        for (let j = 0; j < 8; j++) {
          await _waitForTimeout(1000);
          loggedInValue = await _checkMainPageLoggedIn(mainPageValue, logCallbackValue);
          if (loggedInValue) break;
        }
        if (loggedInValue) {
          logCallbackValue(`✅ [Microsoft] Đăng nhập thành công (Phát hiện trạng thái đã đăng nhập trên trang chính).`);
          return true;
        }
      }
      logCallbackValue(`[Microsoft CẢNH BÁO] Cửa sổ đăng nhập đã bị đóng. Tiếp tục luồng xử lý chính...`);
      return true;
    }

    // Kiểm tra URL - nếu đã redirect khỏi Microsoft thì thành công (không còn ở domain của microsoft/live nữa)
    let urlValue = '';
    try { urlValue = pageValue.url(); } catch(e) { 
      if (_isProxyTunnelError(e, logCallbackValue)) return false;
      return true; 
    }
    if (urlValue && !urlValue.includes('microsoft') && !urlValue.includes('live.com') && !urlValue.includes('office.com')) {
      logCallbackValue(`[Microsoft] Đăng nhập hoàn tất (Đã chuyển hướng khỏi Microsoft).`);
      return true;
    }

    // Occasional human micro idle inside the long poll (keeps behavior from looking mechanical)
    if (Math.random() < 0.18) {
      await _humanMicroIdle(pageValue, logCallbackValue);
    }

    // Quét DOM để phát hiện màn hình hiện tại
    let screenInfo = null;
    try {
      screenInfo = await pageValue.evaluate((recEmail) => {
        const body = document.body.innerText.toLowerCase();
        const hasPassInput = !!document.querySelector('input[name="passwd"], input[type="password"]');

        // Lỗi kết nối mạng / Proxy chết (Chromium error pages)
        if (body.includes("this site can't be reached") ||
            body.includes("this site can’t be reached") ||
            body.includes("took too long to respond") ||
            body.includes("err_timed_out") ||
            body.includes("err_tunnel_connection_failed") ||
            body.includes("err_connection_") ||
            body.includes("không thể truy cập trang web này")) {
          return { screen: 'error_network_proxy' };
        }

        // Lỗi: Quá nhiều lần đăng nhập sai (Microsoft rate limit / temporary lock)
        // This is the combined message user reported: "You've tried to sign in too many times with an incorrect account or password."
        if (body.includes("you've tried to sign in too many times") || 
            body.includes("too many times with an incorrect account") ||
            body.includes("tried to sign in too many times with an incorrect account or password") ||
            body.includes("bạn đã cố đăng nhập quá nhiều lần")) {
          return { screen: 'error_too_many_attempts' };
        }
        
        // Lỗi: Sai mật khẩu hoặc tài khoản không tồn tại
        if (body.includes("incorrect account or password") ||
            body.includes("we couldn't find an account with that email") ||
            body.includes("tài khoản hoặc mật khẩu không chính xác") ||
            body.includes("the password is incorrect")) {
          // Chỉ báo lỗi nếu không có ô nhập password (để tránh nhầm lẫn với text hướng dẫn)
          const errorNode = document.querySelector('#passwordError, #usernameError, .alert, .error, [role="alert"]');
          if (errorNode && errorNode.innerText.trim().length > 0) {
            return { screen: 'error_invalid_credentials' };
          }
        }

        // C. Help us protect your account (Phải đặt trước Unusual Activity vì nội dung có thể chứa text "something unusual")
        const protectText = body.includes('help us protect your account') || 
                            body.includes('bảo vệ tài khoản của bạn') ||
                            body.includes('help protect your account') ||
                            body.includes('protect your account') ||
                            body.includes('keep your account safe') ||
                            body.includes('verify your identity');
        const isOtpLike = body.includes('enter your code') || body.includes('enter code') || body.includes('nhập mã');
        if (protectText && !isOtpLike) {
          return { screen: 'protect_account' };
        }

        const hasOtcText = body.includes('enter your code') || body.includes('enter code') || body.includes('nhập mã') || body.includes('nhập code');
        const hasInvalidOtp = body.includes("that code didn't work") || body.includes("mã đó không hoạt động") || body.includes("check the code and try again") || body.includes("kiểm tra mã và thử lại");
        const hasOtcInput = !!document.querySelector('input[name="otc"], #idTxtBx_SAOTCC_OTC, input[type="tel"]');
        const onProtectScreen = body.includes('help us protect your account') || body.includes('bảo vệ tài khoản của bạn') || body.includes('protect your account');
        if ((hasOtcText || hasOtcInput || hasInvalidOtp) && !onProtectScreen) {
            return { screen: 'otp', hasPassInput, hasInvalidOtp };
        }
        // Evasion: MS risk / unusual activity / extra verification screens (phone, authenticator, "verify it's you", etc.)
        // Detect broadly via body text so we can cleanly skip instead of hammering and getting permanent lock.
        if (body.includes('unusual sign-in') || body.includes('unusual activity') ||
            body.includes('something unusual') || body.includes('verify it\'s you') ||
            body.includes('security check') || body.includes('additional verification') ||
            body.includes('we detected') || body.includes('sign in another way')) {
          return { screen: 'unusual_activity' };
        }

        // A. Stay signed in
        if (body.includes('stay signed in') || !!document.querySelector('#idBtn_Back') || !!document.querySelector('input[type="submit"][value="Yes"]')) {
          return { screen: 'stay_signed_in' };
        }

        // A.5 Permissions / App Access (Let this app access your info?)
        if (body.includes('let this app access your info') || body.includes('cho phép ứng dụng này truy cập thông tin') || body.includes('needs your permission')) {
          return { screen: 'app_access' };
        }

        // B. Proof list (chọn phương thức xác minh)
        if (recEmail) {
          const domain = recEmail.split('@')[1]?.toLowerCase() || '';
          const isOtpScreen = body.includes('enter your code') || body.includes('enter code');
          if (!isOtpScreen && domain) {
            const els = Array.from(document.querySelectorAll('div, span, button, a, tr, td'));
            const found = els.find(el => {
              if (el.children.length > 0) return false;
              const t = el.textContent.trim().toLowerCase();
              return el.closest('button, a, tr, div[role="button"], div[role="option"], div.tile') &&
                     t.includes('email') && t.includes(domain);
            });
            if (found) {
              found.click();
              const btn = found.closest('button, a, tr, div[role="button"]');
              if (btn) { btn.click(); btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, buttons: 1 })); }
              return { screen: 'proof_list' };
            }
          }
        }

        // (Đã dời block protect_account lên trên)

        // C.5 Proof input (nhập email khôi phục)
        if (recEmail) {
          const domain = recEmail.split('@')[1]?.toLowerCase() || '';
          if ((body.includes(domain) || body.includes('verify your email') || body.includes('xác nhận email')) &&
              !body.includes('enter your code')) {
            const inp = document.querySelector('input[name="proof"], #iProofEmail') ||
              Array.from(document.querySelectorAll('input')).find(i => {
                const r = i.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && (i.type === 'text' || i.type === 'email') &&
                       i.name !== 'loginfmt' && i.id !== 'loginfmt' && i.name !== 'passwd' && i.id !== 'passwd';
              });
            if (inp) return { screen: 'proof_input' };
          }
        }

        // (Đã dời block OTP screen lên trên)

        // E. Password input đã sẵn sàng
        if (hasPassInput) return { screen: 'password_ready' };

        // F. Captcha / Puzzle
        const hasCaptchaIframe = !!document.querySelector('iframe[src*="arkoselabs"], iframe[src*="hcaptcha"], iframe[src*="recaptcha"], iframe[src*="captcha"]');
        const hasPuzzleText = body.includes('please solve the puzzle') || 
                              body.includes('giải câu đố') || 
                              body.includes('prove you are not a robot') ||
                              body.includes('we need to make sure you are not a robot');
        if (hasCaptchaIframe || hasPuzzleText) {
          return { screen: 'captcha' };
        }

        // G. Setting up passkey - Đã bỏ tự động xử lý theo yêu cầu để người dùng tự click
        if (body.includes('setting up your passkey') || body.includes('thiết lập mã khóa') || body.includes('mã khóa của bạn') || body.includes("we couldn't create a passkey") || body.includes("không thể tạo mã khóa")) {
          return { screen: 'setting_up_passkey_manual' };
        }

        return { screen: 'unknown' };
      }, recoveryEmailValue);
    } catch(e) {
      // Page đang navigate hoặc đã đóng, tiếp tục poll
      continue;
    }

    if (!screenInfo) continue;

    // ===== XỬ LÝ TỪNG MÀN HÌNH =====
    // Wrap to catch proxy tunnel failures mid-flow (e.g. during password confirm, proof, OTP stages)
    try {
      if (screenInfo.screen === 'error_network_proxy') {
        logCallbackValue(`❌ [Microsoft LỖI] Lỗi kết nối mạng (Proxy die / timeout / ERR_TIMED_OUT). Trang web không thể tải được. Bỏ qua acc này.`);
        return false;
      }

      if (screenInfo.screen === 'error_too_many_attempts') {
      logCallbackValue(`❌ [Microsoft LỖI] Tài khoản bị khóa tạm thời: "You've tried to sign in too many times with an incorrect account or password." (rate limit do nhiều lần sai). Bỏ qua acc này. Nên đổi proxy khác hoặc chờ 30-120 phút.`);
      return false; // Dừng tiến trình đăng nhập cho tài khoản này
    }

    if (screenInfo.screen === 'error_invalid_credentials') {
      logCallbackValue(`❌ [Microsoft LỖI] Sai mật khẩu hoặc tài khoản không tồn tại. Bỏ qua tài khoản này.`);
      return false; // Dừng tiến trình đăng nhập cho tài khoản này
    }

    if (screenInfo.screen === 'unusual_activity') {
      logCallbackValue(`❌ [Microsoft Evasion] Phát hiện unusual activity / extra verification (phone/authenticator/verify it's you...). Bỏ qua acc này để tránh lock. Thử proxy khác hoặc acc khác.`);
      return false; // Clean skip — do not continue hammering
    }

    if (screenInfo.screen === 'captcha') {
      logCallbackValue(`⚠️ [Microsoft CẢNH BÁO] Phát hiện Captcha/Puzzle! Tạm dừng 60 giây để bạn giải bằng tay...`);
      for (let c = 0; c < 60; c++) {
        if (pageValue.isClosed()) break;
        await _waitForTimeout(1000);
      }
      startTimeValue += 60000; // Cộng thêm 60s vào thời gian chờ tổng thể của vòng lặp để không bị timeout oan
      logCallbackValue(`[Microsoft] Đã hết 60s chờ Captcha. Tiếp tục quét màn hình xem đã qua chưa...`);
      continue;
    }

    if (screenInfo.screen === 'stay_signed_in') {
      logCallbackValue(`[Microsoft] Phát hiện màn Stay signed in. Click "Yes".`);
      try {
        await pageValue.locator('#idSIButton9, input[type="submit"][value="Yes"], button:has-text("Yes"), input[value="Có"]').first().click({ timeout: 3000 });
      } catch(e) {}
      try {
        await pageValue.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('input, button, #idSIButton9')).find(b => {
            const v = (b.value || b.textContent || '').trim().toLowerCase();
            return v === 'yes' || v === 'có' || b.id === 'idSIButton9';
          });
          if (btn) { btn.click(); btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }
        });
      } catch(e) {}
      // Poll cho đến khi URL thay đổi (không chờ cứng)
      for (let w = 0; w < 30; w++) {
        await _waitForTimeout(300);
        try {
          const u = pageValue.url();
          if (!u.includes('login.live.com') && !u.includes('login.microsoftonline.com')) break;
          if (pageValue.isClosed()) break;
        } catch(e) { break; }
      }
      continue;
    }

    if (screenInfo.screen === 'app_access') {
      logCallbackValue(`[Microsoft] Phát hiện màn "Let this app access your info?". Đang cuộn xuống và nhấn Accept...`);
      try {
        // Playwright tự động scroll khi gọi hàm click. Đề phòng che lấp, ta nhấn phím End trước
        await pageValue.keyboard.press('End').catch(() => {});
        await _waitForTimeout(500);
        
        // Tìm và nhấn nút Accept
        await pageValue.click('#idBtn_Accept, button:has-text("Accept"), input[value="Accept"]', { timeout: 3000 }).catch(() => {});
        
        // Fallback click bằng JS (chống lỗi Playwright không click được do React hoặc localization)
        try {
          await pageValue.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('input, button, #idBtn_Accept, a')).find(b => {
              const v = (b.value || b.textContent || '').trim().toLowerCase();
              return v === 'accept' || v === 'chấp nhận' || v === 'đồng ý' || v === 'yes' || b.id === 'idBtn_Accept';
            });
            if (btn) { 
              btn.click(); 
              btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, buttons: 1 })); 
            }
          });
        } catch(e) {}
        
        // Chờ để trang Microsoft điều hướng xong sau khi Accept
        for (let w = 0; w < 30; w++) {
          await _waitForTimeout(300);
          try {
            const u = pageValue.url();
            if (!u.includes('microsoft') && !u.includes('live.com') && !u.includes('office.com')) break;
            if (pageValue.isClosed()) break;
          } catch(e) { break; }
        }
      } catch(e) {}
      continue;
    }

    if (screenInfo.screen === 'setting_up_passkey_manual') {
      // Chỉ log ra để người dùng biết và tự thao tác, KHÔNG tự động click Cancel nữa
      logCallbackValue(`[Microsoft] Phát hiện màn hình Passkey. Vui lòng thao tác bằng tay trên trình duyệt...`);
      await _waitForTimeout(2000); // Chờ một chút để không log liên tục quá nhanh
      continue;
    }

    if (screenInfo.screen === 'protect_account') {
      if (protectAccountAttempts < 3) {
        logCallbackValue(`[Microsoft] Phát hiện màn "Help us protect your account". Đang chọn phương thức email khôi phục...`);
        try {
          const domain = recoveryEmailValue ? recoveryEmailValue.split('@')[1]?.toLowerCase() || '' : '';
          const fullRecovery = recoveryEmailValue || '';

          // Debug: log các option xác minh hiện có (giúp debug nếu vẫn không tick đúng)
          try {
            const optionsText = await pageValue.evaluate(() => {
              const containers = Array.from(document.querySelectorAll('div[role="radio"], div[role="button"], button, div.tile, label, div[role="option"], div.method'));
              return containers.map(c => (c.textContent || '').trim().replace(/\s+/g, ' ')).filter(t => t.length > 3).slice(0, 8);
            }).catch(() => []);
            if (optionsText.length) {
              logCallbackValue(`[Microsoft] Các option xác minh tìm thấy: ${optionsText.join(' | ')}`);
            }
          } catch(e) {}

          let selectedMethod = false;

          // Chiến lược 1: Dùng Playwright locator để tìm tile/radio chứa domain hoặc full email (robust hơn)
          if (domain) {
            try {
              // Tìm các option có text chứa domain (ưu tiên email recovery)
              const emailOption = pageValue.locator('div[role="radio"], div[role="button"], button, div.tile, label, [data-bind], div[role="option"]')
                .filter({ hasText: new RegExp(domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
                .first();

              await emailOption.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
              const count = await emailOption.count().catch(() => 0);
              if (count > 0) {
                // Scroll vào view và click mạnh
                await emailOption.scrollIntoViewIfNeeded().catch(() => {});
                await _waitForTimeout(300);
                await emailOption.click({ force: true, timeout: 4000 }).catch(async () => {
                  // Fallback JS click nếu locator click fail
                  await pageValue.evaluate((dom, full) => {
                    const all = Array.from(document.querySelectorAll('div[role="radio"],div[role="button"],button,div.tile,label,[data-bind],div[role="option"],*'));
                    let target = all.find(el => {
                      const t = (el.textContent || '').toLowerCase();
                      return t.includes(dom) || (full && t.includes(full.toLowerCase()));
                    });
                    if (target) {
                      const clickable = target.closest('div[role="radio"],div[role="button"],button,label,div.tile,[data-bind],div[role="option"]') || target;
                      clickable.click();
                      clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, buttons: 1 }));
                      clickable.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                      clickable.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                    }
                  }, domain, fullRecovery);
                });
                selectedMethod = true;
                logCallbackValue(`[Microsoft] Đã click option chứa domain ${domain} bằng locator`);
                await _waitForTimeout(800); // đợi expand
              }
            } catch (locErr) {
              logCallbackValue(`[Microsoft] Locator chọn email thất bại: ${locErr.message}`);
            }
          }

          if (!selectedMethod) {
            // Chiến lược 2: Fallback evaluate tìm và click (như code cũ nhưng mở rộng selector)
            logCallbackValue(`[Microsoft] Thử lại bằng evaluate mở rộng selector...`);
            selectedMethod = await pageValue.evaluate((dom, full) => {
              const selectors = 'div[role="radio"], div[role="button"], input[type="radio"], div.tile, [data-bind], button, label, div[role="option"], div.method, div.verification-option, *';
              const els = Array.from(document.querySelectorAll(selectors));
              // Ưu tiên có "email" + domain hoặc full email
              let target = els.find(el => {
                const txt = (el.textContent || '').toLowerCase();
                const hasEmailWord = txt.includes('email') || txt.includes('e-mail') || txt.includes('mail');
                return hasEmailWord && (txt.includes(dom) || (full && txt.includes(full.toLowerCase())));
              });
              if (!target) {
                target = els.find(el => (el.textContent || '').toLowerCase().includes(dom));
              }
              if (target) {
                const clickable = target.closest('div[role="radio"],div[role="button"],button,label,div.tile,[data-bind],div[role="option"],div.method') || target;
                clickable.click();
                clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, buttons: 1 }));
                clickable.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                clickable.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                return true;
              }
              return false;
            }, domain, fullRecovery);
          }

          if (!selectedMethod) {
            // Cuối cùng: click radio đầu tiên như cũ
            logCallbackValue(`[Microsoft] Vẫn không tìm được, click radio đầu tiên...`);
            try {
              await pageValue.locator('div[role="radio"], div[role="button"], input[type="radio"]').first().click({ force: true, timeout: 2000 });
              selectedMethod = true;
            } catch(e) {}
            await pageValue.evaluate(() => {
              const firstRadioItem = document.querySelector('div[role="radio"], div[role="button"]');
              if (firstRadioItem) {
                firstRadioItem.click();
              } else {
                const firstRadio = document.querySelector('input[type="radio"]');
                if (firstRadio) {
                  const label = firstRadio.closest('label') || firstRadio.parentElement;
                  if (label) label.click();
                  firstRadio.checked = true;
                  firstRadio.click();
                  firstRadio.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            });
          }

          await _waitForTimeout(1500); // Chờ form mở rộng ra sau khi chọn method

          // Nhập email khôi phục - thử nhiều selector và chờ rõ ràng
          if (recoveryEmailValue) {
            logCallbackValue(`[Microsoft] Đang điền email khôi phục: ${recoveryEmailValue}`);
            // Chờ bất kỳ input email nào xuất hiện (có thể sau khi expand)
            const emailSelectors = '#iProofEmail, input[name="ProofConfirmation"], input[type="email"], input[placeholder*="email" i], input[aria-label*="email" i], input[id*="email" i]';
            await pageValue.waitForSelector(emailSelectors, { state: 'visible', timeout: 8000 }).catch(() => {
              logCallbackValue(`[Microsoft] Không thấy input email sau khi chọn method, thử fill anyway`);
            });
            await pageValue.fill(emailSelectors, recoveryEmailValue).catch(() => {});
            await _humanMicroIdle(pageValue, logCallbackValue);
            await _waitForTimeout(500);
          }
          
          // Click Send code / Next - nhiều cách
          logCallbackValue(`[Microsoft] Đã chọn method và điền email, nhấn Send code / Next...`);
          const sendSelectors = '#iSelectProofAction, #idSIButton9, button:has-text("Send code"), button:has-text("Tiếp tục"), input[value*="Send" i], button[type="submit"]';
          let sent = false;
          try {
            await pageValue.click(sendSelectors, { timeout: 4000 });
            sent = true;
          } catch(e) {}
          if (!sent) {
            await pageValue.evaluate(() => {
              const btn = Array.from(document.querySelectorAll('button, input[type="submit"], #idSIButton9, #iSelectProofAction, a'))
                .find(b => {
                  const t = ((b.textContent || b.value || b.innerText) || '').toLowerCase();
                  return t.includes('send') || t.includes('next') || t.includes('tiếp') || t.includes('gửi') || b.id.includes('ProofAction') || b.id.includes('SIButton');
                });
              if (btn) {
                btn.click();
                btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              }
            }).catch(() => {});
          }

          protectAccountAttempts++;
          await _waitForTimeout(4000); // Chờ Microsoft xử lý và load trang mới (sang enter code)
        } catch(e) {
          logCallbackValue(`[Microsoft] Lỗi khi xử lý protect_account: ${e.message || e}`);
        }
      } else {
        await _waitForTimeout(1000); // Đã click submit, đang chờ trang chuyển
      }
      continue;
    }

    if (screenInfo.screen === 'proof_list') {
      if (proofListAttempts < 3) {
        if (recoveryEmailValue) {
          logCallbackValue(`[Microsoft] Đã click chọn phương thức xác minh qua email khôi phục.`);
        } else {
          logCallbackValue(`[Microsoft] Màn chọn phương thức, không có recovery email. Thử Use your password...`);
          if (!pageValue.isClosed()) await _clickUsePwd(pageValue, logCallbackValue);
        }
        proofListAttempts++;
        await _waitForTimeout(2000); // Chờ load trang mới
      } else {
        await _waitForTimeout(1000);
      }
      continue;
    }

    if (screenInfo.screen === 'proof_input') {
      if (proofInputAttempts < 3) {
        if (recoveryEmailValue) {
          logCallbackValue(`[Microsoft] Màn nhập email khôi phục. Điền: ${recoveryEmailValue}`);
          try {
            if (pageValue.isClosed()) continue;
            await pageValue.fill('input[name="proof"], #iProofEmail', recoveryEmailValue);
            await _waitForTimeout(300);
            if (!pageValue.isClosed()) await pageValue.keyboard.press('Enter').catch(() => {});
            await _waitForTimeout(300);
            if (!pageValue.isClosed()) await pageValue.click('#idSIButton9, input[type="submit"]', { timeout: 3000 }).catch(() => {});
            logCallbackValue(`[Microsoft] Đã nhập email khôi phục và submit.`);
            proofInputAttempts++;
            await _waitForTimeout(3000);
          } catch(err) {
            logCallbackValue(`[Microsoft LỖI] Lỗi điền email khôi phục: ${err.message}`);
          }
        } else {
          logCallbackValue(`[Microsoft] Màn khôi phục nhưng không có recovery email. Thử Use your password...`);
          if (!pageValue.isClosed()) {
            const clicked = await _clickUsePwd(pageValue, logCallbackValue);
            if (clicked) {
              // Poll chờ ô password
              for (let w = 0; w < 20; w++) {
                await _waitForTimeout(300);
                try {
                  const hasPwd = await pageValue.evaluate(() => !!document.querySelector('input[name="passwd"], input[type="password"]'));
                  if (hasPwd) break;
                } catch(e) { break; }
              }
              try {
                if (!pageValue.isClosed()) {
                  await _humanMicroIdle(pageValue, logCallbackValue);
                  await _waitForTimeout(_rand(400, 900));
                }
                if (!pageValue.isClosed()) await pageValue.fill('input[name="passwd"], input[type="password"]', passValue);
                if (!pageValue.isClosed()) await pageValue.keyboard.press('Enter').catch(() => {});
                if (!pageValue.isClosed()) await pageValue.click('#idSIButton9', { timeout: 3000 }).catch(() => {});
              } catch(e) {
                if (_isProxyTunnelError(e, logCallbackValue)) return false;
              }
            }
          }
          proofInputAttempts++;
          await _waitForTimeout(3000);
        }
      } else {
        await _waitForTimeout(1000);
      }
      continue;
    }

    if (screenInfo.screen === 'otp') {
      if (screenInfo.hasInvalidOtp && otpAttempts === 1) {
        logCallbackValue(`❌ [Microsoft CẢNH BÁO] Mã OTP cũ bị lỗi ("That code didn't work"). Đang thử lấy mã mới...`);
      }
      if (otpAttempts < 2) {
        if (recoveryEmailValue) {
          logCallbackValue(`[Microsoft] Màn OTP. Bắt đầu lấy mã cho: ${recoveryEmailValue}`);
          let otpCode = null;

          // Thử DongVan API
          if (dongvanApikeyValue && dongvanApikeyValue.trim()) {
            logCallbackValue(`[Microsoft] Lấy OTP qua DongVan API...`);
            const dongvanStartTime = Date.now();
            const url = `https://api.dongvanfb.net/user/get_code_mail_domain?apikey=${dongvanApikeyValue.trim()}&email=${recoveryEmailValue.trim()}`;
            for (let attempt = 0; attempt < 25; attempt++) {
              if (pageValue.isClosed()) break;
              try {
                const res = await fetch(url);
                const data = await res.json();
                if (data && data.status === true && data.code) {
                  otpCode = data.code;
                  logCallbackValue(`✅ [Microsoft] OTP từ DongVan: ${otpCode}`);
                  break;
                }
              } catch(e) {}
              await _waitForTimeout(4000);
            }
            startTimeValue += (Date.now() - dongvanStartTime);
          }

          // Fallback Smvmail
          if (!otpCode) {
            logCallbackValue(`[Microsoft] Lấy OTP qua Smvmail...`);
            const smvStartTime = Date.now();
            otpCode = await _getOtpFromSmvmail(recoveryEmailValue, logCallbackValue);
            // Bù lại thời gian đã mất vào vòng lặp chính
            startTimeValue += (Date.now() - smvStartTime);
          }

          if (otpCode && otpCode.trim()) {
            try {
              if (!pageValue.isClosed()) await pageValue.fill('input[name="otc"], #idTxtBx_SAOTCC_OTC, input[type="tel"]', otpCode.trim());
              await _humanMicroIdle(pageValue, logCallbackValue);
              if (!pageValue.isClosed()) await pageValue.keyboard.press('Enter').catch(() => {});
              await _waitForTimeout(300);
              if (!pageValue.isClosed()) await pageValue.click('#idSIButton9, input[type="submit"]', { timeout: 3000 }).catch(() => {});
              logCallbackValue(`[Microsoft] Đã điền OTP và submit.`);
              otpAttempts++;
              await _waitForTimeout(3000); // Chờ trang điều hướng
            } catch(err) {
              logCallbackValue(`[Microsoft LỖI] Lỗi điền OTP: ${err.message}`);
            }
          } else {
            logCallbackValue(`❌ [Microsoft LỖI] Không lấy được OTP.`);
            otpAttempts = 2; // Set flag để không loop gọi Smvmail vô hạn
          }
        } else {
          logCallbackValue(`[Microsoft] Màn OTP, không có recovery email. Thử Use your password...`);
          if (!pageValue.isClosed()) await _clickUsePwd(pageValue, logCallbackValue);
          otpAttempts++;
          await _waitForTimeout(2000);
        }
      } else {
        await _waitForTimeout(1000); // Đã submit mã OTP, chờ Microsoft load
      }
      continue;
    }

    if (screenInfo.screen === 'password_ready') {
      if (passwordAttempts < 3) {
        // Ô password đã sẵn — hành xử human hơn trước khi nhập (đọc màn hình, di chuột nhẹ)
        try {
          if (!pageValue.isClosed()) {
            await _humanMicroIdle(pageValue, logCallbackValue);
            // Small natural mouse movement while "thinking" about the password
            const box = await pageValue.locator('input[name="passwd"], input[type="password"]').first().boundingBox().catch(() => null);
            if (box) {
              await pageValue.mouse.move(box.x + box.width * 0.3 + _rand(-20, 20), box.y + box.height / 2 + _rand(-10, 10), { steps: 6 }).catch(() => {});
            }
            await _waitForTimeout(_rand(600, 1400)); // realistic "thinking" time
          }

          // Ô password đã sẵn — nhập với tốc độ human (humanize + careful preset đã patch fill thành humanType)
          if (!pageValue.isClosed()) await pageValue.fill('input[name="passwd"], input[type="password"]', passValue);
          await _humanMicroIdle(pageValue, logCallbackValue);
          if (!pageValue.isClosed()) await pageValue.keyboard.press('Enter').catch(() => {});
          await _waitForTimeout(1000);
          if (!pageValue.isClosed()) await pageValue.click('#idSIButton9', { timeout: 3000 }).catch(() => {});
          passwordAttempts++;
          logCallbackValue(`[Microsoft] Đã gõ xong mật khẩu (lần ${passwordAttempts}) và ấn Next/Enter.`);
          await _waitForTimeout(2500); // Chờ Microsoft xử lý password

          // Immediate check for rate-limit / bad password error right after submit (before going back to main loop)
          try {
            const errText = await pageValue.evaluate(() => document.body.innerText.toLowerCase()).catch(() => '');
            if (errText.includes("too many times") || 
                errText.includes("incorrect account or password") ||
                errText.includes("tried to sign in too many times with an incorrect account or password")) {
              logCallbackValue(`❌ [Microsoft] Phát hiện lỗi rate limit / sai mật khẩu ngay sau khi submit password.`);
              return false;
            }
          } catch(e) {}
        } catch(e) {
          if (_isProxyTunnelError(e, logCallbackValue)) return false;
          throw e; // rethrow other errors
        }
      } else {
        await _waitForTimeout(1000);
      }
      continue;
    }

    // screen === 'unknown' → tiếp tục poll (không làm gì thêm)
    } catch (screenErr) {
      if (_isProxyTunnelError(screenErr, logCallbackValue)) return false;
      // For other errors, log and continue polling (don't crash the whole acc)
      logCallbackValue(`[Microsoft] Lỗi khi xử lý màn hình (không phải proxy tunnel): ${screenErr.message || screenErr}`);
    }
  }

  // Cuối cùng, nếu url vẫn ở trang login thì trả về thất bại
  const finalUrlValue = pageValue.url();
  if (finalUrlValue && (finalUrlValue.includes('login.live.com') || finalUrlValue.includes('login.microsoftonline.com'))) {
    logCallbackValue(`[Microsoft LỖI] Hết thời gian chờ đăng nhập.`);
    return false;
  }
  return true;
}

// =============================================================
// LUỒNG COPY KEY NANOBANANA (tách riêng để dễ sửa độc lập)
// =============================================================
async function _clickAndReadKeyNano(pageValue, networkSnipedKey, logCallbackValue) {
  // Xóa clipboard cũ
  clipboard.writeText('');

  // Click copy icon
  logCallbackValue(`[NanoBanana] Đang tìm icon Copy trong bảng...`);
  let copyClickedValue = false;
  for (let iValue = 0; iValue < 10; iValue++) {
    if (pageValue.isClosed()) return null;
    copyClickedValue = await pageValue.evaluate(() => {
      // CÁCH 1: class lucide-copy
      const copySvg = document.querySelector('svg.lucide-copy');
      if (copySvg) { (copySvg.closest('button') || copySvg).click(); return true; }

      // CÁCH 2: span chứa **** → tìm button copy gần đó
      const spanWithKey = Array.from(document.querySelectorAll('span'))
        .find(s => s.textContent.includes('****') && s.textContent.length > 20);
      if (spanWithKey) {
        const td = spanWithKey.closest('td');
        if (td) {
          const nextTd = td.nextElementSibling;
          if (nextTd) {
            const copyBtn = nextTd.parentElement.querySelector('svg, button');
            if (copyBtn) { (copyBtn.closest('button') || copyBtn).click(); return true; }
          }
          const innerSvg = td.querySelector('svg');
          if (innerSvg) { (innerSvg.closest('button') || innerSvg).click(); return true; }
        }
      }

      // CÁCH 3: button rỗng trong table
      for (const btn of document.querySelectorAll('table button')) {
        if (btn.innerHTML.includes('<svg') && !btn.textContent.trim()) { btn.click(); return true; }
      }
      return false;
    }).catch(() => false);

    if (copyClickedValue) { logCallbackValue(`[NanoBanana] Đã click icon Copy.`); break; }
    await _waitForTimeout(1000);
  }

  if (!copyClickedValue) {
    logCallbackValue(`[NanoBanana] Không thấy icon Copy. Fallback: click svg trong table.`);
    await pageValue.evaluate(() => {
      const svg = document.querySelector('table svg');
      if (svg) (svg.closest('button') || svg).click();
    }).catch(() => {});
  }

  await _waitForTimeout(2000);

  // Đọc key: FakeClipboard → Electron clipboard → Network Sniffer → UUID scan
  let key = await pageValue.evaluate(() => window.lastCopiedKeyValue).catch(() => null);

  if (!key || !key.trim()) {
    try { key = clipboard.readText(); } catch(e) {}
  }

  if ((!key || !key.trim()) && networkSnipedKey) {
    logCallbackValue(`⚡ [NanoBanana] Clipboard trống, dùng Network Sniffer!`);
    key = networkSnipedKey;
  }

  if (key && key.trim() && key.trim().length >= 20) {
    logCallbackValue(`✅ [NanoBanana] Lấy API Key thành công: ${key.trim()}`);
    return key.trim();
  }

  // Fallback: quét UUID trên DOM
  logCallbackValue(`⚡ [NanoBanana] Không lấy được qua Copy hay Network. Thử quét UUID trên giao diện...`);
  const fallback = await pageValue.evaluate(() => {
    const re = /(?:[0-9a-f]{32})|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
    const m = document.body.innerText.match(re);
    if (m) return m[0];
    for (const inp of document.querySelectorAll('input')) {
      const v = inp.value.trim().match(re);
      if (v) return v[0];
    }
    return null;
  }).catch(() => null);

  if (fallback) {
    logCallbackValue(`✅ [NanoBanana] Quét UUID thành công: ${fallback}`);
    return fallback;
  }

  return null;
}

// =============================================================
// LUỒNG COPY KEY KIE AI (tách riêng để dễ sửa độc lập)
// Bạn có thể hướng dẫn sửa hàm này mà không ảnh hưởng NanoBanana
// =============================================================
async function _clickAndReadKeyKie(pageValue, networkSnipedKey, logCallbackValue) {
  // Xóa clipboard cũ
  clipboard.writeText('');

  // Click nút Copy - dựa trên HTML thực tế của Kie AI:
  // <code>c146b30f••••••</code> ... <button><svg class="iconify iconify--mdi ..."></svg></button>
  logCallbackValue(`[Kie AI] Đang tìm và click icon Copy để lấy key...`);
  let copyClickedKie = false;
  for (let iValue = 0; iValue < 15; iValue++) {
    if (pageValue.isClosed()) break;
    copyClickedKie = await pageValue.evaluate(() => {
      // ƯU TIÊN: Tìm code/span chứa key bị che (dấu • hoặc *), rồi tìm button iconify--mdi trong cùng container
      const maskedEls = Array.from(document.querySelectorAll('code, span'));
      for (const el of maskedEls) {
        const text = el.textContent || '';
        // Key Kie dạng: "c146b30f••••••••••••••••••••••••" (hex + dấu chấm tròn)
        if ((text.includes('\u2022') || text.includes('*') || text.includes('\u25cf')) && text.trim().length > 8) {
          // Tìm container chứa cả key lẫn button
          const container = el.closest('tr, td, div.flex, div.gap-2, li');
          if (container) {
            // Tìm button có svg iconify--mdi (button copy của Kie)
            const iconSvg = container.querySelector('svg[class*="iconify--mdi"], svg[class*="iconify"]');
            if (iconSvg) {
              const btn = iconSvg.closest('button');
              if (btn) { btn.click(); return 'iconify-near-masked-key'; }
            }
            // Fallback: button rỗng (chỉ chứa svg) gần nhất
            const emptyBtn = Array.from(container.querySelectorAll('button'))
              .find(b => b.querySelector('svg') && !b.textContent.trim());
            if (emptyBtn) { emptyBtn.click(); return 'empty-btn-near-key'; }
          }
        }
      }

      // Fallback 1: Tìm tất cả button có svg iconify--mdi (icon copy của Kie dùng mdi:content-copy)
      // Path của mdi:content-copy bắt đầu bằng "M19 21H8"
      const allSvgs = Array.from(document.querySelectorAll('svg[class*="iconify--mdi"]'));
      for (const svg of allSvgs) {
        const path = svg.querySelector('path');
        if (path && path.getAttribute('d') && path.getAttribute('d').startsWith('M19 21H8')) {
          const btn = svg.closest('button');
          if (btn) { btn.click(); return 'mdi-content-copy-path'; }
        }
      }

      // Fallback 2: button rỗng (chỉ svg, không có text) - lấy cái đầu tiên
      for (const btn of document.querySelectorAll('button')) {
        if (btn.querySelector('svg[class*="iconify"]') && !btn.textContent.trim()) {
          btn.click(); return 'iconify-empty-btn';
        }
      }

      return false;
    }).catch(() => false);

    if (copyClickedKie) {
      logCallbackValue(`[Kie AI] Đã click icon Copy (phương pháp: ${copyClickedKie}).`);
      break;
    }
    await _waitForTimeout(800);
  }

  // Chờ 3 giây - Kie AI có thể gọi API để lấy key thật trước khi copy vào clipboard
  logCallbackValue(`[Kie AI] Chờ clipboard nhận key (3s)...`);
  await _waitForTimeout(3000);

  // Đọc key: FakeClipboard → Electron clipboard → Network Sniffer → DOM scan
  let key = await pageValue.evaluate(() => window.lastCopiedKeyValue).catch(() => null);
  if (key && key.trim().length >= 10) {
    logCallbackValue(`✅ [Kie AI] FakeClipboard: ${key.trim()}`); return key.trim();
  }

  try {
    const sys = clipboard.readText();
    if (sys && sys.trim().length >= 10) {
      logCallbackValue(`✅ [Kie AI] Electron Clipboard: ${sys.trim()}`); return sys.trim();
    }
  } catch(e) {}

  if (networkSnipedKey) {
    logCallbackValue(`⚡ [Kie AI] Clipboard trống, dùng Network Sniffer!`);
    return networkSnipedKey;
  }

  logCallbackValue(`⚡ [Kie AI] Thử quét UUID/key trên giao diện...`);
  const dom = await pageValue.evaluate(() => {
    const uuidRe = /(?:[0-9a-f]{32})|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
    const skRe = /sk-[a-zA-Z0-9]{20,}/i;
    for (const el of document.querySelectorAll('[data-full],[data-key],[data-value],[data-token],[data-api-key]')) {
      for (const a of ['data-full','data-key','data-value','data-token','data-api-key']) {
        const v = el.getAttribute(a) || ''; if (v.length >= 20) return v;
      }
    }
    for (const inp of document.querySelectorAll('input')) {
      const v = inp.value.trim();
      if (skRe.test(v)) return v.match(skRe)[0];
      if (uuidRe.test(v)) return v.match(uuidRe)[0];
    }
    const t = document.body.innerText;
    const m = t.match(skRe) || t.match(uuidRe);
    return m ? m[0] : null;
  }).catch(() => null);

  if (dom) { logCallbackValue(`✅ [Kie AI] DOM scan: ${dom}`); return dom; }
  return null;
}

// Kịch bản cào key NanoBanana
async function _runNanoBananaAutomation(eventValue, accountValue, proxyValue, logCallbackValue) {

  const emailValue = accountValue.email;
  const userDataDirValue = path.join(__dirname, '.profiles', `profile_nano_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);

  let contextValue;
  try {
    // ==========================================
    // GIẢI PHÁP TÀNG HÌNH CLOAKBROWSER
    // ==========================================
    const { launchPersistentContext } = await import('cloakbrowser');
    
    const launchOptionsValue = {
      userDataDir: userDataDirValue,
      headless: false,
      humanize: true,
      humanPreset: 'careful', // slower, more deliberate mouse/typing/scroll/aim for MS consumer evasion (less "rushed")
      geoip: !!proxyValue, // match browser TZ/locale/WebRTC to proxy IP (strong anti-mismatch signal); requires mmdb-lib
      locale: 'en-US',
      timezoneId: 'America/New_York',
      viewport: { width: 1366, height: 768 },
      args: [
        '--window-size=1366,768',
        '--no-sandbox'
      ]
    };

    if (proxyValue) {
      const parsedProxyValue = _parseProxy(proxyValue);
      if (parsedProxyValue) {
        launchOptionsValue.proxy = parsedProxyValue;
      }
    }

    logCallbackValue(`[NanoBanana] Khởi chạy trình duyệt tàng hình (CloakBrowser)...`);
    contextValue = await launchPersistentContext(launchOptionsValue);

    // Ghi đè clipboard API ngay từ đầu để hứng key copy và vô hiệu hóa Passkey (WebAuthn)
    await contextValue.addInitScript(() => {
      // Đã mở khóa WebAuthn để hiển thị bảng Passkey gốc của Windows cho người dùng tự click.

      // Fake Clipboard
      const originalClipboard = navigator.clipboard;
      const fakeClipboard = {
        writeText: async (text) => {
          window.lastCopiedKeyValue = text;
          if (originalClipboard && originalClipboard.writeText) {
            return originalClipboard.writeText(text).catch(() => {});
          }
          return Promise.resolve();
        },
        readText: async () => window.lastCopiedKeyValue
      };
      
      // Bọc lại object navigator để override clipboard an toàn
      Object.defineProperty(navigator, 'clipboard', {
        value: fakeClipboard,
        configurable: true
      });
      
      // Lắng nghe thêm sự kiện copy truyền thống
      document.addEventListener('copy', (e) => {
        const sel = window.getSelection().toString();
        if (sel) window.lastCopiedKeyValue = sel;
      });
    });

    // Nạp Cookie Microsoft
    if (accountValue.cookie && accountValue.cookie.trim()) {
      await contextValue.addCookies([
        {
          name: 'RPSSecAuth',
          value: accountValue.cookie,
          domain: '.live.com',
          path: '/',
          secure: true,
          httpOnly: true
        }
      ]);
      logCallbackValue(`[NanoBanana] Đã nạp Cookie Microsoft.`);
    }

    let pageValue = contextValue.pages().length > 0 ? contextValue.pages()[0] : await contextValue.newPage();
    let humanCursor = null;
    if (createCursor) {
      // Vá lỗi tương thích cho Playwright vì ghost-cursor gọi hàm browser() của Puppeteer
      pageValue.browser = () => pageValue.context().browser();
      humanCursor = createCursor(pageValue);
    }

    // ==========================================
    // BỘ ĐÁNH HƠI MẠNG (NETWORK SNIFFER)
    // ==========================================
    // Bắt API Key trực tiếp từ các gói tin JSON trả về, cực kỳ đáng tin cậy
    let networkSnipedKey = null;
    pageValue.on('response', async (response) => {
      try {
        const url = response.url();
        if (url.includes('nanobananaapi.ai') && response.request().resourceType() === 'fetch') {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const text = await response.text();
            // Tìm key theo chuẩn UUID (có hoặc không gạch ngang) hoặc sk-...
            // Ví dụ key: bb3b3adc... (32 ký tự hex)
            const keyRegex = /(?:sk-[a-zA-Z0-9]{20,})|(?:[0-9a-f]{32})|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
            const matches = text.match(keyRegex);
            if (matches) {
              for (const m of matches) {
                // Loại trừ các UUID phổ biến không phải key (như tenant id, user id, client_id...)
                // Bằng cách ưu tiên lưu, nếu copy UI thất bại thì dùng nó
                networkSnipedKey = m;
              }
            }
          }
        }
      } catch (e) {}
    });

    // Cấp quyền tự động đọc clipboard (nếu được hỗ trợ)
    try { await contextValue.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => null); } catch(e) {}

    pageValue.setDefaultNavigationTimeout(60000); // Đảm bảo các proxy chậm không bị timeout 30s
    logCallbackValue(`[NanoBanana] Đi tới trang chủ https://nanobananaapi.ai/`);
    try {
      await pageValue.goto('https://nanobananaapi.ai/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (gotoErr) {
      const msg = gotoErr.message || '';
      if (msg.includes('ERR_TUNNEL_CONNECTION_FAILED') || msg.includes('tunnel')) {
        logCallbackValue(`[NanoBanana LỖI] Proxy tunnel thất bại (ERR_TUNNEL_CONNECTION_FAILED). Proxy chết/không hỗ trợ hoặc sai định dạng. Bỏ qua account này hoặc đổi proxy.`);
      } else {
        logCallbackValue(`[NanoBanana LỖI] Không mở được trang chủ: ${msg}`);
      }
      if (contextValue) await contextValue.close().catch(() => null);
      return;
    }

    // Click Get Started - chờ load nhưng không dùng networkidle (trang có websocket liên tục)
    logCallbackValue(`[NanoBanana] Đang tìm và click nút "Get Started" bằng DOM...`);
    await pageValue.waitForLoadState('load', { timeout: 20000 }).catch(() => null);
    await _waitForTimeout(1500); // Chờ React render sau load

    // === Evasion warmup: natural micro-interactions on landing (human reading the page) ===
    // Uses our helper + direct patched mouse.wheel (cloak humanize makes higher-level actions careful).
    try {
      logCallbackValue('[Evasion] Warming up NanoBanana landing page (scroll + idle drift) before Get Started...');
      await _humanMicroIdle(pageValue, logCallbackValue);
      await pageValue.mouse.wheel({ deltaY: _rand(80, 220) }).catch(() => {});
      await _waitForTimeout(_rand(250, 550));
      await _humanMicroIdle(pageValue, logCallbackValue);
    } catch (e) {}

    let clickedGetStartedValue = false;
    try {
      const getStartedEl = await pageValue.waitForSelector('text="Get Started"', { state: 'visible', timeout: 5000 }).catch(() => null);
      if (getStartedEl) {
        const box = await getStartedEl.boundingBox();
        if (box) {
          // Lượn chuột như người thật
          await pageValue.mouse.move(box.x + box.width / 2 + (Math.random() * 10 - 5), box.y + box.height / 2 + (Math.random() * 10 - 5), { steps: 15 });
          await _waitForTimeout(300 + Math.random() * 200);
          await getStartedEl.click();
        } else {
          await getStartedEl.click();
        }
        clickedGetStartedValue = true;
      } else {
        logCallbackValue(`[NanoBanana] Không tìm thấy nút Get Started`);
      }
    } catch(e) {
      logCallbackValue(`[NanoBanana] Không thể click Get Started: ${e.message}`);
    }
    await _waitForTimeout(3000);

    // Click Sign in with Microsoft
    logCallbackValue(`[NanoBanana] Đang click "Sign in with Microsoft" bằng hành vi chuột tự nhiên...`);
    let loginPageValue = pageValue;
    let clickedSignWithValue = false;

    // Chuẩn bị bắt sự kiện popup mở ra
    const popupPromise = pageValue.waitForEvent('popup', { timeout: 15000 }).catch(() => null);

    try {
      const msBtnEl = await pageValue.waitForSelector('text="Sign in with Microsoft"', { state: 'visible', timeout: 5000 }).catch(() => null);
      if (msBtnEl) {
        const box = await msBtnEl.boundingBox();
        if (box) {
          await pageValue.mouse.move(box.x + box.width / 2 + (Math.random() * 10 - 5), box.y + box.height / 2 + (Math.random() * 10 - 5), { steps: 15 });
          await _waitForTimeout(300 + Math.random() * 200);
          await msBtnEl.click();
        } else {
          await msBtnEl.click();
        }
        clickedSignWithValue = true;
      } else {
        logCallbackValue(`❌ [NanoBanana LỖI] Không tìm thấy nút Sign in with Microsoft`);
      }
    } catch(e) {
      logCallbackValue(`❌ [NanoBanana LỖI] Lỗi khi click Sign in with Microsoft: ${e.message}`);
    }

    const popupPageValue = await popupPromise;    if (popupPageValue) {
      logCallbackValue(`✅ [NanoBanana] Đã phát hiện và bắt được cửa sổ popup Microsoft Login.`);
      loginPageValue = popupPageValue;

      // Chờ popup load xong (tránh blank/trắng)
      logCallbackValue(`[NanoBanana] Đang chờ popup Microsoft load...`);
      await popupPageValue.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => null);
      // Poll thêm cho đến khi có nội dung thực (không còn about:blank)
      for (let i = 0; i < 20; i++) {
        const popupUrl = popupPageValue.url();
        if (popupUrl && popupUrl !== 'about:blank' && popupUrl.includes('login')) {
          logCallbackValue(`[NanoBanana] Popup đã load: ${popupUrl.substring(0, 60)}...`);
          break;
        }
        await _waitForTimeout(500);
      }
      await _waitForTimeout(1000); // Thêm delay nhỏ cho React render
    } else {
      logCallbackValue(`[NanoBanana] Không thấy popup. Chờ trang chính chuyển hướng (nếu có)...`);
      await pageValue.waitForLoadState('networkidle').catch(() => null);
    }

    // Đăng nhập Microsoft
    const loginSuccessValue = await _handleMicrosoftLogin(loginPageValue, accountValue, logCallbackValue, pageValue);
    if (!loginSuccessValue) {
      logCallbackValue(`[NanoBanana LỖI] Đăng nhập Microsoft thất bại.`);
      await contextValue.close();
      return;
    }

    // Đợi popup đóng nếu có (tối đa 15 giây)
    if (popupPageValue && !popupPageValue.isClosed()) {
      logCallbackValue(`[NanoBanana] Đang chờ popup Microsoft đóng...`);
      for (let iValue = 0; iValue < 15; iValue++) {
        if (popupPageValue.isClosed()) break;
        await _waitForTimeout(1000);
      }
    }

    logCallbackValue(`[NanoBanana] Quay lại trang chính, chờ trang load hoàn toàn...`);
    try { await pageValue.bringToFront(); } catch(e) {}

    // Dùng polling page.url() thay vì waitForFunction/waitForLoadState
    // vì các hàm đó gọi evaluate() bên trong và throw "Execution context was destroyed"
    // khi page đang trong quá trình navigate (sau Microsoft redirect)
    logCallbackValue(`[NanoBanana] Đang chờ trang NanoBanana ổn định sau redirect...`);
    for (let i = 0; i < 25; i++) {
      await _waitForTimeout(1000);
      try {
        const url = pageValue.url();
        if (url && !url.includes('login.microsoftonline.com') && !url.includes('login.live.com') && url !== 'about:blank') {
          logCallbackValue(`[NanoBanana] Trang đã chuyển về: ${url}`);
          break;
        }
      } catch(e) {
        // page.url() có thể throw khi đang navigate, bỏ qua và thử lại
      }
    }
    // Thêm delay cuối để React render xong
    await _waitForTimeout(4000);

    // Kiểm tra xem có bị dính hCaptcha "Please complete the verification" không
    const hasCaptcha = await pageValue.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        return bodyText.includes('complete the verification') || bodyText.includes('i am human');
    }).catch(() => false);

    if (hasCaptcha) {
        logCallbackValue(`⚠️ [NanoBanana CẢNH BÁO] Tài khoản bị chặn bởi hCaptcha (I am human).`);
        
        // Thử tự động click vào ô checkbox trước khi nhường cho người dùng
        try {
            logCallbackValue(`[NanoBanana] Đang thử tự động click vào ô "I am human"...`);
            const hcaptchaFrame = pageValue.frameLocator('iframe[src*="hcaptcha.com"][data-hcaptcha-widget-id], iframe[title*="hCaptcha security challenge"]').first();
            await hcaptchaFrame.locator('#checkbox').click({ timeout: 5000 });
            logCallbackValue(`[NanoBanana] Đã click ô checkbox. Đang chờ xem có qua luôn hay bắt chọn hình...`);
            await _waitForTimeout(3500); // Chờ hCaptcha xử lý click
        } catch(e) {
            logCallbackValue(`[NanoBanana] Không thể tự click checkbox (có thể bị che): ${e.message}`);
        }

        logCallbackValue(`[NanoBanana] Tạm dừng tối đa 60 giây để bạn giải hình ảnh bằng tay (nếu có)...`);
        for (let c = 0; c < 60; c++) {
          if (pageValue.isClosed()) break;
          // Liên tục kiểm tra xem người dùng đã giải captcha xong chưa
          const stillHasCaptcha = await pageValue.evaluate(() => {
              const bodyText = document.body.innerText.toLowerCase();
              return bodyText.includes('complete the verification') || bodyText.includes('i am human');
          }).catch(() => false);
          
          if (!stillHasCaptcha) {
            logCallbackValue(`✅ [NanoBanana] Đã giải xong hCaptcha, tiếp tục xử lý...`);
            break;
          }
          await _waitForTimeout(1000);
        }
        
        // Kiểm tra lần cuối sau khi hết 60s
        const finalCheck = await pageValue.evaluate(() => {
              const bodyText = document.body.innerText.toLowerCase();
              return bodyText.includes('complete the verification') || bodyText.includes('i am human');
        }).catch(() => false);
        
        if (finalCheck) {
          logCallbackValue(`[NanoBanana LỖI] Đã hết 60s nhưng Captcha chưa được giải. Bỏ qua để chạy acc tiếp theo!`);
          if (contextValue) await contextValue.close().catch(() => null);
          return;
        }
    }

    // Click avatar (Hình 2) - chỉ cần nếu chưa ở dashboard
    const currentUrl = pageValue.url();
    logCallbackValue(`[NanoBanana] URL hiện tại sau login: ${currentUrl}`);

    let avatarClickedValue = false;

    if (currentUrl.includes('/dashboard')) {
      logCallbackValue(`[NanoBanana] Đã ở trang dashboard, bỏ qua bước click avatar.`);
      avatarClickedValue = true; // đã ở đúng chỗ, không cần click avatar
    } else {
      logCallbackValue(`[NanoBanana] Tìm kiếm icon avatar ở góc trên bên phải...`);

      // Chờ trang thực sự load xong trước khi interact
      await pageValue.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => null);
      await _waitForTimeout(2000);

      // Thử locator trước
      try {
        const avatarLocator = pageValue.locator('img[alt*="Avatar"], img[alt*="avatar"], [aria-label*="avatar"], button:has(img[alt]), span:has(img[alt])').first();
        const avatarCount = await avatarLocator.count().catch(() => 0);
        if (avatarCount > 0) {
          await avatarLocator.click({ timeout: 6000 });
          avatarClickedValue = true;
          logCallbackValue(`[NanoBanana] Đã click avatar (locator).`);
        }
      } catch (e) {}

      // Fallback evaluate loop - chỉ chạy khi trang đã ổn định
      if (!avatarClickedValue) {
        for (let iValue = 0; iValue < 15; iValue++) {
          if (pageValue.isClosed()) break;
          // Chờ trang không còn đang navigate
          try {
            await pageValue.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => null);
          } catch (e) {}

          try {
            avatarClickedValue = await pageValue.evaluate(() => {
              const els = Array.from(document.querySelectorAll("button, a, span, div, img"));
              const avatarEl = els.find(b => {
                const txt = (b.textContent || "").trim().toLowerCase();
                const alt = (b.alt || "").toLowerCase();
                return txt === "avatar" || alt.includes("avatar") || (b.querySelector && b.querySelector("img[alt*='Avatar']"));
              });
              if (avatarEl) {
                (avatarEl.closest("button, a, span, div") || avatarEl).click();
                return true;
              }
              return false;
            });
          } catch (evalErr) {
            // Trang đang navigate, bỏ qua và thử lại
            await _waitForTimeout(1000);
            continue;
          }
          if (avatarClickedValue) {
            logCallbackValue(`[NanoBanana] Đã click avatar (evaluate, lần ${iValue + 1}).`);
            break;
          }
          await _waitForTimeout(1000);
        }
      }

      if (!avatarClickedValue) {
        logCallbackValue(`[NanoBanana] Không tìm thấy avatar. Thử đi thẳng vào Dashboard.`);
      }
    }

    if (avatarClickedValue && !currentUrl.includes('/dashboard')) {
      await pageValue.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null);
      await _waitForTimeout(1500);
    }

    // Click Dashboard - ưu tiên locator, fallback direct
    let onDashboard = false;
    try {
      const dashLocator = pageValue.locator('text="Dashboard", a:has-text("Dashboard"), [role="menuitem"]:has-text("Dashboard")').first();
      await dashLocator.click({ timeout: 6000 });
      onDashboard = true;
    } catch (e) {
      logCallbackValue(`[NanoBanana] Click Dashboard locator thất bại, thử evaluate...`);
    }

    if (!onDashboard) {
      const dashboardClickedValue = await pageValue.evaluate(() => {
        const elementsValue = Array.from(document.querySelectorAll("div, span, a, button, [role='menuitem']"));
        const dashboardElValue = elementsValue.find(el => el.textContent.trim().toLowerCase() === "dashboard");
        if (dashboardElValue) {
          (dashboardElValue.closest("a, button, [role='menuitem']") || dashboardElValue).click();
          return true;
        }
        return false;
      }).catch(() => false);

      if (dashboardClickedValue) {
        onDashboard = true;
      }
    }

    if (!onDashboard) {
      logCallbackValue(`[NanoBanana] Không click được Dashboard, điều hướng trực tiếp /dashboard.`);
      await pageValue.goto("https://nanobananaapi.ai/dashboard", { waitUntil: "domcontentloaded" }).catch(() => null);
    }

    // Chờ Dashboard ổn định để tránh lỗi context destroyed khi click tiếp
    await pageValue.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => null);
    await pageValue.waitForTimeout(2500);  // dùng built-in thay vì custom để ổn định hơn

    // Thêm bước đảm bảo đã ở dashboard (nếu cần)
    try {
      await pageValue.waitForURL("**/dashboard**", { timeout: 10000 }).catch(() => null);
    } catch (e) {}

    // Click API Key từ sidebar - dùng locator thay vì evaluate thuần để tránh lỗi "context destroyed" khi navigation
    logCallbackValue(`[NanoBanana] Đang tìm mục "API Key" ở menu trái...`);
    let apiKeyTabClickedValue = false;

    try {
      const apiKeyLocator = pageValue.locator('text="API Key", a:has-text("API Key"), [role="menuitem"]:has-text("API Key"), div:has-text("API Key")').first();
      await apiKeyLocator.click({ timeout: 8000 });
      apiKeyTabClickedValue = true;
    } catch (e) {
      logCallbackValue(`[NanoBanana] Click locator "API Key" thất bại, thử evaluate fallback...`);
    }

    if (!apiKeyTabClickedValue) {
      // Fallback evaluate (với bắt lỗi tốt hơn)
      for (let iValue = 0; iValue < 8; iValue++) {
        if (pageValue.isClosed()) return;
        try {
          apiKeyTabClickedValue = await pageValue.evaluate(() => {
            // Ưu tiên 1: thẻ a có href /api-key
            const aTag = document.querySelector('a[href="/api-key"]');
            if (aTag) {
              aTag.click();
              return true;
            }

            // Ưu tiên 2: tìm dựa trên nội dung text "api key"
            const elementsValue = Array.from(document.querySelectorAll("div, span, a, button, li"));
            const apiKeyElValue = elementsValue.find(el => 
              el.textContent.trim().toLowerCase() === "api key" || 
              el.textContent.trim().toLowerCase().includes("api key")
            );
            if (apiKeyElValue) {
              const clickable = apiKeyElValue.closest("a, button, [role='menuitem'], li") || apiKeyElValue;
              clickable.click();
              return true;
            }
            return false;
          });
        } catch (evalErr) {
          // Context destroyed là bình thường nếu đang navigate, bỏ qua và chờ
        }

        if (apiKeyTabClickedValue) {
          logCallbackValue(`[NanoBanana] Đã click tab API Key.`);
          break;
        }
        await _waitForTimeout(1200);
      }
    }

    if (!apiKeyTabClickedValue) {
      // Fallback mạnh: điều hướng trực tiếp (site thường cho phép nếu đã login)
      logCallbackValue(`[NanoBanana] Không click được qua DOM, thử đi thẳng /api-key...`);
      await pageValue.goto("https://nanobananaapi.ai/api-key", { waitUntil: "domcontentloaded" }).catch(() => null);
    }

    await pageValue.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => null);
    await _waitForTimeout(2500);

    // Đảm bảo chắc chắn đang ở trang API Key (rất quan trọng để lấy key)
    const apiPageUrl = pageValue.url();
    if (!apiPageUrl.includes("/api-key")) {
      logCallbackValue(`[NanoBanana] URL hiện tại chưa đúng trang api-key (${apiPageUrl}), force goto /api-key...`);
      await pageValue.goto("https://nanobananaapi.ai/api-key", { waitUntil: "domcontentloaded" }).catch(() => null);
      await pageValue.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => null);
      await _waitForTimeout(3000);
    }

    // === LUỒNG COPY KEY NANOBANANA ===
    const nanoKeyResult = await _clickAndReadKeyNano(pageValue, networkSnipedKey, logCallbackValue);
    if (nanoKeyResult) {
      _saveKeyToCache(emailValue, nanoKeyResult, 'nano');
      eventValue.sender.send('api-key-detected', { email: emailValue, apiKey: nanoKeyResult, site: 'nano' });
    } else {
      logCallbackValue(`❌ [NanoBanana] Thất bại khi lấy API Key.`);
    }

    await _waitForTimeout(3000);
    await contextValue.close();
    logCallbackValue(`[NanoBanana] Trình duyệt đã đóng.`);

  } catch (errValue) {
    logCallbackValue(`❌ [NanoBanana LỖI] ${errValue.message}`);
    if (contextValue) await contextValue.close().catch(() => null);
  }
}

// Kịch bản cào key Kie AI
async function _runKieAutomation(eventValue, accountValue, proxyValue, logCallbackValue) {
  const emailValue = accountValue.email;
  const userDataDirValue = path.join(__dirname, '.profiles', `profile_kie_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);

  let contextValue;
  try {
    const { launchPersistentContext } = await import('cloakbrowser');
    const launchOptionsValue = {
      userDataDir: userDataDirValue,
      headless: false,
      humanize: true,
      humanPreset: 'careful', // slower, more deliberate mouse/typing/scroll/aim for MS consumer evasion (less "rushed")
      geoip: !!proxyValue, // match browser TZ/locale/WebRTC to proxy IP (strong anti-mismatch signal); requires mmdb-lib
      locale: 'en-US',
      timezoneId: 'America/New_York',
      viewport: { width: 1366, height: 768 },
      args: ['--window-size=1366,768', '--no-sandbox']
    };

    if (proxyValue) {
      const parsedProxyValue = _parseProxy(proxyValue);
      if (parsedProxyValue) {
        launchOptionsValue.proxy = parsedProxyValue;
      }
    }

    logCallbackValue(`[Kie AI] Khởi chạy trình duyệt CloakBrowser...`);
    contextValue = await launchPersistentContext(launchOptionsValue);

    // Ghi đè clipboard API (bắt cả navigator.clipboard.writeText, execCommand, và thư viện copy-to-clipboard)
    await contextValue.addInitScript(() => {
      // 1. Intercept navigator.clipboard.writeText (API hiện đại)
      const originalClipboard = navigator.clipboard;
      const fakeClipboard = {
        writeText: async (text) => {
          window.lastCopiedKeyValue = text;
          if (originalClipboard && originalClipboard.writeText) return originalClipboard.writeText(text).catch(() => {});
          return Promise.resolve();
        },
        readText: async () => window.lastCopiedKeyValue
      };
      Object.defineProperty(navigator, 'clipboard', { value: fakeClipboard, configurable: true });

      // 2. Intercept HTMLTextAreaElement.prototype.select và HTMLInputElement.prototype.select
      // Thư viện copy-to-clipboard tạo textarea ẩn → set value → select() → execCommand('copy') → xóa textarea
      // Phải bắt value TẠI THỜI ĐIỂM select() được gọi, trước khi textarea bị xóa
      const origTextareaSelect = HTMLTextAreaElement.prototype.select;
      HTMLTextAreaElement.prototype.select = function() {
        if (this.value && this.value.trim().length >= 10) {
          window._pendingCopyValue = this.value.trim();
        }
        return origTextareaSelect.call(this);
      };
      const origInputSelect = HTMLInputElement.prototype.select;
      HTMLInputElement.prototype.select = function() {
        if (this.value && this.value.trim().length >= 10) {
          window._pendingCopyValue = this.value.trim();
        }
        return origInputSelect.call(this);
      };

      // 3. Intercept execCommand('copy') - dùng _pendingCopyValue từ textarea.select() nếu có
      const origExecCommand = document.execCommand.bind(document);
      document.execCommand = function(cmd, ...args) {
        const result = origExecCommand(cmd, ...args);
        if (cmd === 'copy') {
          // Ưu tiên: giá trị từ textarea.select() hook (copy-to-clipboard pattern)
          if (window._pendingCopyValue) {
            window.lastCopiedKeyValue = window._pendingCopyValue;
            window._pendingCopyValue = null;
          } else {
            // Fallback: selection text (Ctrl+C pattern)
            const sel = window.getSelection ? window.getSelection().toString() : '';
            if (sel) window.lastCopiedKeyValue = sel;
          }
        }
        return result;
      };

      // 4. Bắt copy event (DataTransfer API - thêm một lớp bảo vệ nữa)
      document.addEventListener('copy', (e) => {
        try {
          const clipData = e.clipboardData || window.clipboardData;
          if (clipData) {
            const text = clipData.getData('text/plain') || clipData.getData('text');
            if (text && text.trim().length >= 10) { window.lastCopiedKeyValue = text.trim(); return; }
          }
        } catch(err) {}
        // Fallback: selection hoặc pending value
        if (window._pendingCopyValue) {
          window.lastCopiedKeyValue = window._pendingCopyValue;
          window._pendingCopyValue = null;
        } else {
          const sel = window.getSelection ? window.getSelection().toString() : '';
          if (sel && sel.trim().length >= 10) window.lastCopiedKeyValue = sel;
        }
      });
    });


    // Nạp Cookie Microsoft
    if (accountValue.cookie && accountValue.cookie.trim()) {
      await contextValue.addCookies([
        {
          name: 'RPSSecAuth',
          value: accountValue.cookie,
          domain: '.live.com',
          path: '/',
          secure: true,
          httpOnly: true
        }
      ]);
      logCallbackValue(`[Kie AI] Đã nạp Cookie Microsoft.`);
    }

    const pageValue = await contextValue.newPage();
    try { await contextValue.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => null); } catch(e) {}

    // ==========================================
    // BỘ ĐÁNH HƠI MẠNG (NETWORK SNIFFER) - Kie AI
    // ==========================================
    // Bắt API Key trực tiếp từ các gói tin JSON trả về khi click Copy hoặc load trang API Keys
    let networkSnipedKey = null;
    pageValue.on('response', async (response) => {
      try {
        const url = response.url();
        // Lắng nghe tất cả response từ kie.ai (API keys thường được trả về qua endpoint /api/)
        if ((url.includes('kie.ai') || url.includes('/api/')) && response.request().resourceType() === 'fetch') {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const text = await response.text().catch(() => '');
            if (!text) return;
            // Tìm key theo chuẩn UUID hoặc sk-... hoặc hex 32 chars
            const keyRegex = /(?:sk-[a-zA-Z0-9]{20,})|(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})|(?:[0-9a-f]{32})/gi;
            const matches = text.match(keyRegex);
            if (matches && matches.length > 0) {
              // Lọc bỏ các ID thông thường (user_id, session_id) bằng cách kiểm tra context trong JSON
              for (const m of matches) {
                // Ưu tiên key xuất hiện gần trường "key", "api_key", "value"
                const keyContextRegex = /"(?:key|api_key|apiKey|value|token|secret)"\s*:\s*"([^"]+)"/gi;
                let ctxMatch;
                while ((ctxMatch = keyContextRegex.exec(text)) !== null) {
                  if (ctxMatch[1].length >= 20) {
                    networkSnipedKey = ctxMatch[1];
                    return; // Dừng ngay khi tìm được key từ context
                  }
                }
                // Fallback: lưu match đầu tiên
                if (!networkSnipedKey) networkSnipedKey = m;
              }
            }
          }
        }
      } catch (e) {}
    });
    
    pageValue.setDefaultNavigationTimeout(60000); // Đảm bảo các proxy chậm không bị timeout 30s
    logCallbackValue(`[Kie AI] Đi tới trang chủ https://kie.ai/`);
    try {
      await pageValue.goto('https://kie.ai/', { waitUntil: 'domcontentloaded' });
    } catch (gotoErr) {
      const msg = gotoErr.message || '';
      if (msg.includes('ERR_TUNNEL_CONNECTION_FAILED') || msg.includes('tunnel')) {
        logCallbackValue(`[Kie AI LỖI] Proxy tunnel thất bại (ERR_TUNNEL_CONNECTION_FAILED). Proxy chết/không hỗ trợ hoặc sai định dạng. Bỏ qua account này hoặc đổi proxy.`);
      } else {
        logCallbackValue(`[Kie AI LỖI] Không mở được trang chủ: ${msg}`);
      }
      if (contextValue) await contextValue.close().catch(() => null);
      return;
    }

    // === Evasion warmup: natural micro-interactions on landing (human reading the page) ===
    try {
      logCallbackValue('[Evasion] Warming up Kie landing page (scroll + idle drift) before Login...');
      await _humanMicroIdle(pageValue, logCallbackValue);
      await pageValue.mouse.wheel({ deltaY: _rand(80, 220) }).catch(() => {});
      await _waitForTimeout(_rand(250, 550));
      await _humanMicroIdle(pageValue, logCallbackValue);
    } catch (e) {}

    // Click Get Started / Login
    logCallbackValue(`[Kie AI] Đang tìm và click nút "Get Started / Login" bằng DOM...`);
    await pageValue.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);

    // Ưu tiên 1: Tìm nút button có text chính xác là "Get Started" trong header nav
    let clickedLoginValue = await pageValue.evaluate(() => {
      // Tìm thẻ button với text chính xác "Get Started" (nút trong nav header)
      const buttons = Array.from(document.querySelectorAll('button'));
      const getStartedBtn = buttons.find(b => b.textContent.trim() === 'Get Started');
      if (getStartedBtn) {
        getStartedBtn.click();
        const ev = new MouseEvent('click', { view: window, bubbles: true, cancelable: true, buttons: 1 });
        getStartedBtn.dispatchEvent(ev);
        return true;
      }
      // Fallback: tìm link login / sign in
      const links = Array.from(document.querySelectorAll('a, button'));
      const loginBtn = links.find(el => {
        const text = el.textContent.trim().toLowerCase();
        return text === 'login' || text === 'sign in';
      });
      if (loginBtn) {
        loginBtn.click();
        return true;
      }
      return false;
    });

    if (!clickedLoginValue) {
      // Fallback: dùng Playwright locator
      await pageValue.locator('button:has-text("Get Started")').first().click({ timeout: 5000 }).catch(() => null);
    }
    
    // Thêm thời gian chờ modal xuất hiện
    await _waitForTimeout(2500);

    // Chọn đăng nhập bằng Microsoft trong modal
    logCallbackValue(`[Kie AI] Chờ modal login xuất hiện và click "Sign in with Microsoft"...`);
    let loginPageValue = pageValue;

    // Chờ modal có nút Microsoft bằng locator (với timeout đủ để modal render)
    let microsoftBtnLocator = null;
    for (let i = 0; i < 10; i++) {
      const count = await pageValue.locator('button:has-text("Sign in with Microsoft"), a:has-text("Sign in with Microsoft")').count().catch(() => 0);
      if (count > 0) {
        microsoftBtnLocator = pageValue.locator('button:has-text("Sign in with Microsoft"), a:has-text("Sign in with Microsoft")').first();
        break;
      }
      await _waitForTimeout(500);
    }

    if (!microsoftBtnLocator) {
      // Fallback evaluate tìm theo text includes
      logCallbackValue(`[Kie AI] Không tìm thấy nút Microsoft qua locator, thử evaluate...`);
    }

    const [popupPageValue] = await Promise.all([
      pageValue.waitForEvent('popup', { timeout: 12000 }).catch(() => null),
      (async () => {
        if (microsoftBtnLocator) {
          try {
            await microsoftBtnLocator.click({ timeout: 5000 });
            logCallbackValue(`[Kie AI] Đã click "Sign in with Microsoft" (locator).`);
            return true;
          } catch(e) {}
        }
        // Fallback evaluate
        return await pageValue.evaluate(() => {
          const allEls = Array.from(document.querySelectorAll('button, a, span'));
          const btn = allEls.find(el => el.textContent.trim().toLowerCase().includes('sign in with microsoft') || el.textContent.trim().toLowerCase().includes('microsoft'));
          if (btn) {
            btn.click();
            const ev = new MouseEvent('click', { view: window, bubbles: true, cancelable: true, buttons: 1 });
            btn.dispatchEvent(ev);
            return true;
          }
          return false;
        }).catch(() => false);
      })()
    ]);

    if (popupPageValue) {
      logCallbackValue(`[Kie AI] Đã phát hiện popup Microsoft Login.`);
      loginPageValue = popupPageValue;
    } else {
      logCallbackValue(`[Kie AI] Không thấy popup, kiểm tra xem trang chính có chuyển không...`);
    }

    // Đăng nhập Microsoft
    const loginSuccessValue = await _handleMicrosoftLogin(loginPageValue, accountValue, logCallbackValue, pageValue);
    if (!loginSuccessValue) {
      logCallbackValue(`[Kie AI LỖI] Đăng nhập Microsoft thất bại.`);
      await contextValue.close();
      return;
    }

    // Đợi popup đóng nếu có
    if (popupPageValue && !popupPageValue.isClosed()) {
        await _waitForTimeout(3000);
    }

    logCallbackValue(`[Kie AI] Quay lại trang chính...`);
    try { await pageValue.bringToFront(); } catch(e) {}
    await _waitForTimeout(3000);

    // Điều hướng thẳng tới trang API Keys của Kie AI
    logCallbackValue(`[Kie AI] Đang điều hướng tới trang API Keys...`);
    await pageValue.goto('https://kie.ai/api-key', { waitUntil: 'domcontentloaded' }).catch(() => null);
    await pageValue.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    await _waitForTimeout(2500);

    // Kiểm tra URL xem đã vào đúng trang chưa
    const kieApiUrl = pageValue.url();
    logCallbackValue(`[Kie AI] URL hiện tại: ${kieApiUrl}`);
    if (!kieApiUrl.includes('/api-key')) {
      logCallbackValue(`[Kie AI] Thử click menu "API Keys" bên trái...`);
      await pageValue.locator('a:has-text("API Keys"), a[href*="api-key"]').first().click({ timeout: 5000 }).catch(() => null);
      await pageValue.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
      await _waitForTimeout(2000);
    }

    // === LUỒNG COPY KEY KIE AI ===
    const kieKeyResult = await _clickAndReadKeyKie(pageValue, networkSnipedKey, logCallbackValue);
    if (kieKeyResult) {
      _saveKeyToCache(emailValue, kieKeyResult, 'kie');
      eventValue.sender.send('api-key-detected', { email: emailValue, apiKey: kieKeyResult, site: 'kie' });
    } else {
      logCallbackValue(`❌ [Kie AI] Không lấy được API Key tự động. Trình duyệt mở 30 giây để kiểm tra thủ công.`);
      await _waitForTimeout(30000);
    }

    await _waitForTimeout(3000);
    await contextValue.close();
    logCallbackValue(`[Kie AI] Trình duyệt đã đóng.`);

  } catch (errValue) {
    logCallbackValue(`[Kie AI LỖI] ${errValue.message}`);
    if (contextValue) await contextValue.close().catch(() => null);
  }
}

// Lắng nghe sự kiện đăng nhập qua CloakBrowser (sử dụng handle để Renderer có thể await cho đến khi trình duyệt đóng)
ipcMain.handle('login-with-mc-cookie', async (eventValue, { account: accountValue, proxy: proxyValue, site: siteValue }) => {
  if (!proxyValue || typeof proxyValue !== 'string' || proxyValue.trim() === '') {
    proxyValue = "103.216.74.218:4554:meganebernha903:mde4mte2mzg0oa==";
  }
  const emailValue = accountValue ? accountValue.email : 'Guest';
  console.log(`[IPC] Đang chuẩn bị khởi chạy CloakBrowser cho tài khoản: ${emailValue} (Site: ${siteValue})`);

  // Dọn dẹp profile cũ
  _clearOldProfiles();

  // Helper log tin nhắn từ Main Process gửi về UI console
  const logCallbackValue = (messageValue) => {
    console.log(messageValue);
    if (_mainWindowValue && !_mainWindowValue.isDestroyed()) {
      _mainWindowValue.webContents.send('automation-log', messageValue);
    }
  };

  if (emailValue === 'Guest') {
    // Luồng mở trình duyệt sạch và chờ người dùng tự tắt
    const userDataDirValue = path.join(__dirname, '.profiles', `profile_guest_${Date.now()}`);
    return new Promise(async (resolveValue) => {
      try {
        const { launchPersistentContext } = await import('cloakbrowser');
        const launchOptionsValue = {
          userDataDir: userDataDirValue,
          headless: false,
          humanize: true,
          humanPreset: 'careful',
          geoip: !!proxyValue,
          locale: 'en-US',
          timezoneId: 'America/New_York',
          viewport: { width: 640, height: 400 },
          args: ['--window-size=640,400']
        };
        if (proxyValue) {
          const parsedProxyValue = _parseProxy(proxyValue);
          if (parsedProxyValue) launchOptionsValue.proxy = parsedProxyValue;
        }
        const contextValue = await launchPersistentContext(launchOptionsValue);
        const pageValue = await contextValue.newPage();

        // Khi trang bị đóng, dọn dẹp context và giải quyết Promise
        pageValue.on('close', async () => {
          await contextValue.close().catch(() => null);
          resolveValue(true);
        });

        const targetUrlValue = siteValue === 'kie' ? 'https://kie.ai/' : 'https://nanobananaapi.ai/';
        await pageValue.goto(targetUrlValue, { waitUntil: 'domcontentloaded' });
      } catch (errValue) {
        console.error('[IPC LỖI] Mở trình duyệt Guest thất bại:', errValue);
        resolveValue(false);
      }
    });
  }

  // Chạy kịch bản tương ứng cho từng website và await cho đến khi kịch bản chạy xong (đóng trình duyệt)
  if (siteValue === 'kie') {
    await _runKieAutomation(eventValue, accountValue, proxyValue, logCallbackValue);
  } else {
    await _runNanoBananaAutomation(eventValue, accountValue, proxyValue, logCallbackValue);
  }
  return true;
});

// Xử lý đọc file tài khoản từ thư mục data/FileHotmail
ipcMain.handle('read-accounts-data', async () => {
  const dataDirValue = path.join(__dirname, 'data', 'FileHotmail');
  if (!fs.existsSync(dataDirValue)) {
    return { success: false, message: 'Thư mục data/FileHotmail không tồn tại.' };
  }
  try {
    const filesValue = fs.readdirSync(dataDirValue);
    const txtFilesValue = filesValue.filter(fileValue => fileValue.endsWith('.txt'));
    if (txtFilesValue.length === 0) {
      return { success: false, message: 'Không tìm thấy file .txt nào trong thư mục data/FileHotmail.' };
    }
    // Đọc tất cả các file .txt và gộp nội dung lại
    let allContentValue = '';
    for (const fileValue of txtFilesValue) {
      const filePathValue = path.join(dataDirValue, fileValue);
      const contentValue = fs.readFileSync(filePathValue, 'utf-8');
      allContentValue += contentValue + '\n';
    }
    return { success: true, content: allContentValue.trim() };
  } catch (errValue) {
    return { success: false, message: errValue.message };
  }
});

// Xử lý đọc cache keys đã lưu từ file
ipcMain.handle('read-cached-keys', async () => {
  const dataDirValue = path.join(__dirname, 'data');
  const resultValue = { nano: {}, kie: {} };

  const nanoPathValue = path.join(dataDirValue, 'key_nano.txt');
  if (fs.existsSync(nanoPathValue)) {
    try {
      const contentValue = fs.readFileSync(nanoPathValue, 'utf-8');
      const linesValue = contentValue.split('\n');
      linesValue.forEach(lineValue => {
        const partsValue = lineValue.trim().split('|');
        if (partsValue.length >= 2) {
          resultValue.nano[partsValue[0].trim()] = partsValue[1].trim();
        }
      });
    } catch (eValue) { }
  }

  const kiePathValue = path.join(dataDirValue, 'key_kie.txt');
  if (fs.existsSync(kiePathValue)) {
    try {
      const contentValue = fs.readFileSync(kiePathValue, 'utf-8');
      const linesValue = contentValue.split('\n');
      linesValue.forEach(lineValue => {
        const partsValue = lineValue.trim().split('|');
        if (partsValue.length >= 2) {
          resultValue.kie[partsValue[0].trim()] = partsValue[1].trim();
        }
      });
    } catch (eValue) { }
  }

  return resultValue;
});

// Xử lý lấy OTP từ Email khôi phục qua smvmail.com
ipcMain.handle('get-dongvan-otp', async (eventValue, { apikey: apikeyValue, email: emailValue }) => {
  try {
    const logCallbackValue = (msg) => {
      if (_mainWindowValue) {
        _mainWindowValue.webContents.send('automation-log', msg);
      }
    };
    const otpCodeValue = await _getOtpFromSmvmail(emailValue, logCallbackValue);
    if (otpCodeValue) {
      return { status: true, code: otpCodeValue };
    } else {
      return { status: false, message: 'Không lấy được OTP từ Smvmail' };
    }
  } catch (errValue) {
    return { status: false, message: errValue.message };
  }
});

// Khởi chạy khi Electron đã sẵn sàng
app.whenReady().then(() => {
  createDesktopWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDesktopWindow();
    }
  });
});

// Tắt hoàn toàn ứng dụng khi tất cả các cửa sổ bị đóng (ngoại trừ macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

