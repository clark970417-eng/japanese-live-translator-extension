/** Runs real local engines through the production streaming pipeline.
 * Compile into out/main so worker and Python bridge paths match the app.
 * Requires an isolated profile containing the selected model; never copies credentials.
 * Audio must be mono 16-bit PCM WAV at 16 kHz. This bypasses capture/VAD/UI.
 */
import { app, powerSaveBlocker } from 'electron';
import { bindPipelineActivity } from '../src/main/pipeline-activity';
import { readFileSync, writeFileSync } from 'fs';
import { TranslationPipeline } from '../src/pipeline/TranslationPipeline';
import { MlxWhisperEngine } from '../src/engines/stt/MlxWhisperEngine';
import { HunyuanMT15Translator } from '../src/engines/translator/HunyuanMT15Translator';
if (!process.env.COMPARE_PROFILE || !process.env.COMPARE_AUDIO || !process.env.COMPARE_REPORT) {
    throw new Error('Set COMPARE_PROFILE, COMPARE_AUDIO, and COMPARE_REPORT to isolated test paths.');
}
app.setPath('userData', process.env.COMPARE_PROFILE);
const sleep = (ms: number) => new Promise(r => setTimeout(r, Math.max(0, ms)));
app.whenReady().then(async () => {
    const events: any[] = [];
    const sessionStart = Date.now();
    let start = Date.now();
    let run = 'init';
    const record = (type: string, data: any) => { const e = { type, run, seconds: (Date.now() - start) / 1000, sessionSeconds: (Date.now() - sessionStart) / 1000, ...data }; events.push(e); console.log('MEASURE ' + JSON.stringify(e)); };
    const stt = new MlxWhisperEngine();
    const translator = new HunyuanMT15Translator({ kvCacheQuant: process.env.COMPARE_KV_QUANT !== 'false' });
    // Engine durations include time waiting for the shared translation worker.
    let phase = 'initialization';
    const originalStt = stt.processAudio.bind(stt);
    stt.processAudio = async (...args) => {
        const began = performance.now(), callPhase = phase;
        try { return await originalStt(...args); }
        finally { record('stage', {stage:'stt', phase:callPhase, durationMs:performance.now()-began, audioSeconds:args[0].length/args[1]}); }
    };
    for (const method of ['translate', 'translateSSBD'] as const) {
        const original = translator[method].bind(translator);
        (translator as any)[method] = async (...args: any[]) => {
            const began=performance.now(), callPhase=phase;
            try { return await (original as any)(...args); }
            finally { record('stage', {stage:method, phase:callPhase, durationMs:performance.now()-began, inputLength:args[0].length}); }
        };
    }
    const pipeline = new TranslationPipeline();
    const releaseActivity = bindPipelineActivity(pipeline, powerSaveBlocker);
    pipeline.registerSTT('mlx-whisper', () => stt);
    pipeline.registerTranslator('hunyuan-mt-15', () => translator);
    pipeline.on('interim-result', r => record('interim', r));
    pipeline.on('error', e => record('error', { error: String(e) }));
    try {
        await pipeline.switchEngine({ mode: 'cascade', sttEngineId: 'mlx-whisper', translatorEngineId: 'hunyuan-mt-15' });
        pipeline.start();
        const wav = readFileSync(process.env.COMPARE_AUDIO!);
        let offset = 12;
        while (wav.toString('ascii', offset, offset + 4) !== 'data')
            offset += 8 + wav.readUInt32LE(offset + 4);
        const size = wav.readUInt32LE(offset + 4);
        const pcm = new Float32Array(size / 2);
        for (let i = 0; i < pcm.length; i++)
            pcm[i] = wav.readInt16LE(offset + 8 + i * 2) / 32768;
        await stt.processAudio(pcm, 16000);
        await translator.translate('準備ができました。', 'ja', process.env.COMPARE_TARGET === 'zh' ? 'zh' : 'en');
        for (const target of (process.env.COMPARE_TARGET ? [process.env.COMPARE_TARGET] : ['en', 'zh']) as Array<'en' | 'zh'>) {
            pipeline.setLanguageConfig('ja', target);
            for (let round = 1; round <= Number(process.env.COMPARE_ROUNDS || 2); round++) {
                run = target + '-' + round;
                start = Date.now();
                phase = 'interim';
                for (const sec of [1.2, 2.8, 4.5, 6.5, 8.5]) {
                    await sleep(sec * 1000 - (Date.now() - start));
                    const r = await pipeline.processStreaming(pcm.slice(0, Math.round(sec * 16000)), 16000);
                    if (r)
                        record('source', r);
                }
                await sleep(pcm.length / 16 - (Date.now() - start));
                phase = 'final';
                record('final-start', {audioDurationSeconds:pcm.length/16000});
                const final = await pipeline.finalizeStreaming(pcm, 16000);
                record('final', final);
                if (!final?.sourceText || !final.translatedText) throw new Error('Missing final caption in '+run);
                await sleep(1500);
                record('memory', { rssBytes: process.memoryUsage().rss, heapUsedBytes: process.memoryUsage().heapUsed,
                    processes: app.getAppMetrics().map(p => ({type:p.type, workingSetKB:p.memory.workingSetSize})) });
                const restartEvery = Number(process.env.COMPARE_RESTART_EVERY || 0);
                if (restartEvery > 0 && round % restartEvery === 0) {
                    record('silence-probe', await pipeline.finalizeStreaming(new Float32Array(16000), 16000));
                    await pipeline.stop();
                    record('stopped', { state:pipeline.state });
                    await pipeline.switchEngine({ mode: 'cascade', sttEngineId: 'mlx-whisper', translatorEngineId: 'hunyuan-mt-15' });
                    pipeline.start();
                    record('restarted', { state:pipeline.state });
                }
            }
        }
        run = 'silence';
        start = Date.now();
        record('silence', await pipeline.finalizeStreaming(new Float32Array(16000), 16000));
    }
    catch (e) {
        record('fatal', { error: String(e) });
        process.exitCode = 1;
    }
    finally {
        await pipeline.dispose();
        releaseActivity();
        writeFileSync(process.env.COMPARE_REPORT!, JSON.stringify(events, null, 2));
        app.quit();
    }
});
