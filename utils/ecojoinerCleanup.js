// Generated ecojoiner exports are disposable: the user downloads them within
// minutes. Sweep old job folders so public/ecojoiner_exports/ does not grow
// without bound.
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/env.js';

const { exportsDir, jobTtlDays } = config.ecojoiner;

const DAY_MS = 24 * 60 * 60 * 1000;

export const sweepEcojoinerExports = async () => {
  const cutoff = Date.now() - jobTtlDays * DAY_MS;
  let removed = 0;

  let entries;
  try {
    entries = await fs.readdir(exportsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('ecojoiner_')) continue;
    const jobDir = path.join(exportsDir, entry.name);
    try {
      const stats = await fs.stat(jobDir);
      if (stats.mtimeMs >= cutoff) continue;
      await fs.rm(jobDir, { recursive: true, force: true });
      removed += 1;
    } catch (error) {
      console.error(`Could not sweep ${entry.name}:`, error.message);
    }
  }

  return removed;
};

// Sweep once at boot, then daily. The interval is unref'd so it never keeps the
// process alive on its own.
export const scheduleEcojoinerCleanup = () => {
  const run = () => {
    sweepEcojoinerExports()
      .then((removed) => {
        if (removed) console.log(`🧹 Swept ${removed} expired ecojoiner export(s)`);
      })
      .catch((error) => console.error('Ecojoiner cleanup failed:', error.message));
  };

  run();
  const timer = setInterval(run, DAY_MS);
  timer.unref();
  return timer;
};

export default { sweepEcojoinerExports, scheduleEcojoinerCleanup };
