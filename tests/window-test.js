const root=document.querySelector('#captions'),panel=new JtlCaptionWindow(root,'testRect');
let rows=[{original:'皆さん、こんばんは。今日は一緒にゲームを楽しみましょう。',translated:'大家晚上好，今天一起開心玩遊戲吧。'},{original:'まだクリアできていないけど、もう一回やってみます。',translated:'還沒通關，但我會再試一次。'},{original:'ちょっと待ってくださいね。',translated:'請稍等一下喔。'},{original:'来てくれてありがとうございます。',translated:'謝謝大家來看直播。'}];
panel.render(rows);document.querySelector('#next').onclick=()=>{rows.push({original:'次のステージへ進みましょう。',translated:'我們前往下一關吧。'});panel.render(rows);document.querySelector('#status').textContent='已加入第五句，畫面保留第 2–5 句。';};
