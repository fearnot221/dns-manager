---
format: 1920x1080
duration: 4:51.9
message: "單位同仁不必再寄信或填紙本：在 DNS Manager 就能查看、清查、申請 DNS，並自行管理單位成員"
arc: Hook（一筆申請）→ 角色與路線圖 → 8 段真實操作 → 回顧 → 識別收尾
audience: 校內單位成員與單位管理員
mode: collaborative
---

# DNS Manager 使用教學 · 單位成員與單位管理員篇 — v3

## Decisions

- **Message**: 在 DNS Manager 一個地方，就能查看、清查、申請 DNS，並管理單位成員。
- **Audience / arc**: 校內單位同仁；Hook → 路線圖 → 8 段操作 → 回顧 → 收尾。
- **Format**: 1920×1080、約 5.5 分鐘、zh-TW 旁白（HsiaoChenNeural）、輕柔 BGM（旁白時 carve 壓低）。字幕條位於下方 keep-out 區，內容放在上方約 83%。
- **The spine**: 一張「DNS 申請單」票卡 —— `lab.example.com · A · 140.115.10.50`，狀態膠囊「待審核」。片頭出現、第 4 章真的送出、第 7 章在申請紀錄裡再次出現（callback）；系統管理員篇以同一張票卡開場並翻成「已核准」，串起兩部影片。
- **Brand（取自系統本身 `styles/tokens.css`）**: 底 `#f4f5f7`、面板 `#ffffff`、墨 `#1a1d23`、輔助灰 `#5d6470`、主色 `#2457b8`（唯一強調色）、淺主色 `#ebf1fa`、狀態琥珀 `#a14f05`、成功綠 `#15803d`。字體：標題 Songti TC Bold、內文 PingFang TC（皆為 macOS 內建，本機渲染）、等寬 Geist Mono（系統原有，取自 Next 套件）。校徽 `ncu-emblem.png`。
- **Bans**: 不仿造系統 UI（所有操作畫面皆為真實錄影）；不用漸層字、霓虹、紫藍漸層；不做每章換一張卡的「投影片感」；裝飾不能停滯（避免螢幕保護程式感）。
- **Held frame**: Frame 11 回顧卡在最後一句旁白時完全靜止 1.5 秒。
- **Truthfulness**: 操作畫面為本機隔離環境的真實錄影，帳號與資料為示範用虛構資料。

## Locked

- 計畫（v1）與草圖（storyboard.html v1）已由使用者確認：「計畫可以，先出草圖」「草圖可以，開始製作」。版面、文案與字體依草圖建置，不重畫。

- v2（2026-10-19）：依目前介面重錄。使用者確認章節計畫：「計畫可以，照這份章節開始錄影與製作。」版面、字體與票卡 spine 沿用 v1 草圖，只增修章節與旁白。

- v3（2026-10-19）：「根據最新修正後的內容 修正教學影片的內容」。依 main 最新介面重錄：申請表單改為類型→名稱→網域、所有網域開放申請（PTR 只列反解網域）、申請規則改為設定僅限系統管理員申請的類型。

## Final timing (from index.html)

| Scene | Start | Duration |
| --- | --- | --- |
| s01-hook | 0:00.0 | 13.0s |
| s02-map | 0:12.4 | 15.4s |
| s03-login | 0:27.2 | 31.2s |
| s04-unit-dns | 0:57.9 | 19.5s |
| s05-inspect | 1:16.8 | 30.2s |
| s06-apply | 1:46.4 | 45.4s |
| s07-claim | 2:31.2 | 37.8s |
| s08-change | 3:08.4 | 26.6s |
| s09-records | 3:34.3 | 19.9s |
| s10-unit-admin | 3:53.6 | 37.8s |
| s11-recap | 4:30.8 | 14.2s |
| s12-outro | 4:44.3 | 7.5s |

實際總長 4:51.9（push-left 轉場與相鄰場景重疊 0.6 秒）。章節長度由真實操作錄影決定，旁白長度決定設計場景長度。
## Frame 1 — 一筆申請（Hook）

