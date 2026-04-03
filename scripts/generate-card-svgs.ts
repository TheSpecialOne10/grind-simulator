/**
 * Generates 53 SVG card images: 52 face cards + 1 card back.
 * Run with: npx tsx scripts/generate-card-svgs.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUTPUT_DIR = join(__dirname, '..', 'src', 'renderer', 'assets', 'cards');
mkdirSync(OUTPUT_DIR, { recursive: true });

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
const SUITS = ['c', 'd', 'h', 's'] as const;

const SUIT_SYMBOLS: Record<string, string> = {
  c: '\u2663', // ♣
  d: '\u2666', // ♦
  h: '\u2665', // ♥
  s: '\u2660', // ♠
};

const SUIT_COLORS: Record<string, string> = {
  c: '#1a1a1a',
  d: '#cc0000',
  h: '#cc0000',
  s: '#1a1a1a',
};

const RANK_DISPLAY: Record<string, string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  '8': '8', '9': '9', 'T': '10', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
};

// Pip positions for number cards (relative to 60x84 viewBox)
const PIP_LAYOUTS: Record<number, [number, number][]> = {
  2: [[30, 25], [30, 59]],
  3: [[30, 20], [30, 42], [30, 64]],
  4: [[18, 25], [42, 25], [18, 59], [42, 59]],
  5: [[18, 25], [42, 25], [30, 42], [18, 59], [42, 59]],
  6: [[18, 22], [42, 22], [18, 42], [42, 42], [18, 62], [42, 62]],
  7: [[18, 22], [42, 22], [30, 32], [18, 42], [42, 42], [18, 62], [42, 62]],
  8: [[18, 20], [42, 20], [30, 30], [18, 40], [42, 40], [30, 52], [18, 62], [42, 62]],
  9: [[18, 18], [42, 18], [18, 34], [42, 34], [30, 42], [18, 50], [42, 50], [18, 66], [42, 66]],
  10: [[18, 16], [42, 16], [30, 26], [18, 34], [42, 34], [18, 50], [42, 50], [30, 58], [18, 66], [42, 66]],
};

function generateFaceCard(rank: string, suit: string): string {
  const color = SUIT_COLORS[suit];
  const symbol = SUIT_SYMBOLS[suit];
  const display = RANK_DISPLAY[rank];
  const rankNum = RANKS.indexOf(rank as any) + 2;
  const isFace = ['J', 'Q', 'K', 'A'].includes(rank);

  let centerContent = '';

  if (isFace) {
    // Face cards and Ace: large rank letter in center
    centerContent = `
    <text x="30" y="50" text-anchor="middle" font-family="Georgia, serif"
          font-size="26" font-weight="bold" fill="${color}">${display}</text>
    <text x="30" y="62" text-anchor="middle" font-size="14" fill="${color}">${symbol}</text>`;
  } else {
    // Number cards: pip layout
    const pips = PIP_LAYOUTS[rankNum] || [];
    centerContent = pips.map(([x, y]) =>
      `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="10" fill="${color}">${symbol}</text>`
    ).join('\n    ');
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 84" width="60" height="84">
  <defs>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0.5" dy="0.5" stdDeviation="0.5" flood-opacity="0.15"/>
    </filter>
  </defs>
  <!-- Card body -->
  <rect x="0.5" y="0.5" width="59" height="83" rx="4" ry="4"
        fill="#ffffff" stroke="#cccccc" stroke-width="0.5" filter="url(#shadow)"/>
  <!-- Top-left rank and suit -->
  <text x="5" y="13" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="${color}">${display}</text>
  <text x="5" y="23" font-family="Arial, sans-serif" font-size="9" fill="${color}">${symbol}</text>
  <!-- Bottom-right rank and suit (rotated) -->
  <g transform="rotate(180, 30, 42)">
    <text x="5" y="13" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="${color}">${display}</text>
    <text x="5" y="23" font-family="Arial, sans-serif" font-size="9" fill="${color}">${symbol}</text>
  </g>
  <!-- Center content -->
  ${centerContent}
</svg>`;
}

function generateCardBack(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 84" width="60" height="84">
  <defs>
    <pattern id="diamonds" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
      <path d="M5 0 L10 5 L5 10 L0 5 Z" fill="#8b0000" stroke="#a00000" stroke-width="0.3"/>
    </pattern>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0.5" dy="0.5" stdDeviation="0.5" flood-opacity="0.15"/>
    </filter>
  </defs>
  <!-- Card body -->
  <rect x="0.5" y="0.5" width="59" height="83" rx="4" ry="4"
        fill="#b22222" stroke="#8b0000" stroke-width="0.5" filter="url(#shadow)"/>
  <!-- Inner border -->
  <rect x="3" y="3" width="54" height="78" rx="2" ry="2"
        fill="none" stroke="#ffd700" stroke-width="0.5" opacity="0.6"/>
  <!-- Diamond pattern -->
  <rect x="5" y="5" width="50" height="74" rx="2" ry="2"
        fill="url(#diamonds)" opacity="0.3"/>
  <!-- Center emblem -->
  <circle cx="30" cy="42" r="12" fill="#8b0000" stroke="#ffd700" stroke-width="0.8" opacity="0.8"/>
  <text x="30" y="47" text-anchor="middle" font-family="Georgia, serif"
        font-size="14" font-weight="bold" fill="#ffd700" opacity="0.9">GS</text>
</svg>`;
}

// Generate all 52 face cards
let count = 0;
for (const suit of SUITS) {
  for (const rank of RANKS) {
    const filename = `${rank}${suit}.svg`;
    const svg = generateFaceCard(rank, suit);
    writeFileSync(join(OUTPUT_DIR, filename), svg);
    count++;
  }
}

// Generate card back
writeFileSync(join(OUTPUT_DIR, 'back.svg'), generateCardBack());
count++;

console.log(`Generated ${count} card SVGs in ${OUTPUT_DIR}`);
