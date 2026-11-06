/// <reference lib="webworker" />

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

type InMsg = { type: "load" } | { type: "speak"; id: number; text: string };

let tts: import("kokoro-js").KokoroTTS | null = null;
let loading: Promise<void> | null = null;

async function load() {
  if (tts) return;
  if (!loading) {
    loading = (async () => {
      const { env } = await import("@huggingface/transformers");
      const wasm = env.backends.onnx.wasm;
      if (wasm) {
        wasm.numThreads = 1;
        wasm.proxy = false;
      }
      const { KokoroTTS } = await import("kokoro-js");
      tts = await KokoroTTS.from_pretrained(MODEL, {
        dtype: "q8",
        device: "wasm",
        progress_callback: (info) => {
          const progress = "progress" in info && typeof info.progress === "number" ? info.progress : 0;
          postMessage({ type: "progress", progress });
        },
      });
      postMessage({ type: "ready" });
    })();
  }
  await loading;
}

let chain: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<InMsg>) => {
  const msg = event.data;
  chain = chain.then(async () => {
    try {
      await load();
      if (msg.type === "load") return;
      if (!tts) throw new Error("voice missing");
      const audio = await tts.generate(msg.text, { voice: "af_heart", speed: 0.92 });
      const samples = new Float32Array(audio.audio);
      postMessage({ type: "clip", id: msg.id, samples, rate: audio.sampling_rate }, [samples.buffer]);
    } catch (err) {
      postMessage({
        type: "error",
        id: msg.type === "speak" ? msg.id : 0,
        message: err instanceof Error ? err.message : "voice failed",
      });
    }
  });
};
