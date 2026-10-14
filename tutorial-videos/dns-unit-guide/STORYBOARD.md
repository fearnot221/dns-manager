---
format: 1920x1080
duration: 4:28.4
message: "單位同仁不必再寄信或填紙本：在 DNS Manager 就能查看、清查、申請 DNS，並自行管理單位成員"
arc: Hook（一筆申請）→ 角色與路線圖 → 7 段真實操作 → 回顧 → 識別收尾
audience: 校內單位成員與單位管理員
mode: collaborative
---

# DNS Manager 使用教學 · 單位成員與單位管理員篇 — v1

## Decisions

- **Message**: 在 DNS Manager 一個地方，就能查看、清查、申請 DNS，並管理單位成員。
- **Audience / arc**: 校內單位同仁；Hook → 路線圖 → 7 段操作 → 回顧 → 收尾。
- **Format**: 1920×1080、約 5.5 分鐘、zh-TW 旁白（HsiaoChenNeural）、輕柔 BGM（旁白時 carve 壓低）。字幕條位於下方 keep-out 區，內容放在上方約 83%。
- **The spine**: 一張「DNS 申請單」票卡 —— `lab.example.com · A · 140.115.10.50`，狀態膠囊「待審核」。片頭出現、第 4 章真的送出、第 6 章在申請紀錄裡再次出現（callback）；系統管理員篇以同一張票卡開場並翻成「已核准」，串起兩部影片。
- **Brand（取自系統本身 `styles/tokens.css`）**: 底 `#f4f5f7`、面板 `#ffffff`、墨 `#1a1d23`、輔助灰 `#5d6470`、主色 `#2457b8`（唯一強調色）、淺主色 `#ebf1fa`、狀態琥珀 `#a14f05`、成功綠 `#15803d`。字體：標題 Songti TC Bold、內文 PingFang TC（皆為 macOS 內建，本機渲染）、等寬 Geist Mono（系統原有，取自 Next 套件）。校徽 `ncu-emblem.png`。
- **Bans**: 不仿造系統 UI（所有操作畫面皆為真實錄影）；不用漸層字、霓虹、紫藍漸層；不做每章換一張卡的「投影片感」；裝飾不能停滯（避免螢幕保護程式感）。
- **Held frame**: Frame 10 回顧卡在最後一句旁白時完全靜止 1.5 秒。
- **Truthfulness**: 操作畫面為本機隔離環境的真實錄影，帳號與資料為示範用虛構資料。

## Locked

- 計畫（v1）與草圖（storyboard.html v1）已由使用者確認：「計畫可以，先出草圖」「草圖可以，開始製作」。版面、文案與字體依草圖建置，不重畫。

## Final timing (from index.html)

| Scene | Start | Duration |
| --- | --- | --- |
| s01-hook | 0:00.0 | 13.0s |
| s02-map | 0:12.4 | 15.4s |
| s03-login | 0:27.3 | 31.9s |
| s04-unit-dns | 0:58.6 | 23.1s |
| s05-inspect | 1:21.0 | 33.4s |
| s06-apply | 1:53.8 | 45.2s |
| s07-change | 2:38.4 | 30.3s |
| s08-records | 3:08.1 | 18.8s |
| s09-unit-admin | 3:26.3 | 42.6s |
| s10-recap | 4:08.3 | 13.2s |
| s11-outro | 4:20.9 | 7.5s |

實際總長 4:28.4（push-left 轉場與相鄰場景重疊 0.6 秒）。章節長度由真實操作錄影決定，旁白長度決定設計場景長度。

## Frame 1 — 一筆申請（Hook）

- scene: 淺色舞台中央，票卡逐字打出 lab.example.com · A · 140.115.10.50，狀態膠囊彈出「待審核」，上方大標「申請 DNS，不必再寄信、填紙本」
- duration: 9s
- transition_in: cut
- status: animated
- blueprint: kinetic-type-beats + typewriter-reveal（票卡逐字）、spring-pop-entrance（狀態膠囊）
- voiceover: "申請 DNS，不必再寄信、填紙本。從申請、清查到成員管理，都能在 DNS Manager 完成。"
- src: compositions/01-hook.html

Why：第一拍就講使用者得到的結果（不用寄信／紙本），並立起貫穿全片的票卡。

## Frame 2 — 你的角色與路線圖

- scene: 左側兩張角色卡「單位成員」「單位管理員」（管理員多一項：管理成員），右側 7 章路線圖逐項排入
- duration: 12s
- transition_in: push-left
- status: animated
- blueprint: grid-card-assemble（路線圖）、split-tilt-cards（兩種角色）
- voiceover: "單位只有兩種角色：成員與管理員。管理員擁有成員的所有功能，另外可以管理單位使用者。接下來分七段帶你操作。"
- src: compositions/02-roles.html

