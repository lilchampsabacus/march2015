(function () {
  'use strict';

  const SUPABASE_URL = "https://portal-bridge.ucmas-ambernath-pg.workers.dev";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYWt3Z3piYmp5d3pjY29haGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTAyMjQsImV4cCI6MjA3Nzc2NjIyNH0.VNjAhpbMzv9c19-IAg8UF2u28aIhh5OYCjAhcec9dRk";

  function whenReady() {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }

  function finish() {
    document.getElementById('reportAccessHide')?.remove();
  }

  async function run() {
    try {
      if (!window.supabase) throw new Error('Supabase library unavailable');

      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;

      const { data: profile, error } = await client
        .from('profiles')
        .select('current_level,role,is_active')
        .eq('id', session.user.id)
        .single();

      if (error || !profile || profile.is_active === false) return;

      await whenReady();

      if (profile.role === 'student' && Number(profile.current_level) === 1) {
        const reportCard = document.querySelector('a[href="Report.html"]');
        if (reportCard) reportCard.style.display = 'none';
      }
    } catch (err) {
      console.error('Report visibility check failed:', err);
    } finally {
      finish();
    }
  }

  run();
})();
