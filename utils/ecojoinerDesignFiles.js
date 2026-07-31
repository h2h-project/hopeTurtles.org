// Saved ecojoiner designs must survive utils/ecojoinerCleanup.js's TTL sweep
// of public/ecojoiner_exports/<jobSlug>/, which has no concept of "saved".
// This copies a completed generate run's files out of that ephemeral job
// folder into a persistent location under public/uploads/ before the design
// row is marked 'generated', so its download links never go dead.
import fs from "fs/promises";
import path from "path";
import { config } from "../config/env.js";

const { ecojoiner } = config;

const DESIGNS_DIR_NAME = "ecojoiner_designs";

const assertInsideExports = (jobSlug) => {
  const root = path.resolve(ecojoiner.exportsDir);
  const resolved = path.resolve(root, jobSlug || "");
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(
      `Refusing job slug outside the exports directory: ${jobSlug}`,
    );
  }
  return resolved;
};

/**
 * Copy the files named in a completed generate manifest from their ephemeral
 * job folder into a persistent per-design folder, and return a manifest with
 * `url` rewritten to point at the persisted copies. The original job folder
 * is left untouched — the daily sweep still cleans it up normally.
 */
export const persistDesignFiles = async (
  jobSlug,
  designId,
  manifestFiles = [],
) => {
  const jobDir = assertInsideExports(jobSlug);
  const destDir = path.join(
    ecojoiner.rootDir,
    "public",
    "uploads",
    DESIGNS_DIR_NAME,
    String(designId),
  );
  await fs.mkdir(destDir, { recursive: true });

  const persisted = [];
  for (const file of manifestFiles) {
    const filename = path.basename(file.url || "");
    if (!filename) continue;
    const source = path.join(jobDir, filename);
    const dest = path.join(destDir, filename);
    await fs.copyFile(source, dest);
    persisted.push({
      ...file,
      url: `/uploads/${DESIGNS_DIR_NAME}/${designId}/${filename}`,
    });
  }

  return persisted;
};

/**
 * Best-effort removal of a design's persisted files, used when a design is
 * deleted. Logged, not thrown, matching utils/ecojoinerCleanup.js's pattern.
 */
export const removeDesignFiles = async (designId) => {
  const dir = path.join(
    ecojoiner.rootDir,
    "public",
    "uploads",
    DESIGNS_DIR_NAME,
    String(designId),
  );
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    console.error(
      `Could not remove persisted files for design ${designId}:`,
      error.message,
    );
  }
};

export default { persistDesignFiles, removeDesignFiles };
