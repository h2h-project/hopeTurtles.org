// Bridge between the Ecojoiner generate form and ecojoiner/generate_exports.py,
// the Python script that owns all Ecojoiner v3.2 geometry, validation and file
// writing. Node maps form fields onto the script's inputs, runs it, and hands
// the resulting manifest back to the frontend.
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from '../config/env.js';

const execFileAsync = promisify(execFile);

const { ecojoiner } = config;

// Formats the Python generator can currently write.
const SUPPORTED_FORMATS = ['pdf', 'scad', 'svg'];

// v3.2 part list, kept alongside PART_QUANTITIES in generate_exports.py so the
// confirmation screen can show what the user is about to cut.
// `key` lets the page show a translated part name (locale key `gen_part_<key>`)
// and fall back to the English `part` when a language has not been filled in.
export const PART_QUANTITIES = [
  { key: 'long_john', part: 'Long John', quantity: 6 },
  { key: 'little_john', part: 'Little John', quantity: 5 },
  { key: 'master_john', part: 'Master John', quantity: 1 },
  { key: 'final_key', part: 'Final Key', quantity: 4 },
  { key: 'presser', part: 'Presser', quantity: 12 }
];

// Same idea for the download labels, which the Python script writes in English.
const FILE_LABEL_KEYS = [
  [/_carpenter_sheet\.pdf$/, 'gen_file_pdf'],
  [/_full_set_1to1\.svg$/, 'gen_file_svg_full'],
  [/_one_each_1to1\.svg$/, 'gen_file_svg_one'],
  [/\.scad$/, 'gen_file_scad']
];

const labelKeyFor = (url = '') => {
  const match = FILE_LABEL_KEYS.find(([pattern]) => pattern.test(url));
  return match ? match[1] : null;
};

const DXF_NOTICE =
  'DXF export is not available yet — open the OpenSCAD file and export DXF/STL with the OpenSCAD CLI.';

export class EcojoinerRequestError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'EcojoinerRequestError';
    this.status = 422;
    this.errors = errors.length ? errors : [message];
  }
}

const isTruthy = (value) =>
  value === true || value === 'true' || value === 'on' || value === 1 || value === '1';

// Numbers arrive as strings from a form post and as numbers from JSON.
const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

/**
 * Translate the frontend form body into the snake_case inputs the Python
 * generator expects. Throws EcojoinerRequestError for malformed requests only —
 * every dimensional rule (ranges, geometry, material margins) belongs to
 * validate_inputs() in the Python script, which stays the single source of truth.
 */
export const mapFormFields = (body = {}) => {
  const errors = [];

  const required = {
    brand: body.brand,
    volume: body.volume,
    diameter: body.diameter,
    cap: body.cap,
    collar: body.collar,
    topTapper: body.topTapper,
    thickness: body.thickness
  };

  const brand = String(required.brand ?? '').trim();
  if (!brand) errors.push('Please tell us the bottle brand.');
  if (brand.length > 60) errors.push('Bottle brand must be 60 characters or fewer.');

  const numbers = {};
  for (const key of ['volume', 'diameter', 'cap', 'collar', 'topTapper', 'thickness']) {
    const parsed = toNumber(required[key]);
    if (parsed === null) {
      errors.push(`Missing value: ${key}.`);
    } else if (Number.isNaN(parsed)) {
      errors.push(`${key} must be a number.`);
    } else {
      numbers[key] = parsed;
    }
  }

  // Optional advanced overrides. The Python defaults apply when absent.
  const optional = {};
  for (const [field, target] of [
    ['screwDiameter', 'screw_diameter'],
    ['fitClearance', 'fit_clearance'],
    ['portAllowance', 'port_allowance'],
    ['portLength', 'port_length']
  ]) {
    const parsed = toNumber(body[field]);
    if (parsed === null) continue;
    if (Number.isNaN(parsed)) {
      errors.push(`${field} must be a number.`);
    } else {
      optional[target] = parsed;
    }
  }

  // Fabrication checkboxes → generator formats. DXF has no writer yet, so it
  // yields the SCAD it would be derived from rather than failing the request.
  const formats = new Set();
  if (isTruthy(body.fabCarpentry)) formats.add('pdf');
  if (isTruthy(body.fab3d)) formats.add('scad');
  if (isTruthy(body.fabSvg)) formats.add('svg');
  const dxfRequested = isTruthy(body.fabDxf);
  if (dxfRequested) formats.add('scad');
  if (!formats.size) errors.push('Choose at least one fabrication format.');

  if (errors.length) {
    throw new EcojoinerRequestError('Please check the form values.', errors);
  }

  return {
    inputs: {
      bottle_brand: brand,
      // The form collects millilitres; the generator works in litres.
      bottle_volume_l: numbers.volume / 1000,
      port_height: numbers.diameter, // bottle body diameter
      cap_diameter: numbers.cap,
      collar_diameter: numbers.collar,
      taper_height: numbers.topTapper, // port length = taper height + allowance
      slat_thickness: numbers.thickness,
      formats: SUPPORTED_FORMATS.filter((format) => formats.has(format)),
      ...optional
    },
    // Not generator inputs, but worth echoing back so the page can show the
    // full picture on the confirmation screen.
    context: {
      bottleHeight: toNumber(body.height),
      bottomTapper: toNumber(body.bottomTapper),
      material: body.material ? String(body.material) : null,
      ecojoinerType: body.ecojoinerType ? String(body.ecojoinerType) : null
    },
    notices: dxfRequested ? [DXF_NOTICE] : []
  };
};

