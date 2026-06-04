// --- NANO BANANA FRONTEND APP LOGIC ---

// Trạng thái ứng dụng
let _creditValue = 0;

// DOM Elements
const apiKeyInput = document.getElementById('api-key-input');
const loginBtn = document.getElementById('login-btn');
const getCreditBtn = document.getElementById('get-credit-btn');
const creditNumber = document.getElementById('credit-number');

const consoleLogs = document.getElementById('console-logs');
const clearLogBtn = document.getElementById('clear-log-btn');

// --- Helper Functions ---

// Ghi log lên Console Terminal
function _writeLog(messageValue, typeValue = 'system') {
  const timeValue = new Date().toLocaleTimeString();
  const logLine = document.createElement('div');
  logLine.className = `log-line log-${typeValue}`;
  
  let prefix = '[SYSTEM]';
  if (typeValue === 'request') prefix = '⚡ [REQ]';
  if (typeValue === 'success') prefix = '✅ [RES]';
  if (typeValue === 'error') prefix = '❌ [ERR]';
  
  logLine.innerText = `[${timeValue}] ${prefix} ${messageValue}`;
  consoleLogs.appendChild(logLine);
  
  // Tự động cuộn xuống dưới cùng
  consoleLogs.scrollTop = consoleLogs.scrollHeight;
}

// Hiệu ứng chạy số tăng dần từ 0 cho Credit
function _animateNumber(targetVal) {
  const durationValue = 1000; // 1 giây chạy hiệu ứng
  const startTimeValue = performance.now();
  const startVal = _creditValue;
  
  function update(currentTime) {
    const elapsedValue = currentTime - startTimeValue;
    const progressValue = Math.min(elapsedValue / durationValue, 1);
    
    // Thuật toán easing OutQuad để số chạy chậm dần khi về đích
    const easeProgress = progressValue * (2 - progressValue);
    const currentVal = Math.floor(startVal + easeProgress * (targetVal - startVal));
    
    creditNumber.innerText = currentVal.toLocaleString();
    
    if (progressValue < 1) {
      requestAnimationFrame(update);
    } else {
      creditNumber.innerText = targetVal.toLocaleString();
      _creditValue = targetVal; // Lưu lại giá trị số dư mới
    }
  }
  
  requestAnimationFrame(update);
}

// --- Action Event Listeners ---

// 1. Nút mở trình duyệt Login
loginBtn.addEventListener('click', () => {
  const urlValue = 'https://nanobananaapi.ai/api-key';
  _writeLog(`Mở tab trình duyệt mới tới trang lấy API Key: ${urlValue}`, 'success');
  _writeLog(`Vui lòng copy API Key sau khi login xong để dán vào phần mềm.`, 'system');
  
  // Mở trình duyệt client bằng javascript (Electron sẽ tự mở trình duyệt mặc định)
  window.open(urlValue, '_blank');
});

