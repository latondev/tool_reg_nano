// File test API DongVan của bạn
// Bạn có thể chạy file này bằng lệnh: node test_dongvan.js

async function testDongVanAPI() {
  // DongVan API Key thật của bạn
  const apikeyValue = 'JUficfgBHbq5hD7hhQamzoRSy'; 
  
  // Email khôi phục (mail domain DongVan) cần lấy OTP
  const emailValue = 'kkzwxyymdyzy@smvmail.com'; 

  const urlValue = `https://api.dongvanfb.net/user/get_code_mail_domain?apikey=${apikeyValue}&email=${emailValue}`;
  
  console.log('--------------------------------------------------');
  console.log(`[REQUEST] Đang gửi yêu cầu tới DongVan API...`);
  console.log(`URL: ${urlValue}`);
  console.log('--------------------------------------------------');

  try {
    const responseValue = await fetch(urlValue);
    const textValue = await responseValue.text();
    console.log(`[RESPONSE] Phản hồi thô (Raw Response):`);
    console.log(textValue);
    
    try {
      const jsonValue = JSON.parse(textValue);
      console.log('\n[PARSED] Dữ liệu JSON phân tích được:');
      console.log(JSON.stringify(jsonValue, null, 2));
      
      if (jsonValue.status === true && jsonValue.code) {
        console.log(`\n✅ LẤY OTP THÀNH CÔNG! Mã OTP là: ${jsonValue.code}`);
      } else {
        console.log(`\n❌ API phản hồi thất bại hoặc chưa có mail OTP gửi tới.`);
        console.log(`Lưu ý: API DongVan sẽ báo lỗi 404 (Account not found/chưa nhận được thư) nếu bạn chưa thực hiện bấm nút "Gửi mã" từ phía Microsoft.`);
      }
    } catch (eValue) {
      console.log('\n❌ Không thể chuyển đổi phản hồi sang JSON:', eValue.message);
    }
  } catch (errValue) {
    console.error('\n❌ Lỗi kết nối mạng khi gọi API:', errValue.message);
  }
  console.log('--------------------------------------------------');
}

testDongVanAPI();
