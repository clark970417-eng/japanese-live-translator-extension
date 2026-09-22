# Public beta testing

This preview is intended for people who agree to test unfinished software and report what happened. It is not code-signed yet, so macOS and Windows may show a security warning.

## Download and install

Download the package for your computer and `japanese-live-translator-extension.zip` from the repository's **Releases** page.

### macOS

1. Choose the Apple Silicon package for M-series Macs or the Intel package for Intel Macs.
2. Drag **Japanese Live Translate** into Applications.
3. If macOS blocks the first launch, open **System Settings → Privacy & Security**, confirm that the app came from this project, and choose **Open Anyway**.
4. Grant microphone or screen/audio permission only when you use that feature.

### Windows

1. Run the x64 installer.
2. Windows SmartScreen may identify it as an unrecognized app because this beta is unsigned. Check that the download came from this repository before choosing **More info → Run anyway**.

### Browser extension

1. Unzip `japanese-live-translator-extension.zip`.
2. Open `opera://extensions`, `chrome://extensions`, or `edge://extensions`.
3. Turn on Developer mode, choose **Load unpacked**, and select the unzipped folder.
4. Keep the desktop app open when using desktop recognition or local writing translation.

## Ten-minute first test

1. Complete Quick Start and wait for its model download.
2. Open a live video, select the spoken and subtitle languages, then start audio.
3. Confirm that recognized text appears first and its translation follows without remaining on “Translating…”.
4. Enable website text translation and check the title plus three new chat messages.
5. Type a short message in the website editor, use the translation button, review the draft, and submit it yourself only if it is correct.
6. Stop and start once. Captions from the old session must not return.

## Platform checklist

Test only services you already use. Record **pass**, **fail**, or **not tested** for every row.

| Service | Live audio | Title/page text | New live chat | Writing draft | Stop/start recovery |
| --- | --- | --- | --- | --- | --- |
| YouTube |  |  |  |  |  |
| Twitch |  |  |  |  |  |
| TikTok |  |  |  |  |  |
| Bilibili |  |  |  |  |  |
| X / Twitter |  |  | n/a |  |  |

For a longer test, leave one real stream running for two hours. Note the delay near the beginning and end, memory use, any permanent “Translating…” line, missing messages, duplicate captions, and whether reconnecting recovered without restarting the computer.

## Report feedback

Use **Issues → New issue** and select either **Beta problem report** or **Translation quality feedback**. Include the app and extension version, computer type, browser, website, language pair, engine names, approximate delay, and exact reproduction steps. Remove API keys, private chats, account names, and other personal information.

Read [PRIVACY.md](PRIVACY.md) before testing cloud translation.
