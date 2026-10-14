# DNS Manager 使用教學影片

兩部繁體中文旁白的操作教學，以 [HyperFrames](https://hyperframes.heygen.com) 製作。畫面是本機隔離環境（示範帳號、模擬 PowerDNS）的真實操作錄影，不含正式資料。

| 專案 | 對象 | 長度 |
| --- | --- | --- |
| [`dns-unit-guide/`](dns-unit-guide/) | 單位成員、單位管理員 | 約 4:28 |
| [`dns-admin-guide/`](dns-admin-guide/) | DNS Manager 系統管理員 | 約 5:20 |

每個專案包含：

- `BRIEF.md`、`STORYBOARD.md`：需求、分鏡與實際時間軸。
- `storyboard.html`：已確認的版面草圖（可直接用瀏覽器開啟）。
- `index.html`、`compositions/`：影片合成；`assets/voice.m4a` 為旁白，`assets/bgm.mp3` 為背景音樂（HeyGen 音樂庫）。
- `*.srt`：字幕，可隨影片上傳至教學平台。

## 不在 Git 中的檔案

成片 MP4 超過 GitHub 單檔上限，另行發布；操作錄影素材（`assets/footage.mp4`、`assets/clips/`）與 `node_modules/` 也不進版控。重新渲染前需在本機重新錄製素材並切出各章片段，否則章節畫面會是空白。

## 重新渲染

需要 Node.js 22+ 與 FFmpeg：

```bash
cd tutorial-videos/dns-unit-guide
npx hyperframes check
npx hyperframes render -q delivery --video-frame-format png
```

重新產生合成檔會覆寫 `index.html`；之後須再執行一次背景音樂讓位（HyperFrames audio carve），旁白時音樂才會自動壓低。