// The Python slugifier strips brand text to [a-z0-9-], but assert containment
// here too: nothing derived from user input may escape the exports directory.
const assertInsideExports = (jobSlug) => {
  const root = path.resolve(ecojoiner.exportsDir);
  const resolved = path.resolve(root, jobSlug || '');
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing job slug outside the exports directory: ${jobSlug}`);
  }
  return resolved;
};

/**
 * Run the generator. With `dryRun` it validates and returns derived dimensions
 * without touching the disk; otherwise it writes one job folder under
 * public/ecojoiner_exports/ and returns the manifest.
 */
export const runGenerator = async (body, { dryRun = false } = {}) => {
  const { inputs, context, notices } = mapFormFields(body);

  const payload = {
    ...inputs,
    job_id: dryRun ? '' : crypto.randomBytes(4).toString('hex')
  };

  // User values travel in a temp JSON file, never as argv, so no form text can
  // ever be interpreted as a command-line option or a path.
  const tmpPath = path.join(
    os.tmpdir(),
    `ecojoiner-${crypto.randomBytes(8).toString('hex')}.json`
  );
  await fs.writeFile(tmpPath, JSON.stringify(payload), { encoding: 'utf-8', mode: 0o600 });

  const args = [
    ecojoiner.script,
    '--json',
    tmpPath,
    '--output-dir',
    ecojoiner.exportsDir,
    '--public-url-prefix',
    ecojoiner.urlPrefix,
    '--font-dir',
    ecojoiner.fontDir
  ];
  if (dryRun) args.push('--dry-run');

  let stdout;
  try {
    if (!dryRun) {
      await fs.mkdir(ecojoiner.exportsDir, { recursive: true });
    }
    ({ stdout } = await execFileAsync(ecojoiner.python, args, {
      cwd: ecojoiner.rootDir,
      timeout: ecojoiner.timeoutMs,
      maxBuffer: 8 * 1024 * 1024
    }));
  } catch (error) {
    // Exit code 2 means the script rejected the inputs and still printed a
    // manifest describing why. Anything else is a genuine failure.
    if (error.code === 2 && error.stdout) {
      stdout = error.stdout;
    } else {
      console.error('Ecojoiner generator failed:', error.stderr || error.message);
      throw new Error('The Ecojoiner generator could not be run.');
    }
  } finally {
    await fs.rm(tmpPath, { force: true });
  }

  let manifest;
  try {
    manifest = JSON.parse(stdout);
  } catch {
    console.error('Ecojoiner generator returned unparseable output:', stdout?.slice(0, 500));
    throw new Error('The Ecojoiner generator returned an unexpected response.');
  }

  if (!manifest.ok) {
    throw new EcojoinerRequestError(
      'These measurements will not make a working ecojoiner.',
      manifest.errors || []
    );
  }

  assertInsideExports(manifest.job_slug);

  return {
    ...manifest,
    files: (manifest.files || []).map((file) => ({
      ...file,
      label_key: labelKeyFor(file.url)
    })),
    parts: PART_QUANTITIES,
    context,
    notices
  };
};

export default { runGenerator, mapFormFields, PART_QUANTITIES, EcojoinerRequestError };
