// Status follows observed capture/translation events, not a permanent "listening" label.
export function captureStatus(d,now=Date.now()){
 const x=d.diagnostics||{};
 if(d.lastError)return `提示：${d.lastError}`;
 if(d.controlBusy)return d.controlAction==='stop'?'● 正在停止語音…':'● '+(d.modelStatus && !d.modelStatus.startsWith('已') ? d.modelStatus : '正在啟動語音…');
 if(!d.running)return '● 已就緒';
 if(x.ready&&x.lastHeartbeat&&now-x.lastHeartbeat>6000)return '● 收音連線沒有回應，請停止後重新開始';
 if(!x.ready)return '● '+(d.modelStatus||'載入模型中');
 if(x.captionPhase==='translating')return '● 日文已辨識，等待中文翻譯';
 if(x.busy&&x.captionPhase==='translated')return '● 字幕已更新，持續收音中';
 if(x.busy)return `● 正在辨識日文 · 待處理 ${x.queueDepth||0} 段`;
 if((x.probability||0)>=.15)return '● 偵測到人聲，收集中';
 if((x.level||0)>.001)return '● 有收到聲音，尚未判定為人聲';
 return '● 未收到明顯聲音';
}
