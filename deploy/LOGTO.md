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
LOGTO_OWNER_SUB=LogtoConsole中核對的最高帳號UserID
AUTH_PASSWORD_LOGIN_ENABLED=true
```

最高帳號的 User ID 從 **Logto Console → Users → 帳號详情 → User ID** 複製，不能猜測是 `115502532`。舊 NCU Portal identifier／學號和 Logto sub 是不同的命名空間。未填 owner sub 時，帶有 Logto secret 的 production 啟動會拒絕，以免切換後管理權限遺失。Portal 登入按鈕固定保留；Secret 尚未設定時停用按鈕並顯示原因，帳密測試登入保持可用。

舊 `NCU_PORTAL_CLIENT_ID`、`NCU_PORTAL_CLIENT_SECRET`、`NCU_OWNER_IDENTIFIER` 不再用於登入；新版本 Docker Compose 已傳遞 Logto 變數。保留 `AUTH_SECRET`、資料庫、既有內部 email 與原使用者 ID，不重建資料庫或重新 seed 覆寫帳號。

請在 Logto 的上游 NCU Portal connector 映射真實姓名到 `name`，電子郵件映射到 `email`，只有可信且已驗證的電子郵件才標為 `email_verified=true`。應用程式只要求 `openid profile email`，不讀取 Logto roles 當作系統管理權。

## 既有帳號綁定

任何新的 Logto subject 都可以首次登入建立獨立的一般帳號，即使 verified email 與舊使用者相同。使用相同 subject 再次登入會回到同一帳號；停用／移除帳號仍拒絕登入。不依相同 email 自動合併、繼承 DNS 或權限。若要沿用既有資料，必須人工核對身分後綁定。`LOGTO_OWNER_SUB` 本身不授予最高角色；未綁定的最高 subject 也只會建立一般帳號，最高權限需既有資料庫角色與身分對應同時符合。

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

工具只新增 Logto Account 綁定並記錄稽核，不改角色、姓名、密碼或 DNS／單位關聯；拒絕停用帳號、重複綁定與 owner sub 不符。舊 Portal Account 保留作為歷史對照。若已誤建重複 Logto 使用者，不自動刪除或合併，需另行核對資料。

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
- `owner_binding_mismatch`：最高帳號身分與既有綁定不一致，核對 Logto User ID、`LOGTO_OWNER_SUB` 與目標使用者。
- `account_inactive`：帳號停用或已移除，不得繞過狀態檢查。
- `owner_not_configured`：執行中的容器未取得 `LOGTO_OWNER_SUB`，檢查 env／Compose 並重新建立容器。
- `subject_mismatch`／`invalid_profile`：身分回傳不符，檢查 Logto connector claims 設定。
- `account_lookup_failed`／`profile_update_failed`：檢查資料庫連線、migration 與可用性；不透過放寬登入規則修復。

日誌只記錄固定原因及 callback requestId，不記錄 token、code、state、姓名、email 或原始資料庫錯誤。拒絕登入仍回到登入頁，不應因計時 headers 造成 500。不要重播舊 callback URL；每次測試請從登入頁重新開始。

- 手動登出：先撤銷本站 session，再使用本次登入的 ID token hint 送至 Logto end-session；ID token 不出現在 `/api/auth/session`，不保存 access／refresh token。
- 15 分鐘閒置：只撤銷本站 session；下一次登入帶 `prompt=login`。不宣稱會清除上游 NCU Portal 或其他應用程式的 session。
- 舊 `ncu-portal` session 不再接受；帳密測試登入保留，正式驗收完成後才考慮設 `AUTH_PASSWORD_LOGIN_ENABLED=false`。
- 驗收姓名／email、一般使用者不可進入管理頁、既有 owner 權限與 DNS／單位資料保留、手動登出返回 `/login`、Secret 不出現在瀏覽器或 log。
- 目前未配置 back-channel logout；不要在 Logto Console 填入未實作的 back-channel URL。

參考：[Logto Auth.js 指南](https://docs.logto.io/quick-starts/next-auth)、[Logto 登出說明](https://docs.logto.io/end-user-flows/sign-out)。
