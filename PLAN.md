# ToolNanano (NanoBanana API Hub) - Project Plan & Guidance

> **Mục đích file này**: Đây là tài liệu chỉ dẫn chính cho dự án.  
> Bất kỳ AI agent hoặc developer nào làm việc với project **PHẢI đọc file này trước** để hiểu kiến trúc, luồng hoạt động và tránh phải đọc lại toàn bộ codebase mỗi lần.

---

## 1. Mục tiêu & Bản chất dự án

**Tên chính thức**: ToolNanano / NanoBanana API Hub

**Mục tiêu thực tế**:
- Xây dựng công cụ desktop tự động hóa hàng loạt việc **tạo / thu thập API Key** cho các dịch vụ AI image/API:
  - **NanoBanana** (`nanobananaapi.ai`)
  - **Kie AI** (`kie.ai`)
- Sử dụng pool tài khoản Microsoft (MS) để đăng nhập "Sign in with Microsoft".
- Tự động giải quyết 2FA (OTP) bằng cách kết hợp:
  - Smvmail.com (temp mail domain)
  - DongVan API (`api.dongvanfb.net`) để lấy code từ hộp thư.
- Hỗ trợ proxy + profile browser sạch (anti-detect) để chạy nhiều tài khoản.

**Lưu ý quan trọng**:
- Đây **không phải** là công cụ quản trị API thông thường.
- Đây là **account automation / key harvesting tool** sử dụng browser automation nặng (Playwright + stealth launcher).
- README.md hiện tại **đã lỗi thời** (mô tả phiên bản cũ chỉ có Core proxy + GUI trình duyệt đơn giản).

---

## 2. Kiến trúc tổng thể (Current Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                        Electron App (gui/)                  │
│  ┌──────────────────┐          ┌─────────────────────────┐  │
│  │   Renderer       │  IPC     │   Main Process          │  │
│  │   (app.js + html)│◄────────►│   (main.js)             │  │
│  │   - 3 Tabs UI    │          │   - CloakBrowser +      │  │
│  │   - Tables       │          │     Playwright automation│ │
│  │   - Log Console  │          │   - Microsoft login flow│  │
│  └──────────────────┘          │   - OTP harvesting      │  │
│                                │   - Key capture & cache │  │
│                                └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ (optional / legacy)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Core Backend (core/)                    │
│  - Express server (proxy)                                   │
│  - Lưu API_KEY vào .env trên VPS                            │
│  - Proxy /credit, save-key, masked key                      │
└─────────────────────────────────────────────────────────────┘
```

**Hiện tại**:
- Phần **gui/Electron** là thành phần chính và mạnh nhất.
- Phần **core/** chỉ còn vai trò phụ (có thể coi là legacy hoặc dùng cho trường hợp muốn che key trên VPS).

---

## 3. Cấu trúc thư mục (Chỉ source quan trọng)

```
ToolNanano/
├── PLAN.md                     ← File bạn đang đọc (luôn đọc trước)
├── README.md                   ← Cũ, cần cập nhật
│
├── core/                       ← Backend proxy (đơn giản)
│   ├── .env                    ← PORT + API_KEY (quan trọng)
│   ├── package.json
│   ├── server.js               ← Express routes
│   └── services/nanoService.js ← Logic gọi API thật + persist .env
│
├── gui/                        ← Electron App (phần chính)
│   ├── main.js                 ← ★ QUAN TRỌNG NHẤT: Toàn bộ automation logic
│   ├── preload.js              ← IPC bridge
│   ├── app.js                  ← ★ UI logic + 3 tab controllers
│   ├── index.html              ← Layout + tabs
│   ├── styles.css              ← Glassmorphism premium
│   ├── package.json            ← electron, cloakbrowser, playwright-core
│   │
│   ├── data/                   ← Dữ liệu người dùng
│   │   └── order_*.txt         ← Danh sách tài khoản (email|pass|cookie|uuid|recovery)
│   │                             (key_nano.txt và key_kie.txt được tạo runtime)
│   │
│   └── test_smvmail.js         ← Test script
│
├── test_dongvan.js             ← Test DongVan OTP API
├── test_smvmail.js             ← Test smvmail automation
│
└── .profiles/                  ← RUNTIME ARTIFACT (không commit)
    └── profile_*               ← Chromium user data dirs (tự động tạo/xóa)
