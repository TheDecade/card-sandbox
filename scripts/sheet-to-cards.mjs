#!/usr/bin/env node
// Converts the game's Google Sheet (File → Download → CSV) into a Card Sandbox card-list file.
//
//   node scripts/sheet-to-cards.mjs <sheet.csv> <cards.json>
//
// Sheet layout: cards start at row 26, in sections that each begin with a header row
// ("type, cat., name, cost, text, qty"). Columns: B = type, D = name, E = cost, F = text.
// Resource icons in costs become colored symbols; icons in the card text are kept as they are.

import { readFileSync, writeFileSync } from 'node:fs';

const FIRST_ROW = 26; // 1-based spreadsheet row where the card list starts
const COL = { type: 1, name: 3, cost: 4, text: 5 }; // B, D, E, F (0-based)

// Resource icon → cost symbol ({Y} yellow, {U} blue, {R} red, {G} green, {P} purple).
const RESOURCE_SYMBOLS = {
  '🌽': 'Y', // corn: yellow
  '💎': 'U', // diamond: blue
  '🧱': 'R', // bricks: red
  '🔋': 'G', // battery: green
  '🎆': 'P', // fireworks: purple
};

/** Minimal RFC 4180 CSV parser (quoted fields, "" escapes, newlines inside quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** "🧱🧱⚡ X" → "{X}{R}{R}{⚡}". Unknown icons are kept as their own symbol so nothing is lost. */
function convertCost(raw, warn) {
  const symbols = [];
  let hasX = false;
  for (const ch of [...raw.normalize('NFC')]) {
    if (/\s/.test(ch) || ch === '️') continue; // spaces, line breaks, emoji variation selector
    if (RESOURCE_SYMBOLS[ch]) symbols.push(`{${RESOURCE_SYMBOLS[ch]}}`);
    else if (ch.toUpperCase() === 'X') hasX = true;
    else if (/\d/.test(ch)) symbols.push(`{${ch}}`);
    else {
      symbols.push(`{${ch}}`);
      warn(`kept unknown cost icon ${ch}`);
    }
  }
  return (hasX ? '{X}' : '') + symbols.join(''); // X first, as in Oracle text
}

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function convert(csvText) {
  const rows = parseCsv(csvText.replace(/^﻿/, ''));
  const cards = [];
  const notes = [];
  let sectionType = '';

  rows.slice(FIRST_ROW - 1).forEach((cells, i) => {
    const rowNo = FIRST_ROW + i;
    const get = (k) => (cells[COL[k]] ?? '').trim();
    const type = get('type');
    const name = get('name').replace(/\s+/g, ' ');

    if (type.toLowerCase() === 'type') {
      sectionType = ''; // header row: a new section starts
      return;
    }
    if (type) sectionType = type;
    if (!name) {
      if (type || get('cost') || get('text')) notes.push(`row ${rowNo}: skipped (no name)`);
      return;
    }
    const cardType = type || sectionType;
    if (!type) notes.push(`row ${rowNo} "${name}": no type, used "${cardType}" from its section`);

    cards.push({
      name,
      type: capitalize(cardType),
      cost: convertCost(get('cost'), (m) => notes.push(`row ${rowNo} "${name}": ${m}`)),
      description: get('text').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n'),
    });
  });

  return { cards, notes };
}

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/sheet-to-cards.mjs <sheet.csv> <cards.json>');
  process.exit(1);
}
const { cards, notes } = convert(readFileSync(input, 'utf8'));
writeFileSync(
  output,
  JSON.stringify({ format: 'card-sandbox-cards', version: 1, exportedAt: Date.now(), cards }, null, 2),
);
console.log(`${cards.length} cards written to ${output}`);
for (const n of notes) console.log(`  note: ${n}`);
