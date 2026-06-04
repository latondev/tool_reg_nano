require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nanoService = require('./services/nanoService');

const app = express();
const portValue = process.env.PORT || 3000;

// Cấu hình Middleware
app.use(cors());
app.use(express.json());

// Logger Middleware để giám sát các request từ GUI lên VPS
app.use((req, res, next) => {
  const timeValue = new Date().toLocaleTimeString();
  console.log(`[${timeValue}] Core API <- ${req.method} ${req.url}`);
  next();
});

// 1. API: Kiểm tra trạng thái kết nối và cấu hình VPS Core
app.get('/api/status', (req, res) => {
  const hasKeyValue = !!nanoService.getApiKey();
  res.json({
    status: 'online',
    hasKey: hasKeyValue,
    message: hasKeyValue ? 'VPS đã sẵn sàng và có API Key.' : 'VPS đã kết nối nhưng chưa cấu hình API Key.'
  });
});

// 2. API: Lấy URL để mở trình duyệt đăng nhập
app.get('/api/login-url', (req, res) => {
  const urlValue = nanoService.loginUrl();
  res.json({
    url: urlValue,
    message: 'Chuyển hướng đến trang quản lý API Key của NanoBanana để đăng nhập.'
  });
});

// 3. API: Lưu API Key mới vào cấu hình VPS
app.post('/api/save-key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || apiKey.trim() === '') {
    return res.status(400).json({ error: 'API Key không hợp lệ.' });
  }

  try {
    nanoService.saveApiKey(apiKey.trim());
    res.json({
      success: true,
      message: 'API Key đã được lưu bảo mật vào cấu hình VPS Core thành công!'
    });
  } catch (errorValue) {
    res.status(500).json({ error: errorValue.message });
  }
});

// 4. API: Lấy API Key hiện tại (trả về dạng che mờ để bảo mật)
app.get('/api/apikey', (req, res) => {
  const keyValue = nanoService.getApiKey();
  if (!keyValue) {
    return res.status(404).json({ error: 'Chưa cấu hình API Key trên VPS Core.' });
  }

  // Che mờ API Key (Ví dụ: nano_ab...xyz)
  let maskedKeyValue = '••••••••••••••••';
  if (keyValue.length > 8) {
    maskedKeyValue = `${keyValue.substring(0, 6)}••••••••${keyValue.substring(keyValue.length - 4)}`;
  }

  res.json({
    apiKey: maskedKeyValue,
    rawKey: keyValue // Trả về rawKey để GUI có thể lấy copy nếu cần
  });
});

// 5. API: Lấy Credit số dư tài khoản từ API thật của NanoBanana
app.get('/api/credit', async (req, res) => {
  try {
    const creditsValue = await nanoService.creditValue();
    res.json({
      success: true,
      credits: creditsValue,
      message: 'Lấy số dư tài khoản thành công.'
    });
  } catch (errorValue) {
    res.status(500).json({ error: errorValue.message });
  }
});

// Khởi chạy server
app.listen(portValue, () => {
  console.log('===================================================');
  console.log(`🚀 NanoBanana Core API Server đang chạy tại:`);
  console.log(`👉 http://localhost:${portValue}`);
  console.log(`⚙️  Sẵn sàng nhận request từ GUI client.`);
  console.log('===================================================');
});
