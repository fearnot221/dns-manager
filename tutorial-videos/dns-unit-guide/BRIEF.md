---
workflow: general-video
flow: automation
storyboard: yes
message: "單位同仁不必再寄信或填紙本：在 DNS Manager 就能查看、清查、申請 DNS，並自行管理單位成員"
destination: internal-training
aspect: 1920x1080
language: zh-TW
audience: 校內單位成員與單位管理員
length: 5-6min
angle: tutorial
---

## Intent

「使用這些 skill（awesome-claude-video-skills）重新製作一版好看的使用介紹說明影片」。兩部之一：給單位 user 與單位 admin。
沿用前一版的真實操作流程與章節（登入導覽、單位 DNS、清查、申請新增、變更／刪除、申請紀錄、單位管理），升級為有設計感的成片。

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
