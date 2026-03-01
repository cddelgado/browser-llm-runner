# browser-llm-runner

Student-facing browser chat UI with local model inference.

## Runtime behavior

- Inference runs in-browser via Transformers.js inside a Web Worker.
- Backend selection supports:
  - `Auto (WebGPU then CPU)`
  - `WebGPU only`
  - `CPU only`
- `Auto` attempts WebGPU first and falls back to CPU if unavailable or initialization fails.
- The selected backend and model are stored in `localStorage`.

## Supported model

- `onnx-community/gemma-3-1b-ONNX-GQA`
- Legacy stored ID `onnx-community/gemma-3-1b-it-ONNX-GQA` is automatically remapped to the supported model.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
