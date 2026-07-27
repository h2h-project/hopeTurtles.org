# August 2026 — Proposed Schema Update

Two changes proposed for the next schema revision (would land as `hopeturtles_db_v1.4.sql`
plus a migration under `sql/migrations/`):

1. The bottle-recovery schema change carried over from `docs/july_tasks.md` task 1 —
   still agreed, still not started, formalized here as concrete DDL.
2. A new addition: schema to let a logged-in user save their ecojoiner generation specs
   for a particular bottle type on `/ecojoiners/generate`, and later view/reopen those
   saved designs from `/dashboard`.

Neither change has been applied to `docs/hopeturtles_db_v1.3.sql` yet. This document is the
proposal to review before writing the migration file.

---

## 1. Carried over from July: bottle recovery lifecycle + success linkage

**Source:** `docs/july_tasks.md`, task 1 ("Schema: track successfully found bottles").
Status there is still "agreed, not started" — restating it here as DDL so it ships in the
same migration pass as the ecojoiner tables below, rather than getting lost as a separate
follow-up.

**Problem, unchanged from July:** `success_tb` links a find to a `turtle_id` only — no
`bottle_id`. `bottles_tb` has no lifecycle state, so "bottles currently aboard turtle N"
cannot be answered without conflating it with "bottles ever assigned to turtle N."

**Decision for this migration:** go with July's option **B** (join table), since it's the
only shape that can represent one beachcomber finding a turtle with several bottles as a
single success event, and it needs no follow-up migration if that turns out to be common.

