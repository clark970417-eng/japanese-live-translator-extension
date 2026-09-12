import { getLlama, LlamaChatSession } from 'node-llama-cpp';
import { writeFileSync, appendFileSync } from 'node:fs';
const texts=['今天也謝謝你陪大家聊天，請早點休息喔。','謝謝你今天唱了這麼多歌，我聽得很開心！','剛剛是我看錯了，不是你操作錯了。','我明天要上課，今天不能陪你到最後。','昨天沒有趕上，但明天我會再來。','不用特別為我再唱一次，能聽到你的聲音就很開心了。','希望你今天錄音順利，晚安～','如果你不方便回答也沒關係，我只是有點好奇。','等一下要出門，今天不能待到結束。','晚安啊，REC加油～'];
const prompt=t=>{
const terms=[['好聽','素敵'],['歌聲','歌声'],['辛苦了','お疲れさまでした'],['排程','スケジュール'],['了解','了解です'],['直播','配信'],['沒辦法','できません'],['不能待到結束','最後までいられません'],['不一定能來','来られるとは限りません'],['補精神','元気をチャージ']];
const glossary=terms.filter(([source])=>t.includes(source)).map(([source,target])=>`${source} 翻译成 ${target}`).join('\n');
const gratitude=/(?:謝謝|谢谢|感謝|感谢)你/.test(t)?'原文感谢收信人做的事时，应使用「〜してくれてありがとうございます」，不要翻成说话人自己「〜できて」。':'';
return `时态参考：未来无法参加用「明日は参加できません」，昨天未能参加用「昨日は参加できませんでした」。不要输出这些参考句。\n${glossary?'参考下面的翻译：\n'+glossary+'\n\n':''}${gratitude}将以下文本翻译为日语，这是观众写给主播的留言，使用自然亲切、有礼貌的语气。保持留言者视角，不把个人计划改为邀请或命令。完整保留原意、时态、否定、称呼和表情。只输出译文，不要额外解释：\n\n${t}`;
};
const report=process.env.COMPARE_REPORT;writeFileSync(report,JSON.stringify({type:'metadata',candidate:'conditional-gratitude-role',development:true,concurrentLoad:true})+'\n');
const llama=await getLlama({gpu:'metal'});const model=await llama.loadModel({modelPath:process.env.COMPARE_MODEL});const ctx=await model.createContext({contextSize:2048});const seq=ctx.getSequence();const session=new LlamaChatSession({contextSequence:seq});
try{for(const source of texts){session.setChatHistory([]);const t=performance.now();const r=await session.promptWithMeta(prompt(source),{temperature:0,maxTokens:256,repeatPenalty:{penalty:1.05},signal:AbortSignal.timeout(30000)});const row={source,translated:r.responseText,stopReason:r.stopReason,ms:performance.now()-t};appendFileSync(report,JSON.stringify(row)+'\n');console.log(row);}}finally{session.dispose();seq.dispose();await ctx.dispose();await model.dispose();await llama.dispose();}
