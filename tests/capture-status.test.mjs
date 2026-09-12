import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureStatus} from '../capture-status.mjs';
test('capture status distinguishes audio, recognition, translation, and interrupted heartbeat',()=>{
 const health={running:true,diagnostics:{ready:true,lastHeartbeat:10000}};
 const status=x=>captureStatus({...health,diagnostics:{...health.diagnostics,...x}},11000);
 assert.match(status({level:0}),/未收到明顯聲音/);
 assert.match(status({level:.05}),/有收到聲音/);
 assert.match(status({probability:.8}),/偵測到人聲/);
 assert.match(status({busy:true}),/正在辨識/);
 assert.match(status({busy:true,captionPhase:'translating'}),/等待中文翻譯/);
 assert.match(status({busy:true,captionPhase:'translated'}),/字幕已更新/);
 assert.match(captureStatus(health,18000),/停止後重新開始/);
 assert.equal(captureStatus({...health,running:false},18000),'● 已就緒');
 assert.equal(captureStatus({...health,lastError:'測試錯誤'},11000),'提示：測試錯誤');
});

test('model initialization stays visible before capture is running',()=>{
 assert.match(captureStatus({running:false,controlBusy:true,controlAction:'start',modelStatus:'正在載入桌面模型'}),/正在載入桌面模型/);
 assert.match(captureStatus({running:false,controlBusy:true,controlAction:'start',modelStatus:'已停止'}),/正在啟動語音/);
 assert.match(captureStatus({running:true,controlBusy:true,controlAction:'stop'}),/正在停止語音/);
 assert.match(captureStatus({running:false,controlBusy:false,lastError:'無法擷取聲音'}),/無法擷取聲音/);
});
