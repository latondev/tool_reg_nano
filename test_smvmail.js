// Script test tự động hóa lấy OTP từ SMVMail.com
// Chạy bằng: node test_smvmail.js

const path = require('path');
const fs = require('fs');

async function testSmvmail() {
  const emailValue = 'kkzwxyymdyzy@smvmail.com'; // Email test
  const userDataDirValue = path.join(__dirname, '.profiles', 'profile_test_otp_' + Date.now());

  console.log('Khởi chạy trình duyệt test...');
  let contextValue;
  try {
    const { launchPersistentContext } = await import('cloakbrowser');
    contextValue = await launchPersistentContext({
      userDataDir: userDataDirValue,
      headless: false,
      humanize: true,
      geoip: false,
      viewport: { width: 800, height: 600 },
      args: ['--window-size=800,600']
    });

    const pageValue = await contextValue.newPage();
    pageValue.setDefaultNavigationTimeout(30000);

    console.log('Đi tới smvmail.com...');
    await pageValue.goto('https://smvmail.com', { waitUntil: 'domcontentloaded' });
    await pageValue.waitForTimeout(3000);

    console.log(`Điền email: ${emailValue}`);
    // Tìm ô nhập email bằng placeholder
    await pageValue.fill('input[placeholder*="Email address"]', emailValue);
    await pageValue.waitForTimeout(1000);

    console.log('Click View inbox...');
    await pageValue.click('button:has-text("View inbox")');
    await pageValue.waitForTimeout(5000);

    // Chờ và click thư đầu tiên chứa mã xác minh Microsoft
    console.log('Đang chờ thư...');
    let otpCodeValue = null;

    for (let iValue = 0; iValue < 10; iValue++) {
      console.log(`Kiểm tra thư lần ${iValue + 1}...`);
      
      // Click nút retry để cập nhật thư mới nhất
      await pageValue.evaluate(() => {
        const retryBtn = Array.from(document.querySelectorAll('button')).find(btn => {
          const svg = btn.querySelector('svg');
          // Nút retry thường là nút không có chữ, chỉ có svg và nằm cạnh Search mail...
          return svg && btn.textContent.trim() === '';
        });
        if (retryBtn) {
          retryBtn.click();
          return true;
        }
        return false;
      });
      await pageValue.waitForTimeout(3000);

      // Thử tìm và click vào thư
      const clickedValue = await pageValue.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('div, td, tr, p, span, a')).filter(el => {
          const txt = el.textContent.toLowerCase();
          return txt.includes('your single-use code') || txt.includes('single-use code') || txt.includes('account-security-noreply');
        });
        if (rows.length > 0) {
          const target = rows[0].closest('tr, div[role="button"], a') || rows[0];
          target.click();
          return true;
        }
        return false;
      });

      if (clickedValue) {
        console.log('Đã click vào thư!');
        await pageValue.waitForTimeout(2000);

        // Click chuyển sang tab Text
        console.log('Chuyển sang tab Text...');
        const tabClickedValue = await pageValue.evaluate(() => {
          const tabs = Array.from(document.querySelectorAll('button, div, span, a')).filter(el => el.textContent.trim() === 'Text');
          if (tabs.length > 0) {
            tabs[0].click();
            return true;
          }
          return false;
        });

        if (tabClickedValue) {
          await pageValue.waitForTimeout(1000);
        }

        // Lấy nội dung text để trích xuất OTP
        const bodyTextValue = await pageValue.evaluate(() => document.body.innerText);
        console.log('Nội dung thư:\n', bodyTextValue);

        // Regex tìm mã OTP 6 số
        const matchValue = bodyTextValue.match(/single-use code is:\s*(\d{6})/i) || 
                           bodyTextValue.match(/code is:\s*(\d{6})/i) || 
                           bodyTextValue.match(/\b(\d{6})\b/);

        if (matchValue) {
          otpCodeValue = matchValue[1];
          console.log(`✅ LẤY ĐƯỢC OTP THÀNH CÔNG: ${otpCodeValue}`);
          break;
        } else {
          console.log('❌ Không tìm thấy mã OTP 6 số trong nội dung thư.');
        }
      }

      await pageValue.waitForTimeout(3000);
    }

    if (otpCodeValue) {
      console.log(`Mã OTP cuối cùng: ${otpCodeValue}`);
    } else {
      console.log('❌ Không lấy được OTP sau 10 lần thử.');
    }

  } catch (errValue) {
    console.error('Lỗi khi chạy test:', errValue.message);
  } finally {
    if (contextValue) {
      console.log('Đóng trình duyệt test...');
      await contextValue.close();
    }
    // Dọn dẹp profile test
    if (fs.existsSync(userDataDirValue)) {
      try {
        fs.rmSync(userDataDirValue, { recursive: true, force: true });
      } catch (e) {}
    }
  }
}

testSmvmail();
