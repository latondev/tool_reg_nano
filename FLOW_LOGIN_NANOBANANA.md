# Plan Flow Login Nanobanana API

Dưới đây là sơ đồ và các bước chi tiết (Flow) luồng chạy tự động hóa đăng nhập Microsoft và cào API Key từ trang `nanobananaapi.ai`, được phân tích từ source code `_runNanoBananaAutomation` và `_handleMicrosoftLogin`.

## 1. Khởi tạo & Cấu hình Trình duyệt (CloakBrowser)
* **Khởi chạy tàng hình:** Sử dụng `cloakbrowser` với preset `careful` (tạo độ trễ tự nhiên khi gõ phím/di chuột) kèm thiết lập Proxy, GeoIP, Timezone, Locale.
* **Ghi đè Script (Inject):**
  * Mở khóa WebAuthn (`PublicKeyCredential`) để cho phép hiện bảng Passkey tự nhiên của Windows (vừa được cập nhật).
  * Chèn **Fake Clipboard API** (`navigator.clipboard.writeText`) để trực tiếp hứng nội dung API Key khi nút Copy được nhấn.
* **Mạng (Network Sniffer):** Lắng nghe các gói tin HTTP Response trả về từ nanobanana để bắt trực tiếp mã API (chuỗi Hex 32 ký tự hoặc `sk-...`) nhằm đảm bảo lấy được key ngay cả khi nút Copy UI bị lỗi.
* **Nạp Cookie:** Nếu account có cookie `.live.com` (như `RPSSecAuth`), tool tự động nạp thẳng vào trình duyệt.

## 2. Truy cập & Mở Cửa sổ Đăng nhập
* Điều hướng tới `https://nanobananaapi.ai/`.
* Thực hiện **Evasion Warmup**: Cuộn chuột và lượn lờ (micro-idle) ngẫu nhiên như người thật đọc web.
* Chờ DOM sẵn sàng -> Click nút **"Get Started"**.
* Nhận diện và click **"Sign in with Microsoft"**. Tool sẽ bắt lấy `popup` đăng nhập bật lên để xử lý ở bước sau.

## 3. Luồng Đăng nhập Microsoft (`_handleMicrosoftLogin`)
Đây là bước phức tạp nhất, dùng một vòng lặp `while` quét liên tục màn hình (polling 300ms/lần) để quyết định hành vi.

### Giai đoạn nhập liệu sớm (Early Path)
* **Nhập Email:** Phát hiện thẻ `loginfmt`, tự động điền email và submit.
* **Xác thực phụ:** Nếu bị hỏi "Use your password" thay vì nhập code, code sẽ tìm tọa độ nút và dùng click chuột thật để bypass event React của Microsoft.
* **Nhập Password:** Chờ ô `passwd`, di chuột lượn nhẹ, nhập pass và submit.

### Giai đoạn Quét Màn hình tự động (Screen Evaluator)
Nếu đăng nhập không thành công ngay lập tức, tool sẽ quét các điều kiện sau:

* ❌ `error_network_proxy`: Lỗi mạng/proxy chết -> Bỏ qua account.
* ❌ `error_too_many_attempts`: Bị rate-limit (quá nhiều lần sai) -> Bỏ qua account.
* ❌ `error_invalid_credentials`: Sai mật khẩu/Tài khoản không tồn tại -> Bỏ qua.
* ❌ `unusual_activity`: Bị checkpoint bắt xác minh sđt -> Bỏ qua account chống lock cứng.
* ⚠️ `captcha` (ArkoseLabs): Tạm dừng 60 giây chờ bạn tự tay kéo/giải Captcha.
* 🛠️ `setting_up_passkey_manual`: Màn hình hỏi tạo Passkey -> **Dừng lại chờ bạn bấm tay** (Cancel hoặc tạo Passkey).
* ✅ `stay_signed_in` (Duy trì đăng nhập): Bấm **Yes / Có**.
* ✅ `app_access` (Cấp quyền app): Bấm **Accept / Đồng ý**.
* 🛡️ `protect_account` (Xác minh danh tính - OTP Flow):
  1. Dùng locator chọn mục "Email" trùng với đuôi email khôi phục.
  2. Bị chuyển sang màn hình `proof_input`, tiến hành nhập `Recovery Email` và ấn "Send Code".
  3. Bị chuyển sang màn hình `otp`:
     * Thử gọi **DongVan API** để lấy mã.
     * Nếu không có mã DongVan, khởi chạy trình duyệt phụ (`Smvmail` bypass) nhảy thẳng vào Inbox, đọc text email và regex lấy ra 6 số OTP.
     * Tự động điền 6 số OTP và submit.

## 4. Xử lý sau Đăng nhập & hCaptcha
* Popup Microsoft tự động đóng lại. Tool tập trung vào trang chính NanoBanana đang redirect.
* Quét xem trang có trả về Cloudflare/hCaptcha **"I am human"** hay không:
  * Nếu có: Tự động thử click vào ô Checkbox.
  * Tạm ngưng tối đa 60 giây để chờ nếu hệ thống bắt bạn giải hình ảnh (puzzle).
* **Điều hướng:** 
  * Tìm và click icon Avatar -> click **"Dashboard"**. 
  * Nếu click hụt, ép điều hướng thủ công tới `/dashboard`.

## 5. Cào API Key (The Scraper)
* Đợi giao diện Dashboard tải xong, tìm và click vào tab **"API Key"** ở thanh menu bên trái.
* Chờ trang `/api-key` ổn định. Xóa clipboard hệ thống cho sạch.
* Quét tìm **Nút Copy** thông qua các điều kiện:
  1. Thẻ SVG có class `lucide-copy`.
  2. Các hàng `td` chứa nhiều dấu `****` che key, dò sang cột bên cạnh lấy nút bấm.
  3. Các thẻ button rỗng nhưng có thẻ `<svg>` bên trong.
* Click Copy.
* **Trích xuất (Extract):**
  1. Lấy từ biến `window.lastCopiedKeyValue` do đoạn code Fake Clipboard lưu lại.
  2. Lấy từ Clipboard thực của Windows (nếu có quyền).
  3. Lấy từ **Network Sniffer** (các gói tin json bắt được lúc vừa nãy).
* **Kết thúc:** Nếu key lấy được có định dạng >= 20 ký tự, báo thành công, ghi vào file cache `key_nano.txt` và trả sự kiện cho GUI lưu dữ liệu. Lặp lại với account tiếp theo.
