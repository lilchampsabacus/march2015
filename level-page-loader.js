(async function () {
  const script = document.currentScript;
  const base = script?.dataset?.base;
  const page = script?.dataset?.page || '';
  if (!base) return;

  try {
    const res = await fetch(base + '?v=6', { cache: 'no-store' });
    if (!res.ok) throw new Error('Base page could not be loaded.');

    let html = await res.text();

    let inject = '<style id="levelAccessHide">html{visibility:hidden}</style>\n' +
      '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n';

    if (page === 'formula-report' || page === 'formula-practice') {
      inject += `<script src="low-level-access.js?v=1" data-page="${page}"></script>`;
    } else {
      inject += `<script src="level-access.js?v=3" data-page="${page}"></script>`;
      if (page === 'practice-options') {
        inject += '\n<style id="formulaReportDefaultHide">a[href="formula_report.html"]{display:none!important}</style>' +
          '\n<style id="formulaPracticeDefaultHide">a[href="Level1and2.html"]{display:none!important}</style>' +
          '\n<script src="low-level-access.js?v=1" data-page="practice-options"></script>';
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