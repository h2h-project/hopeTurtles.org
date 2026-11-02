#!/usr/bin/env node
// One-off: give every existing turtle a fin code.
//
//   node backfill-fin-codes.js            # assign codes
//   node backfill-fin-codes.js --dry-run  # list who would get one
//
// Run after sql/migrations/20261102_turtle_fin_code.sql. Safe to re-run: it
// only touches turtles whose fin_code is still NULL, and never overwrites one.
// Run from the repo root so config/env.js finds .env. Lives in the root only
// because scripts/ is gitignored — delete once production is backfilled.

import pool from './config/db.js';
import turtlesModel from './models/turtlesModel.js';
import { withUniqueFinCode } from './utils/finCode.js';

const dryRun = process.argv.includes('--dry-run');

const main = async () => {
  const turtles = await turtlesModel.listWithoutFinCode();
  if (!turtles.length) {
    console.log('Every turtle already has a fin code.');
    return;
  }

  console.log(`${turtles.length} turtle(s) without a fin code${dryRun ? ' (dry run)' : ''}:`);
  for (const turtle of turtles) {
    const label = `#${turtle.turtle_id} ${turtle.name || ''}`.trim();
    if (dryRun) {
      console.log(`  ${label}`);
      continue;
    }
    let assigned = null;
    await withUniqueFinCode(async (code) => {
      if (await turtlesModel.setFinCodeIfMissing(turtle.turtle_id, code)) assigned = code;
    });
    console.log(`  ${label} → ${assigned ?? '(already set by someone else, skipped)'}`);
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
