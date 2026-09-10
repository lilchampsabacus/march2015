(function () {
  'use strict';

  const SUPABASE_URL = "https://portal-bridge.ucmas-ambernath-pg.workers.dev";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYWt3Z3piYmp5d3pjY29haGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTAyMjQsImV4cCI6MjA3Nzc2NjIyNH0.VNjAhpbMzv9c19-IAg8UF2u28aIhh5OYCjAhcec9dRk";
  const page = document.currentScript?.dataset?.page || '';

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function revealPage() {
    document.documentElement.style.visibility = 'visible';
    document.getElementById('levelAccessHide')?.remove();
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

      if (profile.role === 'student') {
        const level = Number(profile.current_level);
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

      const { data: profile, error } = await client
        .from('profiles')
        .select('current_level,role,is_active,full_name')
        .eq('id', session.user.id)
        .single();

      if (error || !profile) throw error || new Error('Profile not found');
      if (profile.is_active === false) {
        location.replace('login.html');
        return;
      }

      const level = Number(profile.current_level);
      if (Number.isInteger(level)) sessionStorage.setItem('currentLevel', String(level));

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
          hideSecondLevelCard();
          document.querySelector('a[href="decimal.html"]')?.style.setProperty('display', 'none');
          document.querySelector('a[href="negative.html"]')?.style.setProperty('display', 'none');
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
