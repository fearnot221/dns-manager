# 本機 PR 與發布流程

```text
本機功能分支開發、測試
  → 取得 push 授權，推送功能分支
  → 本機 agent 使用 gh 建立／重用 PR（base: main）
  → 本機同步 main、解衝突、測試，再推送
  → 等待最新 PR 的 Verify 成功
  → 依 push 的完整發布授權，由本機 gh 合併 main
  → 原本 main push webhook → Server 拉 main → 更新與健康檢查
  → 本機 agent 確認合併與部署結果
```

此模式使用本機既有 GitHub CLI 登入，不需要 Actions 的 `BRANCH_AUTOMATION_TOKEN` 或 `OPENAI_API_KEY`。GitHub 不會自動開 PR、呼叫 Codex 解衝突或自動合併；必須由目前對話中的 agent 執行。電腦離線或對話中斷時不會繼續本機操作，恢復後先核對遠端狀態。

## 授權與分支

- 專案規則以 [AGENTS.md](../AGENTS.md) 為準。一般修改要求不授權發布；使用者要求「push」即授權提交本次變更、推送功能分支、開 PR、解衝突、等 CI、合併 main 觸發既有部署並追蹤驗證，不再另外詢問是否合併。若明確要求只推分支、不合併或不上線，遵守該限制。討論 push 規則或詢問狀態不等於發布指令。此授權不包含擅改遠端保護規則、正式資料或部署方式。
- 每個功能使用自己的分支，預設 `codex/<功能名稱>`；平行開發使用獨立 worktree。不要切換其他 agent 的工作目錄分支，不提交其他功能的變更。
- 開始發布前用 `git status`、`git remote -v`、`git branch --show-current`、`gh auth status` 核對目標與登入。登入失效時請使用者在本機重新登入，不印出 token 或把本機登入憑證複製到 GitHub Secrets。

## 操作順序

1. 依專案驗證分級完成本地檢查，只提交本次變更。取得授權後用 `git push -u origin <功能分支>` 推送。
2. 查詢該分支以 main 為 base 的 PR，有則重用；沒有則 `gh pr create --base main --head <功能分支> --title <標題> --body <摘要與驗證結果>`。建立後將 PR URL 附加至目前對話（工具可用時）。
3. `git fetch origin` 後核對 PR head 與本地分支。工作目錄乾淨且目標正確時，把 `origin/main` merge 到功能分支。解衝突要保留雙方意圖，無法判定的需求先詢問；不可整批選 ours/theirs、force push 或覆蓋其他人的提交。
4. 新增同步／修正 commit 後重跑受影響驗證並推送。用 `gh pr checks <PR> --watch --interval 30` 等待；這只是等待工具，還必須確認最新 PR 合併版本的 Verify `verify` 為 success，並滿足其他必要檢查與審核。缺少檢查、skipped、cancelled 或舊版本結果不能當成成功。
5. CI 失敗先查看該 run 的 log（`gh run view <RUN_ID> --log-failed`），本機修正後再推送等待。合併前重新讀 PR head、main、mergeability 與保護狀態；任一版本變動就重新核對、同步與驗證。
6. 已有合併授權且保護有效時，使用 `gh pr merge <PR> --merge --match-head-commit <已驗證的HEAD_SHA>`。不要用 `--admin`、不要為了合併關閉檢查或移除審核要求。若遭拒，重新讀取狀態並處理原因。
7. 確認 PR 為 MERGED，fetch 後確認 merge commit 是 origin/main 的祖先。原本 Server 收到 main push 就開始部署，無須改 webhook；main push 的 CI 與部署可能同時執行，所以上線門檻是合併前的 PR CI。
8. 使用已授權的 Server 日誌／SSH／部署版本資訊確認這次 commit 已部署，再檢查健康狀態；只有首頁 HTTP 200 不能證明部署了新版。若缺少管道，明確回報「main 已合併，VM 部署未驗證」，並說明需要的資訊，不宣稱完成正式環境驗證。

## main 保護

為防止多個 agent 同時合併造成過期 CI 上線，main 應要求 GitHub Actions 的 `verify`、Require branches to be up to date before merging（strict），並將規則套用到 administrators，不允許 bypass。需允許 merge commit，並保留既有其他審核要求。

strict 保護負責在 GitHub 合併當下阻擋過期 base；`--match-head-commit` 負責鎖定已驗證的功能分支版本。沒有保護時，本地先查再合併仍有競爭空窗，因此 agent 必須先回報並取得設定授權，不能自行降低要求。設定須檢查、保留既有規則，不能直接覆蓋。參考 [GitHub 分支保護說明](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)。

## 保留與移除

- 保留 `.github/workflows/ci.yml`：push／pull_request 的完整 Verify，以及同事件／ref 過期執行取消。
- Server 的 `deploy.sh`、`webhook.mjs`、註冊與安裝腳本維持原版，不改成 workflow_run 部署。
- 移除尚未發布的自動整合／Codex Actions workflows、配套 API 腳本、專用測試及保護設定範本。不需要新增上述兩個 Secrets。
- 本次只修改本地檔案與規則，未推送、建立 PR、合併或修改 GitHub 遠端設定。先前查詢 main 尚無保護，正式發布前須重新確認並補齊。

## 驗證紀錄

2026-10-04 本次變更僅移除未啟用的自動化程式並更新規則／文件，應用程式、依賴、Verify 及 Server 程式未變。沿用前次 production build 與應用測試結果；前次 472 個測試包含本次已移除的 19 個自動化測試，不能視為目前測試數。

本次驗證結果：

- `npm run lint`：通過。
- `npx vitest run tests/deployment.test.mjs tests/vm-deployment.test.mjs`：2 個測試檔、29 個測試通過。
- `git diff --check`：通過；文件引用路徑存在。
- Node 搭配 js-yaml 解析 workflow：通過，確認只剩 `ci.yml`，觸發仍為 push／pull_request，且保留 verify job。
- `git diff --exit-code -- deploy/deploy.sh deploy/webhook.mjs deploy/register-webhook.mjs deploy/install-vm.sh`：通過，Server 腳本與 HEAD 無差異。

本次未重跑完整應用測試／build，沿用上述未變更來源的前次結果。尚未執行遠端 PR／CI／合併或 VM 部署驗證；local demo 保持關閉。

同日更新 push 授權語意後再次確認：上述部署測試 29 個全數通過；`bash -n deploy/install-vm.sh deploy/deploy.sh deploy/register-webhook.sh deploy/update-now.sh`、工作目錄與暫存區的 diff check 均通過。以 `git diff HEAD --exit-code` 比對部署、webhook、註冊、安裝、update-now 腳本及兩份部署測試均無差異（包含已暫存內容）。Webhook 仍訂閱 push、驗證簽章並過濾目標分支；本次沒有修改或驗證遠端 VM 的實際狀態。
