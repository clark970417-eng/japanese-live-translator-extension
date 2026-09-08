// Track the visible clause within a single expanding ASR utterance. Full
// decodes can lose punctuation; locate the current cue before selecting a tail.
export class CueCursor {
 constructor(){this.reset();}
 reset(){this.id=null;this.previous='';}
 select(text,id){
  if(id!==this.id){this.id=id;this.previous='';}
  const key=this.previous.replace(/[\p{P}\s]/gu,'');
  if(key.length>=4){
   let normalized='';const positions=[];
   for(let i=0;i<text.length;i++)if(!/[\p{P}\s]/u.test(text[i])){normalized+=text[i];positions.push(i);}
   let at=normalized.indexOf(key);
   // ASR can revise the ending (待ってくれ → 待ってください).
   // A matching cue opening still identifies its place in the old paragraph.
   if(at<0)at=normalized.indexOf(key.slice(0,4));
   if(at>0)text=text.slice(positions[at]);
   if(/[。！？!?]$/u.test(this.previous)&&normalized.slice(Math.max(0,at)).startsWith(key)){
    const end=Math.max(0,at)+key.length;
    if(end<positions.length){
     const next=normalized.slice(end);
     if(next.length<4)return this.previous;
     text=text.slice(positions[end]-(at>0?positions[at]:0));
    }
   }
  }
  const clauses=text.match(/[^。！？!?]+[。！？!?]?/gu)||[text];
  let cue=clauses.at(-1).trim();
  if(cue.length<4&&clauses.length>1)cue=clauses.at(-2).trim()+cue;
  this.previous=cue;
  return cue;
 }
}
