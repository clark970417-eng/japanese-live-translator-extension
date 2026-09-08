import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const window={};vm.runInNewContext(fs.readFileSync(new URL('../caption-window.js',import.meta.url),'utf8'),{window});
test('display condenses screams and three repeated words without truncating ordinary speech',()=>{
 const compact=window.jtlCompactCaption;
 assert.equal(compact('ああああ！'),'あ～！');assert.equal(compact('啊啊啊啊！'),'啊～！');
 assert.equal(compact('やばいやばいやばい'),'やばい…');assert.equal(compact('yaba yaba yaba'),'yaba…');
 assert.equal(compact('糟了，糟了，糟了'),'糟了…');assert.equal(compact('本当に本当にありがとう'),'本当に本当にありがとう');
 assert.equal(compact('今日は一緒にゲームを楽しみましょう。'),'今日は一緒にゲームを楽しみましょう。');
});