Why：先讓觀眾知道自己屬於哪個角色、會看到哪些段落。

## Frame 3 — 第 1 章 登入與畫面導覽

- scene: 章節開場（大號 01 + 標題 waterfall）→ 浮動瀏覽器視窗播放真實錄影：登入、側欄選單、目前單位、帳號角色；左側步驟欄同步高亮
- duration: 38s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase（floating-window）＋ coordinate-target-zoom（側欄、帳號區 punch-in）＋ css-marker-patterns（highlight 圈選）
- voiceover: "以學校帳號登入後，左側是功能選單：單位 DNS、申請 DNS 與申請紀錄。選單上方是目前單位，左下角是你的姓名、學號與角色。"
- src: compositions/03-login.html

Why：建立使用介面的方向感，後面每章都從這個選單出發。

## Frame 4 — 第 2 章 查看單位 DNS

- scene: 章節開場 → 錄影：單位 DNS 列表、清查活動公告、搜尋 www 篩選；punch-in 到公告與搜尋框
- duration: 30s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom
- voiceover: "單位 DNS 列出歸屬於本單位、目前生效的紀錄；上方會公告進行中的清查活動。紀錄多時可以直接搜尋。"
- src: compositions/04-unit-dns.html

## Frame 5 — 第 3 章 完成 DNS 清查

- scene: 章節開場 → 錄影：點「清查」→ 更新分機、寫清查備註 → 儲存並記錄清查；成功提示時畫面角落蓋上「已清查」章
- duration: 36s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom ＋ spring-pop-entrance（已清查章）
- voiceover: "清查是確認 DNS 是否仍在使用、聯絡資料是否正確。更新資料、寫下清查備註後儲存，系統會自動記錄時間與經手人，DNS 解析內容不會變更。"
- src: compositions/05-inspect.html

## Frame 6 — 第 4 章 申請新增 DNS

- scene: 章節開場 → 錄影：填申請人資料、網域、名稱 lab、類型 A、IP、用途 → 送出；送出瞬間片頭的票卡從畫面右側滑入並蓋上「待審核」（spine 回收）
- duration: 55s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom（逐欄位 punch-in）＋ card-morph-anchor（票卡回收）
- voiceover: "點選申請 DNS，填好申請人資料，再填 DNS 紀錄：網域、名稱、類型與 IP，並具體說明用途。送出後狀態是待審核，管理員核准前 DNS 不會變更。"
- src: compositions/06-apply.html

Why：全片最重要的任務，票卡在這裡從概念變成真實送出的申請。

## Frame 7 — 第 5 章 申請變更或刪除

- scene: 章節開場 → 錄影：在 app 紀錄點「申請變更」→ 新解析內容、變更原因 → 送出；最後 punch-in 到「申請刪除」按鈕
- duration: 34s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom
- voiceover: "要修改既有紀錄，點選申請變更，填入新的解析內容與原因。申請刪除的流程相同，都要經管理員核准才會生效。"
- src: compositions/07-change.html

## Frame 8 — 第 6 章 追蹤申請紀錄

- scene: 章節開場 → 錄影：申請紀錄列表；票卡在旁邊浮出並對齊列表中的 lab 那一列（callback Frame 1）
- duration: 20s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ card-morph-anchor（callback）
- voiceover: "在申請紀錄可以看到每筆申請的狀態：待審核、已核准或未核准，管理員的審核回覆也會顯示在這裡。"
- src: compositions/08-records.html

## Frame 9 — 第 7 章 單位管理員：管理成員

- scene: 章節開場（角色膠囊切換成「單位管理員」）→ 錄影：單位管理頁、新增使用者輸入學號、加入成功、管理權限對話框
- duration: 55s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom ＋ scale-swap-transition（角色膠囊切換）
- voiceover: "單位管理員多了單位管理。按新增使用者並輸入學號，已註冊的帳號會立即加入。管理權限可以調整角色或移出成員，但單位至少要保留一位管理員。"
- src: compositions/09-unit-admin.html

## Frame 10 — 回顧

- scene: 六個重點以清單逐條排入並打勾，最後一句旁白時靜止（held frame）
- duration: 12s
- transition_in: push-left
- status: animated
- blueprint: grid-card-assemble（清單）＋ titlecard-reveal（靜止落點）
- voiceover: "重點回顧：查看與清查單位 DNS、提出申請、追蹤結果，管理員再以學號管理成員。"
- src: compositions/10-recap.html

## Frame 11 — 識別收尾

- scene: 校徽與「DNS Manager」字標組合成 lockup，下方一行「有問題請聯絡系統管理員」
- duration: 6s
- transition_in: crossfade
- status: animated
- blueprint: logo-assemble-lockup
- voiceover: "有問題請聯絡系統管理員，謝謝收看。"
- src: compositions/11-outro.html