```sql
-- Lifecycle state on the bottle itself, so cargo counts don't require a join.
ALTER TABLE `bottles_tb`
  ADD COLUMN `status` ENUM('packed','aboard','recovered','lost')
    NOT NULL DEFAULT 'packed' AFTER `verified`;

-- One success event can recover multiple bottles.
CREATE TABLE `success_bottles_tb` (
  `success_id` BIGINT UNSIGNED NOT NULL,
  `bottle_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`success_id`, `bottle_id`),
  KEY `bottle_id` (`bottle_id`),
  CONSTRAINT `success_bottles_success_fk` FOREIGN KEY (`success_id`) REFERENCES `success_tb`(`success_id`) ON DELETE CASCADE,
  CONSTRAINT `success_bottles_bottle_fk` FOREIGN KEY (`bottle_id`) REFERENCES `bottles_tb`(`bottle_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

`success_bottles_bottle_fk` should mark the bottle `recovered` at insert time (application
logic, not a trigger, to stay consistent with how the rest of this codebase handles
lifecycle transitions). "Bottles currently aboard turtle N" becomes:

```sql
SELECT COUNT(*) FROM bottles_tb WHERE turtle_id = ? AND status = 'aboard';
```

This unblocks July task 4's open caveat (device API `bottle_count` currently counts bottles
*ever assigned*, not bottles *aboard*).

---

## 2. New: saved ecojoiner specs and designs

**Problem:** `/ecojoiners/generate` (`views/generate.ejs`, `routes/api/ecojoiner.js`,
`utils/ecojoinerGenerator.js`) is entirely stateless today. The page already has a
"Save Ecojoiner" button (`#eco-save` in `views/generate.ejs:268`) wired up to nothing —
there is no table to save it to, and no ownership model, since ecojoiner generation
currently doesn't require login at all. Generated files live under
`public/ecojoiner_exports/<jobSlug>/` and are **swept after `ECOJOINER_JOB_TTL_DAYS`**
(`utils/ecojoinerCleanup.js`) — anything we want a user to reopen later from their
dashboard has to survive that sweep, so "saved" has to mean more than "the job folder is
still on disk."

**Goal (per the request):** a logged-in user can save the spec they've entered for a given
bottle type, and eventually browse those saved specs/designs from `/dashboard`.

### Two distinct things worth keeping separate

The generate form actually produces two kinds of state, and conflating them would force
every save to pay for a PDF/SCAD run:

- **A bottle profile** — the measurements in panels 1–3 (brand, volume, diameter, cap,
  collar, height, taper, material, thickness). Reusable: the same bottle type gets
  generated against different fabrication choices over time.
- **A design** — one generate run against a bottle profile: which ecojoiner type, which
  fabrication formats, and (if it completed) the resulting file manifest.

Saving a bottle profile should not require running the generator; saving a design should
carry enough of a snapshot to render the confirmation screen again even after the job
folder has been swept.

### Proposed tables

```sql
-- Reusable bottle measurements, keyed to the user who entered them. Mirrors
-- the fields validated by ecojoiner/generate_exports.py::validate_inputs()
-- and mapped in utils/ecojoinerGenerator.js::mapFormFields().
CREATE TABLE `ecojoiner_bottle_profiles_tb` (
  `profile_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `buwana_id` INT NOT NULL,
  `label` VARCHAR(80) NOT NULL,               -- user-facing name, e.g. "Aqua 1.5L"
  `brand` VARCHAR(60) NOT NULL,
  `volume_ml` DECIMAL(7,2) NOT NULL,
  `diameter_mm` DECIMAL(6,2) NOT NULL,        -- form's "diameter" -> port_height
  `cap_mm` DECIMAL(6,2) NOT NULL,
  `collar_mm` DECIMAL(6,2) NOT NULL,
  `height_mm` DECIMAL(6,2) DEFAULT NULL,      -- context-only today (not a generator input)
  `top_tapper_mm` DECIMAL(6,2) NOT NULL,
  `bottom_tapper_mm` DECIMAL(6,2) DEFAULT NULL,
  `material` ENUM('solid-wood','pallet-wood','plywood','particle-board','plastic','other') DEFAULT NULL,
  `thickness_mm` DECIMAL(5,2) NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`profile_id`),
  KEY `buwana_id` (`buwana_id`),
  UNIQUE KEY `uq_profile_owner_label` (`buwana_id`, `label`),
  CONSTRAINT `eco_profiles_user_fk` FOREIGN KEY (`buwana_id`) REFERENCES `users_tb`(`buwana_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A generate run against a profile. Denormalizes the spec at save time
-- (profile_snapshot) so edits to the profile — or its deletion — never
-- change what a previously-generated design says it was built from.
CREATE TABLE `ecojoiner_designs_tb` (
  `design_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `buwana_id` INT NOT NULL,
  `profile_id` BIGINT UNSIGNED DEFAULT NULL,
  `profile_snapshot` JSON NOT NULL,           -- full spec at save time; see note below
  `ecojoiner_type` VARCHAR(20) NOT NULL DEFAULT '6fc',
  `formats` JSON NOT NULL,                    -- e.g. ["pdf","scad"], mirrors the fabrication toggles
  `status` ENUM('draft','generated','expired') NOT NULL DEFAULT 'draft',
  `job_id` VARCHAR(32) DEFAULT NULL,          -- ecojoiner/generate_exports.py job slug, while it's live
  `file_manifest` JSON DEFAULT NULL,          -- download URLs/labels, captured at generate time
  `generated_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`design_id`),
  KEY `buwana_id` (`buwana_id`),
  KEY `profile_id` (`profile_id`),
  CONSTRAINT `eco_designs_user_fk` FOREIGN KEY (`buwana_id`) REFERENCES `users_tb`(`buwana_id`) ON DELETE CASCADE,
  CONSTRAINT `eco_designs_profile_fk` FOREIGN KEY (`profile_id`) REFERENCES `ecojoiner_bottle_profiles_tb`(`profile_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Notes on the shape

- **`profile_id` is nullable, `profile_snapshot` is not.** A design should render correctly
  on the dashboard even after its source profile is edited or deleted — same reasoning as
  denormalizing bottle contents onto `bottles_tb` rather than requiring a live join.
- **`status = 'expired'` covers the export-sweep gap.** `file_manifest` and `job_id` point
  at files under `public/ecojoiner_exports/`, which `sweepEcojoinerExports()` deletes after
  `ECOJOINER_JOB_TTL_DAYS`. A daily job (or the existing cleanup sweep, extended) should
  flip `status` to `'expired'` and null out `file_manifest`/`job_id` once the backing files
  are gone, so the dashboard can offer "regenerate" instead of a dead download link.
- **`#eco-save` (draft) vs. "Generate Ecojoiner Specs" (generated)** map directly to
  `status`: clicking Save with no file output yet inserts a `draft` row (`job_id`/
  `file_manifest` NULL); a successful generate run updates it to `generated` and fills
  those columns in. No separate table needed for "in-progress" state.
- **`ecojoiner_type`** stays a plain `VARCHAR` rather than an `ENUM` — `views/generate.ejs`
  already ships four dev-only types (`3fc`, `4fc`, `2fc`, `fin`, `ballast`) alongside the
  one available type (`6fc`); a `VARCHAR` avoids an `ALTER TABLE` every time one of those
  ships.
- **New API surface implied, not proposed here in detail:** `POST /api/ecojoiner/profiles`,
  `GET /api/ecojoiner/profiles`, and a `design_id` returned from
  `POST /api/ecojoiner/generate` so the frontend can attach a save to the run that produced
  it. Left for the implementation pass — this document is schema-only.
- **Dashboard exposure** (the "eventually" part of the request) is a read against
  `ecojoiner_designs_tb WHERE buwana_id = ? ORDER BY created_at DESC` — no new schema
  needed beyond what's proposed here once it's time to build that view.
