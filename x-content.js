// X uses a separate script so YouTube's player and composer stay independent.
(() => {
  let websiteTextEnabled=false;
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
        const result = await message({type: 'make-draft', text: source});
        if(read(box)!==source){status.textContent='原文已修改，請重新翻譯';return;}
        preview.value = result.draft;
        preview.hidden = false;
        apply.hidden = false;
        status.textContent = `${result.mode}。可以修改草稿，再放入留言框。`;
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
    const host = findSpaceHost();
    if (!host) return;
    if (panel?.isConnected) return;
    panel = document.createElement('section');
    panel.className = 'jtl-x-live';
    panel.setAttribute('aria-label', '日文直播語音字幕');
    const status = document.createElement('div');
    status.className = 'jtl-x-live-status';
    status.textContent = '直播／Spaces：日文 → 繁中';
    const original = document.createElement('div');
    original.className = 'jtl-x-original';
    const translated = document.createElement('div');
    translated.className = 'jtl-x-translated';
    const toggle = button('開始日文語音字幕', async () => {
      toggle.disabled = true;
      try {
        if (listening) {
          await message({type:'subtitle-control',action:'stop'});
          listening = false;
          original.textContent = translated.textContent = '';
          status.textContent = '字幕已停止。';
        } else {
          await message({type: 'subtitle-control', action: 'start'});
          listening = true;
          status.textContent = '等待此分頁的日文聲音。';
        }
        toggle.textContent = listening ? '隱藏字幕' : '開始日文語音字幕';
      } catch (error) { status.textContent = error.message; }
      finally { toggle.disabled = false; }
    });
    panel.append(toggle, status, original, translated);
    host.classList.add('jtl-space-host');
    host.append(panel);
  }

  function findSpaceHost() {
    const controls = [...document.querySelectorAll('button')].find(candidate => {
      if (candidate.closest('.jtl-x-live')) return false;
      const label = read(candidate);
      return /^(離開|离开|Leave|開始收聽|开始收听|開始匿名收聽|开始匿名收听|Start listening|Start anonymous listening)$/i.test(label);
    });
    if (controls) {
      const dialog = controls.closest('[role="dialog"], [aria-modal="true"]');
      if (dialog) return dialog;
      let ancestor = controls.parentElement;
      while (ancestor && ancestor !== document.body) {
        const box = ancestor.getBoundingClientRect();
        const style = getComputedStyle(ancestor);
        if ((style.position === 'fixed' || style.position === 'absolute') && box.width >= 360 && box.height >= 260) return ancestor;
        ancestor = ancestor.parentElement;
      }
    }
    if (/\/i\/spaces\//i.test(location.pathname)) {
      return document.querySelector('[role="dialog"], main') || document.body;
    }
    return null;
  }

  function syncSpacePanel() {
    const host = findSpaceHost();
    if (host) {
      if (panel?.isConnected && panel.parentElement !== host) {
        panel.parentElement?.classList.remove('jtl-space-host');
        host.classList.add('jtl-space-host');
        host.append(panel);
      } else installPanel();
    } else if (panel?.isConnected) {
      panel.parentElement?.classList.remove('jtl-space-host');
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
      const fresh = data.running && item && Date.now() / 1000 - item.updatedAt < 8;
      panel.querySelector('.jtl-x-original').textContent = fresh ? item.original : '';
      panel.querySelector('.jtl-x-translated').textContent = fresh
        ? (item.translated === '(translating...)' ? '翻譯中…' : item.translated) : '';
      panel.querySelector('.jtl-x-live-status').textContent = data.running
        ? '正在接收分頁聲音 · 日文 → 繁中' : '字幕已停止，可重新開始。';
    } catch (error) { panel.querySelector('.jtl-x-live-status').textContent = error.message; }
    finally { polling = false; }
  }

  function scan() {
    if(websiteTextEnabled){
    document.querySelectorAll('[contenteditable="true"][data-testid^="tweetTextarea_"]').forEach(addComposer);
    document.querySelectorAll('[data-testid="tweetText"]').forEach(addPost);
    }
    syncSpacePanel();
  }
  function setWebsiteText(enabled){
    websiteTextEnabled=enabled;
    if(!enabled)document.querySelectorAll('.jtl-x-controls').forEach(el=>el.remove());
    scan();
  }
  chrome.storage.local.get('websiteTextEnabled').then(s=>setWebsiteText(s.websiteTextEnabled!==false));
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes.websiteTextEnabled)setWebsiteText(changes.websiteTextEnabled.newValue!==false);
  });
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; scan(); }, 400);
  }).observe(document.documentElement, {subtree: true, childList: true});
  scan();
  setInterval(poll, 1000);
})();