```

**Lưu ý**:
- Không có `.gitignore` ở thời điểm đọc.
- `.profiles/` rất lớn, chứa toàn bộ browser profile, cache, cookies từ các lần chạy.

---

## 4. Chi tiết các file quan trọng

### 4.1 core/server.js + nanoService.js
- Server Express đơn giản.
- Middleware log request.
- 5 API chính (xem chi tiết trong code).
- `nanoService`:
  - Đọc `API_KEY` từ `process.env` hoặc `.env`.
  - `saveApiKey()`: Ghi đè vào file `.env`.
  - `creditValue()`: Gọi thật `https://api.nanobananaapi.ai/api/v1/common/credit`.
  - `loginUrl()`: Hardcode `https://nanobananaapi.ai/api-key`.

### 4.2 gui/main.js (Core Automation - ~1318 dòng)
Đây là file phức tạp nhất.

**Các hàm then chốt**:
- `_parseProxy()`: Hỗ trợ http/socks5 + auth, IPv6.
- `_clearOldProfiles()`: Xóa toàn bộ `.profiles/`.
- `_saveKeyToCache(email, key, site)`: Ghi `data/key_nano.txt` hoặc `key_kie.txt`.
- `_getOtpFromSmvmail(email, logCb)`: 
  - Mở profile riêng → smvmail inbox → retry + click mail Microsoft → chuyển tab Text → regex 6 số.
- `_handleMicrosoftLogin(page, account, logCb)`: 
  - Full flow: email → pass → Stay signed in → chọn recovery email → nhập OTP (gọi `_getOtpFromSmvmail`) → verify.
- `_runNanoBananaAutomation(...)`: 
  - Launch cloakbrowser → goto nanobananaapi.ai → Get Started → Sign in with Microsoft → sau login đi dashboard → API Key → hack clipboard hoặc scan UUID → save + IPC.
- `_runKieAutomation(...)`: Tương tự nhưng flow UI của kie.ai khác (click Login, scan UUID trực tiếp trên page).
- `ipcMain.handle('login-with-mc-cookie', ...)`: Entry point từ renderer. Có chế độ Guest (mở browser sạch).

**IPC quan trọng** (dòng ~1157 trở đi):
- `login-with-mc-cookie`
- `read-accounts-data`
- `read-cached-keys`
- `get-dongvan-otp`

### 4.3 gui/preload.js
- `contextBridge.exposeInMainWorld('electronAPI', { ... })`
- Các hàm: `loginWithMCCookie`, `onApiKeyDetected`, `readAccountsData`, `readCachedKeys`, `getDongVanOtp`, `onAutomationLog`.

### 4.4 gui/app.js (Renderer - ~1032 dòng)
Quản lý 3 tab:

1. **nanobanana-tab** (đơn giản):
   - Mở login URL.
   - Nhập key + Get Credit (gọi trực tiếp API + `_animateNumber`).

2. **kie-ai-tab**:
   - Import textarea (email|pass|...).
   - Bảng tài khoản, nút Login (gọi IPC), ô nhập key, nút Check credit.
   - Bulk Check All.

3. **getkey-tab** (tab mạnh nhất):
   - 2 textarea: accounts + proxies.
   - Global DongVan key.
   - Select site (nanobanana / kie).
   - Nút "Login" → parse + chạy batch tuần tự (await từng cái).
   - Nút "Get OTP" riêng lẻ.
   - Nút "Tải từ Data" (gọi IPC read-accounts-data).
   - Bảng hiển thị Nano + Kie key riêng, 2 cột credit, stats.
   - Tự động cập nhật từ `onApiKeyDetected`.

**Log listener**: Nhận log từ main → phân loại type (request/success/error/system) → render vào console.

