import { LlamaWorkerTranslator, type GGUFVariantConfig } from './LlamaWorkerTranslator'
import type { WorkerInitOptions } from '../../main/worker-pool'

/** Optional local model, pinned and verified before loading. */
export class HunyuanMT2Translator extends LlamaWorkerTranslator {
  readonly id = 'hunyuan-mt-2'
  readonly name = 'Hy-MT2 (Offline)'
  protected getVariants(): Record<string, GGUFVariantConfig> {
    return { Q4_K_M: {
      filename: 'Hy-MT2-1.8B-Q4_K_M.gguf',
      url: 'https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/resolve/a0c709d9fac510f2c807aa3af52872340dc37a4a/Hy-MT2-1.8B-Q4_K_M.gguf',
      sha256: 'dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699'
    }, '7B-Q4_K_M': {
      filename: 'Hy-MT2-7B-Q4_K_M.gguf',
      url: 'https://huggingface.co/tencent/Hy-MT2-7B-GGUF/resolve/ab8472660ac61fac25f1af43fac2599d52a8a775/Hy-MT2-7B-Q4_K_M.gguf',
      sha256: '9f96256500f3fc1ab4d64336b58f52a949a95ad7516b0c229476eef782f9f77b'
    } }
  }
  protected getModelSizeLabel(): string { return 'Hy-MT2' }
  protected getExtraInitOptions(): Partial<WorkerInitOptions> {
    return { modelType: 'hunyuan-mt-2' }
  }
}
