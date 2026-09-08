// Transformers.js streamer protocol: prompt once, then token batches, then end.
// Keep Japanese subword tokens together; never emit an incomplete UTF-8 character.
export class CaptionTokenStream {
 constructor(tokenizer,emit,now=()=>performance.now()){
  this.tokenizer=tokenizer;this.emit=emit;this.now=now;this.tokens=[];this.prompt=true;this.last='';this.sentAt=-Infinity;
 }
 put(batch){
  if(this.prompt){this.prompt=false;return;}
  this.tokens.push(...(batch[0]||[]));this.flush(false);
 }
 flush(force){
  if(!this.tokens.length)return;
  const text=this.tokenizer.decode(this.tokens,{skip_special_tokens:true}).trim();
  if(text.includes('\ufffd')||text===this.last||text.length<4)return;
  if(!force&&this.now()-this.sentAt<300)return;
  this.last=text;this.sentAt=this.now();this.emit(text);
 }
 end(){this.flush(true);}
}
