(() => {
if(window.__jtlV3)return;window.__jtlV3=true;
let translated = new WeakMap();
let websiteTextEnabled=false, textEpoch=0, contextInvalid=false;
let languageSettings={readSource:'ja',readTarget:'zh',typeSource:'zh',typeTarget:'ja',speechSource:'ja',speechTarget:'zh',syncTextLanguages:true};
const langLabel=code=>({ja:'日',zh:'中',en:'英',ko:'韓',es:'西',fr:'法',de:'德',pt:'葡',it:'義',ru:'俄',th:'泰',vi:'越',id:'印尼',ar:'阿'})[code]||code.toUpperCase();
const direction=kind=>`${languageSettings[kind+'Source']}-${languageSettings[kind+'Target']}`;
const languagePattern={ja:/[\u3040-\u30ff]/,zh:/[\u3400-\u9fff]/,ko:/[\uac00-\ud7af]/,ru:/[\u0400-\u04ff]/,ar:/[\u0600-\u06ff]/,th:/[\u0e00-\u0e7f]/};
const matchesLanguage=(text,lang)=>languagePattern[lang]?.test(text)??/[A-Za-zÀ-ž]/.test(text);
const cache = new Map();
const inFlight = new Map();
const translationQueue = [];
let activeTranslations = 0, translationOrder = 0;
let chatBatch = 0;
const MAX_ACTIVE_TRANSLATIONS = 3;

function pumpTranslations() {
  while (activeTranslations < MAX_ACTIVE_TRANSLATIONS && translationQueue.length) {
    translationQueue.sort((a, b) => b.order - a.order);
    const task = translationQueue.shift();
    if (task.isValid && !task.isValid()) {
      inFlight.delete(task.key);
      task.reject(new Error("留言已離開畫面"));
      continue;
    }
    activeTranslations++;
    chrome.runtime.sendMessage({type: "translate", text: task.text, direction: task.direction, priority: task.priority}, reply => {
      activeTranslations--;
      inFlight.delete(task.key);
      if (chrome.runtime.lastError) task.reject(chrome.runtime.lastError);
      else if (!reply?.ok) task.reject(new Error(reply?.error || "翻譯失敗"));
      else {
        cache.set(task.key, reply.text);
        task.resolve(reply.text);
      }
      pumpTranslations();
    });
  }
}

const hasJapanese = text => /[\u3040-\u30ff]/.test(text);
const hasChinese = text => /[\u3400-\u9fff]/.test(text) && !hasJapanese(text);

function smallestJapaneseLeaves(region) {
  if (!region?.querySelectorAll) return [];
  return [...region.querySelectorAll('span,p,div,yt-formatted-string')].filter(element => {
    if (element.closest?.('#author-name,[id*="author" i],[class*="author" i],a')) return false;
    const text = (element.textContent || '').trim();
    return text && matchesLanguage(text,languageSettings.readSource) && ![...(element.children || [])].some(child => matchesLanguage(child.textContent || '',languageSettings.readSource));
  });
}

function requestTranslation(text, direction, priority = false, queueOrder, isValid) {
  const key = `${direction}:${text}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = new Promise((resolve, reject) => {
    translationQueue.push({key, text, direction, priority, resolve, reject, isValid, order: queueOrder ?? (++translationOrder + (priority ? 1000000 : 0))});
    pumpTranslations();
  });
  inFlight.set(key, promise);
  return promise;
}

async function translateElement(element, className, priority = false, queueOrder) {
  if (!websiteTextEnabled || !element) return false;
  const epoch=textEpoch;
  const text = element.textContent.trim();
  if (!text || !matchesLanguage(text,languageSettings.readSource)) return false;
  if (translated.get(element) === text) return true;
  translated.set(element, text);
  const anchor = className === "jtl-title" ? (element.closest("h1") || element) : element;
  let line = anchor.parentElement?.querySelector(`:scope > .${className}`);
  if (!line) {
    line = document.createElement("div");
    line.className = className;
    anchor.insertAdjacentElement("afterend", line);
  }
  line.textContent = `${langLabel(languageSettings.readTarget)}：翻譯中…`;
  const valid=()=>websiteTextEnabled&&epoch===textEpoch&&element.isConnected&&element.textContent.trim()===text;
  try {
    let result;
    try { result = await requestTranslation(text, direction('read'), priority, queueOrder, valid); }
    catch (firstError) {
      if (!valid()) throw firstError;
      line.textContent = "中：第一次失敗，正在重試…";
      result = await requestTranslation(text, direction('read'), true, (queueOrder??0)+1000000, valid);
    }
    if (!valid() || !result) {translated.delete(element);line.remove();return false;}
    line.textContent = `${langLabel(languageSettings.readTarget)}：${result}`;
    return true;
  } catch (error) {
    // Keep the failed source marked after the one bounded retry. Otherwise our
    // own status DOM mutation starts another scan and creates an endless loop.
    if (valid()) line.textContent = "中：翻譯失敗，請稍後重新整理再試";
    else { translated.delete(element); line.remove(); }
    return false;
  }
}

function scan() {
  if(contextInvalid)return;
  if (window.top === window) installSubtitleOverlay();
  if (!websiteTextEnabled) return;
  if (window.top === window) {
    const title = [
      "ytd-watch-metadata h1 yt-formatted-string",
      "ytd-watch-metadata #title h1",
      "#above-the-fold #title h1",
      "h1.ytd-watch-metadata"
    ].map(selector=>document.querySelector(selector)).find(element=>matchesLanguage(element?.textContent||"",languageSettings.readSource));
    const titleLines = [...document.querySelectorAll(".jtl-title")];
    titleLines.slice(1).forEach(line => line.remove());
    titleLines.forEach(line => { if (!line.textContent.trim()) line.remove(); });
    translateElement(title, "jtl-title", true);
    installCommentButtons();
    installSubtitleOverlay();
  }
  // YouTube restores a large virtualized backlog after navigation. Translating
  // all of it at once rate-limits the service and makes fresh chat wait behind
  // stale messages. Keep the newest visible window and enqueue newest first.
  const selectedChat = [...document.querySelectorAll("#message.yt-live-chat-text-message-renderer, yt-live-chat-text-message-renderer #message")];
  const semanticChat = [...document.querySelectorAll('[role="log"]')].flatMap(smallestJapaneseLeaves);
  const chat = [...new Set([...selectedChat, ...semanticChat])].slice(-20);
  const batch = ++chatBatch;
  for (let i = chat.length - 1; i >= 0; i--) translateElement(chat[i], "jtl-translation", false, batch * 1000 + i);
  installComposerButton();
}

function installCommentButtons() {
  document.querySelectorAll("ytd-comment-thread-renderer #content-text, ytd-comment-view-model #content-text").forEach(element => {
    const text = element.textContent.trim();
    if (!text || !matchesLanguage(text,languageSettings.readSource) || element.parentElement?.querySelector(":scope > .jtl-comment-action")) return;
    const action = document.createElement("button");
    action.type = "button";
    action.className = "jtl-comment-action";
    action.textContent = "JP/CH";
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
  const player = document.fullscreenElement || document.body;
  if(!player)return;
  const existing=document.querySelector('#jtl-subtitles');
  if(existing){if(existing.parentElement!==player)player.append(existing);return;}
  const overlay = document.createElement("div");
  overlay.id = "jtl-subtitles";
  overlay.captionWindow=new window.JtlCaptionWindow(overlay,'youtubeCaptionRect');
  player.appendChild(overlay);
  applySubtitleSettings();
}

const subtitleDefaults = {japaneseColor: "#ffffff", chineseColor: "#ffffff", fontSize: 22, outlineWidth: 1, position: 6};
function applySubtitleSettings(settings) {
  const apply = raw => {
    const s = {...subtitleDefaults, ...(raw || {})};
    const overlay = document.querySelector("#jtl-subtitles");
    if (!overlay) return;
    overlay.style.bottom = `${s.position}%`;
    overlay.captionWindow?.apply(s);
  };
  if (settings) apply(settings); else chrome.storage.local.get("subtitleSettings", ({subtitleSettings}) => apply(subtitleSettings));
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.websiteTextEnabled) setWebsiteText(changes.websiteTextEnabled.newValue!==false);
  if (area === "local" && changes.subtitleSettings) applySubtitleSettings(changes.subtitleSettings.newValue);
  if (area === "local" && changes.languageSettings) {languageSettings={...languageSettings,...changes.languageSettings.newValue};translated=new WeakMap();document.querySelectorAll('.jtl-title,.jtl-translation,.jtl-comment-action,.jtl-composer-controls').forEach(el=>el.remove());scan();}
});

let lastSubtitleKey = "", subtitleExpiryTimer;
let pollEpoch=0;
let polling=false,pollTimer,nativeTimer;
let lastNativeCaption = "", nativeChangedAt=0, captionRunning=false;
function readNativeCaption(){
 if(!captionRunning)return;
 const video=document.querySelector('#movie_player video');
 const text=video&&!video.paused ? [...document.querySelectorAll('#movie_player .ytp-caption-window-container .ytp-caption-segment')].map(el=>el.textContent).join(' ').replace(/\s+/g,' ').trim() : '';
 if(text!==lastNativeCaption){lastNativeCaption=text;nativeChangedAt=Date.now();}
 // Follow the visible native cue; its end is authoritative.
 runtimeMessage({type:'native-caption',text}).catch(()=>{});
 document.querySelector('#movie_player')?.classList.toggle('jtl-native-active',matchesLanguage(text,languageSettings.speechSource||'ja'));
}
function renderSubtitle(item) {
  if(item?.recordingRows){clearTimeout(subtitleExpiryTimer);installSubtitleOverlay();const overlay=document.querySelector('#jtl-subtitles');if(overlay){overlay.captionWindow.render(item.recordingRows);overlay.classList.toggle('jtl-visible',item.recordingRows.length>0);}return;}
  clearTimeout(subtitleExpiryTimer);
  const expiresAt=item?.expiresAt??(item?.updatedAt+3);
  if (!item || item.expired || Date.now()/1000 >= expiresAt) {
    document.querySelector("#jtl-subtitles")?.classList.remove("jtl-visible");
    document.querySelector('#jtl-subtitles')?.captionWindow?.render([]);
    lastSubtitleKey = "";
    return;
  }
  installSubtitleOverlay();
  const overlay = document.querySelector("#jtl-subtitles");
  if (!overlay) return;
  overlay.dataset.expiresAt=expiresAt;
  subtitleExpiryTimer=setTimeout(()=>renderSubtitle(null),Math.max(0,expiresAt*1000-Date.now()));
  const key = `${item.id}:${item.original}:${item.translated}:${item.provisional}`;
  if (key === lastSubtitleKey) return;
  lastSubtitleKey = key;
  overlay.captionWindow.render([item]);
  overlay.dataset.state=item.provisional?'provisional':'final';
  overlay.title=item.provisional?'暫定字幕，句尾會校正':'已確認字幕';
  overlay.classList.toggle("jtl-visible", Boolean(item.original));
}
async function pollSubtitles() {
  if (window.top !== window || polling) return;
  polling=true;const epoch=pollEpoch;
  try {
    const data = await runtimeMessage({type: "subtitles"});
    captionRunning=data.running;
    if(!captionRunning)document.querySelector('#movie_player')?.classList.remove('jtl-native-active');
    if(epoch===pollEpoch)renderSubtitle(data.running ? data.items?.at(-1) : null);
  } catch (error) {if(!chrome.runtime?.id){contextInvalid=true;captionRunning=false;clearInterval(pollTimer);clearInterval(nativeTimer);document.querySelector('#jtl-subtitles')?.remove();}} finally {polling=false;}
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
  const inserted=document.execCommand("insertText", false, text);
  if(!inserted||editableText(box)!==text.trim())if(box.replaceChildren&&document.createTextNode)box.replaceChildren(document.createTextNode(text));else box.textContent=text;
  box.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText", data: text}));
  box.dispatchEvent(new Event("change", {bubbles:true}));
}

const composerControls = new WeakMap();
function installComposerButton() {
  // Comment editors are created lazily for watch pages, Shorts and replies.
  const boxes = document.querySelectorAll("#input[contenteditable='true'], #input.yt-live-chat-text-input-field-renderer, #contenteditable-root[contenteditable='true']");
  for (const box of boxes) {
    const previous = composerControls.get(box);
    if (previous?.isConnected) continue;
    const controls = document.createElement("div");
    controls.className = "jtl-composer-controls";
    const button = document.createElement("button");
    button.className = "jtl-compose";
    button.type = "button";
    button.textContent = `${langLabel(languageSettings.typeSource)}/${langLabel(languageSettings.typeTarget)}`;
    button.setAttribute('aria-label', `將留言從${langLabel(languageSettings.typeSource)}翻成${langLabel(languageSettings.typeTarget)}`);
    const status = document.createElement("span");
    status.className = "jtl-status";
    status.setAttribute("role", "status");
    button.addEventListener("click", async () => {
      const text = editableText(box), epoch = textEpoch;
      if (!text) { status.textContent = "請先輸入中文"; return; }
      if (!matchesLanguage(text,languageSettings.typeSource)) { status.textContent = `請先輸入${langLabel(languageSettings.typeSource)}文`; return; }
      button.disabled = true;
      status.textContent = "翻譯中…";
      try {
        const result = await runtimeMessage({type:'make-draft',text,direction:direction('type')});
        if (!websiteTextEnabled || epoch !== textEpoch || !box.isConnected || !controls.isConnected) return;
        if(editableText(box)!==text){status.textContent='原文已修改，請重新翻譯';return;}
        if (!result.draft?.trim()) throw new Error("沒有收到日文草稿");
        replaceEditable(box, result.draft);
        status.textContent = `${result.mode}，確認後自行送出`;
      } catch (error) {
        status.textContent = `翻譯失敗：${error.message}`;
      } finally { button.disabled = false; }
    });
    controls.append(button, status);
    const live = box.closest("yt-live-chat-text-input-field-renderer");
    const host = live?.parentElement || box.closest("ytd-commentbox, ytd-comment-simplebox-renderer") || box.parentElement;
    host?.append(controls);
    composerControls.set(box, controls);
  }
}

function setWebsiteText(enabled){
 websiteTextEnabled=enabled;textEpoch++;translated=new WeakMap();
 if(!enabled)document.querySelectorAll('.jtl-title,.jtl-translation,.jtl-comment-action,.jtl-compose,.jtl-status').forEach(el=>el.remove());
 else scan();
}
chrome.storage.local.get(['websiteTextEnabled','languageSettings']).then(s=>{languageSettings={...languageSettings,...(s.languageSettings||{})};setWebsiteText(s.websiteTextEnabled!==false);});
let timer;
new MutationObserver(() => {
  if (!timer) timer = setTimeout(() => { timer = null; scan(); }, 250);
}).observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ["contenteditable"]});
document.addEventListener("focusin", () => { if (websiteTextEnabled && !contextInvalid) installComposerButton(); });
scan();
if (window.top === window) {
 pollTimer=setInterval(pollSubtitles,700);
 nativeTimer=setInterval(readNativeCaption,350);
 const reset=()=>{pollEpoch++;lastNativeCaption='';nativeChangedAt=0;lastSubtitleKey='';renderSubtitle(null);runtimeMessage({type:'subtitle-reset'}).catch(()=>{});};
 document.addEventListener('yt-navigate-start',reset);
 document.addEventListener('seeking',event=>{if(event.target.tagName==='VIDEO')reset();},true);
}

})();
