/**
 * Creates a concurrency limiter: at most `concurrency` async tasks run at the same time.
 * Pending tasks queue and start the moment a running task finishes.
 */
export function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await task();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}
