(function () {
  'use strict';

  const SUPABASE_URL = "https://portal-bridge.ucmas-ambernath-pg.workers.dev";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYWt3Z3piYmp5d3pjY29haGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTAyMjQsImV4cCI6MjA3Nzc2NjIyNH0.VNjAhpbMzv9c19-IAg8UF2u28aIhh5OYCjAhcec9dRk";
  const page = document.currentScript?.dataset?.page || '';

  function resolvePracticeLevels(result, profile) {
    // The server derives batch settings from the authenticated student's profile.
    const {data,error}=result;
    if(error || !data) throw new Error('Unable to load batch practice settings');
    const official=Number(data.official_level);
    if(official!==Number(profile.current_level) || !Number.isInteger(official)) {
      throw new Error('Practice level mismatch; please refresh');
    }
    const practice={};
    for(const subject of ['plusminus','multiplication','division']){
      const level=Number(data[subject]);
      if(!Number.isInteger(level)||level<1||level>official) throw new Error('Invalid practice settings');
      practice[subject]=level;
    }
    return practice;
  }

  function levelFor(profile) {
    return Number(profile.practiceLevels?.plusminus ?? profile.current_level);
  }

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function revealPage() {
    document.documentElement.style.visibility = 'visible';
    document.getElementById('levelAccessHide')?.remove();
    document.getElementById('practice-startup')?.remove();
  }

  function hideSecondLevelCard() {
    document.querySelectorAll('a.practice-card').forEach(card => {
      const title = card.querySelector('h4')?.textContent?.trim().toLowerCase();
      if (title === 'for 2nd level') card.style.display = 'none';
    });
  }

  function applyPlusMinusMenu(profile) {
    onReady(() => {
      hideSecondLevelCard();
      const formulaCard = document.getElementById('taught-formula-card');
      if (formulaCard && profile.role === 'student' && [1,2].includes(Number(profile.current_level))) formulaCard.style.display = '';

      if (profile.role === 'student') {
        const level = levelFor(profile);

        if (level === 1) {
          document.querySelectorAll('a.practice-card').forEach(card => {
            const href = card.getAttribute('href') || '';
            if (href !== 'ContAddSub.html' && href !== 'taught-formula-practice.html') card.style.display = 'none';
          });
          revealPage();
          return;
        }

        const decimalCard = document.querySelector('a[href="decimal.html"]');
        const negativeCard = document.querySelector('a[href="negative.html"]');

        if (decimalCard && level < 6) decimalCard.style.display = 'none';
        if (negativeCard && level < 4) negativeCard.style.display = 'none';
      }

      revealPage();
    });
  }

  function showLocked(label, minimumLevel, currentLevel) {
    onReady(() => {
      document.body.innerHTML = `
        <div style="min-height:100vh;background:#f0f9ff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Arial,sans-serif;">
          <div style="max-width:520px;width:100%;background:white;border-radius:18px;padding:32px;text-align:center;box-shadow:0 15px 40px rgba(0,0,0,.12);">
            <div style="font-size:54px;margin-bottom:12px;">🔒</div>
            <h1 style="font-size:26px;color:#1f2937;margin:0 0 10px;">${label} Locked</h1>
            <p style="font-size:17px;color:#4b5563;line-height:1.5;margin:0 0 22px;">${label} is available from Level ${minimumLevel} onwards.${currentLevel ? ` Your current level is Level ${currentLevel}.` : ''}</p>
            <a href="plus_minus.html" style="display:inline-block;background:#4f46e5;color:white;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">Back to Plus & Minus</a>
          </div>
        </div>`;
      revealPage();
    });
  }

  async function run() {
    try {
      if (!window.supabase) throw new Error('Supabase library unavailable');
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: { session } } = await client.auth.getSession();

      if (!session) {
        location.replace('login.html');
        return;
      }

      const [profileResult, practiceResult] = await Promise.all([
        client.from('profiles')
          .select('current_level,role,is_active,full_name')
          .eq('id', session.user.id).single(),
        client.rpc('student_practice_settings_get')
      ]);
      const { data: profile, error } = profileResult;

      if (error || !profile) throw error || new Error('Profile not found');
      if (profile.is_active === false) {
        location.replace('login.html');
        return;
      }

      if (profile.role === 'student') profile.practiceLevels = resolvePracticeLevels(practiceResult, profile);
      const level = levelFor(profile);
      if (Number.isInteger(level)) sessionStorage.setItem('currentLevel', String(Number(profile.current_level)));

      if (page === 'plus-minus') {
        applyPlusMinusMenu(profile);
        return;
      }

      if (profile.role !== 'student') {
        revealPage();
        return;
      }

      if (page === 'decimal') {
        if (!Number.isInteger(level) || level < 6) {
          showLocked('Decimal Practice', 6, Number.isInteger(level) ? level : null);
          return;
        }
        revealPage();
        return;
      }

      if (page === 'negative') {
        if (!Number.isInteger(level) || level < 4) {
          showLocked('Negative Sums', 4, Number.isInteger(level) ? level : null);
          return;
        }
        revealPage();
        return;
      }

      revealPage();
    } catch (err) {
      console.error('Plus/minus access check failed:', err);
      if (page === 'plus-minus') {
        onReady(() => {
          document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f0f9ff;font-family:Arial,sans-serif"><div style="background:white;padding:28px;border-radius:16px;max-width:490px;text-align:center"><h2 style="font-size:22px;font-weight:bold;color:#1e293b">Practice settings unavailable</h2><p style="color:#475569;margin:14px 0">Refresh the page. If the issue continues, contact your teacher.</p><a href="practice_options.html" style="font-weight:bold;color:#4338ca">Back to practice</a></div></div>';
          revealPage();
        });
      } else if (page === 'decimal') {
        showLocked('Decimal Practice', 6, null);
      } else if (page === 'negative') {
        showLocked('Negative Sums', 4, null);
      }
    }
  }

  run();
})();