// 2. Nút Get Credit (Gọi trực tiếp API NanoBanana và tự động lưu LocalStorage)
getCreditBtn.addEventListener('click', async () => {
  const keyVal = apiKeyInput.value.trim();
  
  if (!keyVal) {
    _writeLog('Vui lòng nhập API Key để lấy số dư Credit.', 'error');
    return;
  }

  // Ghi nhớ key vào LocalStorage máy khách để tiện sử dụng lần sau
  localStorage.setItem('nanobanana_api_key', keyVal);
  _writeLog('Đang lưu API Key bảo mật vào bộ nhớ máy khách (LocalStorage)...', 'system');

  _writeLog('Đang gửi request trực tiếp tới API NanoBanana để lấy Credits...', 'request');
  try {
    const responseValue = await fetch('https://api.nanobananaapi.ai/api/v1/common/credit', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${keyVal}`,
        'Content-Type': 'application/json'
      }
    });

    const resultValue = await responseValue.json();
    
    if (responseValue.ok && resultValue.code === 200) {
      _writeLog(`Lấy số dư thành công! Credits còn lại: ${resultValue.data}`, 'success');
      
      // Chạy hiệu ứng số tăng dần cho credit
      _animateNumber(resultValue.data);
    } else {
      throw new Error(resultValue.msg || `Lỗi API (Code: ${resultValue.code})`);
    }
  } catch (errValue) {
    _writeLog(`Lấy Credit thất bại: ${errValue.message}. Hãy kiểm tra lại API Key.`, 'error');
  }
});



// 5. Xóa Logs
clearLogBtn.addEventListener('click', () => {
  consoleLogs.innerHTML = '';
  _writeLog('Logs đã được làm sạch.', 'system');
});

// --- Tab Controller logic ---
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTabId = btn.getAttribute('data-tab');
    const tabName = btn.querySelector('span').innerText;
    
    // Xóa active khỏi các nút tab và nội dung tab
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    // Kích hoạt tab hiện tại
    btn.classList.add('active');
    const targetContent = document.getElementById(targetTabId);
    if (targetContent) {
      targetContent.classList.add('active');
    }
    
    _writeLog(`Đã chuyển sang Tab: ${tabName}`, 'system');
  });
});

// Khởi động: Khôi phục API Key từ LocalStorage máy khách
window.addEventListener('load', () => {
  const savedKeyValue = localStorage.getItem('nanobanana_api_key');
  if (savedKeyValue) {
    apiKeyInput.value = savedKeyValue;
    _writeLog('Đã tự động tải API Key đã lưu từ LocalStorage máy khách. Sẵn sàng hoạt động!', 'system');
  } else {
    _writeLog('Chào mừng! Vui lòng dán API Key hoặc nhấn nút Login để lấy số dư Credit.', 'system');
  }

  // Tải DongVan API Key dùng chung
  const savedDongVanKeyValue = localStorage.getItem('dongvan_global_apikey');
  const dongvanGlobalInput = document.getElementById('dongvan-global-apikey');
  if (savedDongVanKeyValue && dongvanGlobalInput) {
    dongvanGlobalInput.value = savedDongVanKeyValue;
    _writeLog('Đã tự động tải DongVan API Key dùng chung.', 'system');
  }

  if (dongvanGlobalInput) {
    dongvanGlobalInput.addEventListener('input', (eventValue) => {
      localStorage.setItem('dongvan_global_apikey', eventValue.target.value.trim());
    });
  }
  
  // Điền proxy mặc định vào ô nhập để người dùng đỡ phải nhập nhiều
  const proxyInput = document.getElementById('getkey-proxies-textarea');
  if (proxyInput) {
    proxyInput.value = '103.216.74.218:4554:meganebernha903:mde4mte2mzg0oa==';
  }
  
  // Tự động quét và tải tài khoản từ thư mục data cho tab GetKey
  _autoLoadAccountsFromData();
});

// --- Kie AI Tab Controller ---

// DOM Elements cho tab Kie AI
const kieAccountsTextarea = document.getElementById('kie-accounts-textarea');
const kieImportBtn = document.getElementById('kie-import-btn');
const kieCheckAllBtn = document.getElementById('kie-check-all-btn');
const kieAccountsTbody = document.getElementById('kie-accounts-tbody');

// Stats DOM Elements
const kieStatTotal = document.getElementById('kie-stat-total');
const kieStatLiveKeys = document.getElementById('kie-stat-live-keys');
const kieStatTotalCredits = document.getElementById('kie-stat-total-credits');

// Biến private lưu trữ danh sách tài khoản
let _kieAccountsList = [];

// Sự kiện Import & Phân Tích tài khoản
kieImportBtn.addEventListener('click', () => {
  const rawTextValue = kieAccountsTextarea.value.trim();
  if (!rawTextValue) {
    _writeLog('Vui lòng dán danh sách tài khoản trước khi Import.', 'error');
    return;
  }

  const globalDongVanInput = document.getElementById('dongvan-global-apikey');
  const globalDongVanKeyValue = globalDongVanInput ? globalDongVanInput.value.trim() : '';

  const linesValue = rawTextValue.split('\n');
  _kieAccountsList = [];
  let successCountValue = 0;

  linesValue.forEach(lineValue => {
    const partsValue = lineValue.trim().split('|');
    if (partsValue.length >= 1) {
      const emailValue = partsValue[0].trim();
      if (!emailValue) return;

      const passValue = partsValue[1] ? partsValue[1].trim() : '';
      
      let cookieValue = '';
      let dongvanApikeyValue = '';
      let recoveryEmailValue = '';
      
      for (let iValue = 2; iValue < partsValue.length; iValue++) {
        const valValue = partsValue[iValue].trim();
        if (!valValue) continue;
        if (valValue.includes('@')) {
          recoveryEmailValue = valValue;
        } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valValue)) {
          // Bỏ qua UUID vì đó là ID thiết bị/tài khoản chứ không phải DongVan API Key
        } else if (valValue.length >= 10 && valValue.length < 50 && !valValue.includes('@')) {
          dongvanApikeyValue = valValue;
        }
      }

      // Ưu tiên DongVan API Key dùng chung trên GUI
      if (globalDongVanKeyValue) {
        dongvanApikeyValue = globalDongVanKeyValue;
      }
      
      _kieAccountsList.push({
        email: emailValue,
        pass: passValue,
        cookie: cookieValue,
        dongvanApikey: dongvanApikeyValue,
        recoveryEmail: recoveryEmailValue,
        apiKey: '',
        credits: 'Chưa check',
        status: 'Sẵn sàng'
      });
      successCountValue++;
    }
  });

  _writeLog(`Đã import thành công ${successCountValue} tài khoản Microsoft vào tab Kie AI.`, 'success');
  _renderKieAccountsTable();
  _updateKieStats();
});

// Cập nhật các chỉ số thống kê tổng quan
function _updateKieStats() {
  kieStatTotal.innerText = _kieAccountsList.length;
  
  let liveKeysCountValue = 0;
  let totalCreditsValue = 0;
  let hasAnyKeyValue = false;

  _kieAccountsList.forEach(accValue => {
    if (accValue.status === 'Hoạt động (Live)') {
      liveKeysCountValue++;
    }
    if (typeof accValue.credits === 'number') {
      totalCreditsValue += accValue.credits;
    }
    if (accValue.apiKey && accValue.apiKey.trim()) {
      hasAnyKeyValue = true;
    }
  });

  kieStatLiveKeys.innerText = liveKeysCountValue;
  kieStatTotalCredits.innerText = totalCreditsValue.toLocaleString();

  // Kích hoạt nút Check All nếu có ít nhất một tài khoản được nhập API Key
  if (hasAnyKeyValue) {
    kieCheckAllBtn.removeAttribute('disabled');
  } else {
    kieCheckAllBtn.setAttribute('disabled', 'true');
  }
}

// Hàm hiển thị danh sách tài khoản Kie AI lên bảng
function _renderKieAccountsTable() {
  if (_kieAccountsList.length === 0) {
    kieAccountsTbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-table-msg">Chưa có tài khoản nào được nạp. Hãy dán danh sách tài khoản lên trên.</td>
      </tr>
    `;
    return;
  }

  kieAccountsTbody.innerHTML = '';
  
  _kieAccountsList.forEach((accValue, indexValue) => {
    const trValue = document.createElement('tr');
    
    // Kiểm tra trạng thái Cookie
    const isCookieReadyValue = !!accValue.cookie;
    const cookieStatusBadgeValue = isCookieReadyValue 
      ? '<span class="cookie-status-badge cookie-active">Active (Có Cookie)</span>' 
      : '<span class="cookie-status-badge cookie-inactive">No Cookie</span>';

    // Tạo badge hiển thị credits
    let creditBadgeValue = '';
    if (accValue.status === 'Hoạt động (Live)') {
      creditBadgeValue = `<span class="text-green font-small" style="display:block; font-weight: 600;">${accValue.credits.toLocaleString()} Credits</span>`;
    } else if (accValue.status === 'Checking...') {
      creditBadgeValue = '<span class="cookie-status-badge font-small" style="background:rgba(6,182,212,0.1);color:var(--color-cyan);border-color:rgba(6,182,212,0.2);">Checking...</span>';
    } else if (accValue.status === 'Lỗi / Key Die') {
      creditBadgeValue = '<span class="cookie-status-badge cookie-inactive font-small">Die / Lỗi Key</span>';
    } else {
      creditBadgeValue = `<span class="text-muted font-small">${accValue.credits}</span>`;
    }

    trValue.innerHTML = `
      <td title="${accValue.email}">${accValue.email}</td>
      <td>${cookieStatusBadgeValue}</td>
      <td>
        <button class="btn-table-action btn-ms-login" data-index="${indexValue}" ${!(accValue.cookie || (accValue.email && accValue.pass)) ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Login
        </button>
      </td>
      <td>
        <input type="password" class="table-key-input" data-index="${indexValue}" placeholder="Dán API Key..." value="${accValue.apiKey || ''}" style="width:100%; padding: 6px 10px; font-size: 0.85rem; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.08); border-radius:6px; color:#fff;">
      </td>
      <td>
        <div style="display:flex; align-items:center; gap:8px; justify-content:space-between;">
          <div class="credit-status-container" style="flex:1; text-align:left;">
            ${creditBadgeValue}
          </div>
          <button class="btn-table-action btn-check-credit btn-green" data-index="${indexValue}" ${!accValue.apiKey ? 'disabled' : ''} style="padding: 4px 8px; font-size: 0.78rem;">
            Check
          </button>
        </div>
      </td>
    `;
    
    // Sự kiện Click nút Đăng nhập qua Cookie
    const loginBtnElementValue = trValue.querySelector('.btn-ms-login');
    if (loginBtnElementValue) {
      loginBtnElementValue.addEventListener('click', () => {
        _writeLog(`Đang gửi yêu cầu đăng nhập bằng Cookie cho tài khoản: ${accValue.email}`, 'request');
        if (window.electronAPI && window.electronAPI.loginWithMCCookie) {
          window.electronAPI.loginWithMCCookie(accValue);
        } else {
          _writeLog('Lỗi hệ thống: electronAPI không khả dụng trong môi trường này.', 'error');
        }
      });
    }

    // Sự kiện thay đổi nội dung API Key trong bảng
    const keyInputElementValue = trValue.querySelector('.table-key-input');
    if (keyInputElementValue) {
      keyInputElementValue.addEventListener('input', (eventValue) => {
        const keyValue = eventValue.target.value.trim();
        accValue.apiKey = keyValue;
        
        // Bật/tắt nút Check credit của dòng đó
        const checkBtnElementValue = trValue.querySelector('.btn-check-credit');
        if (checkBtnElementValue) {
          if (keyValue) {
            checkBtnElementValue.removeAttribute('disabled');
          } else {
            checkBtnElementValue.setAttribute('disabled', 'true');
          }
        }
        
        // Cập nhật thống kê và nút Check All
        _updateKieStats();
      });
    }

    // Sự kiện Click nút Check Credit riêng lẻ
    const checkCreditBtnElementValue = trValue.querySelector('.btn-check-credit');
    if (checkCreditBtnElementValue) {
      checkCreditBtnElementValue.addEventListener('click', async () => {
        await _checkAccountCredit(indexValue);
      });
    }

    kieAccountsTbody.appendChild(trValue);
  });
}

// Gọi API kiểm tra credit của một tài khoản cụ thể
async function _checkAccountCredit(indexValue) {
  const accValue = _kieAccountsList[indexValue];
  if (!accValue || !accValue.apiKey) return;

  accValue.status = 'Checking...';
  accValue.credits = 'Loading...';
  _renderKieAccountsTable();

  _writeLog(`[Kie AI] Đang kiểm tra số dư cho: ${accValue.email}...`, 'request');

  try {
    const responseValue = await fetch('https://api.kie.ai/api/v1/chat/credit', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accValue.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const resultValue = await responseValue.json();
    
    if (responseValue.ok && resultValue.code === 200) {
      accValue.credits = resultValue.data;
      accValue.status = 'Hoạt động (Live)';
      _writeLog(`[Kie AI] Tài khoản ${accValue.email} hoạt động tốt. Số dư: ${resultValue.data} Credits.`, 'success');
    } else {
      accValue.credits = 'Die';
      accValue.status = 'Lỗi / Key Die';
      _writeLog(`[Kie AI] Lỗi kiểm tra API Key cho ${accValue.email}: ${resultValue.msg || 'Không rõ nguyên nhân'}`, 'error');
    }
  } catch (errValue) {
    accValue.credits = 'Die';
    accValue.status = 'Lỗi / Key Die';
    _writeLog(`[Kie AI] Lỗi mạng khi kiểm tra ${accValue.email}: ${errValue.message}`, 'error');
  }

  _renderKieAccountsTable();
  _updateKieStats();
}

// Kiểm tra credits hàng loạt song song cho tất cả các dòng có API Key
kieCheckAllBtn.addEventListener('click', async () => {
  const accountsToCheckValue = _kieAccountsList.filter(accValue => accValue.apiKey && accValue.apiKey.trim());
  if (accountsToCheckValue.length === 0) return;

  _writeLog('Bắt đầu kiểm tra credits hàng loạt cho các tài khoản có API Key...', 'request');
  kieCheckAllBtn.setAttribute('disabled', 'true');

  // Chuyển trạng thái hiển thị của các hàng có key sang checking
  _kieAccountsList.forEach(accValue => {
    if (accValue.apiKey && accValue.apiKey.trim()) {
      accValue.status = 'Checking...';
      accValue.credits = 'Loading...';
    }
  });
  _renderKieAccountsTable();

  // Tạo các promise chạy song song để check
  const promisesValue = _kieAccountsList.map(async (accValue, indexValue) => {
    if (accValue.apiKey && accValue.apiKey.trim()) {
      try {
        const responseValue = await fetch('https://api.kie.ai/api/v1/chat/credit', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accValue.apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        const resultValue = await responseValue.json();
        
        if (responseValue.ok && resultValue.code === 200) {
          accValue.credits = resultValue.data;
          accValue.status = 'Hoạt động (Live)';
        } else {
          accValue.credits = 'Die';
          accValue.status = 'Lỗi / Key Die';
        }
      } catch (errValue) {
        accValue.credits = 'Die';
        accValue.status = 'Lỗi / Key Die';
      }
    }
  });

  await Promise.all(promisesValue);

  _writeLog('Hoàn thành kiểm tra credits hàng loạt cho tab Kie AI.', 'success');
  kieCheckAllBtn.removeAttribute('disabled');
  _renderKieAccountsTable();
  _updateKieStats();
});

// Lắng nghe sự kiện tự động nhận diện API Key từ CloakBrowser
if (window.electronAPI && window.electronAPI.onApiKeyDetected) {
  window.electronAPI.onApiKeyDetected((emailValue, apiKeyValue, siteValue) => {
    _writeLog(`[Auto Key] Nhận diện thành công API Key của tài khoản ${emailValue} (${siteValue === 'kie' ? 'Kie AI' : 'NanoBanana'}): ${apiKeyValue}`, 'success');
    
    // 1. Kiểm tra và cập nhật cho tab Kie AI
    const accKieValue = _kieAccountsList.find(a => a.email === emailValue);
    if (accKieValue && siteValue === 'kie') {
      accKieValue.apiKey = apiKeyValue;
      _renderKieAccountsTable();
      _updateKieStats();
      _checkAccountCredit(_kieAccountsList.indexOf(accKieValue));
    }

    // 2. Kiểm tra và cập nhật cho tab GetKey Nano And Kie
    const accGetKeyValue = _getkeyAccountsList.find(a => a.email === emailValue);
    if (accGetKeyValue) {
      if (siteValue === 'kie') {
        accGetKeyValue.apiKeyKie = apiKeyValue;
        _renderGetKeyAccountsTable();
        _updateGetKeyStats();
        _checkGetKeyAccountCredit(_getkeyAccountsList.indexOf(accGetKeyValue), 'kie');
      } else {
        accGetKeyValue.apiKeyNano = apiKeyValue;
        _renderGetKeyAccountsTable();
        _updateGetKeyStats();
        _checkGetKeyAccountCredit(_getkeyAccountsList.indexOf(accGetKeyValue), 'nano');
      }
    }
  });
}

// --- GetKey Nano And Kie Tab Controller ---

// DOM Elements
const getkeyAccountsTextareaValue = document.getElementById('getkey-accounts-textarea');
const getkeyProxiesTextareaValue = document.getElementById('getkey-proxies-textarea');
const getkeySiteSelectValue = document.getElementById('getkey-site-select');
const getkeyLoginBtnValue = document.getElementById('getkey-login-btn');
const getkeyLoadDataBtnValue = document.getElementById('getkey-load-data-btn');
const getkeyAccountsTbodyValue = document.getElementById('getkey-accounts-tbody');

// Stats DOM Elements
const getkeyStatTotalValue = document.getElementById('getkey-stat-total');
const getkeyStatLiveKeysValue = document.getElementById('getkey-stat-live-keys');
const getkeyStatTotalCreditsValue = document.getElementById('getkey-stat-total-credits');

// Biến private lưu trữ danh sách tài khoản cho tab GetKey
let _getkeyAccountsList = [];

// Hàm phân tích dữ liệu tài khoản và proxy từ textarea rồi render lên bảng
async function _parseAndRenderLoadedAccounts() {
  const accountsRawValue = getkeyAccountsTextareaValue.value.trim();
  const proxiesRawValue = getkeyProxiesTextareaValue.value.trim();

  const accountLinesValue = accountsRawValue ? accountsRawValue.split('\n') : [];
  const proxyLinesValue = proxiesRawValue ? proxiesRawValue.split('\n') : [];

  // Đọc cached keys nếu có
  let cachedKeysValue = { nano: {}, kie: {} };
  if (window.electronAPI && window.electronAPI.readCachedKeys) {
    try {
      cachedKeysValue = await window.electronAPI.readCachedKeys();
    } catch (eValue) {
      console.error('Không thể đọc cache keys:', eValue);
    }
  }

  // Preserve manual edits the user made in the table (e.g. cleared a key to force re-run)
  const manualKeyOverrides = {};
  _getkeyAccountsList.forEach(acc => {
    if (acc && acc.email) {
      manualKeyOverrides[acc.email] = {
        nano: acc.apiKeyNano,
        kie: acc.apiKeyKie
      };
    }
  });

  _getkeyAccountsList = [];
  let successCountValue = 0;

  const globalDongVanInput = document.getElementById('dongvan-global-apikey');
  const globalDongVanKeyValue = globalDongVanInput ? globalDongVanInput.value.trim() : '';

  accountLinesValue.forEach((lineValue, indexValue) => {
    const partsValue = lineValue.trim().split('|');
    if (partsValue.length >= 1) {
      const emailValue = partsValue[0].trim();
      if (!emailValue) return;

      const passValue = partsValue[1] ? partsValue[1].trim() : '';
      
      let cookieValue = '';
      let dongvanApikeyValue = '';
      let recoveryEmailValue = '';
      
      for (let iValue = 2; iValue < partsValue.length; iValue++) {
        const valValue = partsValue[iValue].trim();
        if (!valValue) continue;
        if (valValue.includes('@')) {
          recoveryEmailValue = valValue;
        } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valValue)) {
          // Bỏ qua UUID vì đó là ID thiết bị/tài khoản chứ không phải DongVan API Key
        } else if (valValue.length >= 10 && valValue.length < 50 && !valValue.includes('@')) {
          dongvanApikeyValue = valValue;
        }
      }

      // Ưu tiên DongVan API Key dùng chung trên GUI
      if (globalDongVanKeyValue) {
        dongvanApikeyValue = globalDongVanKeyValue;
      }
      
      // Ghép proxy có cùng chỉ số dòng (thứ tự dòng tương ứng), nếu không có thì lấy dòng proxy đầu tiên làm mặc định
      let proxyValue = proxyLinesValue[indexValue] ? proxyLinesValue[indexValue].trim() : '';
      if (!proxyValue && proxyLinesValue.length > 0 && proxyLinesValue[0].trim()) {
        proxyValue = proxyLinesValue[0].trim();
      }
      
      let nanoKeyValue = cachedKeysValue.nano[emailValue] || '';
      let kieKeyValue = cachedKeysValue.kie[emailValue] || '';

      // Prefer manual value from previous table render (user may have cleared the key in UI to force re-run this account)
      const prevOverride = manualKeyOverrides[emailValue];
      if (prevOverride) {
        if (prevOverride.nano !== undefined) nanoKeyValue = prevOverride.nano;
        if (prevOverride.kie !== undefined) kieKeyValue = prevOverride.kie;
      }
      
      _getkeyAccountsList.push({
        email: emailValue,
        pass: passValue,
        cookie: cookieValue,
        proxy: proxyValue,
        dongvanApikey: dongvanApikeyValue,
        recoveryEmail: recoveryEmailValue,
        apiKeyNano: nanoKeyValue,
        apiKeyKie: kieKeyValue,
        creditsNano: nanoKeyValue ? 'Chưa check' : 'Chưa check',
        creditsKie: kieKeyValue ? 'Chưa check' : 'Chưa check',
        statusNano: nanoKeyValue ? 'Đã có key (Cache)' : 'Sẵn sàng',
        statusKie: kieKeyValue ? 'Đã có key (Cache)' : 'Sẵn sàng'
      });
      successCountValue++;
    }
  });

  _renderGetKeyAccountsTable();
  _updateGetKeyStats();
  return successCountValue;
}

// Hàm chạy hàng loạt tuần tự các tài khoản chưa có key
async function _startBatchGetKeyProcess() {
  const siteValue = getkeySiteSelectValue ? getkeySiteSelectValue.value : 'nanobanana';
  _writeLog(`[GetKey] Bắt đầu luồng chạy tự động hàng loạt tuần tự cho site: ${siteValue === 'kie' ? 'Kie AI' : 'NanoBanana'}`, 'system');

  // Vô hiệu hoá nút để tránh click trùng
  getkeyLoginBtnValue.setAttribute('disabled', 'true');

  for (let iValue = 0; iValue < _getkeyAccountsList.length; iValue++) {
    const accValue = _getkeyAccountsList[iValue];
    
    // Kiểm tra xem tài khoản đã có key chưa
    const hasKeyValue = siteValue === 'kie' ? !!accValue.apiKeyKie : !!accValue.apiKeyNano;
    
    if (hasKeyValue) {
      _writeLog(`[GetKey] Tài khoản ${accValue.email} đã có key cache. Tự động bỏ qua.`, 'system');
      continue;
    }

    _writeLog(`[GetKey] [Tiến trình ${iValue + 1}/${_getkeyAccountsList.length}] Đang chạy cào key cho: ${accValue.email}`, 'request');

    if (siteValue === 'kie') {
      accValue.statusKie = 'Đang chạy...';
    } else {
      accValue.statusNano = 'Đang chạy...';
    }
    _renderGetKeyAccountsTable();

    try {
      if (window.electronAPI && window.electronAPI.loginWithMCCookie) {
        // Await cho đến khi trình duyệt đóng
        await window.electronAPI.loginWithMCCookie(accValue, accValue.proxy, siteValue);
      }
    } catch (errValue) {
      _writeLog(`[GetKey LỖI] Lỗi trong tiến trình của ${accValue.email}: ${errValue.message}`, 'error');
    }

    // Sau khi chạy xong, nạp lại cache từ file để cập nhật key mới cào được vào UI
    // Sau khi chạy xong, nạp lại cache từ file để cập nhật key mới cào được vào UI
    let cachedKeysValue = { nano: {}, kie: {} };
    if (window.electronAPI && window.electronAPI.readCachedKeys) {
      try {
        cachedKeysValue = await window.electronAPI.readCachedKeys();
        accValue.apiKeyNano = cachedKeysValue.nano[accValue.email] || accValue.apiKeyNano;
        accValue.apiKeyKie = cachedKeysValue.kie[accValue.email] || accValue.apiKeyKie;
      } catch (eValue) {}
    }

    _renderGetKeyAccountsTable();
    _updateGetKeyStats();

    // Tự động check credit ngay lập tức để lấy tích xanh (nếu đã có key)
    const currentKey = siteValue === 'kie' ? accValue.apiKeyKie : accValue.apiKeyNano;
    if (currentKey) {
      await _checkGetKeyAccountCredit(iValue, siteValue);
    } else {
      if (siteValue === 'kie') accValue.statusKie = 'Thất bại';
      else accValue.statusNano = 'Thất bại';
      _renderGetKeyAccountsTable();
      _updateGetKeyStats();
    }
    
    // Nghỉ trước khi chạy tài khoản tiếp theo
    if (iValue < _getkeyAccountsList.length - 1) {
      let delayMs = 8000; // base fail delay (was 5s)
      if (currentKey) {
        // Thành công thì random 20 - 30 giây (human-like pacing between accounts)
        delayMs = Math.floor(Math.random() * (30000 - 20000 + 1)) + 20000;
      } else {
        // Evasion: on fail (no key, or saw "too many"/"unusual" in logs from main process) use longer backoff
        // The main.js now emits clear evasion logs + early returns; caller can observe via console.
        delayMs = 45000 + Math.floor(Math.random() * 45000); // 45-90s to cool down MS risk signals
      }
      _writeLog(`[GetKey] Tạm nghỉ ${delayMs / 1000}s trước khi chuyển sang tài khoản tiếp theo...`, 'system');
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  _writeLog(`[GetKey] Đã hoàn tất xử lý danh sách tài khoản.`, 'success');
  getkeyLoginBtnValue.removeAttribute('disabled');
}

// Sự kiện Click nút Login: Phân tích danh sách và tự động chạy luồng hàng loạt tuần tự
getkeyLoginBtnValue.addEventListener('click', async () => {
  const siteValue = getkeySiteSelectValue ? getkeySiteSelectValue.value : 'nanobanana';

  // Only re-parse from textareas if we don't have a prepared list yet.
  // This allows the batch to respect current table state (including user clearing keys to force re-run).
  if (_getkeyAccountsList.length === 0) {
    const successCountValue = await _parseAndRenderLoadedAccounts();
    _writeLog(`[GetKey] Đã nạp thành công ${successCountValue} tài khoản từ textareas.`, 'system');
  } else {
    // List already prepared (from "Tải từ Data" or previous). Re-parse to pick up any textarea changes,
    // but the key preservation logic inside parse will keep manual table edits (clears etc.).
    await _parseAndRenderLoadedAccounts();
  }

  if (_getkeyAccountsList.length > 0) {
    _writeLog(`[GetKey] Bắt đầu luồng kiểm tra và lấy key cho các acc chưa có key (theo thứ tự danh sách)...`, 'success');
    _startBatchGetKeyProcess();
  } else {
    // Nếu không nhập tài khoản nào cả, vẫn mở CloakBrowser ở trạng thái sạch!
    _writeLog(`[GetKey] Không có tài khoản được nhập. Mở trình duyệt CloakBrowser sạch hoàn toàn (Site: ${siteValue}) để kiểm tra...`, 'request');
    if (window.electronAPI && window.electronAPI.loginWithMCCookie) {
      window.electronAPI.loginWithMCCookie({ email: 'Guest', pass: '', cookie: '', proxy: '', dongvanApikey: '', recoveryEmail: '' }, '', siteValue);
    }
  }
});

// Sự kiện Click nút Tải từ Data
getkeyLoadDataBtnValue.addEventListener('click', () => {
  _autoLoadAccountsFromData();
});

// Hàm tự động tải tài khoản từ thư mục data
async function _autoLoadAccountsFromData() {
  _writeLog('Đang tự động quét và đọc danh sách tài khoản từ thư mục data...', 'system');
  if (window.electronAPI && window.electronAPI.readAccountsData) {
    try {
      const resultValue = await window.electronAPI.readAccountsData();
      if (resultValue.success && resultValue.content) {
        getkeyAccountsTextareaValue.value = resultValue.content;
        _writeLog('Đã tự động đọc tài khoản từ thư mục data thành công.', 'success');
        await _parseAndRenderLoadedAccounts();
      } else {
        _writeLog(resultValue.message || 'Không tìm thấy tài khoản nào trong thư mục data.', 'system');
      }
    } catch (errValue) {
      _writeLog(`Lỗi khi đọc file tài khoản: ${errValue.message}`, 'error');
    }
  }
}

// Cập nhật các chỉ số thống kê của tab GetKey
function _updateGetKeyStats() {
  getkeyStatTotalValue.innerText = _getkeyAccountsList.length;
  
  let liveKeysCountValue = 0;
  let totalCreditsValue = 0;

  _getkeyAccountsList.forEach(accValue => {
    if (accValue.statusNano === 'Hoạt động (Live)') {
      liveKeysCountValue++;
    }
    if (accValue.statusKie === 'Hoạt động (Live)') {
      liveKeysCountValue++;
    }
    if (typeof accValue.creditsNano === 'number') {
      totalCreditsValue += accValue.creditsNano;
    }
    if (typeof accValue.creditsKie === 'number') {
      totalCreditsValue += accValue.creditsKie;
    }
  });

  getkeyStatLiveKeysValue.innerText = liveKeysCountValue;
  getkeyStatTotalCreditsValue.innerText = totalCreditsValue.toLocaleString();
}

// Hàm hiển thị danh sách tài khoản của tab GetKey lên bảng
function _renderGetKeyAccountsTable() {
  if (_getkeyAccountsList.length === 0) {
    getkeyAccountsTbodyValue.innerHTML = `
      <tr>
        <td colspan="4" class="empty-table-msg">Chưa có tài khoản nào được nạp. Hãy dán danh sách tài khoản lên trên.</td>
      </tr>
    `;
    return;
  }

  getkeyAccountsTbodyValue.innerHTML = '';
  
  _getkeyAccountsList.forEach((accValue, indexValue) => {
    const trValue = document.createElement('tr');
    
    // Nút đăng nhập qua cookie
    const isCookieReadyValue = !!accValue.cookie;
    
    // Hiển thị Proxy
    const proxyDisplayValue = accValue.proxy ? `<code>${accValue.proxy}</code>` : '<span class="text-disabled font-small">No Proxy</span>';

    // Tạo badge hiển thị credits Nano
    let creditNanoBadgeValue = '';
    if (accValue.statusNano === 'Hoạt động (Live)') {
      creditNanoBadgeValue = `<span class="text-green font-small" style="font-weight: 600;">${accValue.creditsNano.toLocaleString()} Cr</span>`;
    } else if (accValue.statusNano === 'Checking...') {
      creditNanoBadgeValue = '<span class="cookie-status-badge font-small" style="background:rgba(6,182,212,0.1);color:var(--color-cyan);border-color:rgba(6,182,212,0.2);padding:2px 6px;">Checking...</span>';
    } else if (accValue.statusNano === 'Lỗi / Key Die') {
      creditNanoBadgeValue = '<span class="cookie-status-badge cookie-inactive font-small" style="padding:2px 6px;">Die</span>';
    } else {
      creditNanoBadgeValue = `<span class="text-muted font-small">${accValue.creditsNano}</span>`;
    }

    // Tạo badge hiển thị credits Kie
    let creditKieBadgeValue = '';
    if (accValue.statusKie === 'Hoạt động (Live)') {
      creditKieBadgeValue = `<span class="text-green font-small" style="font-weight: 600;">${accValue.creditsKie.toLocaleString()} Cr</span>`;
    } else if (accValue.statusKie === 'Checking...') {
      creditKieBadgeValue = '<span class="cookie-status-badge font-small" style="background:rgba(6,182,212,0.1);color:var(--color-cyan);border-color:rgba(6,182,212,0.2);padding:2px 6px;">Checking...</span>';
    } else if (accValue.statusKie === 'Lỗi / Key Die') {
      creditKieBadgeValue = '<span class="cookie-status-badge cookie-inactive font-small" style="padding:2px 6px;">Die</span>';
    } else {
      creditKieBadgeValue = `<span class="text-muted font-small">${accValue.creditsKie}</span>`;
    }

    trValue.innerHTML = `
      <td title="${accValue.email}">${accValue.email}</td>
      <td>
        <div style="display:flex; flex-direction:column; gap:6px; align-items:center;">
          <button class="btn-table-action btn-ms-login btn-purple" data-index="${indexValue}" ${!(accValue.cookie || (accValue.email && accValue.pass)) ? 'disabled' : ''}>
            Get Key
          </button>
          <button class="btn-table-action btn-get-otp btn-cyan" data-index="${indexValue}" ${(!accValue.dongvanApikey || !accValue.recoveryEmail) ? 'disabled' : ''} style="background:rgba(6,182,212,0.15); color:var(--color-cyan); border-color:rgba(6,182,212,0.25);">
            Get OTP
          </button>
          <span class="otp-text" style="font-size:0.85rem; font-weight:700; color:#22c55e;"></span>
        </div>
      </td>
      <td>
        <div class="api-key-row" style="margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
          <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600; width:45px;">Nano:</span>
          <input type="text" class="table-key-input nano-key" data-index="${indexValue}" placeholder="Nano API Key..." value="${accValue.apiKeyNano || ''}" style="flex:1; padding: 4px 8px; font-size: 0.8rem; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.08); border-radius:6px; color:#fff;">
        </div>
        <div class="api-key-row" style="display: flex; align-items: center; gap: 4px;">
          <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600; width:45px;">Kie:</span>
          <input type="text" class="table-key-input kie-key" data-index="${indexValue}" placeholder="Kie API Key..." value="${accValue.apiKeyKie || ''}" style="flex:1; padding: 4px 8px; font-size: 0.8rem; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.08); border-radius:6px; color:#fff;">
        </div>
      </td>
      <td>
        <div class="credit-row" style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 6px;">
          <span style="font-size:0.75rem; color:var(--text-muted); width:45px; font-weight:600;">Nano:</span>
          <div style="flex:1; text-align:left; padding-left: 5px;">${creditNanoBadgeValue}</div>
          <button class="btn-table-action btn-check-nano btn-green" data-index="${indexValue}" ${!accValue.apiKeyNano ? 'disabled' : ''} style="padding: 2px 6px; font-size: 0.72rem;">Check</button>
        </div>
        <div class="credit-row" style="display:flex; align-items:center; justify-content:space-between;">
          <span style="font-size:0.75rem; color:var(--text-muted); width:45px; font-weight:600;">Kie:</span>
          <div style="flex:1; text-align:left; padding-left: 5px;">${creditKieBadgeValue}</div>
          <button class="btn-table-action btn-check-kie btn-green" data-index="${indexValue}" ${!accValue.apiKeyKie ? 'disabled' : ''} style="padding: 2px 6px; font-size: 0.72rem;">Check</button>
        </div>
      </td>
    `;
    
    // Click nút Get Key (mở CloakBrowser với Proxy và Cookie)
    const loginBtnElementValue = trValue.querySelector('.btn-ms-login');
    if (loginBtnElementValue) {
      loginBtnElementValue.addEventListener('click', () => {
        const siteValue = getkeySiteSelectValue ? getkeySiteSelectValue.value : 'nanobanana';
        _writeLog(`[GetKey] Đang mở CloakBrowser Chromium (Profile sạch, Proxy: ${accValue.proxy || 'Không có'}, Site: ${siteValue}) cho: ${accValue.email}`, 'request');
        if (window.electronAPI && window.electronAPI.loginWithMCCookie) {
          // Gửi thêm cả proxy và site sang Main Process để cấu hình
          window.electronAPI.loginWithMCCookie(accValue, accValue.proxy, siteValue);
        } else {
          _writeLog('Lỗi hệ thống: electronAPI không khả dụng.', 'error');
        }
      });
    }

    // Click nút Get OTP (gọi API lấy OTP từ recovery email)
    const getOtpBtnElementValue = trValue.querySelector('.btn-get-otp');
    if (getOtpBtnElementValue) {
      getOtpBtnElementValue.addEventListener('click', async () => {
        const otpTextElementValue = trValue.querySelector('.otp-text');
        otpTextElementValue.innerText = 'Đang lấy...';
        otpTextElementValue.style.color = '#eab308'; // màu vàng
        
        _writeLog(`[DongVan OTP] Đang gửi yêu cầu lấy OTP cho recovery email: ${accValue.recoveryEmail}`, 'request');
        
        if (window.electronAPI && window.electronAPI.getDongVanOtp) {
          try {
            const resultValue = await window.electronAPI.getDongVanOtp(accValue.dongvanApikey, accValue.recoveryEmail);
            if (resultValue.status && resultValue.code) {
              otpTextElementValue.innerText = `OTP: ${resultValue.code}`;
              otpTextElementValue.style.color = '#22c55e'; // màu xanh lá
              _writeLog(`[DongVan OTP] Lấy OTP thành công cho ${accValue.email}: ${resultValue.code}`, 'success');
            } else {
              let errorMsgValue = resultValue.message || 'Hộp thư trống';
              if (errorMsgValue === 'Email not exist') {
                errorMsgValue = 'Email chưa nhận được thư OTP từ Microsoft (Email not exist)';
              }
              otpTextElementValue.innerText = 'Không có OTP';
              otpTextElementValue.style.color = '#ef4444'; // màu đỏ
              _writeLog(`[DongVan OTP] Thất bại: ${errorMsgValue}`, 'error');
            }
          } catch (errValue) {
            otpTextElementValue.innerText = 'Lỗi kết nối';
            otpTextElementValue.style.color = '#ef4444';
            _writeLog(`[DongVan OTP] Lỗi mạng hoặc lỗi API: ${errValue.message}`, 'error');
          }
        } else {
          _writeLog('Lỗi hệ thống: getDongVanOtp không khả dụng.', 'error');
        }
      });
    }

    // Sự kiện thay đổi API Key Nano
    const nanoKeyInputElementValue = trValue.querySelector('.nano-key');
    if (nanoKeyInputElementValue) {
      nanoKeyInputElementValue.addEventListener('input', (eventValue) => {
        const keyValue = eventValue.target.value.trim();
        accValue.apiKeyNano = keyValue;
        
        const checkBtnElementValue = trValue.querySelector('.btn-check-nano');
        if (checkBtnElementValue) {
          if (keyValue) {
            checkBtnElementValue.removeAttribute('disabled');
          } else {
            checkBtnElementValue.setAttribute('disabled', 'true');
          }
        }
        _updateGetKeyStats();
      });
    }

    // Sự kiện thay đổi API Key Kie
    const kieKeyInputElementValue = trValue.querySelector('.kie-key');
    if (kieKeyInputElementValue) {
      kieKeyInputElementValue.addEventListener('input', (eventValue) => {
        const keyValue = eventValue.target.value.trim();
        accValue.apiKeyKie = keyValue;
        
        const checkBtnElementValue = trValue.querySelector('.btn-check-kie');
        if (checkBtnElementValue) {
          if (keyValue) {
            checkBtnElementValue.removeAttribute('disabled');
          } else {
            checkBtnElementValue.setAttribute('disabled', 'true');
          }
        }
        _updateGetKeyStats();
      });
    }

    // Check Credit Nano riêng lẻ
    const checkNanoCreditBtnElementValue = trValue.querySelector('.btn-check-nano');
    if (checkNanoCreditBtnElementValue) {
      checkNanoCreditBtnElementValue.addEventListener('click', async () => {
        await _checkGetKeyAccountCredit(indexValue, 'nano');
      });
    }

    // Check Credit Kie riêng lẻ
    const checkKieCreditBtnElementValue = trValue.querySelector('.btn-check-kie');
    if (checkKieCreditBtnElementValue) {
      checkKieCreditBtnElementValue.addEventListener('click', async () => {
        await _checkGetKeyAccountCredit(indexValue, 'kie');
      });
    }

    getkeyAccountsTbodyValue.appendChild(trValue);
  });
}

// Gọi API kiểm tra credit của một tài khoản cụ thể trong tab GetKey
async function _checkGetKeyAccountCredit(indexValue, typeValue) {
  const accValue = _getkeyAccountsList[indexValue];
  if (!accValue) return;

  const keyValue = typeValue === 'nano' ? accValue.apiKeyNano : accValue.apiKeyKie;
  if (!keyValue) return;

  if (typeValue === 'nano') {
    accValue.statusNano = 'Checking...';
    accValue.creditsNano = 'Loading...';
  } else {
    accValue.statusKie = 'Checking...';
    accValue.creditsKie = 'Loading...';
  }
  _renderGetKeyAccountsTable();

  const labelValue = typeValue === 'nano' ? 'Nano' : 'Kie';
  _writeLog(`[GetKey ${labelValue}] Đang kiểm tra số dư cho: ${accValue.email}...`, 'request');

  try {
    const creditUrl = typeValue === 'nano'
      ? 'https://api.nanobananaapi.ai/api/v1/common/credit'
      : 'https://api.kie.ai/api/v1/chat/credit';
    const responseValue = await fetch(creditUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${keyValue}`,
        'Content-Type': 'application/json'
      }
    });

    const resultValue = await responseValue.json();
    
    if (responseValue.ok && resultValue.code === 200) {
      if (typeValue === 'nano') {
        accValue.creditsNano = resultValue.data;
        accValue.statusNano = 'Hoạt động (Live)';
      } else {
        accValue.creditsKie = resultValue.data;
        accValue.statusKie = 'Hoạt động (Live)';
      }
      _writeLog(`[GetKey ${labelValue}] Tài khoản ${accValue.email} hoạt động tốt. Số dư: ${resultValue.data} Credits.`, 'success');
    } else {
      if (typeValue === 'nano') {
        accValue.creditsNano = 'Die';
        accValue.statusNano = 'Lỗi / Key Die';
      } else {
        accValue.creditsKie = 'Die';
        accValue.statusKie = 'Lỗi / Key Die';
      }
      _writeLog(`[GetKey ${labelValue}] Lỗi kiểm tra API Key cho ${accValue.email}: ${resultValue.msg || 'Không rõ nguyên nhân'}`, 'error');
    }
  } catch (errValue) {
    if (typeValue === 'nano') {
      accValue.creditsNano = 'Die';
      accValue.statusNano = 'Lỗi / Key Die';
    } else {
      accValue.creditsKie = 'Die';
      accValue.statusKie = 'Lỗi / Key Die';
    }
    _writeLog(`[GetKey ${labelValue}] Lỗi mạng khi kiểm tra ${accValue.email}: ${errValue.message}`, 'error');
  }

  _renderGetKeyAccountsTable();
  _updateGetKeyStats();
}

// Lắng nghe log tự động hóa từ Main Process
if (window.electronAPI && window.electronAPI.onAutomationLog) {
  window.electronAPI.onAutomationLog((msgValue) => {
    let typeValue = 'system';
    const lowerMsgValue = msgValue.toLowerCase();
    
    if (lowerMsgValue.includes('lỗi') || lowerMsgValue.includes('thất bại') || lowerMsgValue.includes('❌') || lowerMsgValue.includes('fail') || lowerMsgValue.includes('error')) {
      typeValue = 'error';
    } else if (lowerMsgValue.includes('thành công') || lowerMsgValue.includes('✅') || lowerMsgValue.includes('success') || lowerMsgValue.includes('hoàn tất') || lowerMsgValue.includes('hoàn thành')) {
      typeValue = 'success';
    } else if (lowerMsgValue.includes('đang chạy') || lowerMsgValue.includes('đang tìm') || lowerMsgValue.includes('đang click') || lowerMsgValue.includes('⚡') || lowerMsgValue.includes('gọi lấy') || lowerMsgValue.includes('khởi chạy')) {
      typeValue = 'request';
    }
    
    _writeLog(msgValue, typeValue);
  });
}

// Kiểm tra credits hàng loạt song song
// Hết tệp app.js


