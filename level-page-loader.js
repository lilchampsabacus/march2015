(async function () {
  const script = document.currentScript;
  const base = script?.dataset?.base;
  const page = script?.dataset?.page || '';
  if (!base) return;

  try {
    const res = await fetch(base + '?v=2', { cache: 'no-store' });
    if (!res.ok) throw new Error('Base page could not be loaded.');

    let html = await res.text();
    const inject = `<style id="levelAccessHide">html{visibility:hidden}</style>\n<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"><\/script>\n<script src="level-access.js?v=2" data-page="${page}"><\/script>`;

    html = html.replace('</head>', inject + '</head>');
    document.open();
    document.write(html);
    document.close();
  } catch (err) {
    console.error(err);
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;background:#f0f9ff;color:#4338ca;font-weight:700;">Unable to load this page. Please refresh.</div>';
  }
})();