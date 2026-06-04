const { contextBridge, ipcRenderer } = require('electron');

// Phơi bày kênh giao tiếp an toàn qua contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  loginWithMCCookie: (accountValue, proxyValue, siteValue) => {
    return ipcRenderer.invoke('login-with-mc-cookie', { account: accountValue, proxy: proxyValue, site: siteValue });
  },
  onApiKeyDetected: (callbackValue) => {
    ipcRenderer.on('api-key-detected', (eventValue, dataValue) => callbackValue(dataValue.email, dataValue.apiKey, dataValue.site));
  },
  readAccountsData: () => ipcRenderer.invoke('read-accounts-data'),
  readCachedKeys: () => ipcRenderer.invoke('read-cached-keys'),
  getDongVanOtp: (apikeyValue, emailValue) => ipcRenderer.invoke('get-dongvan-otp', { apikey: apikeyValue, email: emailValue }),
  onAutomationLog: (callbackValue) => {
    ipcRenderer.on('automation-log', (eventValue, msgValue) => callbackValue(msgValue));
  }
});

