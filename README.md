# 日常記帳 Bookkeeper

Vue 3 + Vite 前端、Express 後端、SQLite 資料庫。沿用手機線稿的每日記帳與月／年統計，資料會真正寫入本機 `.db`，重新整理或重新啟動後仍保留。

## 本機開發

使用 Node.js 24.12 以上（建議 Node 24 LTS）與 npm。在專案根目錄執行：

```sh
cd /Users/jeffchuangmbp2024/Desktop/Projects/bookkeeper
npm ci
npm run dev
```

如果使用 nvm，可以先執行 `nvm install`、`nvm use`，讀取專案的 `.nvmrc`。

開啟 **http://127.0.0.1:5173**。前端使用 5173 埠，後端使用 3001 埠；前端透過 Vite 代理 `/api`，不需另外設定 CORS。終端機按 `Ctrl+C` 同時停止兩個服務。

第一次啟動後端會建立 `database/bookkeeper.db`，執行 `database/schema.sql` 與 `database/init.sql`，加入 ID 1～8 的類別。已有資料庫不會重建或清空。沒有內建假資料；Fortune City CSV 需透過「匯入匯出」選檔並確認後才寫入。

也可使用兩個終端機，分別執行：

```sh
npm run dev:backend
npm run dev:frontend
```

## 手動測試流程

1. 首頁顯示今天，按「新增花費」，輸入整數金額、說明、選擇類別後儲存。
2. 確認彈窗關閉，明細與合計更新；重新整理，確認資料仍存在。
3. 點日期開啟日曆，選昨天並新增紀錄；左右滑動或按箭頭切換日期。
4. 切換「統計」：檢查本月圓餅圖、分類加總；點色塊切換為該分類筆數與金額，再點相同色塊恢復全類別加總。
5. 點分類加總開啟明細，重複點金額或日期排序按鈕，確認升冪／降冪交替。
6. 切換年統計，左右滑動或按箭頭切換年月。
7. 回每日明細，按垃圾桶。先取消確認資料仍在，再確認刪除，檢查統計同步更新。
8. 停止、重新啟動服務，確認未刪除的資料仍保留。

## 匯入與匯出

底部導覽由左至右為「統計／每日明細／匯入匯出」，預設首頁仍為每日明細。匯入匯出頁面上方切換「匯入」與「匯出」。

### Fortune City 匯入

1. 選擇來源「Fortune City（記帳城市）」，選取 CSV，按「預覽匯入內容」。
2. 查看可匯入筆數、總金額、日期範圍、略過筆數及前三筆花費。
3. 按「匯入」，檢查確認彈窗，再按「確認匯入」。預覽不會寫入資料庫。

欄位對應：

| CSV 欄位 | 處理方式 |
| --- | --- |
| `Account`、`Account ID` | 完全忽略，不需要提供 |
| `Category` | 以 `categories.name` 對應資料庫 ID，只接受 `init.sql` 的食物、飲品、交通、消費、娛樂、3C、醫藥、其他；收入與其他名稱略過 |
| `Amount` | 正整數 TWD，保留整數元；`80.00` 可接受，非零小數不接受 |
| `Currency` | 目前只接受 TWD |
| `Recorded At` | 接受 `YYYY/MM/DD HH:mm` 或含秒格式，按 UTC+8 轉為 Unix 毫秒；嚴格檢查日期有效性 |
| `note` | 保留原文、逗號、引號、空白與換行 |

- 檔案需為 UTF-8 CSV，可含 BOM；最大 5 MB、50,000 筆，單筆 CSV 大小最多 64 KiB。
- 符合類別的資料若有金額、幣別或日期錯誤，整批停止，顯示前 20 個錯誤與資料筆數。修正後重新選檔，不會部分寫入。
- 確認時重新解析及驗證，`import_batches` 與所有 `expenses` 使用同一個 transaction；任何寫入失敗都會回復。
- 以來源和原始檔案 SHA-256 阻擋相同檔案重複匯入（改檔名也不會重複匯入）。不同檔案即使內容有重疊，仍會新增，不會猜測哪些是重複消費。
- `import_batches.source` 使用 `fortune-city` 或 `bookkeeper`；略過筆數僅供預覽顯示，沒有新增資料庫欄位。
- `source_row_number` 是不含標題列的 CSV 邏輯資料筆數，欄位內換行不會被算成新的一筆。

### CSV 匯出與再次匯入

1. 切換「匯出」，選擇全部紀錄、本月或自訂日期；自訂範圍含起訖當天，按台北時間計算。
2. 確認筆數與總額，按「匯出 CSV」，在瀏覽器的下載項目取得檔案。
3. 若要還原到另一個資料庫，選擇來源「日常記帳（本 app 匯出的 CSV）」再匯入。

