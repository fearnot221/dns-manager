---
format: 1920x1080
duration: 6:14.8
message: "單位送出的申請，在後台審核後立即生效；歸屬、規則、郵件、帳號與稽核都在同一處管理"
arc: Hook（票卡翻成已核准）→ 後台地圖 → 9 段真實操作 → 回顧 → 識別收尾
audience: DNS Manager 系統管理員
mode: collaborative
---

# DNS Manager 使用教學 · 系統管理員篇 — v3

## Decisions

- **Message**: 單位的申請在這裡審核後立即生效；歸屬、規則、郵件、單位、帳號與稽核都在同一處管理。
- **Audience / arc**: 系統管理員；Hook → 後台地圖 → 9 段操作 → 回顧 → 收尾。
- **Format**: 1920×1080、約 6 分鐘、zh-TW 旁白、輕柔 BGM（carve）。字幕條下方 keep-out。
- **The spine**: 與單位篇相同的「DNS 申請單」票卡 `lab.example.com · A · 140.115.10.50`。片頭以「待審核」出現 → 第 2 章真實核准時翻成「已核准」並帶上「計算機中心」歸屬標籤 → 第 3 章在 DNS 管理列表中再次對位（callback）。
- **Brand**: 與單位篇共用同一份設計（系統 tokens：`#f4f5f7` / `#1a1d23` / `#2457b8`，Songti TC Bold + PingFang TC + Geist Mono，校徽）。系統管理員篇的章節色條用同一主色，角色膠囊為「系統管理員」。
- **Bans**: 同單位篇；另外不示範刪除 DNS（示範環境沒有刪除保護密碼，只以旁白說明）。
- **Held frame**: Frame 12 回顧卡最後一句旁白靜止 1.5 秒。
- **Truthfulness**: 操作畫面為本機隔離環境的真實錄影；申請由單位篇錄影中的成員實際送出。

## Locked

- 計畫（v1）與草圖（storyboard.html v1）已由使用者確認：「計畫可以，先出草圖」「草圖可以，開始製作」。版面、文案與字體依草圖建置，不重畫。

- v2（2026-10-19）：依目前介面重錄。使用者確認章節計畫：「計畫可以，照這份章節開始錄影與製作。」版面、字體與票卡 spine 沿用 v1 草圖，只增修章節與旁白。

- v3（2026-10-19）：「根據最新修正後的內容 修正教學影片的內容」。依 main 最新介面重錄：申請表單改為類型→名稱→網域、所有網域開放申請（PTR 只列反解網域）、申請規則改為設定僅限系統管理員申請的類型。

## Final timing (from index.html)

| Scene | Start | Duration |
| --- | --- | --- |
| s01-hook | 0:00.0 | 12.6s |
| s02-map | 0:12.0 | 11.6s |
| s03-login | 0:23.0 | 34.2s |
| s04-review | 0:56.6 | 64.7s |
| s05-dns | 2:00.7 | 55.8s |
| s06-policy | 2:55.9 | 33.8s |
| s07-units | 3:29.2 | 32.6s |
| s08-protect-events | 4:01.1 | 29.5s |
| s09-mail | 4:30.0 | 38.6s |
| s10-accounts | 5:08.0 | 22.1s |
| s11-audit | 5:29.5 | 24.7s |
| s12-recap | 5:53.5 | 14.0s |
| s13-outro | 6:06.9 | 7.9s |

實際總長 6:14.8（push-left 轉場與相鄰場景重疊 0.6 秒）。章節長度由真實操作錄影決定，旁白長度決定設計場景長度。
## Frame 1 — 待審核 → 已核准（Hook）

- scene: 票卡從畫面外滑入，狀態「待審核」；大標「單位送出的申請，在這裡生效」；狀態膠囊翻轉成綠色「已核准」
- duration: 12.6s
- transition_in: cut
- status: animated
- blueprint: kinetic-type-beats ＋ theme-crossfade-morph（狀態膠囊翻轉）
- voiceover: "單位送出的 DNS 申請，在後台審核後立即生效。這部影片說明系統管理員的日常操作。"
- src: compositions/s01-hook.html

## Frame 2 — 後台地圖

