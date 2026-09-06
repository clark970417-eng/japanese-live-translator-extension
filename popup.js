const status = document.querySelector("#status");
const start = document.querySelector("#start");
const stop = document.querySelector("#stop");

function send(message) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, reply => {
    if (chrome.runtime.lastError || !reply?.ok) reject(new Error(reply?.error || "無法連線"));
    else resolve(reply.text);
  }));
}

async function refresh() {
  try {
    const data = await send({type: "health"});
    status.textContent = data.running ? "● 語音字幕運作中" : "● 本機服務已連線，字幕未啟動";
    start.disabled = data.running;
    stop.disabled = !data.running;
  } catch (_error) {
    status.textContent = "請先雙擊桌面的「啟動即時字幕」";
    start.disabled = stop.disabled = true;
  }
}

start.addEventListener("click", async () => { status.textContent = "正在啟動…"; await send({type: "subtitle-control", action: "start"}).catch(() => {}); setTimeout(refresh, 1000); });
stop.addEventListener("click", async () => { await send({type: "subtitle-control", action: "stop"}).catch(() => {}); setTimeout(refresh, 300); });
refresh();
setInterval(refresh, 2000);
