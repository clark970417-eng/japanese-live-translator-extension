chrome.storage.local.get(['recordedCaptions']).then(({recordedCaptions:entries=[]})=>{
 const session=entries.at(-1)?.session;const latest=entries.filter(e=>e.session===session);
 document.querySelector('#result').textContent=JSON.stringify({entries:latest.length,groups:[...new Set(latest.map(e=>e.group))],items:latest.map(e=>({key:e.key,group:e.group,state:e.state,length:e.original?.length,translatedLength:e.translated?.length}))},null,2);
});
