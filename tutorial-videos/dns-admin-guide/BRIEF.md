---
workflow: general-video
flow: automation
storyboard: yes
message: "單位送出的申請，在後台審核後立即生效；歸屬、規則、帳號與稽核都在同一處管理"
destination: internal-training
aspect: 1920x1080
language: zh-TW
audience: DNS Manager 系統管理員
length: 6min
angle: tutorial
---

## Intent

「使用這些 skill（awesome-claude-video-skills）重新製作一版好看的使用介紹說明影片」。兩部之二：給 DNS Manager 後台 admin。
沿用前一版的真實操作流程與章節（後台導覽、審核、DNS 管理與歸屬、申請規則、單位管理、刪除保護與清查活動、帳號管理、操作紀錄），升級為有設計感的成片。

## Assets

- ../../public/ncu-emblem.png — 校徽，用於片頭與片尾識別。
- 真實操作錄影 — 以 Playwright 錄製最新 main 樣式的本機隔離環境（示範帳號、mock PowerDNS）。

- assets/bgm.mp3 — HeyGen 音樂庫 bgm_001（calm premium corporate, soft piano + ambient pads, 30s, track 7133e61f…），以 3 秒交叉淡化延長至片長，並以 carve 讓位給旁白。
- assets/voice.m4a — edge-tts zh-TW-HsiaoChenNeural 旁白合成。

## Customizations

- 視覺風格交由製作者決定（使用者選「交給你決定」）。
- 旁白：zh-TW 神經網路語音（edge-tts HsiaoChenNeural，沿用上一版選擇）。
- 輕柔背景音樂，旁白時自動壓低（carve）。

## Notes

- 畫面必須是真實系統錄影，不得仿造 UI。
- 示範資料皆為虛構；不得出現正式資料或憑證。
