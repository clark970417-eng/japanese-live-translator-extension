// Shared Bilibili and TikTok adapter: page/live-chat translation, CH/JP drafts,
// and the same tab-audio caption surface used by YouTube and X.
(() => {
  if (window.__jtlSocial) return;
  window.__jtlSocial = true;

  const host = location.hostname.toLowerCase();
  const site = host.endsWith('bilibili.com') ? 'bilibili' : host.endsWith('tiktok.com') ? 'tiktok' : '';
  if (!site) return;

  const configs = {
    bilibili: {
      title: ['h1.video-title', 'h1[title]', '.video-title', '.live-title', '.room-title'],
      text: [
        '.danmaku-item .danmaku-content', '.chat-item .danmaku-content',
        '.chat-item .text', '.live-chat-item .content', '.reply-content',
        '.root-reply .reply-content', '.sub-reply-content',
        '.comment-container .text', 'bili-comment-renderer [class*="content"]'
      ],
      composer: [
        '.chat-input textarea', '.chat-input input', '.chat-input[contenteditable="true"]', '.chat-input [contenteditable="true"]',
        'textarea[placeholder*="弹幕"]', 'input[placeholder*="弹幕"]', '[contenteditable="true"][data-placeholder*="弹幕"]',
        '[contenteditable="true"][aria-label*="弹幕"]',
        '.reply-box textarea', '.reply-box [contenteditable="true"]',
        '.comment-box textarea', '.comment-box [contenteditable="true"]',
        '.comment-send textarea', '.bili-comment [contenteditable="true"]',
        'textarea:not([disabled])', '[role="textbox"]',
        '[contenteditable]:not([contenteditable="false"])'
      ]
    },
    tiktok: {
      title: ['h1[data-e2e="browse-video-desc"]', '[data-e2e="browser-nickname"] + div', 'h1'],
      text: [
        '[data-e2e="chat-message"] [data-e2e="message-text"]',
        '[data-e2e="chat-message"] [class*="CommentContent"]',
        '[data-e2e="chat-message"]', '[data-e2e="comment-level-1"]',
        '[data-e2e="comment-level-2"]',
        '[data-e2e="comment-item"] [class*="CommentText"]',
        '[class*="DivCommentItemContainer"] [class*="CommentText"]'
      ],
      composer: [
        '[data-e2e="comment-input"] textarea', '[data-e2e="comment-input"] input', '[data-e2e="comment-input"] [contenteditable="true"]',
        '[data-e2e="chat-input"] textarea', '[data-e2e="chat-input"] input', '[data-e2e="chat-input"] [contenteditable="true"]',
        '[class*="CommentInput"] textarea', '[class*="CommentInput"] [contenteditable="true"]',
        '[contenteditable="true"][data-placeholder*="comment" i]',
        '[contenteditable="true"][aria-label*="comment" i]',
        '[contenteditable="true"][data-placeholder*="chat" i]',
        'textarea:not([disabled])', '[role="textbox"]',
        '[contenteditable]:not([contenteditable="false"])'
      ]
    }
  };
  const config = configs[site];
  const translated = new WeakMap();
  const composers = new WeakMap();
  let activeComposer;
  let activeControls;
  const cache = new Map();
  const translationInFlight = new Map();
  const translationQueue = [];
  let activeTranslations = 0;
  let translationOrder = 0;
  const MAX_ACTIVE_TRANSLATIONS = 3;
  let enabled = false;
  let epoch = 0;
  let polling = false;
  let lastSubtitleSignature = '';
  let captionBox;

  const hasJapanese = text => /[\u3040-\u30ff]/.test(text);
  const hasChinese = text => /[\u3400-\u9fff]/.test(text) && !hasJapanese(text);
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

  function messageTextNode(node) {
    if (!node?.querySelectorAll) return node;
    const explicit = node.querySelector?.([
      '[data-e2e="message-text"]', '[class*="CommentContent"]', '[class*="CommentText"]',
      '.danmaku-content', '.reply-content', '.sub-reply-content'
    ].join(','));
    if (explicit && hasJapanese(clean(explicit.innerText || explicit.textContent))) return explicit;

    // TikTok's fallback chat selector can cover the avatar, nickname, badge and
    // message in one React container. Prefer the smallest Japanese leaf that is
    // not part of account metadata so names and rankings are not translated.
    const metadata = '[data-e2e*="user" i],[data-e2e*="avatar" i],[class*="Author"],[class*="Avatar"],[class*="Nickname"],[class*="UserName"],a';
    const candidates = [...node.querySelectorAll('span,p,div')].filter(element => {
      if (element.closest?.(metadata)) return false;
      const text = clean(element.innerText || element.textContent);
      if (!text || !hasJapanese(text)) return false;
      return ![...element.children].some(child => hasJapanese(clean(child.innerText || child.textContent)));
    });
    return candidates.sort((a, b) => clean(a.innerText || a.textContent).length - clean(b.innerText || b.textContent).length)[0] || node;
  }

  function message(payload) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage(payload, reply => {
      if (chrome.runtime.lastError || !reply?.ok) {
        reject(new Error(reply?.error || '本機翻譯服務未啟動'));
      } else resolve(reply.text);
    }));
  }

  function pumpTranslations() {
    while (activeTranslations < MAX_ACTIVE_TRANSLATIONS && translationQueue.length) {
      translationQueue.sort((a, b) => b.order - a.order);
      const task = translationQueue.shift();
      if (task.isValid && !task.isValid()) {
        translationInFlight.delete(task.key);
        task.reject(new Error('留言已離開畫面'));
        continue;
      }
      activeTranslations++;
      message({type: 'translate', text: task.source, direction: 'ja-zh', priority: task.isTitle})
        .then(result => {
          cache.set(task.key, result);
          task.resolve(result);
        }, error => {
          translationInFlight.delete(task.key);
          task.reject(error);
        })
        .finally(() => {
          activeTranslations--;
          translationInFlight.delete(task.key);
          pumpTranslations();
        });
    }
  }

  function requestTranslation(source, isTitle, order, isValid) {
    const key = `ja-zh:${source}`;
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (translationInFlight.has(key)) return translationInFlight.get(key);
    const pending = new Promise((resolve, reject) => {
      translationQueue.push({key, source, isTitle, isValid, order: order ?? ++translationOrder, resolve, reject});
      pumpTranslations();
    });
    translationInFlight.set(key, pending);
    return pending;
  }

  async function translateNode(node, isTitle = false, order) {
    if (!enabled || !node?.isConnected || node.closest?.('.jtl-social-translation,.jtl-social-controls')) return;
    if (!isTitle) node = messageTextNode(node);
    const source = clean(node.innerText || node.textContent);
    // The background translator safely splits long messages. Keep only a
    // generous guard against accidentally selecting an entire chat timeline.
    if (!source || source.length > 3000 || !hasJapanese(source)) return;
    if (translated.get(node) === source) return;
    translated.set(node, source);
    const currentEpoch = epoch;
    const valid = () => enabled && currentEpoch === epoch && node.isConnected && clean(node.innerText || node.textContent) === source;
    const parent = node.parentElement;
    let line = parent?.querySelector(':scope > .jtl-social-translation');
    if (!line) {
      line = document.createElement('div');
      line.className = `jtl-social-translation${isTitle ? ' jtl-social-title' : ''}`;
      node.insertAdjacentElement('afterend', line);
    }
    line.textContent = '中：翻譯中…';
    try {
      let result;
      try { result = await requestTranslation(source, isTitle, order, valid); }
      catch (firstError) {
        if (!valid()) throw firstError;
        line.textContent = '中：第一次失敗，正在重試…';
        result = await requestTranslation(source, true, (order ?? 0) + 1000000, valid);
      }
      if (!valid()) { line.remove(); return; }
      line.textContent = `中：${result}`;
    } catch (_) {
      // Keep the failed source marked after one retry so the status mutation
      // cannot cause the page observer to resubmit it forever.
      if (valid()) line.textContent = '中：翻譯失敗，請稍後重新整理再試';
      else { translated.delete(node); line.remove(); }
    }
  }

  function editableText(box) {
    return clean('value' in box ? box.value : (box.innerText || box.textContent));
  }

  function replaceEditable(box, text) {
    box.focus();
    if ('value' in box) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box), 'value')?.set;
      if (setter) setter.call(box, text); else box.value = text;
      box.dispatchEvent(new Event('input', {bubbles: true}));
      box.dispatchEvent(new Event('change', {bubbles: true}));
      return;
    }
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(box);
    selection.removeAllRanges();
    selection.addRange(range);
    const inserted = document.execCommand?.('insertText', false, text);
    // Some Bilibili editors expose a contenteditable surface but reject
    // execCommand. Keep the visible editor and its framework input event in
    // sync instead of silently leaving the Chinese source unchanged.
    if (!inserted || clean(box.innerText || box.textContent) !== clean(text)) box.textContent = text;
    box.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: text}));
    box.dispatchEvent(new Event('change', {bubbles: true}));
  }

  function composerHost(box) {
    return box.closest('[data-e2e="comment-input"], [data-e2e="chat-input"], .chat-input, .reply-box, .comment-box, .comment-send') || box.parentElement;
  }

  function isUsableComposer(box) {
    if (!box?.isConnected || box.matches?.('[disabled],[aria-disabled="true"]')) return false;
    const rect = box.getBoundingClientRect?.();
    return !rect || (rect.width > 0 && rect.height > 0);
  }

  function installComposer(box, force = false) {
    if (!enabled || !box?.isConnected) return;
    if (activeComposer === box && activeControls?.isConnected) return;
    // Dynamic pages contain many unrelated text fields. Once a real composer
    // is selected, background scans must not rebind the single visible button
    // to a search field or an off-screen editor.
    if (!force && isUsableComposer(activeComposer) && activeControls?.isConnected) return;
    const previous = composers.get(box);
    if (previous?.isConnected) return;
    activeControls?.remove();
    const controls = document.createElement('div');
    controls.className = 'jtl-social-controls';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jtl-social-language';
    button.textContent = 'CH/JP';
    button.setAttribute('aria-label', '將這則中文留言翻成日文草稿');
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const source = editableText(box);
      const currentEpoch = epoch;
      if (!source || !hasChinese(source)) { status.textContent = '請先輸入中文'; return; }
      button.disabled = true;
      status.textContent = '翻譯中…';
      try {
        const result = await message({type: 'make-draft', text: source});
        if (!enabled || currentEpoch !== epoch || !box.isConnected || !controls.isConnected) return;
        if (editableText(box) !== source) { status.textContent = '原文已修改，請重新翻譯'; return; }
        if (!result?.draft) throw new Error('沒有收到日文草稿');
        replaceEditable(box, result.draft);
        status.textContent = `${result.mode || '日文草稿'}，確認後自行送出`;
      } catch (error) {
        status.textContent = `翻譯失敗：${error.message}`;
      } finally {
        button.disabled = false;
      }
    });
    controls.append(button, status);
    // Bilibili and TikTok frequently reconcile their composer containers and
    // delete foreign children. Keep our compact control under document.body.
    (document.body || composerHost(box))?.append(controls);
    composers.set(box, controls);
    activeComposer = box;
    activeControls = controls;
  }

  function focusedComposer(event) {
    const box = event.composedPath?.().find(node => node instanceof HTMLElement && (
      node.matches?.('textarea, input[type="text"], input:not([type])') ||
      node.isContentEditable || node.getAttribute?.('role') === 'textbox'
    ));
    if (box) installComposer(box, true);
    scan();
  }

  function installCaptionBox() {
    if (window.top !== window || captionBox?.isConnected || !document.body) return;
    captionBox = document.createElement('div');
    captionBox.id = 'jtl-social-subtitles';
    captionBox.className = 'jtl-caption-window';
    captionBox.hidden = true;
    captionBox.controller = new window.JtlCaptionWindow(captionBox, `${site}CaptionRect`);
    document.body.append(captionBox);
  }

  function renderSubtitles(data) {
    installCaptionBox();
    if (!captionBox) return;
    const item = data.running ? data.items?.at(-1) : null;
    const fresh = item && !item.expired && Date.now() / 1000 < (item.expiresAt ?? item.updatedAt + 3);
    const rows = data.running ? (item?.recordingRows || (fresh ? [item] : [])) : [];
    const signature = JSON.stringify(rows);
    if (signature !== lastSubtitleSignature) {
      lastSubtitleSignature = signature;
      captionBox.controller.render(rows);
    }
    captionBox.hidden = !rows.length;
  }

  async function pollSubtitles() {
    if (window.top !== window || polling) return;
    polling = true;
    try { renderSubtitles(await message({type: 'subtitles'})); }
    catch (_) { /* The popup reports actionable capture/desktop errors. */ }
    finally { polling = false; }
  }

  function scan() {
    if (window.top === window) installCaptionBox();
    if (!enabled) return;
    if (window.top === window) config.title.forEach(selector => document.querySelectorAll(selector).forEach(node => translateNode(node, true, 1_000_000_000 + ++translationOrder)));
    // Both sites restore large virtualized chat histories. Keep model work
    // bounded and always let the newest visible messages enter the queue first.
    // Hashed classes change frequently on both sites. ARIA live regions are a
    // stable semantic contract, so scan their smallest Japanese leaves as a
    // fallback when product-specific selectors no longer match.
    const semanticMessages = [...document.querySelectorAll('[role="log"], [aria-live="polite"], [aria-live="assertive"]')]
      .flatMap(region => [...region.querySelectorAll('span,p,div')])
      .filter(element => {
        const text = clean(element.innerText || element.textContent);
        return text && hasJapanese(text) && ![...element.children].some(child => hasJapanese(clean(child.innerText || child.textContent)));
      });
    const messages = [...new Set([
      ...config.text.flatMap(selector => [...document.querySelectorAll(selector)]),
      ...semanticMessages
    ])].slice(-20);
    const batch = ++translationOrder * 1000;
    for (let index = messages.length - 1; index >= 0; index--) translateNode(messages[index], false, batch + index);
    if (!isUsableComposer(activeComposer) || !activeControls?.isConnected) {
      let candidate;
      for (const selector of config.composer) {
        candidate = [...document.querySelectorAll(selector)].find(isUsableComposer);
        if (candidate) break;
      }
      if (candidate) installComposer(candidate);
    }
  }

  function setEnabled(value) {
    enabled = value !== false;
    epoch++;
    if (!enabled) {
      document.querySelectorAll('.jtl-social-translation,.jtl-social-controls').forEach(node => node.remove());
      activeComposer = null;
      activeControls = null;
    }
    else scan();
  }

  chrome.runtime.onMessage.addListener(payload => {
    if (payload.type === 'subtitle-update' && window.top === window) renderSubtitles({running: true, items: [payload.item]});
  });
  chrome.storage.local.get('websiteTextEnabled').then(settings => setEnabled(settings.websiteTextEnabled !== false));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.websiteTextEnabled) setEnabled(changes.websiteTextEnabled.newValue !== false);
    if (area === 'local' && changes.subtitleSettings) captionBox?.controller.apply(changes.subtitleSettings.newValue);
  });
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; scan(); }, 250);
  }).observe(document.documentElement, {subtree: true, childList: true, attributes: true, attributeFilter: ['contenteditable']});
  document.addEventListener('focusin', focusedComposer, true);
  scan();
  if (window.top === window) setInterval(pollSubtitles, 700);
})();