- scene: 兩欄地圖：「日常與審核作業」申請審核／DNS 管理與歸屬／單位管理；「系統設定」申請規則／刪除保護・清查活動／郵件服務／帳號管理／操作紀錄，逐項排入
- duration: 11.6s
- transition_in: push-left
- status: animated
- blueprint: grid-card-assemble
- voiceover: "系統管理員的範圍涵蓋全部單位與網域，接下來分九段介紹後台操作。"
- src: compositions/s02-map.html

## Frame 3 — 第 1 章 登入與後台導覽

- scene: 章節開場 → 錄影：登入、系統範圍、四組選單（日常作業／申請作業／審核作業／系統設定）依序圈選
- duration: 34.2s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom
- voiceover: "使用系統管理員帳號登入，正式環境請透過學校帳號登入。系統管理員的範圍涵蓋全部單位與網域。選單分成四組：日常作業包含單位 DNS、單位管理與 DNS 管理；申請作業可以代單位提出申請。審核作業是申請審核；系統設定包含申請規則、刪除保護、郵件服務、清查活動、帳號管理與操作紀錄。"
- src: compositions/s03-login.html

## Frame 4 — 第 2 章 審核 DNS 申請

- scene: 章節開場 → 錄影：待審核分頁、展開 lab 申請、核准並填回覆；核准 api 的「歸屬申請」；app 變更申請不核准並填原因；切到已核准分頁。核准瞬間票卡翻成「已核准」（spine）
- duration: 64.7s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom ＋ theme-crossfade-morph（票卡狀態翻轉）
- voiceover: "登入後預設進入申請審核，分頁可以切換待審核、已核准、未核准與已取消。點選任一列可以展開完整資料：申請類別、完整名稱、申請人、單位與用途。確認內容無誤後按「核准」，視窗會提醒核准後立即變更 DNS。可以填寫審核回覆給申請人，再按「核准並套用紀錄」。標示「歸屬申請」的是單位要認領既有的 DNS。核准後歸屬該單位並記錄清查，不會修改解析內容。確認後按「核准歸屬並記錄清查」。若申請資料不足，可以選擇「不核准」並說明原因。審核回覆會顯示在申請人的申請紀錄中，方便對方補件後重新申請。處理完成後，可以在「已核准」與「未核准」分頁查看結果。"
- src: compositions/s04-review.html

Why：全片價值主張的證據 —— 單位申請在這裡變成生效的 DNS。

## Frame 5 — 第 3 章 DNS 管理與歸屬單位

- scene: 章節開場 → 錄影：網域分頁、搜尋 lab（票卡對位 callback）、指出已歸屬的 api、以「歸屬」按鈕把 MX 紀錄指派給計算機中心、直接新增 status 紀錄、歷程與 CSV 匯出按鈕
- duration: 55.8s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom ＋ card-morph-anchor（票卡 callback）
- voiceover: "「DNS 管理」依網域列出所有解析值，以及申請人、單位、用途與清查狀態。剛剛核准的 lab 紀錄已經出現，並帶入申請單位與用途。剛核准歸屬的 api 已經屬於計算機中心。尚未歸屬的紀錄，也可以直接按「歸屬」指派給單位。選擇計算機中心並確認。只會指派這一筆，也不會改變 DNS 解析。系統管理員也可以直接新增紀錄：選擇類型、輸入名稱與 IP，儲存後立即生效。每筆紀錄都有「歷程」；「DNS 歷程」還能查看已刪除紀錄的變更經過。右上角可以匯出全部 DNS 的 CSV 檔，作為清查或備份資料。"
- src: compositions/s05-dns.html

## Frame 6 — 第 4 章 申請規則

- scene: 章節開場 → 錄影：「僅限系統管理員申請的類型」勾選區 punch-in → 勾選 CAA 並儲存 → 指向說明：所有網域開放申請，PTR 只列反解網域
- duration: 33.8s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom ＋ control-target-sync（開關與狀態文字）
- voiceover: "「申請規則」設定哪些 DNS 類型僅限系統管理員申請；沒有勾選的類型，所有單位成員都可以申請。例如勾選 CAA 並儲存，之後只有系統管理員能申請 CAA 紀錄。所有網域都開放申請：申請 PTR 時只列出反解網域，其他類型只列出正解網域。"
- src: compositions/s06-policy.html

