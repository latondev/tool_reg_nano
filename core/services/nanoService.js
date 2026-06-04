const fs = require('fs');
const path = require('path');

class NanoService {
  constructor() {
    // Biến private/protected bắt đầu bằng dấu gạch dưới
    this._apiKey = process.env.API_KEY || '';
    this._apiBaseUrl = 'https://api.nanobananaapi.ai/api/v1';
    this._envFilePath = path.join(__dirname, '../.env');
  }

  // Phương thức private/protected gọi API lên NanoBanana
  async _request(endpointValue, methodValue = 'GET', bodyValue = null) {
    if (!this._apiKey) {
      throw new Error('API Key chưa được cấu hình trên VPS Core. Vui lòng lưu API Key trước.');
    }

    const urlValue = `${this._apiBaseUrl}${endpointValue}`;
    const headersValue = {
      'Authorization': `Bearer ${this._apiKey}`,
      'Content-Type': 'application/json'
    };

    const optionsValue = {
      method: methodValue,
      headers: headersValue
    };

    if (bodyValue) {
      optionsValue.body = JSON.stringify(bodyValue);
    }

    const responseValue = await fetch(urlValue, optionsValue);
    const resultValue = await responseValue.json();
    return resultValue;
  }

  // Public method: Lưu API Key vào bộ nhớ và file .env
  saveApiKey(apiKeyVal) {
    this._apiKey = apiKeyVal;
    process.env.API_KEY = apiKeyVal;
    
    try {
      let envContentValue = '';
      if (fs.existsSync(this._envFilePath)) {
        envContentValue = fs.readFileSync(this._envFilePath, 'utf8');
      }

      if (envContentValue.includes('API_KEY=')) {
        envContentValue = envContentValue.replace(/API_KEY=.*/, `API_KEY=${apiKeyVal}`);
      } else {
        envContentValue += `\nAPI_KEY=${apiKeyVal}`;
      }

      fs.writeFileSync(this._envFilePath, envContentValue, 'utf8');
      return true;
    } catch (errorValue) {
      console.error('Lỗi khi ghi file .env:', errorValue);
      throw new Error('Không thể lưu API Key vào cấu hình VPS: ' + errorValue.message);
    }
  }

  // Public method: Lấy API Key hiện tại
  getApiKey() {
    return this._apiKey;
  }

  // Public method: Lấy Credit từ NanoBanana API thực tế
  async creditValue() {
    try {
      const resultValue = await this._request('/common/credit', 'GET');
      if (resultValue && resultValue.code === 200) {
        return resultValue.data; // Trả về số credit còn lại
      } else {
        throw new Error(resultValue.msg || 'Không thể lấy số dư từ NanoBanana');
      }
    } catch (errorValue) {
      throw new Error(errorValue.message);
    }
  }

  // Public method: Lấy URL đăng nhập của NanoBanana
  loginUrl() {
    return 'https://nanobananaapi.ai/api-key';
  }
}

module.exports = new NanoService();