- scene: 淺色舞台中央，票卡逐字打出 lab.example.com · A · 140.115.10.50，狀態膠囊彈出「待審核」，上方大標「申請 DNS，不必再寄信、填紙本」
- duration: 13.0s
- transition_in: cut
- status: animated
- blueprint: kinetic-type-beats + typewriter-reveal（票卡逐字）、spring-pop-entrance（狀態膠囊）
- voiceover: "申請 DNS，不必再寄信、填紙本。從申請、清查到成員管理，都能在 DNS Manager 完成。"
- src: compositions/s01-hook.html

Why：第一拍就講使用者得到的結果（不用寄信／紙本），並立起貫穿全片的票卡。

## Frame 2 — 你的角色與路線圖

- scene: 左側兩張角色卡「單位成員」「單位管理員」（管理員多一項：管理成員），右側 8 章路線圖逐項排入
- duration: 15.4s
- transition_in: push-left
- status: animated
- blueprint: grid-card-assemble（路線圖）、split-tilt-cards（兩種角色）
- voiceover: "單位只有兩種角色：成員與管理員。管理員擁有成員的所有功能，另外可以管理單位使用者。接下來分八段帶你操作。"
- src: compositions/s02-map.html

Why：先讓觀眾知道自己屬於哪個角色、會看到哪些段落。

## Frame 3 — 第 1 章 登入與畫面導覽

- scene: 章節開場（大號 01 + 標題 waterfall）→ 浮動瀏覽器視窗播放真實錄影：登入、側欄兩組選單（日常作業／申請作業）、目前單位、帳號角色；左側步驟欄同步高亮
- duration: 31.2s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase（floating-window）＋ coordinate-target-zoom（側欄、帳號區 punch-in）＋ css-marker-patterns（highlight 圈選）
- voiceover: "正式環境請用學校帳號登入；這裡以示範帳號操作，流程相同。登入後，左側選單分成兩組：日常作業是單位 DNS；申請作業包含申請 DNS、DNS 歸屬申請與申請紀錄。選單上方是目前單位，左下角是你的姓名、學號與角色。如果你同時屬於多個單位，可以在選單上方切換。"
- src: compositions/s03-login.html

Why：建立使用介面的方向感，後面每章都從這個選單出發。

## Frame 4 — 第 2 章 查看單位 DNS

- scene: 章節開場 → 錄影：單位 DNS 列表、清查活動公告、搜尋 www 篩選；punch-in 到公告與搜尋框
- duration: 19.5s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom
- voiceover: "單位 DNS 列出歸屬於本單位、目前生效的紀錄。上方的公告會顯示進行中的清查活動與期間。紀錄多時，可以用名稱、類型、解析內容或用途搜尋。"
- src: compositions/s04-unit-dns.html

## Frame 5 — 第 3 章 完成 DNS 清查

- scene: 章節開場 → 錄影：點「清查」→ 更新分機、寫清查備註 → 儲存並記錄清查；成功提示時畫面角落蓋上「已清查」章
- duration: 30.2s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom ＋ spring-pop-entrance（已清查章）
- voiceover: "清查是確認 DNS 是否仍在使用、聯絡資料是否正確。點選紀錄右側的「清查」。可以更新申請人、電子郵件、分機與用途；清查不會修改 DNS 解析內容。在清查備註寫下確認結果，例如服務仍在使用。按下「儲存並記錄清查」，系統會自動記錄時間與經手人。"
- src: compositions/s05-inspect.html

## Frame 6 — 第 4 章 申請新增 DNS

- scene: 章節開場 → 錄影：填申請人資料 → 類型 A、名稱 lab、選網域 example.com（顯示完整名稱）→ IP 與用途 → 送出；送出瞬間片頭的票卡從畫面右側滑入並蓋上「待審核」（spine 回收）
- duration: 45.4s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom（逐欄位 punch-in）＋ card-morph-anchor（票卡回收）
- voiceover: "要新增 DNS，點選左側的「申請 DNS」。先填申請人資料：姓名、電子郵件與分機必填，申請單位會自動帶入。再填 DNS 紀錄：先選類型，這裡用 A；名稱輸入主機名稱，再選擇網域，下方會顯示完整名稱。填入 IP 位址，並具體說明用途，之後清查會用到。所有網域都開放申請，申請 PTR 時只會列出反解網域。全部填好後按送出。送出後狀態是待審核，管理員核准前 DNS 不會變更。"
- src: compositions/s06-apply.html

