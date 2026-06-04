const fs=require("fs"); const lines=fs.readFileSync("gui/main.js", "utf8").split("\n"); const newCode = `    // Click avatar (Hình 2)
    logCallbackValue(\\\`[NanoBanana] Tìm kiếm icon avatar ở góc trên bên phải...\\\`);
    let avatarClickedValue = false;
    for (let iValue = 0; iValue < 15; iValue++) {
      if (pageValue.isClosed()) {
        logCallbackValue(\\\`[NanoBanana] Trình duyệt đã bị đóng.\\\`);
        if (contextValue) await contextValue.close().catch(() => null);
        return;
      }

      avatarClickedValue = await pageValue.evaluate(() => {
        const buttonsValue = Array.from(document.querySelectorAll("button, a, span, div, img"));
        const avatarElValue = buttonsValue.find(b => {
          const txt = b.textContent.trim().toLowerCase();
          const alt = b.alt ? b.alt.toLowerCase() : "";
          return txt === "avatar" || alt === "avatar" || (b.querySelector && b.querySelector("img[alt=\\\"Avatar\\\"]"));
        });
        if (avatarElValue) {
          avatarElValue.click();
          return true;
        }
        return false;
      }).catch(() => false);

      if (avatarClickedValue) {
        logCallbackValue(\\\`[NanoBanana] Đã click avatar.\\\`);
        break;
      }
      await _waitForTimeout(1000);
    }

    if (!avatarClickedValue) {
      logCallbackValue(\\\`[NanoBanana] Không tìm thấy avatar. Thử đi thẳng vào Dashboard.\\\`);
      await pageValue.goto("https://nanobananaapi.ai/dashboard").catch(() => null);
    } else {
      await _waitForTimeout(1500);
      // Click Dashboard từ dropdown (Hình 3)
      logCallbackValue(\\\`[NanoBanana] Chọn "Dashboard" từ menu thả xuống...\\\`);
      const dashboardClickedValue = await pageValue.evaluate(() => {
        const elementsValue = Array.from(document.querySelectorAll("div, span, a, button"));
        const dashboardElValue = elementsValue.find(el => el.textContent.trim().toLowerCase() === "dashboard");
        if (dashboardElValue) {
          dashboardElValue.click();
          return true;
        }
        return false;
      }).catch(() => false);

      if (!dashboardClickedValue) {
        logCallbackValue(\\\`[NanoBanana] Không click được Dashboard từ menu dropdown. Điều hướng trực tiếp.\\\`);
        await pageValue.goto("https://nanobananaapi.ai/dashboard").catch(() => null);
      }
    }

    // Quan trọng: Chờ trang Dashboard load xong trước khi tìm DOM để tránh lỗi Context Destroyed!
    await pageValue.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => null);
    await _waitForTimeout(3000);

    // Click API Key từ sidebar (Hình 4)
    logCallbackValue(\\\`[NanoBanana] Đang tìm mục "API Key" ở menu trái...\\\`);
    let apiKeyTabClickedValue = false;
    for (let iValue = 0; iValue < 10; iValue++) {
      if (pageValue.isClosed()) return;
      apiKeyTabClickedValue = await pageValue.evaluate(() => {
        const elementsValue = Array.from(document.querySelectorAll("div, span, a, button"));
        const apiKeyElValue = elementsValue.find(el => el.textContent.trim().toLowerCase() === "api key");
        if (apiKeyElValue) {
          apiKeyElValue.click();
          return true;
        }
        return false;
      }).catch(() => false);

      if (apiKeyTabClickedValue) {
        logCallbackValue(\\\`[NanoBanana] Đã click tab API Key.\\\`);
        break;
      }
      await _waitForTimeout(1000);
    }

    await pageValue.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => null);
    await _waitForTimeout(2000);

    // Click copy icon (Hình 5)
    logCallbackValue(\\\`[NanoBanana] Đang tìm icon Copy trong bảng...\\\`);
    let copyClickedValue = false;
    for (let iValue = 0; iValue < 10; iValue++) {
      if (pageValue.isClosed()) return;
      copyClickedValue = await pageValue.evaluate(() => {
        const svgsValue = Array.from(document.querySelectorAll("svg"));
        let copyElValue = null;

        for (const svg of svgsValue) {
          if (svg.innerHTML.includes("M16 1H4") || svg.innerHTML.includes("M19 21H8")) {
            copyElValue = svg;
            break;
          }
        }

        if (!copyElValue) {
          const keyContainerValue = Array.from(document.querySelectorAll("td, span")).find(el => el.textContent.includes("sk-"));
          if (keyContainerValue) {
            const parentValue = keyContainerValue.parentElement;
            if (parentValue) {
              const svgValue = parentValue.querySelector("svg, button, span");
              if (svgValue) copyElValue = svgValue;
            }
          }
        }

        if (copyElValue) {
          const parentButtonValue = copyElValue.closest("button");
          if (parentButtonValue) {
            parentButtonValue.click();
          } else {
            copyElValue.click();
            copyElValue.dispatchEvent(new MouseEvent("click", { view: window, bubbles: true, cancelable: true }));
          }
          return true;
        }
        return false;
      }).catch(() => false);

      if (copyClickedValue) {
        logCallbackValue(\\\`[NanoBanana] Đã click icon Copy.\\\`);
        break;
      }
      await _waitForTimeout(1000);
    }

    if (!copyClickedValue) {
      logCallbackValue(\\\`[NanoBanana] Không tìm thấy icon Copy. Thử click trực tiếp vào svg trong bảng.\\\`);
      await pageValue.evaluate(() => {
        const tableValue = document.querySelector("table");
        if (tableValue) {
          const svgValue = tableValue.querySelector("svg");
          if (svgValue) {
            const btnValue = svgValue.closest("button") || svgValue;
            btnValue.click();
          }
        }
      }).catch(() => false);
    }

    await _waitForTimeout(2000);`; const newLines = [...lines.slice(0, 934), newCode, ...lines.slice(1028)]; fs.writeFileSync("gui/main.js", newLines.join("\n"));
