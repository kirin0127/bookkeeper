# GitHub Actions 部署到 VPS

適用於此專案的 Ubuntu 24.04 x64、512 MB RAM VPS。由 GitHub 的 Ubuntu runner 執行測試、Vue 打包與正式依賴安裝；VPS 只解壓縮、切換版本與啟動 Node，不在 VPS 執行 npm install 或 Vite。

流程：push `main` → 測試 → 打包 → SSH 上傳 → systemd 重啟 → 檢查新版本 → 成功或切回前一版。

以下以 `root@VPS_IP` 登入管理 VPS，Actions 使用你已有的部署帳號（`VPS_USER`），網址以 `book.example.com` 示範，請替換 IP 與網域。此文件不會自動連線或修改 VPS。

## 1. DNS 與現有服務（VPS）

新增 `book` 子網域的 A 記錄，指向 VPS IPv4；若有 AAAA，也應指向正確 IPv6。以下沿用 `second_hand_notify` 部署文件中的 Caddy，在現有 Caddyfile 增加一個網站，不覆蓋 bot 的設定。

先確認服務與資源：

```bash
free -h
df -h /
sudo ss -ltnp
caddy version
```

這份設定使用 `127.0.0.1:3001`，請確認尚未被其他服務使用。若要換埠，需同時修改 `bookkeeper.service` 的 `PORT`、`activate-release.sh` 的健康檢查網址，以及 Caddy 的 upstream。