## Frame 7 — 第 5 章 單位管理

- scene: 章節開場 → 錄影：單位清單、建立單位「電機工程學系」並以學號指定管理人、修改名稱按鈕、使用者管理的「指定單位管理人」
- duration: 32.6s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom
- voiceover: "「單位管理」左側列出所有單位，右側可以查看該單位的 DNS 與使用者。按「建立單位」，輸入單位名稱，並以學號指定管理人；管理人須已登入註冊過。建立後立即生效；之後也可以改名，或在沒有 DNS 與待審申請時刪除單位。下方的使用者管理可以新增成員，或按「指定單位管理人」授予管理權限。"
- src: compositions/s07-units.html

## Frame 8 — 第 6 章 刪除保護與清查活動

- scene: 章節開場 → 錄影：刪除保護說明頁 → 清查活動列表、編輯對話框
- duration: 29.5s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom
- voiceover: "「刪除保護」：刪除 DNS 前必須輸入專用密碼，只有最高管理員能設定；未設定時所有刪除都會暫停。「清查活動」用來公告清查期間，單位使用者會在單位 DNS 頁面看到活動名稱與日期。點選編輯可以調整名稱與起訖日期；同一時間只能有一個活動，日期以台北時間計算。"
- src: compositions/s08-protect-events.html

## Frame 9 — 第 7 章 郵件服務

- scene: 章節開場 → 錄影：通知設定（啟用開關、加密連線、寄件者、網管小組收件地址）→ 郵件模板分組與即時預覽 → 寄信給單位的收件單位清單 → 寄送紀錄。只瀏覽，不儲存、不寄信
- duration: 38.6s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom（模板面板 punch-in）
- voiceover: "「郵件服務」設定系統通知信：啟用開關、加密連線、寄件者，以及網管小組的收件地址。「郵件模板」依情境分組：申請通知寄給網管小組，審核結果寄給申請人，清查活動寄給單位管理員。每個模板都能個別啟用並修改內容，右側會用範例資料即時預覽。「寄信給單位」可以勾選單位，一次寄信給各單位的管理員。所有寄出的郵件，都會記錄在「寄送紀錄」。"
- src: compositions/s09-mail.html

Why：v2 新功能。示範環境未設定 SMTP，畫面停在設定與預覽，不實際寄出郵件。

## Frame 10 — 第 8 章 帳號管理

- scene: 章節開場 → 錄影：搜尋帳號、管理對話框的角色與狀態欄位、取消
- duration: 22.1s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom
- voiceover: "「帳號管理」依單位分組列出所有帳號，可以搜尋姓名、學號、電子郵件或單位。按「管理」可以編輯備註、調整角色或停用帳號；最高管理員帳號受到額外保護。這次不做變更，按取消關閉。"
- src: compositions/s10-accounts.html

## Frame 11 — 第 9 章 操作紀錄

- scene: 章節開場 → 錄影：搜尋與篩選、展開一筆紀錄查看變更前後內容
- duration: 24.7s
- transition_in: push-left
- status: animated
- blueprint: device-surface-showcase ＋ coordinate-target-zoom
- voiceover: "「操作紀錄」保存所有登入、申請、審核與 DNS 變更，只能查閱，無法修改或刪除。可以輸入姓名或網域後按 Enter 搜尋，也能依結果與操作類型篩選。點選列首的箭頭展開，就能查看請求資訊與變更前後的內容。"
- src: compositions/s11-audit.html

## Frame 12 — 回顧

- scene: 九項重點逐條排入並打勾，最後一句靜止（held frame）
- duration: 14.0s
- transition_in: push-left
- status: animated
- blueprint: grid-card-assemble ＋ titlecard-reveal
- voiceover: "重點回顧：審核即生效、維護 DNS 歸屬、設定規則與郵件通知，並管理單位、帳號與操作紀錄。"
- src: compositions/s12-recap.html

## Frame 13 — 識別收尾

- scene: 校徽與「DNS Manager」lockup，下方一行「所有變更都留有紀錄」
- duration: 7.9s
- transition_in: crossfade
- status: animated
- blueprint: logo-assemble-lockup
- voiceover: "所有變更都會留下紀錄。謝謝收看。"
- src: compositions/s13-outro.html
