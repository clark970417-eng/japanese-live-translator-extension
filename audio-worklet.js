class CaptureProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(2048); this.offset = 0; this.finished = false;
    this.port.onmessage = ({data}) => {
      if(data?.type !== 'flush' || this.finished)return;
      this.finished = true;
      if(this.offset){const tail=this.buffer.slice(0,this.offset);this.port.postMessage(tail,[tail.buffer]);this.offset=0;}
      this.port.postMessage({type:'flushed'});
    };
  }
  process(inputs, outputs) {
    if(this.finished)return false;
    const channels = inputs[0] || [];
    // Paused/ended media may have no input channels. Keep the sample clock
    // advancing with silence so VAD can finalize the utterance.
    const frames = channels[0]?.length || outputs?.[0]?.[0]?.length || 128;
    for (let i=0; i<frames; i++) {
      let value=0;
      for (const channel of channels) value += channel[i];
      this.buffer[this.offset++] = channels.length ? value/channels.length : 0;
      if (this.offset === this.buffer.length) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(2048); this.offset=0;
      }
    }
    return true;
  }
}
registerProcessor('subtitle-capture', CaptureProcessor);