若尚未安裝 Caddy，請先依 [官方 Ubuntu 安裝指令](https://caddyserver.com/docs/install#debian-ubuntu-raspbian)安裝。以下 `basic_auth` 語法需要 Caddy 2.8 以上。

## 2. 安裝 Node 24（VPS，只需一次）

使用 Node 官方 Linux x64 binary，獨立放在 `/opt/node24`。以下固定 24.22.2，符合專案的 Node 24.12+ 要求。

```bash
sudo apt update
sudo apt install -y ca-certificates curl xz-utils tar sqlite3

mkdir -p /tmp/bookkeeper-node-setup
cd /tmp/bookkeeper-node-setup
curl -fSLO https://nodejs.org/dist/v24.22.2/node-v24.22.2-linux-x64.tar.xz
curl -fSLO https://nodejs.org/dist/v24.22.2/SHASUMS256.txt
awk '$2 == "node-v24.22.2-linux-x64.tar.xz"' SHASUMS256.txt | sha256sum -c -
```

確認顯示 `OK` 才繼續：

```bash
sudo mkdir -p /opt/node24
sudo tar -xJf node-v24.22.2-linux-x64.tar.xz -C /opt/node24 --strip-components=1
/opt/node24/bin/node --version
```

這個 Node 路徑不改變現有 Python bot。未來可定期更新 Node 24 的安全修補版本，再重啟 bookkeeper；workflow 依 `.nvmrc` 使用 Node 24。

## 3. 沿用現有部署帳號，設定目錄（VPS，只需一次）

不需要重新建立 SSH 登入帳號或私鑰。以下的 `deploy` 請換成你已存在的部署帳號，也就是稍後 GitHub 的 `VPS_USER`：

```bash
BOOKKEEPER_DEPLOY_USER=deploy
id "$BOOKKEEPER_DEPLOY_USER"
```

app 的執行帳號仍使用 systemd 範本中的 `bookkeeper`，不必允許它 SSH 登入。若尚未建立這個服務帳號，才執行：

```bash
sudo useradd --system --user-group --home-dir /var/lib/bookkeeper --no-create-home --shell /usr/sbin/nologin bookkeeper
```

讓現有部署帳號管理此 app 的版本目錄：

```bash
sudo install -d -m 755 -o "$BOOKKEEPER_DEPLOY_USER" -g "$(id -gn "$BOOKKEEPER_DEPLOY_USER")" /opt/bookkeeper
sudo install -d -m 755 -o "$BOOKKEEPER_DEPLOY_USER" -g "$(id -gn "$BOOKKEEPER_DEPLOY_USER")" /opt/bookkeeper/incoming /opt/bookkeeper/releases
```

資料目錄 `/var/lib/bookkeeper` 由 systemd 在第一次啟動時建立，由 app 帳號持有。既有 SSH 公鑰與 authorized_keys 不需變更。

## 4. 安裝服務設定（Mac 上傳，然後 VPS 安裝）

Mac：

```bash
cd /Users/jeffchuangmbp2024/Desktop/Projects/bookkeeper
scp deploy/bookkeeper.service deploy/bookkeeper.sudoers root@VPS_IP:/tmp/
```

VPS：

```bash
sudo install -o root -g root -m 644 /tmp/bookkeeper.service /etc/systemd/system/bookkeeper.service
# deploy 換成與 VPS_USER 相同的既有帳號。
BOOKKEEPER_DEPLOY_USER=deploy
sed "s/deploy_user/$BOOKKEEPER_DEPLOY_USER/" /tmp/bookkeeper.sudoers > /tmp/bookkeeper.sudoers.rendered
sudo visudo -cf /tmp/bookkeeper.sudoers.rendered
```

上面檢查通過後：

```bash
sudo install -o root -g root -m 440 /tmp/bookkeeper.sudoers.rendered /etc/sudoers.d/bookkeeper
sudo systemctl daemon-reload
sudo systemctl enable bookkeeper.service
```

現在還沒有 `current` 版本，不要加 `--now`。第一次 Actions 部署會啟動服務。

sudoers 只允許部署帳號以 root 重啟／停止 `bookkeeper.service`，不給一般 root shell。服務設定由 root 持有，不會由 workflow 覆寫。

## 5. 確認既有 SSH key 與 VPS 主機公鑰

沿用你現有的部署私鑰，確認對應公鑰已在 `VPS_USER` 的 authorized_keys 中。Mac 可先測試：

```bash
ssh -i /你的既有私鑰路徑 deploy@VPS_IP 'id -un'
```

`deploy` 換成你的現有部署帳號。workflow 使用無密碼互動的 SSH key；目前不另接 passphrase secret。

GitHub Actions 只需要三個 Secrets。主機公鑰改放 repository 的 `deploy/known_hosts`，使用固定別名 `bookkeeper-vps`，不需要在 repository 寫出 VPS IP。

透過你已信任的 VPS SSH 連線或供應商 Console 執行：

```bash
awk '{print "bookkeeper-vps " $1 " " $2}' /etc/ssh/ssh_host_ed25519_key.pub
```

把輸出的**完整一行**貼到本機 `deploy/known_hosts` 註解下方，並隨程式一起提交，格式為：

```text
bookkeeper-vps ssh-ed25519 AAAA...
```

這是 **VPS 的主機公鑰**，不是登入帳號的 authorized_keys 公鑰，也不是你的部署私鑰。workflow 保留 `StrictHostKeyChecking=yes`；主機公鑰未填或不符時會停止，不會自動信任連線當下掃描到的主機。

## 6. 設定三個 GitHub Secrets（GitHub 網頁）

在 [kirin0127/bookkeeper 的 Actions secrets](https://github.com/kirin0127/bookkeeper/settings/secrets/actions) 新增 Repository secrets：

| 名稱 | 內容 |
| --- | --- |
| `VPS_HOST` | VPS IPv4 或 SSH 網域；不含 `https://`、帳號或埠 |
| `VPS_USER` | 你已存在的部署登入帳號 |
| `VPS_SSH_KEY` | 對應這個帳號的既有完整私鑰，包含 BEGIN／END 行 |

不需要 `VPS_KNOWN_HOSTS` Secret，也不需要 GitHub Variables。SSH 預設 22 埠；若你的 SSH 使用其他埠，直接修改 `.github/workflows/deploy.yml` 的 `VPS_PORT` 常數即可。

私鑰只貼到 GitHub Secret，不放進 Git、README 或聊天。已設定的帳號還需具備第 3、4 節所列的目錄及 bookkeeper 服務操作權限；若已有相同權限，可跳過重複設定。

若供應商防火牆限制 SSH 來源，必須讓 Actions runner 能連到 SSH。GitHub hosted runner IP 會變動；若你只開放固定來源，需要固定出口的 runner 或另外設計連線方式，單靠 Secret 不會讓網路通過。

## 7. 第一次推送（Mac）

上述 VPS 與 Secrets 設定完成後，檢查要提交的檔案：

```bash
cd /Users/jeffchuangmbp2024/Desktop/Projects/bookkeeper
git status --short
git add .
git diff --cached --stat
```

確認沒有私鑰、`.env`、`.db` 或私人 CSV，再提交：

```bash
git commit -m "Add expense app and GitHub Actions deployment"
git push origin main
```

到 [Actions](https://github.com/kirin0127/bookkeeper/actions) 查看 **Deploy Bookkeeper**。也可在該 workflow 使用 **Run workflow**，選 `main` 手動重跑。

workflow 在 GitHub Ubuntu 24.04 x64 runner 上完成：

1. `npm ci`、`npm test`、`npm run build`。
2. 從明確清單建立正式套件，只安裝 backend 正式依賴，省略開發套件與 install scripts；不打包任何 `.db`、CSV、私鑰或 `.env`。
3. 嚴格驗證 SSH host key，上傳到 `/opt/bookkeeper/incoming`。
4. 解壓到 `releases/<run-id>-<attempt>-<commit>`，原子切換 `current` symlink。
5. 重啟服務，檢查 `/api/health` 回傳的版本確實等於此次 release。
6. 健康檢查失敗切回前一版；首次部署失敗則停止服務。成功後保留最近三版及目前／前一版。

套件在 Linux runner 製作；不要手動把 Mac 的 `node_modules` 傳到 VPS。後續如果新增需要 install scripts 的依賴，需調整 `scripts/package-release.mjs` 並驗證 Linux 套件。

## 8. 設定 Caddy HTTPS 與登入（VPS）

先確認 app 已啟動：

```bash
sudo systemctl status bookkeeper --no-pager
curl --fail http://127.0.0.1:3001/api/health
```

應看到 `{"ok":true,"release":"..."}`。

產生網頁登入密碼雜湊，命令會互動詢問密碼：

```bash
caddy hash-password
```

備份並編輯既有 Caddyfile：

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-bookkeeper
sudo nano /etc/caddy/Caddyfile
```

保留原本 bot 等站台，追加下面區塊。把 `book.example.com` 換成你的子網域，把 `REPLACE_WITH_PASSWORD_HASH` 換成剛才完整的雜湊（不是原始密碼）：

```caddyfile
book.example.com {
    basic_auth {
        jeff REPLACE_WITH_PASSWORD_HASH
    }
    reverse_proxy 127.0.0.1:3001
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

確認驗證成功後：

```bash
sudo systemctl reload caddy
```

網域 DNS 與對外 80／443 通暢時，Caddy 自動申請與更新 HTTPS 憑證。若使用 UFW，確認允許 80/tcp、443/tcp，並保留原有 SSH 規則；供應商防火牆也需放行。Node 的 3001 僅監聽 loopback，不需要對外開放。

這層登入同時保護網頁、API、匯入及匯出。Caddy 反向代理預設保留原始 Host，符合本 app 的寫入來源檢查；不要把 Host 改成 `127.0.0.1:3001`。

使用 iPhone Safari 開啟 `https://你的子網域`，輸入帳號 `jeff` 和剛才的原始密碼。需要時可使用 Safari「加入主畫面」。

## 9. 驗證與資料移轉

- 未登入的瀏覽器請求 `/api/expenses` 應先得到 401。
- 登入後新增一筆、重新整理確認保留，再確認刪除及統計。
- 在「匯入匯出」匯入 Fortune City CSV；對話中的測試只使用臨時資料庫，不會自動上傳到 VPS。
- 如果你已在本機新增要保留的正式紀錄，可先匯出「全部紀錄」CSV，再在空白 VPS 資料庫以「日常記帳」格式匯入。不要再疊加匯入含相同花費的 Fortune City 檔案。

VPS 資料庫固定在 `/var/lib/bookkeeper/bookkeeper.db`，不在任何 release 目錄。重啟服務與更新程式不會重建或覆蓋既有資料。

## 10. 後續更新、檢查與備份

一般更新只需測試後 push `main`；Actions 自動部署。workflow 不會修改 systemd、sudoers、Caddy、Node runtime 或防火牆。這些設定檔變更需由你另行安裝。

VPS 常用指令：

```bash
sudo systemctl status bookkeeper --no-pager
sudo journalctl -u bookkeeper -n 80 --no-pager
sudo journalctl -u caddy -n 80 --no-pager
readlink -f /opt/bookkeeper/current
curl --fail http://127.0.0.1:3001/api/health
free -h
du -sh /opt/bookkeeper/releases /var/lib/bookkeeper
```

在 VPS 用 SQLite 線上備份，可在服務執行時執行：

```bash
sudo install -d -m 700 /var/backups/bookkeeper
sudo sqlite3 /var/lib/bookkeeper/bookkeeper.db ".backup '/var/backups/bookkeeper/manual.db'"
sudo chmod 600 /var/backups/bookkeeper/manual.db
```

`manual.db` 是固定檔名，再跑會更新這份備份。請定期下載到自己的電腦，單放同一台 VPS 不構成異地備份。Mac：

```bash
scp root@VPS_IP:/var/backups/bookkeeper/manual.db ~/Downloads/bookkeeper-backup.db
```

程式回退只切換 release，**不會還原資料庫**。目前沒有 schema migration；未來若變更 schema，需先設計 migration 與資料備份流程，再自動部署。

## 參考文件

- [GitHub Actions 部署與 concurrency](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)
- [Node 官方 Node 24 發行檔](https://nodejs.org/dist/latest-v24.x/)
- [Caddy Basic Auth](https://caddyserver.com/docs/caddyfile/directives/basic_auth)
- [Caddy 自動 HTTPS](https://caddyserver.com/docs/automatic-https)
