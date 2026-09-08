(() => {
 if(window.JtlCaptionWindow)return;
 window.JtlCaptionWindow=class {
  constructor(root,key){
   this.root=root;this.key=key;root.classList.add('jtl-caption-window');
   root.replaceChildren();this.lines=document.createElement('div');this.lines.className='jtl-lines';root.append(this.lines);
   for(const side of ['n','s','e','w','ne','nw','se','sw']){const handle=document.createElement('div');handle.className='jtl-resize jtl-'+side;handle.dataset.side=side;root.append(handle);}
   root.addEventListener('pointerdown',e=>this.begin(e));
   root.addEventListener('click',e=>e.stopPropagation());
   root.addEventListener('dblclick',e=>e.stopPropagation());
   chrome.storage.local.get(['subtitleSettings','captionStyleV34',key]).then(s=>{let prefs=s.subtitleSettings||{};if(!s.captionStyleV34){prefs={...prefs,fontSize:22,japaneseColor:'#ffffff',chineseColor:'#ffffff',outlineWidth:1,backgroundColor:'#000000',backgroundOpacity:60};chrome.storage.local.set({subtitleSettings:prefs,captionStyleV34:true});}this.apply(prefs);if(s[key])this.place(s[key]);});
  }
  place(rect){const r=this.root;r.style.left=(rect.x*100)+'%';r.style.top=(rect.y*100)+'%';r.style.width=(rect.w*100)+'%';r.style.height=(rect.h*100)+'%';r.style.right='auto';r.style.bottom='auto';r.style.transform='none';}
  apply(raw={}){const s={fontSize:22,backgroundColor:'#000000',backgroundOpacity:60,japaneseColor:'#ffffff',chineseColor:'#ffffff',outlineWidth:1,...raw};this.root.style.setProperty('--jtl-size',s.fontSize+'px');this.root.style.setProperty('--jtl-ja',s.japaneseColor);this.root.style.setProperty('--jtl-zh',s.chineseColor);this.root.style.setProperty('--jtl-outline',s.outlineWidth+'px');const hex=/^#[0-9a-f]{6}$/i.test(s.backgroundColor)?s.backgroundColor:'#000000';const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));this.root.style.setProperty('--jtl-bg',`rgba(${rgb.join(',')},${Math.max(0,Math.min(100,Number(s.backgroundOpacity)))/100})`);}
  render(rows){
   const signature=JSON.stringify(rows);if(signature===this.signature)return;this.signature=signature;
   this.lines.replaceChildren(...rows.slice(-4).map(row=>{const pair=document.createElement('div');pair.className='jtl-pair';for(const [cls,text] of [['jtl-spoken',row.original],['jtl-chinese',row.translated]]){const line=document.createElement('div');line.className=cls;const value=(text||'').replace(/\s+/g,' ').trim();if(value){const backing=document.createElement('span');backing.textContent=value;line.append(backing);}pair.append(line);}return pair;}));
   this.lines.scrollTop=this.lines.scrollHeight;
  }
  begin(event){
   if(event.button!==0)return;
   const root=this.root,parent=root.parentElement;if(!parent)return;
   event.preventDefault();event.stopPropagation();
   const box=root.getBoundingClientRect(),host={left:0,top:0,width:window.innerWidth,height:window.innerHeight},side=event.target.dataset.side||'';
   const start={x:box.left-host.left,y:box.top-host.top,w:box.width,h:box.height,px:event.clientX,py:event.clientY};
   root.setPointerCapture(event.pointerId);
   const move=e=>{
    const dx=e.clientX-start.px,dy=e.clientY-start.py;let{x,y,w,h}=start;
    if(!side){x+=dx;y+=dy;}else{if(side.includes('e'))w+=dx;if(side.includes('s'))h+=dy;if(side.includes('w')){x+=dx;w-=dx;}if(side.includes('n')){y+=dy;h-=dy;}}
    w=Math.min(host.width,Math.max(Math.min(180,host.width),w));h=Math.min(host.height,Math.max(Math.min(60,host.height),h));x=Math.max(0,Math.min(host.width-w,x));y=Math.max(0,Math.min(host.height-h,y));
    this.rect={x:x/host.width,y:y/host.height,w:w/host.width,h:h/host.height};this.place(this.rect);
   };
   const end=()=>{root.removeEventListener('pointermove',move);root.removeEventListener('pointerup',end);root.removeEventListener('pointercancel',end);if(this.rect)chrome.storage.local.set({[this.key]:this.rect});};
   root.addEventListener('pointermove',move);root.addEventListener('pointerup',end);root.addEventListener('pointercancel',end);
  }
 };
})();
