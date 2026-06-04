// Script test tự động hóa lấy OTP từ SMVMail.com - Bản click input tab Text và lấy code
const path = require('path');
const fs = require('fs');

async function testSmvmail() {
  const emailValue = 'kkzwxyymdyzy@smvmail.com';
  const userDataDirValue = path.join(__dirname, '.profiles', 'profile_test_otp_' + Date.now());

  console.log('Khởi chạy trình duyệt...');
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
    pageValue.setDefaultNavigationTimeout(45000);

    const directInboxUrl = `https://smvmail.com/email/inbox?email=${encodeURIComponent(emailValue)}`;
    console.log(`Đi thẳng tới URL Inbox: ${directInboxUrl}`);
    await pageValue.goto(directInboxUrl, { waitUntil: 'commit' });

    console.log('Chờ tải trang inbox...');
    await pageValue.waitForSelector('input[placeholder*="Search mail"]', { timeout: 20000 });
    await pageValue.waitForTimeout(3000);

    const firstMailSelector = 'a:has(h3:has-text("Your single-use code")), a:has(h3:has-text("code")), a:has(h3:has-text("Microsoft"))';
    const mailCount = await pageValue.locator(firstMailSelector).count().catch(() => 0);

    if (mailCount > 0) {
      console.log(`Tìm thấy ${mailCount} thư. Click thư đầu tiên...`);
      await pageValue.locator(firstMailSelector).first().click();
      
      console.log('Chờ trang chi tiết thư tải...');
      // Chờ cho tiêu đề thư hoặc email xuất hiện để biết đã tải xong
      await pageValue.waitForSelector('h2:has-text("Your single-use code")', { timeout: 10000 });
      await pageValue.waitForTimeout(2000);

      // Click tab Text bằng cách click thẻ input có aria-label="Text"
      const textTabSelector = 'input[aria-label="Text"]';
      const hasTextTab = await pageValue.locator(textTabSelector).count().catch(() => 0);

      if (hasTextTab > 0) {
        console.log('Tìm thấy tab Text (input[aria-label="Text"]). Click chọn...');
        await pageValue.click(textTabSelector);
        await pageValue.waitForTimeout(1000);

        // Lấy nội dung text trong div kế tiếp của input[aria-label="Text"]
        const textBody = await pageValue.locator('input[aria-label="Text"] + div').innerText().catch(() => '');
        console.log('Nội dung Text thu được:\n', textBody);

        const matchValue = textBody.match(/single-use code is:\s*(\d{6})/i) || 
                           textBody.match(/code is:\s*(\d{6})/i) || 
                           textBody.match(/\b(\d{6})\b/);

        if (matchValue) {
          console.log(`✅ LẤY ĐƯỢC OTP THÀNH CÔNG: ${matchValue[1]}`);
        } else {
          console.log('❌ Không tìm thấy OTP 6 số.');
        }
      } else {
        console.log('❌ Không thấy tab Text.');
      }

    } else {
      console.log('Không tìm thấy thư nào để click.');
    }

  } catch (errValue) {
    console.error('Lỗi khi chạy test:', errValue.message);
  } finally {
    if (contextValue) {
      console.log('Đóng trình duyệt...');
      await contextValue.close();
    }
    if (fs.existsSync(userDataDirValue)) {
      try { fs.rmSync(userDataDirValue, { recursive: true, force: true }); } catch (e) {}
    }
  }
}

testSmvmail();
