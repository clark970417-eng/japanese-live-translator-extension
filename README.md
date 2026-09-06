# 日文直播翻譯助手

![日文直播翻譯助手圖示](./icon-preview.png)

這是一個 Opera GX／Chromium 擴充功能，將 YouTube 與 X 的日文內容翻成台灣繁體中文，也能把中文留言轉成適合與日本 VTuber 互動的自然日文草稿。

## 功能

- YouTube 日文語音即時顯示原文與繁中翻譯。
- 自動翻譯 YouTube 影片標題與直播聊天室訊息；一般留言可按需翻譯。
- 在 YouTube 直播聊天室把中文轉成日文草稿。
- 在 X／Twitter 顯示 Spaces 日文語音字幕。
- 手動將 X 貼文翻成繁中。
- 在 X 發文或回覆框產生親切、可愛且有禮貌的日文草稿。
- 所有譯文都先供使用者確認；擴充功能不會自動發送留言。

## 翻譯語氣

中文轉日文以日本 VTuber 直播聊天室為使用情境。譯文偏自然日常口語，帶一點可愛並保留禮貌；保留原文情緒、表情符號、專有名詞與網址，不擅自添加告白、暱稱或過度親密的稱呼。

## 安裝

1. 下載並解壓縮 Release 中的 ZIP。
2. 在 Opera GX 開啟 `opera://extensions`；Chrome 則開啟 `chrome://extensions`。
3. 開啟開發人員模式。
4. 按「Load unpacked／載入未封裝項目」，選取含有 `manifest.json` 的資料夾。
5. 重新整理已開啟的 YouTube 或 X 頁面。

## 本機服務需求

擴充功能不是獨立的語音辨識器。它連接使用者 Mac 上的即時字幕橋接服務：

- `127.0.0.1:17381`：提供語音字幕並代送文字翻譯請求。

語音辨識使用本機 Whisper／MLX Whisper 與 BlackHole 2ch；文字翻譯可設定為 OpenRouter、NVIDIA NIM 或其他 OpenAI 相容雲端 API。開始播放 YouTube 或 X Spaces 前，Mac 系統輸出需選擇已設定的「即時字幕＋喇叭」，並先啟動本機字幕程式。

目前擴充功能讀取的是 Mac 系統聲音，因此其他同時播放的聲音也可能被辨識。X Space 若沒有平台提供的留言入口，可在相關貼文下回覆；擴充功能不會建立 X 本身沒有的留言功能。

## 隱私

API Key 只儲存在本機字幕程式的設定中，不會放入擴充功能。擴充功能只連接 localhost 橋接器；使用雲端翻譯時，待翻譯文字會傳給所設定的 API 供應商。專案不包含分析追蹤，也不會自行發布內容。

## 專案結構

- `background.js`：翻譯請求排程與字幕橋接服務通訊。
- `content.js`／`content.css`：YouTube 翻譯與影片字幕介面。
- `x-content.js`／`x-content.css`：X／Spaces 字幕、貼文與留言草稿介面。
- `popup.*`：擴充功能選單與字幕啟停控制。
- `icons/`：16、32、48、128 像素圖示。

## 狀態

JavaScript 語法、Manifest 引用與 ZIP 完整性已驗證。OpenRouter 雲端翻譯與語音字幕顯示已實機測試成功；YouTube 與 X 的頁面介面仍可能因網站更新而需要調整選擇器。

## 設計說明

圖示使用中日語言卡片與聲波概念，參考一般翻譯工具的辨識方式重新設計，並非 Google Translate 圖示或其衍生作品。本專案與 Google、YouTube、X／Twitter 及任何 VTuber 團體皆無關聯。
