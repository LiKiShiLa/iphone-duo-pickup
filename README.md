# iPhone Duo 取貨雷達 — GitHub + Render 部署版（v1.2.0）

這是 v1.2 版，修正 Apple 於 2026/10/22 回傳 `pickupDisplay: "default"`（官方提示 10/23 才能查看庫存）的情況，不再誤當查詢錯誤或缺貨。Node.js 20+、不需要第三方 npm 套件。前端與 API 都由同一個 Node.js 網站提供，不用另外設定 GitHub Pages。

## 1. 上傳 GitHub

1. 登入 https://github.com ，點右上角「+」→「New repository」。
2. Repository name 可填 `iphone-duo-pickup-radar`，選 Public 或 Private。
3. 建立後按「Add file」→「Upload files」。
4. **先解壓縮 ZIP**，將此資料夾內的 `server.js`、`package.json`、`render.yaml`、`public/`、`tests/` 等**內容本身**上傳。注意：不要只上傳 ZIP，也不要多包一層資料夾。`package.json` 必須位於儲存庫根目錄。
5. 按「Commit changes」。

## 2. 透過 Render 上線

1. 登入 https://dashboard.render.com/ 並連結 GitHub 帳號。
2. 按「New」→「Web Service」，選擇剛建立的 GitHub repository。
3. 設定：
   - Language/Runtime：Node
   - Build Command：`npm install --omit=dev`
   - Start Command：`npm start`
   - Instance Type：Free（如果你選擇使用免費方案）
   - Environment Variable：`HOST` = `0.0.0.0`
   - Health Check Path（可選）：`/health`
   - Root Directory：留空
4. 按「Deploy Web Service」，完成後會出現 `https://你的服務名稱.onrender.com` 網址。每次推送 GitHub 更新後，Render 可自動重新部署。

也可以在 Render 新增 Blueprint（讀取本專案 `render.yaml`）。

## 3. 查詢與通知限制

- 瀏覽器開啟網站時，預設每 2 分鐘查一次 Apple 的非公開取貨介面；不保證蘋果會允許雲端伺服器存取。若遭封鎖，網站會顯示無法確認而非缺貨。
- 網站的通知與聲音僅在頁面開啟且有瀏覽器權限時生效。Render 的免費 Web Service 閒置約 15 分鐘會休眠，下次存取時需喚醒。**部署完成不等於全天候背景監控／關閉手機網頁後持續通知。**
- 已使用共用快取降低 Apple 查詢次數。是否能取貨以 Apple 官方結帳頁面為準。
- **請勿啟用 GitHub Pages 當作這份程式的唯一主機**，因為靜態網站無法執行 `/api/check` Node.js 服務。
- 本專案不是 Apple 官方網站，沒有自動結帳或預訂功能。

## 本地測試

```bash
npm test
npm start
```

打開 http://localhost:3000 ，或取得 `GET /health` 確認執行。

## v1.2 更新（已有 GitHub + Render 網站）

1. 上傳這份更新檔案到現有 GitHub repository 的根目錄（不要再建立新的 Repository）。
2. GitHub 上的 `server.js`、`public/app.js`、`public/style.css`、`public/index.html`、`tests/parser.test.js`、`package.json` 需要更新；其餘維持不變即可。
3. 上傳後按 **Commit changes**，Render 若已開啟 Auto-Deploy，通常會自動發布新版本。
4. 在 Render 確認新的 Deploy 狀態為 **Live**，重新整理網站，頁尾應顯示 `DUORADAR v1.2`。
5. 開啟 `/api/check`：若 Apple 仍回覆預售狀態，會顯示 `ok: true` 和 `status: "awaiting"`。這代表已成功讀到官方提醒，但 **不代表有貨或缺貨**。

注意：無法從本環境直接連線到 Render 執行中的伺服器做端對端實測。這次修正以 Apple 官方回應的實際欄位為依據，並用模擬回應驗證。
