# 日文直播翻譯助手

![日文直播翻譯助手圖示](./icon-preview.png)

Opera GX／Chromium 擴充功能，可直接擷取 YouTube 或 X Spaces 分頁聲音，顯示日文原文與台灣繁體中文翻譯；也能翻譯標題、聊天室與貼文，並把中文轉成適合向日本 VTuber 留言的親切日文草稿。

## 完整記錄模式（3.4.0）

字幕設定可選「完整記錄 · 依序翻譯 · 四組字幕」（新預設），或保留「即時優先 · 單組字幕」。切換模式於下次開始收音生效。

完整模式在偵測到停頓後，先把辨識文字儲存在 extension 本機儲存空間，再依序翻譯；翻譯時繼續辨識下一句。已辨識的文字不受三秒翻譯截止影響。四組顯示依翻譯處理順序前進，不會因後面積壓很多句而跳過尚未翻出的舊句。連續長語音仍以有限音訊視窗辨識，但同一段未停頓的結果會合併成一組。這不是保存原始錄音，也不能保證語音辨識無漏字。

日中同字級，預設 22px 白字與 1px 黑邊，組間留半行；四組日中字幕共用一個連續的 60% 黑色半透明方框，行距與空白處的背景不會斷開，可在設定調整底色與透明度（0% 為透明）；長句只在寬度不足時自然換行。按住字幕區拖曳，拉邊緣或角落縮放，位置與大小會保存。四組在完整模式下保留至新句替換；即時模式才使用秒數消失設定。縮小到無法容納內容時可捲動字幕區。

「字幕記錄」可匯出原文與譯文、重試失敗翻譯。停止收音後仍處理已記錄文字；瀏覽器重新啟動後，下一次開始或開啟記錄會恢復未完成工作。API 持續較慢時延遲會累積；無法保證零延遲。若辨識／儲存負載超限，會明確停止收音並保留已辨識文字，而不是靜默丟棄。文字記錄保存在瀏覽器，不上傳 GitHub。

## 兩個獨立控制

- **網站文字翻譯**：開關 YouTube 日文標題、直播聊天／彈幕與留言翻譯，以及 X 貼文翻譯控制。關閉會立即清除已顯示的譯文；再次開啟會重新掃描。中翻日草稿按鈕也在此功能內。
- **影片／直播語音字幕**：在目前影片或 Spaces 分頁按「開始語音」，按「停止語音」結束。與網站文字開關互不影響，不會因開啟文字翻譯而收音。

3.3.3 改用 NVIDIA Nemotron 3.5 Lightning 並關閉推理輸出；一般留言的可愛禮貌模式需要有效 API Key 與可用服務。免費短句與普通機翻仍可使用。

## 主要功能

- WebGPU Whisper small（FP32）：在擴充功能內辨識日文語音；Silero V5 先判斷人聲，不需另外開啟程式。
- 日文翻繁中優先使用 Google 翻譯端點；失敗時可使用已儲存的 NVIDIA Key。
- 音訊在瀏覽器 WebGPU 處理；目前不提供雲端語音模式。
- YouTube 標題、直播聊天與一般留言翻譯。
- X／Twitter Spaces 字幕、貼文翻譯與回覆草稿。
- 中文轉自然、稍微可愛並保持禮貌的日文；所有內容由使用者確認後自行送出。
- 260px 精簡彈出視窗，技術錯誤不會覆蓋影片畫面。

## 免費模式

3.3.0 新增辨識過程中的逐步文字輸出，讓翻譯不必等整次辨識結束才開始。相同測試音檔的暖機對照中，首次文字由約 1.05～1.10 秒提前到 0.44～0.46 秒；這不是直播到中文的總延遲。目前仍使用分窗 Whisper，並未改成能重用跨窗聲學狀態的原生串流模型，也尚未微調模型。

在播放日文影片的分頁按「開始」。第一次使用會下載 Whisper small 模型並存入瀏覽器快取，需要較多下載時間和 GPU 記憶體。Silero V5 模型隨擴充功能提供。需要支援 WebGPU 的瀏覽器；辨識會使用本機 GPU，並非零延遲。文字翻譯需要網路，第三方免費端點可能限流或失效。

3.2.1 使用 AudioWorklet 擷取、獨立 VAD 與辨識 worker、依連續兩次假設共同前綴判斷穩定文字，並補償低音量輸入（最多 12 倍，不改變播放音量）。每段音訊最多約 12 秒，長段保留約 2 秒重疊；暫定字幕在段落結束前更新。翻譯最多兩個並行請求，等待區只保留最新一句；已完成的日中配對維持顯示，直到較新的配對完成，避免慢網路造成字幕一直空白。字幕維持日文與繁中各一行。已開啟的 YouTube 日文 CC 會優先使用；沒有 CC 的直播直接辨識語音。測試範圍及限制見 [測試紀錄](V3-TEST-STATUS.md)。

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
- `vad-worker.js`、`vendor/silero/`：本機人聲偵測。
- `streaming.mjs`：持續重採樣、重疊視窗、共同前綴與延遲統計。
- `token-stream.mjs`：辨識期間的日文暫定文字輸出。
- `ort/`：ONNX Runtime WebGPU／WASM 執行檔。
- `content.*`：YouTube 翻譯與字幕介面。
- `x-content.*`：X／Spaces 翻譯介面。
- `popup.*`：字幕外觀、診斷與啟停控制。

## 測試

執行 `node --test tests/*.test.mjs`。模型測試可用 `python3 -m http.server 8766 --bind 127.0.0.1` 啟動，再於支援 WebGPU 的瀏覽器開啟 `http://127.0.0.1:8766/tests/browser.html`。這會真正載入 Silero 和 Whisper，但不是直播端到端測試。

`tests/japanese-fixture.wav` 是 macOS Kyoko 合成語音，內容為：「みなさん、こんにちは。今日は一緒にゲームを楽しみましょう。ちょっと待ってください。魚が逃げてしまいました。来てくれてありがとうございます。」不含使用者錄音。

完整收音測試：載入包含 `tests/` 的擴充功能後，開啟 `chrome-extension://你的擴充功能ID/tests/capture.html`，先從工具列按「開始」，等模型就緒後播放音檔。表格記錄正式字幕介面出現的日中配對與播放後時間；此測試也會使用正常的網路翻譯服務。

增量輸出使用 [Transformers.js 的 streamer 介面](https://huggingface.co/docs/transformers.js/en/api/generation/streamers)，並依本專案所附執行檔的 `put/end` 協定實作日文預覽。
# Translation update 3.3.1

Reviewed short phrases, shared text requests, slow-request backup, and polite/cute viewer drafts are documented in [TRANSLATION-NOTES.md](TRANSLATION-NOTES.md). The popup has collapsed NVIDIA/OpenRouter settings. Without a working style provider, drafts explicitly say they are general machine translation. Full clauses are retained for translation instead of deleting their opening words to fit the subtitle line. No model training was performed.
