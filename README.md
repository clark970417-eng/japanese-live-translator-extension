# 日文直播翻譯助手

![日文直播翻譯助手圖示](./icon-preview.png)

這是一個 Opera GX／Chromium 擴充功能，可直接擷取目前 YouTube 或 X Spaces 分頁的聲音，將日文語音辨識後翻成台灣繁體中文；也能翻譯頁面內容，並把中文留言轉成適合與日本 VTuber 互動的日文草稿。

## 功能

- 在擴充功能內啟動或停止目前分頁的日文語音字幕，不必另外開啟本機程式。
- 自動翻譯 YouTube 影片標題與直播聊天室訊息；一般留言可按需翻譯。
- 在 YouTube 聊天室將中文轉成親切、稍微可愛且有禮貌的日文草稿。
- 支援 X／Twitter Spaces 語音字幕、貼文翻譯及中文轉日文回覆草稿。
- 所有留言只產生草稿，需由使用者確認後自行送出。
- 精簡的 210px 彈出視窗，約為舊版寬度的一半。

## 雲端服務

語音辨識使用 OpenRouter 上的 NVIDIA Nemotron ASR；日文轉繁中使用 NVIDIA Riva Translate。擴充功能首次使用時需在「API 設定」填入 OpenRouter API Key 與 NVIDIA API Key（NVIDIA Build／NIM）。

OpenRouter 的音訊 API 要求帳戶至少有 US$0.50 餘額。兩組 Key 只儲存在瀏覽器的 `chrome.storage.local`，不會包含在原始碼、GitHub 或 Release ZIP 中。分頁音訊與待翻譯文字會送至相應的雲端服務處理。

## 安裝

1. 下載並解壓縮 Release 中的 ZIP。
2. 在 Opera GX 開啟 `opera://extensions`；Chrome 則開啟 `chrome://extensions`。
3. 開啟開發人員模式。
4. 按「Load unpacked／載入未封裝項目」，選取含有 `manifest.json` 的資料夾。
5. 重新整理 YouTube 或 X 頁面，打開擴充功能並儲存兩組 API Key。
6. 在正在播放的影片或 Space 分頁按「開始」。

## 翻譯語氣

中文轉日文以日本 VTuber 直播聊天室為使用情境。譯文偏自然日常口語，帶一點可愛並保留禮貌；保留原文情緒、表情符號、專有名詞與網址，不擅自添加告白、暱稱或過度親密的稱呼。

## 專案結構

- `background.js`：OpenRouter 語音辨識、NVIDIA 翻譯及字幕狀態。
- `offscreen.*`：在擴充功能背景擷取與分段目前分頁聲音。
- `content.*`：YouTube 翻譯與字幕介面。
- `x-content.*`：X／Spaces 字幕、貼文與回覆草稿介面。
- `popup.*`：API 設定與字幕啟停控制。

## 狀態

Manifest、JavaScript 語法、分頁擷取與錯誤回報已在 Opera GX 實機驗證。網站介面更新時，YouTube 或 X 的頁面選擇器可能需要跟著調整。
