# Logto 登入切換（前端仍顯示 NCU Portal）

應用程式類型選 Traditional web，App ID：`dtvpigx50sgdvy4aeadee`。

| Logto 設定 | 值 |
| --- | --- |
| 重定向 URI | `https://dnsmgr.ce.ncu.edu.tw/api/auth/callback/logto` |
| 登出後重定向 URI | `https://dnsmgr.ce.ncu.edu.tw/login` |
| Issuer | `https://authgate.ce.ncu.edu.tw/oidc` |
| Discovery | `https://authgate.ce.ncu.edu.tw/oidc/.well-known/openid-configuration` |

使用 discovery 取得授權、Token、UserInfo、JWKS 和登出端點。已唯讀驗證 discovery 宣告 ES384 與 S256 PKCE；仍須以實際帳號完成正式登入驗收。

## 伺服器設定

在 `/etc/dns-manager/app.env` 填入（Secret 不進 Git、不貼到對話、不使用 NEXT_PUBLIC 前綴）：

```dotenv
AUTH_URL=https://dnsmgr.ce.ncu.edu.tw
AUTH_LOGTO_ID=dtvpigx50sgdvy4aeadee
AUTH_LOGTO_SECRET=由你在伺服器填入
AUTH_PASSWORD_LOGIN_ENABLED=true
```

本專案已確認 Logto 的頂層 `name` 是 NCU Portal 同步、使用者不能修改的學號。最高權限要求經驗證的 `profile.name` 為 `115502532`，且帳號已有資料庫 `SUPER_ADMIN` 角色。`LOGTO_OWNER_SUB` 已停用，可從 env 移除；`sub` 僅保留作 OIDC 登入綁定，不指定最高權限。一般管理員仍需人工指派角色，學號本身不會自動授予角色。

部署須先執行新增 `User.logtoName` 的 migration。新欄位不從歷史顯示姓名、學號或備註回填，只在成功驗證 Logto UserInfo 後寫入。既有最高管理員請重新登入一次；之前的 session 不會憑歷史欄位取得最高權限。帳密測試登入保持可用。

舊 `NCU_PORTAL_CLIENT_ID`、`NCU_PORTAL_CLIENT_SECRET`、`NCU_OWNER_IDENTIFIER` 不再用於登入；新版本 Docker Compose 已傳遞 Logto 變數。保留 `AUTH_SECRET`、資料庫、既有內部 email 與原使用者 ID，不重建資料庫或重新 seed 覆寫帳號。

畫面姓名依序使用 `custom_data.username` → `chinese-name` → `chineseName`，不再將標準 `name` 的學號當成人名。`custom_data.username` 只接受去除頭尾空白後不超過 300 字的非空字串。每次登入同步 `User.name`；缺少顯示姓名時保留既有姓名。頂層 `name` 另存 `User.logtoName` 作驗證識別，並作為學號輔助顯示。`student-id`、`studentId`、email 和 custom_data 不參與授權。

Scope 保持 `openid profile custom_data`，不保證回傳 email。姓名和學號的可信來源以此專案的 NCU connector 設定為前提：若日後允許使用者修改標準 `name`，必須先停用此授權對應。保留資料庫內部 ID、既有登入 email 與歷史稽核，不因顯示／驗證識別調整而搬移 DNS 或自動合併帳號。

## 既有帳號綁定

新 subject 首次登入仍建立獨立 USER，不因 email 或學號相同自動取得既有資料或角色。登入綁定繼續使用 OIDC sub；管理權驗證改用受控的 `profile.name` 與儲存角色。既有帳號記錄過 `logtoName` 後，回傳名稱若不符即拒絕登入，不靜默更換授權識別。要更換登入綁定仍需維運核對，不能僅輸入姓名就合併帳號。

新版 tools image 建好後，在 VM 的 Bash 使用下列共用指令（不依賴 `/opt/dns-manager/.git`）：

```bash
cd /opt/dns-manager
web_image="$(sudo docker inspect --format '{{.Config.Image}}' dns-manager-web-1)"
if [[ ! "$web_image" =~ ^dns-manager-web:([a-f0-9]{40})$ ]]; then
  echo '請先確認目前部署的 commit 標籤'; exit 1
fi
deploy_tag="${BASH_REMATCH[1]}"
run_link() {
  sudo env DEPLOY_TAG="$deploy_tag" docker compose \
    --project-name dns-manager --env-file /etc/dns-manager/app.env \
    -f /opt/dns-manager/docker-compose.yml run --rm --no-deps migrate \
    ./node_modules/.bin/tsx scripts/link-logto-user.ts "$@"
}
run_link --list
```

