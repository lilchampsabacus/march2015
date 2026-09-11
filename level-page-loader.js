(async function () {
  const script = document.currentScript;
  const base = script?.dataset?.base;
  const page = script?.dataset?.page || '';
  if (!base) return;

  try {
    const res = await fetch(base + '?v=11', { cache: 'no-store' });
    if (!res.ok) throw new Error('Base page could not be loaded.');

    let html = await res.text();

    let inject = '<style id="levelAccessHide">html{visibility:hidden}</style>\n' +
      '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n';

    if (page === 'formula-report' || page === 'formula-practice') {
      if (page === 'formula-practice') {
        inject += `
<style id="formulaPracticeMobileFix">
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
      }
      inject += `<script src="low-level-access.js?v=1" data-page="${page}"></script>`;
    } else if (page === 'plus-minus' || page === 'decimal' || page === 'negative') {
      inject += `<script src="plus-minus-access.js?v=2" data-page="${page}"></script>`;
    } else {
      inject += `<script src="level-access.js?v=5" data-page="${page}"></script>`;
      if (page === 'practice-options') {
        inject += '\n<style id="formulaMasterHide">a[href="FormulaMaster.html"]{display:none!important}</style>' +
          '\n<style id="formulaReportDefaultHide">a[href="formula_report.html"]{display:none!important}</style>' +
          '\n<style id="formulaPracticeDefaultHide">a[href="Level1and2.html"]{display:none!important}</style>' +
          '\n<style id="reportAccessHide">html{visibility:hidden!important}</style>' +
          '\n<script src="low-level-access.js?v=1" data-page="practice-options"></script>' +
          '\n<script src="report-access.js?v=1"></script>' +
          '\n<script src="daily-card.js?v=1"></script>';
      }
    }

    html = html.replace('</head>', inject + '</head>');
    document.open();
    document.write(html);
    document.close();
  } catch (err) {
    console.error(err);
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;background:#f0f9ff;color:#4338ca;font-weight:700;">Unable to load this page. Please refresh.</div>';
  }
})();
