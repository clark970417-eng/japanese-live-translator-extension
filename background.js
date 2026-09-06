const BRIDGE = "http://127.0.0.1:17381";
const queue = [];
let batchTimer;

async function translate(text, direction) {
  const response = await fetch(`${BRIDGE}/translate`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({text, direction})
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `翻譯服務回應 ${response.status}`);
  }
  const data = await response.json();
  return data.text;
}

async function traditionalize(texts) {
  const response = await fetch(`${BRIDGE}/traditionalize`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({texts})
  });
  if (!response.ok) throw new Error("繁體中文轉換失敗");
  return (await response.json()).texts;
}

async function translateBatch(items) {
  return Promise.all(items.map(item => translate(item.text, "ja-zh")));
}

async function flushBatch() {
  batchTimer = null;
  const items = queue.splice(0, 4);
  if (!items.length) return;
  try {
    const translations = await translateBatch(items);
    items.forEach((item, index) => item.resolve(translations[index]));
  } catch (error) {
    items.forEach(item => item.reject(error));
  }
  if (queue.length) batchTimer = setTimeout(flushBatch, 100);
}

function enqueue(text) {
  return new Promise((resolve, reject) => {
    if (queue.length > 60) queue.shift()?.reject(new Error("直播訊息過多，已略過較舊內容"));
    queue.push({text, resolve, reject});
    if (!batchTimer) batchTimer = setTimeout(flushBatch, 350);
  });
}

async function bridge(path, method = "GET") {
  const response = await fetch(`${BRIDGE}${path}`, {method});
  if (!response.ok) throw new Error(`字幕服務回應 ${response.status}`);
  return response.json();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  let task;
  if (message.type === "translate") task = message.direction === "ja-zh" && !message.priority
    ? enqueue(message.text)
    : translate(message.text, message.direction);
  else if (message.type === "subtitles") task = bridge("/latest");
  else if (message.type === "subtitle-control") task = bridge(message.action === "stop" ? "/stop" : "/start", "POST");
  else if (message.type === "health") task = bridge("/health");
  else return;
  task
    .then(text => sendResponse({ok: true, text}))
    .catch(error => sendResponse({ok: false, error: error.message}));
  return true;
});
