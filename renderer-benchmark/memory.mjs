// Memory of a Linux cgroup (v2), for the benchmark.
import { readFileSync } from 'node:fs';

// The fields of memory.stat, in bytes.
function memoryStat(dir) {
  const stat = {};
  for (const line of readFileSync(`${dir}/memory.stat`, 'utf8').split('\n')) {
    const [key, value] = line.split(' ');
    if (key) stat[key] = Number(value);
  }
  return stat;
}

// Read the cgroup in `dir` every 50 ms, until stop(). stop() returns:
// - peakBytes: memory.peak, all memory of the cgroup, also the page cache
//   of the files that the processes read or write;
// - processBytes: the highest memory.current without the page cache that
//   the kernel can drop (file - shmem): process memory, shared memory, kernel;
// - anonBytes and shmemBytes: the highest anon and shmem values of memory.stat.
// Without a cgroup (dir is null, or not Linux), the values are null.
export function sampleMemory(dir) {
  let processBytes = null;
  let anonBytes = null;
  let shmemBytes = null;
  const read = () => {
    try {
      const current = Number(readFileSync(`${dir}/memory.current`, 'utf8'));
      const stat = memoryStat(dir);
      processBytes = Math.max(processBytes ?? 0, current - (stat.file - stat.shmem));
      anonBytes = Math.max(anonBytes ?? 0, stat.anon);
      shmemBytes = Math.max(shmemBytes ?? 0, stat.shmem);
    } catch {
      // No cgroup, or it is already gone.
    }
  };
  const timer = dir ? setInterval(read, 50).unref() : null;
  return {
    stop() {
      if (!dir) return { peakBytes: null, processBytes: null, anonBytes: null, shmemBytes: null };
      clearInterval(timer);
      read();
      let peakBytes = null;
      try {
        peakBytes = Number(readFileSync(`${dir}/memory.peak`, 'utf8'));
      } catch {
        // memory.peak needs Linux 5.19 or later.
      }
      return { peakBytes, processBytes, anonBytes, shmemBytes };
    },
  };
}
