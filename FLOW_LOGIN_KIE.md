# Plan Flow Login Kie AI

Dưới đây là sơ đồ và các bước chi tiết (Flow) luồng chạy tự động hóa đăng nhập và cào API Key từ trang `kie.ai`, được phân tích từ source code `_runKieAutomation`.

## 1. Khởi tạo & Cấu hình Trình duyệt (CloakBrowser)
* **Khởi chạy tàng hình:** Sử dụng `cloakbrowser` với preset `careful` (tạo độ trễ tự nhiên khi gõ phím/di chuột) kèm thiết lập Proxy, GeoIP, Timezone, Locale. Kích thước cửa sổ 640x400.
* **Ghi đè Script (Inject):**
  * Chèn **Fake Clipboard API** (`navigator.clipboard.writeText`) để trực tiếp hứng nội dung API Key. (Tuy nhiên trên Kie AI, code ưu tiên quét trực tiếp trên giao diện thay vì bắt sự kiện Copy).
* **Nạp Cookie:** Nạp cookie `.live.com` (như `RPSSecAuth`) nếu tài khoản đã lưu phiên.

## 2. Truy cập & Mở Cửa sổ Đăng nhập
* Điều hướng tới trang chủ `https://kie.ai/`.
* Thực hiện **Evasion Warmup**: Cuộn chuột lên xuống và lượn lờ ngẫu nhiên để đánh lừa hệ thống phát hiện bot.
* Tìm nút **Login / Sign in**:
  * Quét DOM tìm thẻ chứa chữ "Login" hoặc "Sign in" và sử dụng event `click` của MouseEvent.
  * Nếu không được, dùng Playwright locator `text="Login"` làm phương án dự phòng.
* **Chọn phương thức Microsoft:** 
  * Quét trên giao diện đăng nhập tìm thẻ chứa chữ `microsoft`.
  * Click và đồng thời hứng cửa sổ `popup` mở ra để chuẩn bị cho bước xác thực.

## 3. Luồng Đăng nhập Microsoft (`_handleMicrosoftLogin`)
*(Luồng này hoàn toàn dùng chung cơ chế thông minh giống hệt bên NanoBanana)*
* **Early Path:** Cố gắng điền Email -> Password.
* **Screen Evaluator (Quét liên tục 300ms/lần):**
  * Xử lý lỗi: `error_network_proxy`, `error_too_many_attempts`, `error_invalid_credentials`, `unusual_activity` -> Bỏ qua.
  * Xử lý Captcha (ArkoseLabs): Chờ 60s.
  * Xử lý thiết lập Passkey (Màn hình hỏi tạo Passkey): Chờ người dùng tự tương tác (Cancel hoặc Tạo mới).
  * Xử lý Keep me signed in & App Access -> Tự động click Yes / Accept.
  * Xử lý Xác minh Danh tính (`protect_account` / OTP):
    1. Chọn nhận mã qua email khôi phục.
    2. Điền email khôi phục.
    3. Nhận OTP qua DongVan API hoặc Smvmail (chạy nền lấy mã tự động).
    4. Điền OTP và Submit.

## 4. Xử lý sau Đăng nhập & Đợi trang chính
* Popup Microsoft tự động đóng lại sau khi hoàn tất.
* Trình duyệt chuyển về (bringToFront) trang chính của `kie.ai`.
* Tool chờ 5 giây để trang Kie AI tải hoàn thiện sau khi được Microsoft xác thực.

## 5. Cào API Key (UUID Regex Scanner)
Khác với NanoBanana phải vào mục `/api-key` và bấm nút Copy, phương thức lấy Key của Kie AI diễn ra **ngay trên giao diện hiện tại** bằng công cụ quét (Scanner):

* Tool khởi tạo vòng lặp tối đa 20 lần (khoảng 40 giây).
* **Quét mã UUID:**
  * Tại mỗi vòng lặp, chạy biểu thức chính quy (Regex) với chuẩn: `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`.
  * Quét thẳng trên văn bản hiển thị: `document.body.innerText`.
  * Quét ngầm vào giá trị (`value`) của toàn bộ các thẻ `<input>` trên trang.
* **Kết thúc cào:**
  * Nếu phát hiện một chuỗi khớp định dạng UUID: Lập tức báo thành công, ghi đè vào file `key_kie.txt` và trả kết quả cho ứng dụng giao diện.
  * Nếu quét hết 20 vòng lặp mà không thấy Key: Tool sẽ giữ **mở trình duyệt thêm 30 giây** để người dùng kiểm tra thủ công (người dùng tự tìm key copy bằng tay).
  * Cuối cùng, trình duyệt tự động đóng lại.
