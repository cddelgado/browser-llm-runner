function installMockWorker() {
  class MockWorker {
    constructor() {
      this.listeners = new Map();
      this.timer = null;
      this.terminated = false;
    }

    addEventListener(type, handler) {
      const set = this.listeners.get(type) || new Set();
      set.add(handler);
      this.listeners.set(type, set);
    }

    removeEventListener(type, handler) {
      const set = this.listeners.get(type);
      if (!set) {
        return;
      }
      set.delete(handler);
    }

    postMessage(message) {
      if (!message || this.terminated) {
        return;
      }

      if (message.type === 'init') {
        this.#emit('message', {
          type: 'status',
          payload: { message: 'Loading model...' },
        });
        this.#emit('message', {
          type: 'progress',
          payload: {
            percent: 100,
            message: 'Model ready.',
            file: 'mock-model.onnx',
            status: 'done',
            loadedBytes: 100,
            totalBytes: 100,
          },
        });
        this.#emit('message', {
          type: 'init-success',
          payload: {
            backend: 'cpu',
            modelId: message.payload?.modelId || 'mock/model',
          },
        });
        this.#emit('message', {
          type: 'status',
          payload: { message: 'Ready (CPU)' },
        });
        return;
      }

      if (message.type === 'generate') {
        const requestId = message.payload?.requestId;
        const promptText = String(message.payload?.prompt || '');
        const isLong = /long answer/i.test(promptText);
        const chunks = isLong
          ? ['Mock ', 'streamed ', 'response ', 'that ', 'keeps ', 'going ', 'to ', 'allow ', 'cancellation.']
          : ['Mock ', 'streamed ', 'response.'];
        let index = 0;
        this.timer = setInterval(() => {
          if (this.terminated) {
            clearInterval(this.timer);
            this.timer = null;
            return;
          }
          if (index < chunks.length) {
            this.#emit('message', {
              type: 'token',
              payload: { requestId, text: chunks[index] },
            });
            index += 1;
            return;
          }
          clearInterval(this.timer);
          this.timer = null;
          this.#emit('message', {
            type: 'complete',
            payload: { requestId, text: chunks.join('') },
          });
          this.#emit('message', {
            type: 'status',
            payload: { message: 'Complete (CPU)' },
          });
        }, isLong ? 180 : 60);
      }
    }

    terminate() {
      this.terminated = true;
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    #emit(type, data) {
      const set = this.listeners.get(type);
      if (!set) {
        return;
      }
      for (const handler of set) {
        handler({ data });
      }
    }
  }

  window.Worker = /** @type {any} */ (MockWorker);
}

module.exports = { installMockWorker };
