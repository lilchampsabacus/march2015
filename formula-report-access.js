(function () {
  'use strict';

  const SUPABASE_URL = "https://portal-bridge.ucmas-ambernath-pg.workers.dev";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYWt3Z3piYmp5d3pjY29haGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTAyMjQsImV4cCI6MjA3Nzc2NjIyNH0.VNjAhpbMzv9c19-IAg8UF2u28aIhh5OYCjAhcec9dRk";
  const page = document.currentScript?.dataset?.page || '';

  function revealPage() {
    document.documentElement.style.visibility = 'visible';
    const hider = document.getElementById('levelAccessHide');
    if (hider) hider.remove();
  }

  function showLocked(level) {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.innerHTML = `
        <div style="min-height:100vh;background:#f0f9ff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Arial,sans-serif;">
          <div style="max-width:520px;width:100%;background:white;border-radius:18px;padding:32px;text-align:center;box-shadow:0 15px 40px rgba(0,0,0,.12);">
            <div style="font-size:54px;margin-bottom:12px;">🔒</div>
            <h1 style="font-size:26px;color:#1f2937;margin:0 0 10px;">Formula Report Locked</h1>
            <p style="font-size:17px;color:#4b5563;line-height:1.5;margin:0 0 22px;">Formula Practice Report is available only for Level 1 and Level 2 students.${level ? ` Your current level is Level ${level}.` : ''}</p>
            <a href="practice_options.html" style="display:inline-block;background:#4f46e5;color:white;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">Back to Practice Dashboard</a>
          </div>
        </div>`;
      revealPage();
    }, { once: true });
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
        .select('current_level,role,is_active')
        .eq('id', session.user.id)
        .single();

      if (error || !profile) throw error || new Error('Profile not found');
      if (profile.is_active === false) {
        location.replace('login.html');
        return;
      }

      const level = Number(profile.current_level);
      const allowed = profile.role === 'student' && (level === 1 || level === 2);

      if (page === 'practice-options') {
        const hideStyle = document.getElementById('formulaReportDefaultHide');
        if (allowed && hideStyle) hideStyle.remove();
        return;
      }

      if (page === 'formula-report') {
        if (!allowed) {
          showLocked(Number.isInteger(level) ? level : null);
          return;
        }
        revealPage();
      }
    } catch (err) {
      console.error('Formula report access check failed:', err);
      if (page === 'formula-report') showLocked(null);
    }
  }

  run();
})();