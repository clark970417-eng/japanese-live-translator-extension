# 日文直播翻譯助手

![日文直播翻譯助手圖示](./icon-preview.png)

Opera GX／Chromium 擴充功能，可直接擷取 YouTube 或 X Spaces 分頁聲音，顯示日文原文與台灣繁體中文翻譯；也能翻譯標題、聊天室與貼文，並把中文轉成適合向日本 VTuber 留言的親切日文草稿。

## 主要功能

- 免費 WebGPU Whisper：直接在擴充功能內辨識分頁日文語音，不需要另開程式或 OpenRouter。
- NVIDIA Riva：將辨識出的日文翻成繁體中文。
- 可選 NVIDIA Nemotron 雲端語音模式，需 OpenRouter 音訊額度。
- YouTube 標題、直播聊天與一般留言翻譯。
- X／Twitter Spaces 字幕、貼文翻譯與回覆草稿。
- 中文轉自然、稍微可愛並保持禮貌的日文；所有內容由使用者確認後自行送出。
- 210px 精簡彈出視窗，技術錯誤不會覆蓋影片畫面。

## 免費模式

在「辨識模式與 API」選擇「免費｜WebGPU Whisper」，儲存 NVIDIA API Key，然後在播放中的分頁按「開始」。第一次使用會下載 Whisper tiny 模型並存入瀏覽器快取，所以初次啟動較久；後續可直接使用。辨識在本機 WebGPU 上執行，日文文字才會送到 NVIDIA 翻譯。

## 安裝

1. 下載並解壓縮 Release ZIP。
2. Opera GX 開啟 `opera://extensions`；Chrome 開啟 `chrome://extensions`。
3. 開啟開發人員模式，選擇「Load unpacked／載入未封裝項目」。
4. 選取含 `manifest.json` 的資料夾並重新整理 YouTube 或 X。
5. 在擴充功能內選擇模式、儲存 API Key，再於影片或 Space 分頁按「開始」。

## 隱私

API Key 儲存在瀏覽器的 `chrome.storage.local`，不包含於原始碼、GitHub 或 Release ZIP。免費模式的音訊留在瀏覽器內處理；辨識後的文字會傳給 NVIDIA 進行翻譯。本專案不含分析追蹤，也不會自動送出留言。

## 專案結構

- `background.js`：翻譯、字幕狀態與模式控制。
- `offscreen.*`：分頁音訊擷取及 WebGPU Whisper。
- `ort/`：ONNX Runtime WebGPU／WASM 執行檔。
- `content.*`：YouTube 翻譯與字幕介面。
- `x-content.*`：X／Spaces 翻譯介面。
- `popup.*`：模式、API 設定與啟停控制。
