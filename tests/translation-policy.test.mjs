import {test} from 'node:test';
import assert from 'node:assert/strict';
import {phraseTranslation,validateTranslation,TranslationMemo,firstTranslation,polishChinese} from '../translation-policy.mjs';
test('whole phrases preserve negation, questions and viewer perspective',()=>{
 assert.equal(phraseTranslation('我先去睡覺了','zh-ja'),'そろそろ寝ますね。');
 assert.equal(phraseTranslation('不要勉強自己喔','zh-ja'),'無理しないでくださいね。');
 assert.equal(phraseTranslation('好可愛？','zh-ja'),undefined);
 assert.equal(phraseTranslation('かわいくない','ja-zh'),undefined);
 assert.equal(phraseTranslation('我不是第一次來看直播','zh-ja'),undefined);
 assert.equal(phraseTranslation('這套衣服很適合你','zh-ja'),'この衣装、とてもお似合いです！');
 assert.equal(polishChinese('配信のアーカイブを見ます','去檔案館看。'),'去直播存檔看。');
 assert.equal(polishChinese('市のアーカイブ','市立檔案館'),'市立檔案館');
});
test('output checks reject English, commentary and leftover Japanese but retain known names',()=>{
 assert.throws(()=>validateTranslation('Let us play today','ja-zh'));
 assert.throws(()=>validateTranslation('中文こんにちは','ja-zh'));
 assert.throws(()=>validateTranslation('Translation: こんにちは','zh-ja'));
 assert.equal(validateTranslation('鹿乃まほろ今天要玩遊戲。','ja-zh'),'鹿乃まほろ今天要玩遊戲。');
});
test('memo shares concurrent work, retries failures and evicts least recently used',async()=>{
 const memo=new TranslationMemo(2);let calls=0;
 const work=async()=>{calls++;return '結果';};
 await Promise.all([memo.run('a',work),memo.run('a',work)]);assert.equal(calls,1);
 await memo.run('b',work);await memo.run('a',work);await memo.run('c',work);
 assert.equal(memo.cache.has('b'),false);
 await assert.rejects(memo.run('fail',async()=>{throw Error('network');}));
 assert.equal(await memo.run('fail',work),'結果');
});
test('fast primary never calls backup; slow primary is aborted after backup wins',async()=>{
 let backups=0;
 assert.equal(await firstTranslation(async()=> '快',async()=>{backups++;return '備援';},undefined,20),'快');
 await new Promise(r=>setTimeout(r,25));assert.equal(backups,0);
 let stopped=false;
 const slow=signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{stopped=true;reject(Error('stopped'));}));
 assert.equal(await firstTranslation(slow,async()=> '備援',undefined,1),'備援');assert.equal(stopped,true);
});
test('failed primary starts backup immediately and cancellation aborts both',async()=>{
 assert.equal(await firstTranslation(async()=>{throw Error('bad language');},async()=> '中文',undefined,1000),'中文');
 const controller=new AbortController();controller.abort();let called=0;
 await assert.rejects(firstTranslation(async()=>{called++;},async()=>{called++;},controller.signal,1));
 assert.equal(called,0);
});

test('reviewed warm viewer phrases preserve meaning, names and supplied emoji without matching larger messages',()=>{
 assert.equal(phraseTranslation('都好好聽啊','zh-ja'),'どれもとっても素敵ですね！');
 assert.equal(phraseTranslation('睡飽飽補精神喔🤎✨','zh-ja'),'たっぷり寝て、元気をチャージしてくださいね🤎✨');
 assert.match(phraseTranslation('如果有不懂的漢字和功能，可以問我ww','zh-ja'),/漢字や機能.*ww$/);
 assert.equal(phraseTranslation('都好好聽啊，但我比較喜歡以前的版本','zh-ja'),undefined);
});

test('standalone cheer spellings preserve praise without rewriting negation or clauses',()=>{
 for(const text of ['ないす','ないすー！','ナイスー!','ないす～'])assert.equal(phraseTranslation(text,'ja-zh'),'漂亮！');
 assert.equal(phraseTranslation('次こそ！','ja-zh'),'下次一定！');
 for(const text of ['頑張れ！！','がんばって～','がんばえ〜','ファイト'])assert.equal(phraseTranslation(text,'ja-zh'),'加油！');
 assert.equal(phraseTranslation('おしい','ja-zh'),'可惜了！');
 for(const text of ['ないです','ナイスじゃない','次こそ失敗しない','ないす？','頑張らないで','ファイトマネー'])assert.equal(phraseTranslation(text,'ja-zh'),undefined);
});
