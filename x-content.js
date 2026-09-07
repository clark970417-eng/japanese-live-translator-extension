// X uses a separate script so YouTube's player and composer stay independent.
(() => {
  const composers = new WeakMap();
  const posts = new WeakMap();
  let panel;
  let listening = false;
  let polling = false;

  function message(payload) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage(payload, reply => {
      if (chrome.runtime.lastError || !reply?.ok) {
        reject(new Error(reply?.error || '請先啟動桌面的「啟動即時字幕」'));
      } else resolve(reply.text);
    }));
  }

  function button(label, action) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
    return el;
  }

  function read(box) { return (box.innerText || box.textContent || '').trim(); }

  function addComposer(box) {
    if (composers.get(box)?.isConnected) return;
    const controls = document.createElement('div');
    controls.className = 'jtl-x-controls';
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    const preview = document.createElement('textarea');
    preview.setAttribute('aria-label', '日文留言草稿，可修改');
    preview.hidden = true;
    let source = '';
    const apply = button('放入留言框', () => {
      if (!box.isConnected || read(box) !== source) {
        status.textContent = '原文已修改，請重新翻譯，避免覆蓋新內容。';
        return;
      }
      box.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(box);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, preview.value);
      box.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: preview.value}));
      status.textContent = read(box) === preview.value.trim()
        ? '已放入日文，確認後自行送出。'
        : '未能放入，請從上方草稿複製日文。';
    });
    apply.hidden = true;
    const translate = button('中 → 日 · 親切可愛', async () => {
      source = read(box);
      if (!source) { status.textContent = '請先輸入中文。'; return; }
      translate.disabled = true;
      apply.hidden = true;
      status.textContent = '翻譯中…';
      try {
        preview.value = await message({type: 'translate', text: source, direction: 'zh-ja'});
        preview.hidden = false;
        apply.hidden = false;
        status.textContent = '可以修改日文草稿，再放入留言框。';
      } catch (error) { status.textContent = error.message; }
      finally { translate.disabled = false; }
    });
    controls.append(translate, status, preview, apply);
    const anchor = box.closest('[data-testid="tweetTextarea_0RichTextInputContainer"]') || box.parentElement;
    anchor.insertAdjacentElement('afterend', controls);
    composers.set(box, controls);
  }

  function addPost(text) {
    if (posts.get(text)?.isConnected) return;
    const controls = document.createElement('div');
    controls.className = 'jtl-x-controls';
    const result = document.createElement('div');
    result.setAttribute('role', 'status');
    const translate = button('翻成繁中', async () => {
      const source = read(text);
      translate.disabled = true;
      result.textContent = '翻譯中…';
      try {
        const value = await message({type: 'translate', text: source, direction: 'ja-zh', priority: true});
        result.textContent = read(text) === source ? value : '貼文已更新，請再按一次翻譯。';
      } catch (error) { result.textContent = error.message; }
      finally { translate.disabled = false; }
    });
    controls.append(translate, result);
    text.insertAdjacentElement('afterend', controls);
    posts.set(text, controls);
  }

  function installPanel() {
    if (!isSpaceOpen()) return;
    if (panel?.isConnected) return;
    panel = document.createElement('section');
    panel.className = 'jtl-x-live';
    panel.setAttribute('aria-label', '日文直播語音字幕');
    const status = document.createElement('div');
    status.className = 'jtl-x-live-status';
    status.textContent = '直播／Spaces：翻譯 Mac 系統聲音';
    const original = document.createElement('div');
    original.className = 'jtl-x-original';
    const translated = document.createElement('div');
    translated.className = 'jtl-x-translated';
    const toggle = button('開始日文語音字幕', async () => {
      toggle.disabled = true;
      try {
        if (listening) {
          listening = false;
          original.textContent = translated.textContent = '';
          status.textContent = '已隱藏 X 字幕；本機錄音可在擴充功能選單停止。';
        } else {
          await message({type: 'subtitle-control', action: 'start'});
          listening = true;
          status.textContent = '等待日文聲音；系統輸出需選「即時字幕＋喇叭」。';
        }
        toggle.textContent = listening ? '隱藏字幕' : '開始日文語音字幕';
      } catch (error) { status.textContent = error.message; }
      finally { toggle.disabled = false; }
    });
    panel.append(toggle, status, original, translated);
    document.body.append(panel);
  }

  function isSpaceOpen() {
    return /\/i\/spaces\//i.test(location.pathname);
  }

  function syncSpacePanel() {
    if (isSpaceOpen()) {
      installPanel();
    } else if (panel?.isConnected) {
      panel.remove();
      panel = null;
      if (listening) {
        listening = false;
        message({type: 'subtitle-control', action: 'stop'}).catch(() => {});
      }
    }
  }

  async function poll() {
    if (!listening || polling || !panel?.isConnected) return;
    polling = true;
    try {
      const data = await message({type: 'subtitles'});
      const item = data.items?.slice().sort((a, b) => b.id - a.id)[0];
      const fresh = data.running && item && Date.now() / 1000 - item.updatedAt < 25;
      panel.querySelector('.jtl-x-original').textContent = fresh ? item.original : '';
      panel.querySelector('.jtl-x-translated').textContent = fresh
        ? (item.translated === '(translating...)' ? '翻譯中…' : item.translated) : '';
      panel.querySelector('.jtl-x-live-status').textContent = data.running
        ? '正在接收 Mac 系統聲音 · 日文 → 繁中' : '本機字幕已停止，可重新開始。';
    } catch (error) { panel.querySelector('.jtl-x-live-status').textContent = error.message; }
    finally { polling = false; }
  }

  function scan() {
    document.querySelectorAll('[contenteditable="true"][data-testid^="tweetTextarea_"]').forEach(addComposer);
    document.querySelectorAll('[data-testid="tweetText"]').forEach(addPost);
    syncSpacePanel();
  }
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; scan(); }, 400);
  }).observe(document.documentElement, {subtree: true, childList: true});
  scan();
  setInterval(poll, 1000);
})();