### 4.5 gui/index.html + styles.css
- Thiết kế glassmorphism hiện đại (Outfit font, backdrop-filter, glowing orbs, neon accents).
- 3 tab + bulk stats cards + bảng + console footer.
- Rất nhiều class như `.glass-card`, `.btn-purple`, `.cookie-status-badge`, v.v.

---

## 5. Luồng hoạt động chính (Key Harvesting)

1. User chuẩn bị danh sách acc (thường lấy từ file order_*.txt).
2. (Tab GetKey) Dán acc + proxy + DongVan key → chọn site → nhấn Login.
3. `app.js` gọi `window.electronAPI.loginWithMCCookie(acc, proxy, site)`.
4. Main nhận → `_clearOldProfiles()` → launch `cloakbrowser` (persistent context, humanize, proxy).
5. Nếu có cookie → nạp `RPSSecAuth`.
6. Tự động click đến "Sign in with Microsoft".
7. `_handleMicrosoftLogin`:
   - Điền email/pass.
   - Xử lý các màn hình giữa (Stay signed in, chọn recovery email).
   - Khi cần OTP → gọi `_getOtpFromSmvmail` (mở browser riêng smvmail).
8. Sau khi login thành công trên target site:
   - Điều hướng đến trang API Key.
   - Override `navigator.clipboard.writeText` hoặc quét regex UUID.
9. Gọi `_saveKeyToCache` + `event.sender.send('api-key-detected', ...)`.
10. Renderer nhận → cập nhật bảng + tự động check credit.

**Cache**:
- `data/key_nano.txt`: `email|key`
- `data/key_kie.txt`: tương tự
- Được load khi khởi động tab GetKey và sau mỗi lần chạy.

---

## 6. Tech Stack & Thư viện quan trọng

- **GUI**: Electron 30, HTML/CSS/JS thuần (không framework).
- **Automation**:
  - `cloakbrowser` (stealth launcher quan trọng).
  - `playwright-core` (persistent context, locator, evaluate, keyboard.type...).
- **Core**: Node.js + Express + dotenv + native `fetch`.
- **OTP**: DongVan API (bên thứ 3) + smvmail.com.
- **Khác**: fs/path, IPC, contextBridge.

**Đặc điểm kỹ thuật nổi bật**:
- Rất nhiều `page.evaluate()` + DOM query + click thủ công (vì page có thể thay đổi).
- Kết hợp native Playwright click + synthetic MouseEvent.
- Timing nhạy cảm (nhiều `await _waitForTimeout(...)`).
- Profile isolation triệt để.

---

## 7. Trạng thái hiện tại (Important Notes)

| Vấn đề                    | Mô tả |
|---------------------------|-------|
| README.md                 | Cũ, mô tả kiến trúc browser + VPS. Cần viết lại hoặc note rõ "xem PLAN.md". |
| Core backend              | Vẫn hoạt động nhưng GUI ít dùng (gọi trực tiếp API + automation local). |
| .profiles/                | Tạo rất nhiều, code đã có logic dọn nhưng vẫn nên xóa thủ công khi cần. |
| data/                     | Chỉ chứa file order mẫu. Key cache được tạo runtime. |
| .env                      | Chỉ ở core/. Không có gui/.env. |
| .gitignore                | Chưa có (cần thêm node_modules, .profiles, *.log, data/key_*.txt ?). |

---

## 8. Cách chạy (Updated)

### Chạy GUI (chính)
```bash
cd gui
npm install          # nếu chưa
npm start            # electron .
```

### Build Windows
```bash
npm run package-win
```

### Chạy Core (nếu cần)
```bash
cd core
npm install
npm start
# Server chạy tại http://localhost:3000
```

**Lưu ý khi chạy**:
- Cần có tài khoản Microsoft + recovery email @smvmail.com.
- Cần DongVan API key để lấy OTP tự động.
- Nên dùng proxy riêng cho từng acc để tránh rate limit / block.

---

## 9. Hướng dẫn cho AI Agent / Developer (BẮT BUỘC)

