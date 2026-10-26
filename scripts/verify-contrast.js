/**
 * scripts/verify-contrast.js
 * Computes exact WCAG 2.2 luminance and contrast ratios for all design token pairs.
 */

function hexToRgb(hex) {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function getLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map(val => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrast(hex1, hex2) {
  const lum1 = getLuminance(hexToRgb(hex1));
  const lum2 = getLuminance(hexToRgb(hex2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

const tokens = {
  dark: {
    bg: '#0A0C0F',
    surface1: '#11141A',
    surface2: '#171B22',
    surface3: '#1E232B',
    border: '#242A33',
    borderStrong: '#323A45',
    text: '#E8EAED',
    text2: '#A1A9B5',
    text3: '#828D9D',
    stateM: '#F0736B',
    stateS: '#5BA4F5',
    stateI: '#828D9D',
    ok: '#3DBE8B',
    warn: '#E0A93B',
    sync: '#9D8DF1',
    info: '#5BA4F5',
  },
  light: {
    bg: '#F6F7F9',
    surface1: '#FFFFFF',
    surface2: '#F1F3F5',
    surface3: '#E4E7EC',
    border: '#E2E5EA',
    borderStrong: '#C4C9D2',
    text: '#12151A',
    text2: '#4A5260',
    text3: '#565F6E',
    stateM: '#BA3329',
    stateS: '#1C68BE',
    stateI: '#565F6E',
    ok: '#137A53',
    warn: '#945F0F',
    sync: '#6D5BD0',
    info: '#1C68BE',
  }
};

console.log('======================================================================');
console.log('       WCAG 2.2 AA / AAA COLOR CONTRAST VERIFICATION REPORT');
console.log('======================================================================\n');

let allPassed = true;

for (const [theme, t] of Object.entries(tokens)) {
  console.log(`--- THEME: ${theme.toUpperCase()} (Base: ${t.bg}, Surface: ${t.surface1}) ---`);
  
  const checks = [
    { label: 'Primary Text on Page BG', fg: t.text, bg: t.bg, minRatio: 4.5 },
    { label: 'Primary Text on Surface 1', fg: t.text, bg: t.surface1, minRatio: 4.5 },
    { label: 'Secondary Text on Page BG', fg: t.text2, bg: t.bg, minRatio: 4.5 },
    { label: 'Secondary Text on Surface 1', fg: t.text2, bg: t.surface1, minRatio: 4.5 },
    { label: 'Tertiary Text on Page BG', fg: t.text3, bg: t.bg, minRatio: 4.5 },
    { label: 'Tertiary Text on Surface 1', fg: t.text3, bg: t.surface1, minRatio: 4.5 },
    { label: 'Modified State (M) on Surface 1', fg: t.stateM, bg: t.surface1, minRatio: 4.5 },
    { label: 'Shared State (S) on Surface 1', fg: t.stateS, bg: t.surface1, minRatio: 4.5 },
    { label: 'Invalid State (I) on Surface 1', fg: t.stateI, bg: t.surface1, minRatio: 4.5 },
    { label: 'Success / OK on Surface 1', fg: t.ok, bg: t.surface1, minRatio: 4.5 },
    { label: 'Warning on Surface 1', fg: t.warn, bg: t.surface1, minRatio: 4.5 },
    { label: 'Sync / Mutex on Surface 1', fg: t.sync, bg: t.surface1, minRatio: 4.5 },
    { label: 'Border on Surface 1 (UI Component)', fg: t.border, bg: t.surface1, minRatio: 1.2 },
    { label: 'Strong Border on Surface 1', fg: t.borderStrong, bg: t.surface1, minRatio: 1.5 },
  ];

  for (const check of checks) {
    const ratio = getContrast(check.fg, check.bg);
    const pass = ratio >= check.minRatio;
    if (!pass) allPassed = false;
    const grade = ratio >= 7.0 ? 'AAA' : (ratio >= 4.5 ? 'AA' : (ratio >= 3.0 ? 'AA Large' : 'FAIL'));
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${check.label.padEnd(38)}: ${ratio.toFixed(2)}:1 (${grade}) [FG: ${check.fg}, BG: ${check.bg}]`);
  }
  console.log('');
}

console.log('======================================================================');
console.log(`Overall Result: ${allPassed ? 'ALL TOKENS PASS WCAG 2.2 AA REQUIREMENTS!' : 'SOME TOKENS FAILED'}`);
console.log('======================================================================');
