// A small pool of Stockfish WASM workers. Each worker is single-threaded, so running
// several in parallel is how we use more CPU cores without cross-origin isolation.

const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;

/** Engine evaluation from the point of view of the side to move. */
export interface EngineEval {
  cp?: number;
  mate?: number;
  best: string | null; // UCI move, null if no legal moves
  pv: string[];
  depth: number;
}

interface Job {
  fen: string;
  depth: number;
  resolve: (e: EngineEval) => void;
  reject: (err: Error) => void;
}

class EngineWorker {
  private worker: Worker;
  private listener: ((line: string) => void) | null = null;
  readonly ready: Promise<void>;

  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (e: MessageEvent) => {
      const line = typeof e.data === "string" ? e.data : String(e.data);
      this.listener?.(line);
    };
    this.ready = (async () => {
      await this.waitFor("uci", (l) => l === "uciok");
      this.send("setoption name Hash value 32");
      await this.waitFor("isready", (l) => l === "readyok");
    })();
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private waitFor(cmd: string, done: (line: string) => boolean): Promise<void> {
    return new Promise((resolve) => {
      this.listener = (line) => {
        if (done(line)) {
          this.listener = null;
          resolve();
        }
      };
      this.send(cmd);
    });
  }

  analyse(fen: string, depth: number): Promise<EngineEval> {
    return new Promise((resolve) => {
      const result: EngineEval = { best: null, pv: [], depth: 0 };
      this.listener = (line) => {
        if (line.startsWith("info ") && line.includes(" score ") && !/(upper|lower)bound/.test(line)) {
          const multipv = /\bmultipv (\d+)/.exec(line);
          if (multipv && multipv[1] !== "1") return;
          const d = /\bdepth (\d+)/.exec(line);
          const cp = /\bscore cp (-?\d+)/.exec(line);
          const mate = /\bscore mate (-?\d+)/.exec(line);
          const pv = /\bpv (.+)$/.exec(line);
          if (d) result.depth = Number(d[1]);
          if (cp) { result.cp = Number(cp[1]); result.mate = undefined; }
          if (mate) { result.mate = Number(mate[1]); result.cp = undefined; }
          if (pv) result.pv = pv[1].trim().split(/\s+/);
        } else if (line.startsWith("bestmove")) {
          const best = line.split(/\s+/)[1];
          result.best = best && best !== "(none)" ? best : null;
          if (result.best && result.pv[0] !== result.best) result.pv = [result.best];
          this.listener = null;
          resolve(result);
        }
      };
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
    });
  }

  terminate() {
    this.worker.terminate();
  }
}

export class EnginePool {
  private workers: EngineWorker[] = [];
  private idle: EngineWorker[] = [];
  private queue: Job[] = [];

  constructor(size = defaultPoolSize()) {
    for (let i = 0; i < size; i++) {
      const w = new EngineWorker();
      this.workers.push(w);
      w.ready.then(() => this.release(w));
    }
  }

  get size() {
    return this.workers.length;
  }

  /** Queues a position; `urgent` jumps the queue (used for interactive drill checks). */
  evaluate(fen: string, depth: number, urgent = false): Promise<EngineEval> {
    return new Promise((resolve, reject) => {
      const job = { fen, depth, resolve, reject };
      if (urgent) this.queue.unshift(job);
      else this.queue.push(job);
      this.pump();
    });
  }

  /** Drops queued (not yet started) jobs. */
  clearQueue() {
    const dropped = this.queue.splice(0);
    for (const j of dropped) j.reject(new Error("cancelled"));
  }

  private release(w: EngineWorker) {
    this.idle.push(w);
    this.pump();
  }

  private pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const job = this.queue.shift()!;
      w.analyse(job.fen, job.depth)
        .then(job.resolve, job.reject)
        .finally(() => this.release(w));
    }
  }

  terminate() {
    this.clearQueue();
    for (const w of this.workers) w.terminate();
  }
}

function defaultPoolSize() {
  const cores = navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(4, cores - 1));
}