Why：全片最重要的任務，票卡在這裡從概念變成真實送出的申請。

## Frame 7 — 第 5 章 DNS 歸屬申請

- scene: 章節開場 → 錄影：側欄點「DNS 歸屬申請」→ 填申請人資料 → 類型選 AAAA、名稱 api、選網域 example.com、解析內容 2001:db8::10 → 用途 → 指向表單下方說明並送出
- duration: 37.8s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom（名稱與類型欄位 punch-in）
- voiceover: "如果 DNS 已經存在、但還沒歸屬任何單位，可以用「DNS 歸屬申請」把它納入本單位。一樣先填申請人資料，申請單位會自動帶入。再填要歸屬的紀錄：類型、名稱、網域與目前的解析內容。並說明這筆 DNS 的用途。送出後由管理員審核；核准後歸屬本單位並記錄清查，解析內容不會改變。"
- src: compositions/s07-claim.html

Why：v2 新功能。既有但未歸屬的 DNS 由單位認領，核准後只改歸屬、不改解析。

## Frame 8 — 第 6 章 申請變更或刪除

- scene: 章節開場 → 錄影：在 app 紀錄點「申請變更」→ 新解析內容、變更原因 → 送出；最後 punch-in 到「申請刪除」按鈕
- duration: 26.6s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom
- voiceover: "要修改既有紀錄，在該筆紀錄點選「申請變更」。填入新的解析內容與變更原因，名稱、類型與 TTL 會維持不變。確認後送出變更申請。申請刪除的流程相同：寫下原因後送出，經管理員核准才會刪除。"
- src: compositions/s08-change.html

## Frame 9 — 第 7 章 追蹤申請紀錄

- scene: 章節開場 → 錄影：申請紀錄列表；票卡在旁邊浮出並對齊列表中的 lab 那一列（callback Frame 1）
- duration: 19.9s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ card-morph-anchor（callback）
- voiceover: "在「申請紀錄」可以查看本人與所屬單位的所有申請，包含新增、歸屬、變更與刪除。每筆申請都會顯示狀態：待審核、已核准或未核准；管理員的審核回覆也會顯示在這裡。"
- src: compositions/s09-records.html

## Frame 10 — 第 8 章 單位管理員：管理成員

- scene: 章節開場（角色膠囊切換成「單位管理員」）→ 錄影：單位管理頁、新增使用者輸入學號、加入成功、管理權限對話框
- duration: 37.8s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom ＋ scale-swap-transition（角色膠囊切換）
- voiceover: "接著換成單位管理員的帳號登入。單位管理員的選單多了「單位管理」。要加入新同仁，按「新增使用者」並輸入完整學號。已註冊的帳號會立即加入，預設為成員；還沒登入過的人，會在第一次登入後自動加入。點選「管理權限」，可以調整角色或移出單位；單位至少要保留一位管理員。提醒：單位角色沒有 DNS 審核權限，所有申請仍由系統管理員審核。"
- src: compositions/s10-unit-admin.html

## Frame 11 — 回顧

- scene: 七個重點以清單逐條排入並打勾，最後一句旁白時靜止（held frame）
- duration: 14.2s
- transition_in: push-left
- status: animated
- blueprint: grid-card-assemble（清單）＋ titlecard-reveal（靜止落點）
- voiceover: "重點回顧：查看與清查單位 DNS、提出新增與歸屬申請、追蹤結果，管理員再以學號管理成員。"
- src: compositions/s11-recap.html

## Frame 12 — 識別收尾

- scene: 校徽與「DNS Manager」字標組合成 lockup，下方一行「有問題請聯絡系統管理員」
- duration: 7.5s
- transition_in: crossfade
- status: animated
- blueprint: logo-assemble-lockup
- voiceover: "有問題請聯絡系統管理員，謝謝收看。"
- src: compositions/s12-outro.html