**Quy tắc làm việc**:
1. **Luôn đọc `PLAN.md` trước** khi bắt đầu bất kỳ task nào.
2. Khi cần hiểu logic automation → đọc `gui/main.js` (đặc biệt các hàm có tiền tố `_run`, `_handleMicrosoft`, `_getOtp`).
3. Khi cần sửa UI / bảng / tab → đọc `gui/app.js` + `index.html` + `styles.css`.
4. Khi cần thêm site mới → copy pattern từ `_runNanoBananaAutomation` / `_runKieAutomation`.
5. Khi debug OTP → đọc `gui/test_smvmail.js` + hàm `_getOtpFromSmvmail`.
6. Khi thêm tính năng cache / data → xem `ipcMain.handle('read-accounts-data')` và `_saveKeyToCache`.
7. Tránh sửa trực tiếp trong `.profiles/` hoặc data/key_*.txt (chúng là output).

**Các file nên đọc khi**:
- Thêm tính năng mới: `PLAN.md` + `gui/main.js` + `gui/app.js`
- Sửa bug login MS: `gui/main.js` (_handleMicrosoftLogin + _getOtpFromSmvmail)
- Thay đổi UI: `gui/app.js` + `gui/index.html` + `gui/styles.css`
- Thay đổi cách lưu key: `gui/main.js` (_saveKeyToCache) + IPC
- Làm việc với Core: `core/server.js` + `core/services/nanoService.js`

---

## 10. Known Gotchas / Rủi ro

- **Timing**: Nhiều bước cần delay chính xác (4s retry, 2s chờ mail...). Dễ bị race condition nếu thay đổi.
- **Selector fragility**: Code dùng rất nhiều `textContent.includes('dashboard')`, `evaluate` query DOM. Dễ hỏng khi site thay đổi UI.
- **Clipboard hack**: Override `navigator.clipboard.writeText` chỉ hoạt động trong context của page.
- **Profile lock**: Nhiều lần close browser vẫn để lại file lock → cần `_clearOldProfiles()` + delay.
- **DongVan dependency**: Nếu DongVan die hoặc thay đổi API → toàn bộ luồng OTP hỏng.
- **Legal / ToS**: Công cụ này tự động hóa đăng nhập hàng loạt → có thể vi phạm ToS của NanoBanana / Kie / Microsoft.
- **Fingerprint / MS spam**: Dù có cloakbrowser + humanize + proxy, vẫn có rủi ro bị detect nếu chạy quá nhiều. (2025-06 update: thêm humanPreset:'careful', geoip:true khi có proxy, warmup human actions trên landing page, mở rộng detect 'unusual_activity' + clean skip, micro idles quanh fill/click/OTP, backoff dài hơn trên fail. Xem gui/main.js các helper _humanMicroIdle + launch sites + _handleMicrosoftLogin screenInfo).

---

## 11. Ý tưởng cải tiến (nếu cần phát triển tiếp)

- Thêm database (SQLite / better cache thay vì txt).
- Hỗ trợ nhiều site hơn (dễ mở rộng pattern).
- Cải thiện error handling + retry policy rõ ràng hơn.
- Thêm config file riêng (thay hardcode URL, selector).
- Tách automation thành module riêng (không để hết trong main.js).
- Thêm GUI cho quản lý proxy pool, account health.
- Logging tốt hơn + export report.
- Cập nhật README + thêm .gitignore chuẩn.

---

## 12. Tóm tắt nhanh (TL;DR cho AI)

- **Core của project** = `gui/main.js` (automation) + `gui/app.js` (UI điều khiển).
- **Luồng chính** = MS login (có OTP từ smvmail + DongVan) → target site → capture key → cache txt → IPC → UI.
- **Luôn đọc PLAN.md trước**.
- README cũ → ưu tiên PLAN.md.
- Code automation rất dài, nhiều hack DOM + timing.

---

**Cập nhật lần cuối**: Sau khi đọc toàn bộ source (core + gui + tests + data mẫu).

Nếu bạn thay đổi lớn (thêm site, refactor automation, thay cache mechanism...), hãy cập nhật file PLAN.md này để giữ ngữ cảnh cho các session sau.
