class CaptureProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(2048); this.offset = 0; }
  process(inputs, outputs) {
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
