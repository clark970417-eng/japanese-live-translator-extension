const translated = new WeakMap();
const cache = new Map();

const hasJapanese = text => /[\u3040-\u30ff]/.test(text);
const hasChinese = text => /[\u3400-\u9fff]/.test(text) && !hasJapanese(text);

function requestTranslation(text, direction, priority = false) {
  const key = `${direction}:${text}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(
    {type: "translate", text, direction, priority},
    reply => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      if (!reply?.ok) return reject(new Error(reply?.error || "翻譯失敗"));
      cache.set(key, reply.text);
      resolve(reply.text);
    }
  ));
}

async function translateElement(element, className, priority = false) {
  if (!element) return false;
  const text = element.textContent.trim();
  if (!text || !hasJapanese(text)) return false;
  if (translated.get(element) === text) return true;
  translated.set(element, text);
  try {
    const result = await requestTranslation(text, "ja-zh", priority);
    if (!element.isConnected || !result) return false;
    let line = element.parentElement?.querySelector(`:scope > .${className}`);
    if (!line) {
      line = document.createElement("div");
      line.className = className;
      element.insertAdjacentElement("afterend", line);
    }
    line.textContent = `中：${result}`;
    return true;
  } catch (error) {
    translated.delete(element);
    return false;
  }
}

function scan() {
  if (window.top === window) {
    document.querySelectorAll("ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata").forEach(el => translateElement(el, "jtl-title", true));
    installCommentButtons();
    installSubtitleOverlay();
  }
  document.querySelectorAll("#message.yt-live-chat-text-message-renderer, yt-live-chat-text-message-renderer #message").forEach(el => translateElement(el, "jtl-translation"));
  installComposerButton();
}

function installCommentButtons() {
  document.querySelectorAll("ytd-comment-thread-renderer #content-text, ytd-comment-view-model #content-text").forEach(element => {
    const text = element.textContent.trim();
    if (!text || !hasJapanese(text) || element.parentElement?.querySelector(":scope > .jtl-comment-action")) return;
    const action = document.createElement("button");
    action.type = "button";
    action.className = "jtl-comment-action";
    action.textContent = "翻成繁中";
    action.addEventListener("click", async () => {
      action.disabled = true;
      action.textContent = "翻譯中…";
      try {
        const ok = await translateElement(element, "jtl-translation", true);
        if (!ok) throw new Error("翻譯失敗");
        action.textContent = "已翻譯";
      } catch (_error) {
        action.disabled = false;
        action.textContent = "再試一次";
      }
    });
    element.insertAdjacentElement("afterend", action);
  });
}

function runtimeMessage(message) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, reply => {
    if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
    if (!reply?.ok) return reject(new Error(reply?.error || "本機服務未啟動"));
    resolve(reply.text);
  }));
}

function installSubtitleOverlay() {
  const player = document.querySelector("#movie_player");
  if (!player || document.querySelector("#jtl-subtitles")) return;
  const overlay = document.createElement("div");
  overlay.id = "jtl-subtitles";
  overlay.innerHTML = '<div class="jtl-spoken"></div><div class="jtl-chinese"></div>';
  player.appendChild(overlay);
}

let lastSubtitleKey = "";
function renderSubtitle(item) {
  if (!item) return;
  installSubtitleOverlay();
  const overlay = document.querySelector("#jtl-subtitles");
  if (!overlay) return;
  const key = `${item.id}:${item.original}:${item.translated}`;
  if (key === lastSubtitleKey) return;
  lastSubtitleKey = key;
  overlay.querySelector(".jtl-spoken").textContent = item.original || "";
  overlay.querySelector(".jtl-chinese").textContent = item.translated === "(translating...)" ? "翻譯中…" : (item.translated || "");
  overlay.classList.toggle("jtl-visible", Boolean(item.original));
}
async function pollSubtitles() {
  if (window.top !== window) return;
  try {
    const data = await runtimeMessage({type: "subtitles"});
    renderSubtitle(data.items?.[data.items.length - 1]);
  } catch (_error) {}
}
chrome.runtime.onMessage.addListener(message => {
  if (message.type === "subtitle-update" && window.top === window) renderSubtitle(message.item);
});

function editableText(box) {
  return (box.innerText || box.textContent || "").trim();
}

function replaceEditable(box, text) {
  box.focus();
  document.execCommand("selectAll", false, null);
  document.execCommand("insertText", false, text);
  box.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText", data: text}));
}

function installComposerButton() {
  const box = document.querySelector("#input[contenteditable='true'], #input.yt-live-chat-text-input-field-renderer");
  if (!box || document.querySelector(".jtl-compose")) return;
  const button = document.createElement("button");
  button.className = "jtl-compose";
  button.type = "button";
  button.textContent = "中 → 日";
  const status = document.createElement("span");
  status.className = "jtl-status";
  button.addEventListener("click", async () => {
    const text = editableText(box);
    if (!text) return;
    if (!hasChinese(text)) { status.textContent = "請先輸入中文"; return; }
    button.disabled = true;
    status.textContent = "翻譯中…";
    try {
      const result = await requestTranslation(text, "zh-ja");
      replaceEditable(box, result);
      status.textContent = "已翻成日文，確認後按送出";
    } catch (error) {
      status.textContent = `翻譯失敗：${error.message}`;
    } finally { button.disabled = false; }
  });
  const anchor = box.closest("yt-live-chat-text-input-field-renderer") || box.parentElement;
  anchor.parentElement?.append(button, status);
}

let timer;
new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(scan, 250);
}).observe(document.documentElement, {childList: true, subtree: true});
scan();
if (window.top === window) setInterval(pollSubtitles, 700);
