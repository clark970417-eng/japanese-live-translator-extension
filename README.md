# 日文直播翻譯助手

![日文直播翻譯助手圖示](./icon-preview.png)

Opera GX／Chromium 擴充功能，可直接擷取 YouTube 或 X Spaces 分頁聲音，顯示日文原文與台灣繁體中文翻譯；也能翻譯標題、聊天室與貼文，並把中文轉成適合向日本 VTuber 留言的親切日文草稿。

## 主要功能

- 免費 WebGPU Whisper：直接在擴充功能內辨識分頁日文語音，不需要另開程式或 OpenRouter。
- 日文翻繁中優先使用 Google 翻譯端點；失敗時可使用已儲存的 NVIDIA Key。
- 音訊在瀏覽器 WebGPU 處理；3.0.2 不提供雲端語音模式。
- YouTube 標題、直播聊天與一般留言翻譯。
- X／Twitter Spaces 字幕、貼文翻譯與回覆草稿。
- 中文轉自然、稍微可愛並保持禮貌的日文；所有內容由使用者確認後自行送出。
- 210px 精簡彈出視窗，技術錯誤不會覆蓋影片畫面。

## 免費模式

在播放日文影片的分頁按「開始」。第一次使用會下載 Whisper tiny 模型並存入瀏覽器快取。需要支援 WebGPU 的瀏覽器；辨識會使用本機 GPU，並非零延遲。文字翻譯需要網路，第三方免費端點可能限流或失效。

3.0.2 使用 AudioWorklet 擷取音訊、獨立 worker 辨識、限制待處理佇列，並阻止過期翻譯覆蓋新字幕。字幕維持日文與繁中各一行，顏色、字級、黑色描邊可調。測試範圍及限制見 [測試紀錄](V3-TEST-STATUS.md)。

## 安裝

1. 下載並解壓縮 Release ZIP。
2. Opera GX 開啟 `opera://extensions`；Chrome 開啟 `chrome://extensions`。
3. 開啟開發人員模式，選擇「Load unpacked／載入未封裝項目」。
4. 選取含 `manifest.json` 的資料夾並重新整理 YouTube 或 X。
5. 於影片或 Space 分頁按擴充功能的「開始」。

## 隱私

API Key 儲存在瀏覽器的 `chrome.storage.local`，不包含於原始碼、GitHub 或 Release ZIP。免費模式的音訊留在瀏覽器內處理；辨識後的文字會傳给 Google 翻譯端點，或在失敗時傳給已設定的 NVIDIA；中文回覆草稿也可能使用已設定的 OpenRouter。本專案不含分析追蹤，也不會自動送出留言。

## 專案結構

- `background.js`：翻譯、字幕狀態與模式控制。
- `offscreen.*`：分頁音訊擷取及 WebGPU Whisper。
- `ort/`：ONNX Runtime WebGPU／WASM 執行檔。
- `content.*`：YouTube 翻譯與字幕介面。
- `x-content.*`：X／Spaces 翻譯介面。
- `popup.*`：字幕外觀、診斷與啟停控制。
