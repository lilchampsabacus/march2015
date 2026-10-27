'use strict';
// Run after editing a *-base.html template. --check validates committed output.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pages = {
  'multiplication': 'multiplication',
  'division': 'division',
  'plus_minus': 'plus-minus',
  'decimal': 'decimal',
  'negative': 'negative',
  'multiplication-master': 'multiplication-master',
  'division-master': 'division-master',
  '500': 'mastery-500',
  'special_division': 'special-division',
  'Level1and2': 'formula-practice',
  'formula_report': 'formula-report'
};
const mobileFix = `<style id="formulaPracticeMobileFix">
@media (max-width: 759px) {
  #game-screen {
    height: 100dvh !important;
    min-height: 100dvh !important;
    overflow: hidden !important;
  }
  #play-body {
    display: flex !important;
    flex-direction: column !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
    overflow: hidden !important;
  }
  #question-panel {
    flex: 1 1 auto !important;
    height: auto !important;
    min-height: 0 !important;
    padding: 4px !important;
    overflow: hidden !important;
  }
  #keypad-panel {
    flex: 0 0 auto !important;
    position: relative !important;
    z-index: 5 !important;
    padding: 8px 10px calc(8px + env(safe-area-inset-bottom)) !important;
  }
  #keypad-wrap { max-width: 430px !important; }
  #answer-display {
    height: 46px !important;
    margin-bottom: 7px !important;
    font-size: 1.7rem !important;
  }
  #keypad-wrap .grid { gap: 6px !important; }
  .key {
    min-height: 42px !important;
    font-size: 1.22rem !important;
    border-radius: 11px !important;
  }
  #keypad-wrap > button:last-child {
    margin-top: 6px !important;
    padding-top: 9px !important;
    padding-bottom: 9px !important;
    font-size: 1.05rem !important;
  }
  .sum-table { max-width: 180px !important; }
  .number-cell {
    font-size: 1.9rem !important;
    line-height: 1.02 !important;
    padding: 1px 0 !important;
  }
}
@media (max-width: 759px) and (max-height: 700px) {
  #answer-display { height: 40px !important; margin-bottom: 5px !important; }
  #keypad-wrap .grid { gap: 4px !important; }
  .key { min-height: 36px !important; font-size: 1.05rem !important; }
  #keypad-panel { padding-top: 5px !important; }
  #keypad-wrap > button:last-child {
    margin-top: 4px !important;
    padding-top: 7px !important;
    padding-bottom: 7px !important;
  }
  .sum-table { max-width: 155px !important; }
  .number-cell { font-size: 1.55rem !important; }
}
</style>`;
const startup = '<div id="practice-startup" role="status" aria-live="polite" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#f0f9ff;font:700 17px Arial,sans-serif;color:#4338ca;z-index:9999;text-align:center;padding:24px">Opening your practice…</div>';
function buildPage(name, page) {
  let html = fs.readFileSync(path.join(root, name + '-base.html'), 'utf8').replace(/\r\n/g, '\n');
  const access = ['formula-practice','formula-report'].includes(page) ? 'low-level-access' :
    ['plus-minus','decimal','negative'].includes(page) ? 'plus-minus-access' : 'level-access';
  let inject = '\n<!-- Generated from ' + name + '-base.html by scripts/build-practice-pages.cjs -->\n' +
    '<style id="levelAccessHide">body > :not(#practice-startup){visibility:hidden!important}</style>\n' +
    '<link rel="preconnect" href="https://portal-bridge.ucmas-ambernath-pg.workers.dev" crossorigin>\n' +
    '<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>\n';
  if (!html.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@2')) {
    inject += '<script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n';
  }
  inject += `<script defer src="${access}.js?v=20261027-speed2" data-page="${page}"></script>\n`;
  if (page === 'formula-practice') inject += mobileFix + '\n';
  html = html.replace(/<title\b/, inject + '<title');
  html = html.replace(/(<body\b[^>]*>)/i, '$1\n' + startup);
  return html.replace(/[ \t]+$/gm, '').replace(/^[ \t]+/gm, indent => indent.replace(/\t/g, '    ')).trimEnd() + '\n';
}
function build(check = false) {
  for (const [name, page] of Object.entries(pages)) {
    const html = buildPage(name, page);
    const output = path.join(root, name + '.html');
    if (check) {
      if (fs.readFileSync(output, 'utf8') !== html) throw new Error(name + '.html needs rebuilding');
    } else fs.writeFileSync(output, html);
  }
}
if (require.main === module) {
  build(process.argv.includes('--check'));
  console.log('PASS: 11 complete practice pages ' + (process.argv.includes('--check') ? 'verified' : 'built'));
}
module.exports = {buildPage, pages};
