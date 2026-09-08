import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CueCursor} from '../cue-cursor.mjs';
test('complete unpunctuated decode cannot prepend old sentences to the current cue',()=>{
 const c=new CueCursor();
 c.select('皆さんこんにちは。魚が逃げてしまいました。',1);
 c.select('皆さんこんにちは。魚が逃げてしまいました。来てくれて',1);
 assert.equal(c.select('皆さんこんにちは魚が逃げてしまいました来てくれて',1),'来てくれて');
 assert.equal(c.select('皆さんこんにちは魚が逃げてしまいました来てくれてありがとうございます',1),'来てくれてありがとうございます');
 assert.equal(c.select('皆さんこんにちは',2),'皆さんこんにちは');
 c.select('ちょっと待ってくれ',3);
 assert.equal(c.select('皆さんこんにちは今日は遊びましょうちょっと待ってください',3),'ちょっと待ってください');
 c.select('魚が逃げてしまいました。',4);
 assert.equal(c.select('魚が逃げてしまいました来てく',4),'魚が逃げてしまいました。');
 assert.equal(c.select('魚が逃げてしまいました来てくれてありがとう',4),'来てくれてありがとう');
});
test('same-utterance repetitions and long clause beginnings are preserved',()=>{
 const c=new CueCursor();c.select('待ってください',1);
 assert.equal(c.select('待ってください待ってください',1),'待ってください待ってください');
 const long='私は絶対に'+ 'このゲームを'.repeat(10)+'やめません。';
 assert.equal(c.select(long,2),long);
});