從清單取得既有 DNS Manager 使用者 ID，再用 **已核對的 Logto User ID**：

```bash
run_link --user-id EXISTING_USER_ID --subject VERIFIED_LOGTO_USER_ID
# 上一行只檢查，不改資料。確認姓名與兩端帳號確實相同後才執行：
run_link --user-id EXISTING_USER_ID --subject VERIFIED_LOGTO_USER_ID \
  --apply --confirm-subject VERIFIED_LOGTO_USER_ID
```

工具只新增 Logto Account 綁定並記錄稽核，不改角色、姓名、密碼或 DNS／單位關聯；拒絕停用帳號、重複綁定與已儲存的最高帳號學號不符。工具不猜測 UserInfo 學號，實際登入仍須通過 `profile.name` 檢查。舊 Portal Account 保留作為歷史對照，不自動刪除或合併帳號。

### 暫時解除綁定以測試一般登入

部署含 `scripts/unlink-logto-user.ts` 的新版 tools image 後，使用與上方相同的 Compose 參數，將腳本改成 `scripts/unlink-logto-user.ts`：

```bash
# 先 dry run；使用同一組經核對的既有 user ID 和 Logto subject。
./node_modules/.bin/tsx scripts/unlink-logto-user.ts --user-id EXISTING_USER_ID --subject VERIFIED_LOGTO_USER_ID
# 確認後套用。
./node_modules/.bin/tsx scripts/unlink-logto-user.ts --user-id EXISTING_USER_ID --subject VERIFIED_LOGTO_USER_ID --apply --confirm-subject VERIFIED_LOGTO_USER_ID
```

工具僅刪除指定 user ID／subject 的 Logto Account 並撤銷該使用者所有登入 session，記錄稽核；保留使用者、角色、密碼、舊 Portal 綁定及 DNS／單位資料。先確認仍能用另一個管理員或既有帳密進入管理功能；工具不建立或重設密碼。若本來未綁定則不變更資料。之後該 subject 會建立獨立 USER 帳號，不取得原管理權限。測試完成後不能直接將已被測試帳號使用的 subject 綁回最高帳號，需核對測試帳號資料再另行處理；不得自動合併或刪除。

## 登出與驗收

### 登入遭拒的排查

查看 `docker logs --since 10m --tail 150 dns-manager-web-1` 中的 `logto-signin-denied`：

- `account_link_required`：同一 subject 的內部合成 email 已存在，但缺少 Account 綁定，需核對並人工處理；一般真實 email 相同不阻擋登入。
- `owner_binding_mismatch`：最高角色帳號回傳的 `profile.name` 不是 `115502532`。
- `account_inactive`：帳號停用或已移除，不得繞過狀態檢查。
- `account_name_missing`：管理員登入未回傳頂層 `name` 學號。
- `account_name_mismatch`：已綁定帳號回傳的學號與先前驗證值不符，需維運核對。
- `subject_mismatch`／`invalid_profile`：身分回傳不符，檢查 Logto connector claims 設定。
- `account_lookup_failed`／`profile_update_failed`：檢查資料庫連線、migration 與可用性；不透過放寬登入規則修復。

日誌只記錄固定原因及 callback requestId，不記錄 token、code、state、姓名、email 或原始資料庫錯誤。拒絕登入仍回到登入頁，不應因計時 headers 造成 500。不要重播舊 callback URL；每次測試請從登入頁重新開始。

- 手動登出：先撤銷本站 session，再使用本次登入的 ID token hint 送至 Logto end-session；ID token 不出現在 `/api/auth/session`，不保存 access／refresh token。
- 15 分鐘閒置：只撤銷本站 session；下一次登入帶 `prompt=login`。不宣稱會清除上游 NCU Portal 或其他應用程式的 session。
- 舊 `ncu-portal` session 不再接受；帳密測試登入保留，正式驗收完成後才考慮設 `AUTH_PASSWORD_LOGIN_ENABLED=false`。
- 驗收姓名／email、一般使用者不可進入管理頁、既有 owner 權限與 DNS／單位資料保留、手動登出返回 `/login`、Secret 不出現在瀏覽器或 log。
- 目前未配置 back-channel logout；不要在 Logto Console 填入未實作的 back-channel URL。

參考：[Logto Auth.js 指南](https://docs.logto.io/quick-starts/next-auth)、[Logto 登出說明](https://docs.logto.io/end-user-flows/sign-out)。
