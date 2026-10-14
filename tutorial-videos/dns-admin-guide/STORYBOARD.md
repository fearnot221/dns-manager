---
format: 1920x1080
duration: 5:20.4
message: "單位送出的申請，在後台審核後立即生效；歸屬、規則、帳號與稽核都在同一處管理"
arc: Hook（票卡翻成已核准）→ 後台地圖 → 8 段真實操作 → 回顧 → 識別收尾
audience: DNS Manager 系統管理員
mode: collaborative
---

# DNS Manager 使用教學 · 系統管理員篇 — v1

## Decisions

- **Message**: 單位的申請在這裡審核後立即生效；歸屬、規則、單位、帳號與稽核都在同一處管理。
- **Audience / arc**: 系統管理員；Hook → 後台地圖 → 8 段操作 → 回顧 → 收尾。
- **Format**: 1920×1080、約 6 分鐘、zh-TW 旁白、輕柔 BGM（carve）。字幕條下方 keep-out。
- **The spine**: 與單位篇相同的「DNS 申請單」票卡 `lab.example.com · A · 140.115.10.50`。片頭以「待審核」出現 → 第 2 章真實核准時翻成「已核准」並帶上「計算機中心」歸屬標籤 → 第 3 章在 DNS 管理列表中再次對位（callback）。
- **Brand**: 與單位篇共用同一份設計（系統 tokens：`#f4f5f7` / `#1a1d23` / `#2457b8`，Songti TC Bold + PingFang TC + Geist Mono，校徽）。系統管理員篇的章節色條用同一主色，角色膠囊為「系統管理員」。
- **Bans**: 同單位篇；另外不示範刪除 DNS（示範環境沒有刪除保護密碼，只以旁白說明）。
- **Held frame**: Frame 11 回顧卡最後一句旁白靜止 1.5 秒。
- **Truthfulness**: 操作畫面為本機隔離環境的真實錄影；申請由單位篇錄影中的成員實際送出。

## Locked

- 計畫（v1）與草圖（storyboard.html v1）已由使用者確認：「計畫可以，先出草圖」「草圖可以，開始製作」。版面、文案與字體依草圖建置，不重畫。

## Final timing (from index.html)

| Scene | Start | Duration |
| --- | --- | --- |
| s01-hook | 0:00.0 | 12.6s |
| s02-map | 0:12.0 | 12.7s |
| s03-login | 0:24.1 | 29.3s |
| s04-review | 0:52.8 | 49.9s |
| s05-dns | 1:42.1 | 61.6s |
| s06-policy | 2:43.1 | 27.2s |
| s07-units | 3:09.7 | 28.4s |
| s08-protect-events | 3:37.6 | 34.1s |
| s09-accounts | 4:11.1 | 24.6s |
| s10-audit | 4:35.1 | 25.5s |
| s11-recap | 4:60.0 | 13.2s |
| s12-outro | 5:12.5 | 7.9s |

實際總長 5:20.4（push-left 轉場與相鄰場景重疊 0.6 秒）。章節長度由真實操作錄影決定，旁白長度決定設計場景長度。

## Frame 1 — 待審核 → 已核准（Hook）

- scene: 票卡從畫面外滑入，狀態「待審核」；大標「單位送出的申請，在這裡生效」；狀態膠囊翻轉成綠色「已核准」
- duration: 9s
- transition_in: cut
- status: animated
- blueprint: kinetic-type-beats ＋ theme-crossfade-morph（狀態膠囊翻轉）
- voiceover: "單位送出的 DNS 申請，在後台審核後立即生效。這部影片說明系統管理員的日常操作。"
- src: compositions/01-hook.html

## Frame 2 — 後台地圖

- scene: 兩欄地圖對應新版側欄分組：「日常作業」申請審核／單位管理／DNS 管理；「系統設定」申請規則／刪除保護／清查活動／帳號管理／操作紀錄，逐項排入
- duration: 12s
- transition_in: push-left
- status: animated
- blueprint: grid-card-assemble
- voiceover: "系統管理員的範圍涵蓋全部單位與網域。選單分成日常作業與系統設定兩組，接下來分八段介紹。"
- src: compositions/02-map.html

## Frame 3 — 第 1 章 登入與後台導覽

- scene: 章節開場 → 錄影：登入、系統範圍、兩組選單；punch-in 到選單分組標題
- duration: 22s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom
- voiceover: "以系統管理員帳號登入後，範圍是全部單位與網域，所有後台功能都在左側選單。"
- src: compositions/03-login.html