輸出欄位為 `Recorded At,Category,Amount,Currency,note`，UTF-8 BOM，使用標準 CSV 引號與換行處理。日期依時間與 ID 由舊到新排列；例如 `recorded_at_ms = 1793619300000` 會輸出 `2026-11-02T19:35:00.000+08:00`。毫秒精度保留，UTC+8 時區不受主機時區影響。

本 app 的匯入日期必須包含 ISO 8601 時區，例如 `+08:00` 或 `Z`。匯出／再次匯入保留花費的類別、金額、幣別、原記帳時間與說明；資料庫流水號與建立／更新時間會重新產生，因此 CSV 是花費紀錄匯出，不是 SQLite 檔案備份。重新匯入到原資料庫會新增紀錄，請使用空白資料庫驗證還原流程。

## 建置與正式模式本機預覽

先停止開發服務，再執行：

```sh
npm run build
npm start
```

開啟 **http://127.0.0.1:3001**。後端同時提供打包後的前端與 API，此模式只需一個 Node 程序，不需執行 Vite 開發伺服器。前端可在本機打包，再將 `frontend/dist` 部署至 VPS。

目前是單人版，沒有 app 內建登入頁面；服務只監聽 `127.0.0.1`。VPS 部署透過 Caddy HTTPS 與 Basic Auth 保護網站及 API。完整的 GitHub Actions、VPS 首次設定與備份步驟見 [部署說明](deploy/README.md)。部署設定已備妥，尚未連線至你的 VPS 執行。

## 資料與設定

- 類別依 `init.sql` 使用固定 ID，資料處理與時間填入由程式負責，不修改既有 schema。
- 金額以整數 TWD 儲存，單筆範圍為 1～1,000,000,000 元。沒有收入與帳戶功能。
- `recorded_at_ms`、`created_at_ms`、`updated_at_ms` 都是 Unix timestamp 毫秒。
- 畫面顯示、每日分組、月／年統計固定使用 `Asia/Taipei`，不受伺服器時區影響。時區切換 UI 尚未實作。
- 今日新增使用實際時間；補記過去日期使用該日台北時間 12:00，因目前表單沒有時間欄位。CSV 匯入保留來源的實際時間。
- 刪除會永久移除該筆紀錄，畫面會先要求確認。
- `.db`、WAL／SHM、`node_modules` 與 `dist` 均已加入 `.gitignore`。
- `DB_PATH` 可指定另一個 SQLite 檔案；相對路徑以專案根目錄為基準。例如 `DB_PATH=/tmp/bookkeeper-demo.db npm run dev`。不會動到其他專案的 SQLite。
- `PORT` 可改後端埠，預設 3001。開發時如更改，請同步修改 `frontend/vite.config.js` 的代理目標。
- 備份方式：先正常停止後端，再複製 `database/bookkeeper.db`；服務執行中不要只複製 `.db` 而漏掉 WAL，可改用 SQLite 的 `.backup` 指令。

## 自動驗證

```sh
npm test
npm run build
```

測試使用記憶體與臨時 SQLite，不修改 `database/bookkeeper.db`。涵蓋初始化與重新開啟、固定類別 ID、API 新增／刪除、輸入驗證、台北日期邊界、閏年與跨年，以及 CSV 略過規則、重複匯入、交易回復、BOM／多行說明、匯出範圍、ISO 時區／毫秒與再次匯入一致性。

## 專案結構

```text
bookkeeper/
├── frontend/
│   ├── src/
│   │   ├── App.vue
│   │   ├── views/          # 每日明細、統計、匯入匯出
│   │   ├── components/     # 彈窗、表單、日曆、圓餅圖、明細列表
│   │   ├── api/            # API 呼叫
│   │   ├── lib/            # 日期、類別顏色、載入與滑動邏輯
│   │   └── assets/         # 沿用線稿的 CSS
│   ├── index.html
│   └── vite.config.js
├── backend/
│   ├── src/               # Express API、SQLite 初始化
│   └── test/              # API 與日期測試
├── database/              # schema.sql、init.sql、本機 .db
├── scripts/               # 同時啟動前後端
├── wireframes/            # 保留既有 HTML 線稿
├── package.json           # npm workspaces 與共用指令
└── package-lock.json      # 鎖定依賴版本
```

技術文件：[Vue 快速開始](https://vuejs.org/guide/quick-start.html)、[Vite](https://vite.dev/guide/)、[Node SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)。
