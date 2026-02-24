#!/usr/bin/env node
/**
 * Reads public/rotulista.csv (columns: fi_name; en_name) and generates src/data/dogBreeds.ts.
 * Run: node scripts/generateDogBreeds.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const csvPath = join(root, 'public/rotulista.csv');
const outPath = join(root, 'src/data/dogBreeds.ts');

const csv = readFileSync(csvPath, 'utf-8');
const lines = csv.split(/\r?\n/).filter((line) => line.trim());
const sep = lines[0].includes(';') ? ';' : ',';
const rows = lines.map((line) => line.split(sep).map((cell) => cell.trim()));
const isHeader = (row) =>
  row[0]?.toLowerCase() === 'fi_name' || row[1]?.toLowerCase() === 'en_name';
const data = isHeader(rows[0]) ? rows.slice(1) : rows;

const breeds = data
  .filter((row) => row.length >= 2 && row[0] && row[1])
  .map((row) => ({ fi: row[0], en: row[1] }));

const ts = `/**
 * Generated from public/rotulista.csv. To update, edit the CSV and run:
 *   node scripts/generateDogBreeds.mjs
 */
export const DOG_BREEDS: { fi: string; en: string }[] = ${JSON.stringify(breeds, null, 2)};

/** Finnish names only (for datalist). */
export const DOG_BREEDS_FI = DOG_BREEDS.map((b) => b.fi);
`;

mkdirSync(join(root, 'src/data'), { recursive: true });
writeFileSync(outPath, ts, 'utf-8');
console.log(`Wrote ${outPath} with ${breeds.length} breeds.`);