## Frame 4 — 第 2 章 審核 DNS 申請

- scene: 章節開場 → 錄影：待審核分頁、展開 lab 申請、核准並填回覆、核准；另一筆 app 變更申請不核准並填原因；切到已核准分頁。核准瞬間票卡翻成「已核准」（spine）
- duration: 62s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom ＋ theme-crossfade-morph（票卡狀態翻轉）
- voiceover: "申請審核依狀態分頁。展開申請可查看完整資料；確認後按核准，DNS 立即生效並歸屬到申請單位。資料不足時可以不核准並說明原因，回覆會顯示給申請人。"
- src: compositions/04-review.html

Why：全片價值主張的證據 —— 單位申請在這裡變成生效的 DNS。

## Frame 5 — 第 3 章 DNS 管理與歸屬單位

- scene: 章節開場 → 錄影：網域分頁、搜尋 lab（票卡對位 callback）、對 api 紀錄指派單位、直接新增 status 紀錄、歷程與 CSV 匯出按鈕
- duration: 66s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom ＋ card-morph-anchor（票卡 callback）
- voiceover: "DNS 管理依網域列出所有紀錄。剛核准的 lab 已帶入單位與用途。未歸屬的紀錄可以指派給單位；也能直接新增紀錄，立即生效。每筆紀錄都有歷程，也可以匯出全部 DNS。"
- src: compositions/05-dns.html

## Frame 6 — 第 4 章 申請規則與開放網域

- scene: 章節開場 → 錄影：類型勾選區、網域開關、開放 student 網域
- duration: 34s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom ＋ control-target-sync（開關與狀態文字）
- voiceover: "申請規則設定可申請的 DNS 類型，以及哪些網域開放申請。未開放的網域不會出現在申請表單，暫停申請也不會刪除既有 DNS。"
- src: compositions/06-policy.html

## Frame 7 — 第 5 章 單位管理

- scene: 章節開場 → 錄影：單位清單、建立單位「電機工程學系」並以學號指定管理人、修改名稱按鈕
- duration: 40s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom
- voiceover: "單位管理可以查看每個單位的 DNS 與使用者。建立單位時以學號指定管理人，建立後立即生效；沒有 DNS 與待審申請時才能刪除單位。"
- src: compositions/07-units.html

## Frame 8 — 第 6 章 刪除保護與清查活動

- scene: 章節開場 → 錄影：刪除保護說明頁 → 清查活動列表、編輯對話框
- duration: 36s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom
- voiceover: "刪除 DNS 前必須輸入刪除保護密碼，只有最高管理員能設定。清查活動用來公告清查期間，同一時間只能有一個活動。"
- src: compositions/08-protect-events.html

## Frame 9 — 第 7 章 帳號管理

- scene: 章節開場 → 錄影：搜尋帳號、管理對話框的角色與狀態欄位、取消
- duration: 26s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom
- voiceover: "帳號管理依單位分組列出所有帳號，可以搜尋、編輯備註、調整角色或停用帳號，最高管理員帳號受到額外保護。"
- src: compositions/09-accounts.html

## Frame 10 — 第 8 章 操作紀錄

- scene: 章節開場 → 錄影：搜尋與篩選、展開一筆紀錄查看變更前後內容
- duration: 26s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom
- voiceover: "操作紀錄保存所有登入、申請、審核與 DNS 變更，只能查閱、無法修改。展開紀錄可以看到請求資訊與變更前後的內容。"
- src: compositions/10-audit.html

## Frame 11 — 回顧

- scene: 八項重點逐條排入並打勾，最後一句靜止（held frame）
- duration: 12s
- transition_in: push-left
- status: animated
- blueprint: grid-card-assemble ＋ titlecard-reveal
- voiceover: "重點回顧：審核即生效、維護 DNS 歸屬、設定規則，並管理單位、帳號與操作紀錄。"
- src: compositions/11-recap.html

## Frame 12 — 識別收尾

- scene: 校徽與「DNS Manager」lockup，下方一行「所有變更都留有紀錄」
- duration: 6s
- transition_in: crossfade
- status: animated
- blueprint: logo-assemble-lockup
- voiceover: "所有變更都會留下紀錄。謝謝收看。"
- src: compositions/12-outro.html
