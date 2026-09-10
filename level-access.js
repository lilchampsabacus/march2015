(function () {
  'use strict';

  const SUPABASE_URL = "https://portal-bridge.ucmas-ambernath-pg.workers.dev";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYWt3Z3piYmp5d3pjY29haGl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTAyMjQsImV4cCI6MjA3Nzc2NjIyNH0.VNjAhpbMzv9c19-IAg8UF2u28aIhh5OYCjAhcec9dRk";
  const page = document.currentScript?.dataset?.page || '';

  const mulAllowed = {
    3: ['mul-1x1'],
    4: ['mul-2x1'],
    5: ['mul-3x1'],
    6: ['mul-2x2', 'mul-4x1'],
    7: ['mul-3x2', 'mul-5x1', 'mul-4x2'],
    8: ['mul-3x2', 'mul-5x1', 'mul-4x2']
  };

  const divAllowed = {
    5: ['div-3d1d'],
    6: ['div-4d1d', 'div-5d1d'],
    7: ['div-4d2d', 'div-5d2d'],
    8: ['div-5d3d']
  };

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function reveal() {
    document.documentElement.style.visibility = 'visible';
    const hider = document.getElementById('levelAccessHide');
    if (hider) hider.remove();
  }

  function setStudentSession(profile, session) {
    if (session?.user?.id) sessionStorage.setItem('userId', session.user.id);
    if (session?.user?.email) sessionStorage.setItem('userEmail', session.user.email);
    if (profile?.role) sessionStorage.setItem('userRole', profile.role);
    if (profile?.full_name) sessionStorage.setItem('studentIdentifier', profile.full_name);
    const level = Number(profile?.current_level);
    if (Number.isInteger(level)) sessionStorage.setItem('currentLevel', String(level));
  }

  function lockedPage(message) {
    onReady(() => {
      document.body.innerHTML = `
        <div style="min-height:100vh;background:#f0f9ff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Arial,sans-serif;">
          <div style="max-width:520px;width:100%;background:white;border-radius:18px;padding:32px;text-align:center;box-shadow:0 15px 40px rgba(0,0,0,.12);">
            <div style="font-size:54px;margin-bottom:12px;">🔒</div>
            <h1 style="font-size:26px;color:#1f2937;margin:0 0 10px;">Practice Locked</h1>
            <p style="font-size:17px;color:#4b5563;line-height:1.5;margin:0 0 22px;">${message}</p>
            <a href="practice_options.html" style="display:inline-block;background:#4f46e5;color:white;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">Back to Practice Dashboard</a>
          </div>
        </div>`;
      reveal();
    });
  }

  function lockDashboardCard(anchor, label) {
    if (!anchor || anchor.dataset.levelLocked === '1') return;
    anchor.dataset.levelLocked = '1';
    anchor.removeAttribute('href');
    anchor.setAttribute('aria-disabled', 'true');
    anchor.style.opacity = '0.58';
    anchor.style.filter = 'grayscale(0.45)';
    anchor.style.cursor = 'not-allowed';
    anchor.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
    });

    const badge = document.createElement('div');
    badge.textContent = '🔒 ' + label;
    badge.style.cssText = 'position:absolute;top:12px;left:12px;z-index:30;background:#374151;color:#fff;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800;';
    anchor.appendChild(badge);

    const spans = anchor.querySelectorAll('span');
    const action = spans.length ? spans[spans.length - 1] : null;
    if (action) {
      action.textContent = 'Locked';
      action.className = 'bg-gray-200 text-gray-600 px-4 py-2 rounded-full font-bold text-sm z-10';
    }
  }

  function applyPracticeDashboard(profile) {
    onReady(() => {
      const level = Number(profile.current_level);
      const nameEl = document.getElementById('welcome-name');
      if (nameEl && profile.full_name) nameEl.textContent = profile.full_name;

      let levelEl = document.getElementById('student-level');
      if (!levelEl && nameEl) {
        levelEl = document.createElement('div');
        levelEl.id = 'student-level';
        levelEl.className = 'mt-1 inline-flex items-center bg-white/15 border border-white/25 text-white text-sm font-extrabold px-3 py-1 rounded-full';
        nameEl.insertAdjacentElement('afterend', levelEl);
      }
      if (levelEl) levelEl.textContent = Number.isInteger(level) ? `Level ${level}` : 'Level: Not Set';

      const mul = document.querySelector('a[href="multiplication.html"]');
      const div = document.querySelector('a[href="division.html"]');

      if (Number.isInteger(level)) {
        if (level < 3) lockDashboardCard(mul, 'Level 3+');
        if (level < 5) lockDashboardCard(div, 'Level 5+');
      }
      reveal();
    });
  }

  function updateGreeting(profile, actionText) {
    const greeting = document.getElementById('student-greeting');
    if (greeting && profile.full_name) greeting.textContent = `Welcome, ${profile.full_name}! ${actionText}`;
  }

  function showMultiplicationMenu(profile) {
    const level = Number(profile.current_level);
    if (level < 3 || level > 8) {
      lockedPage('Multiplication practice is available from Level 3 onwards.');
      return;
    }

    onReady(() => {
      updateGreeting(profile, 'Ready to Multiply?');
      const levelContainer = document.getElementById('level-selection-container');
      const practiceContainer = document.getElementById('practice-options-container');
      const title = document.getElementById('current-level-title');

      if (levelContainer) levelContainer.classList.add('hidden');
      if (practiceContainer) {
        practiceContainer.classList.remove('hidden');
        practiceContainer.classList.add('fade-in');
      }
      if (title) title.textContent = `Level ${level} Multiplication Practice`;

      const backLevels = document.querySelector('button[onclick="showLevels()"]');
      if (backLevels) backLevels.style.display = 'none';

      document.querySelectorAll('.practice-card').forEach(card => {
        card.classList.add('hidden');
        card.classList.remove('flex');
      });

      const group = (level === 7 || level === 8) ? 'level78' : `level${level}`;
      document.querySelectorAll(`.group-${group}`).forEach(card => {
        card.classList.remove('hidden');
        card.classList.add('flex');
      });

      if (level >= 4) {
        document.querySelectorAll('.group-level500').forEach(card => {
          card.classList.remove('hidden');
          card.classList.add('flex');
        });
      }
      reveal();
    });
  }

  function showDivisionMenu(profile) {
    const level = Number(profile.current_level);
    if (level < 5 || level > 8) {
      lockedPage('Division practice is available from Level 5 onwards.');
      return;
    }

    onReady(() => {
      updateGreeting(profile, 'Ready to Divide?');
      const levelContainer = document.getElementById('level-selection-container');
      const practiceContainer = document.getElementById('practice-options-container');
      const title = document.getElementById('current-level-title');

      if (levelContainer) levelContainer.classList.add('hidden');
      if (practiceContainer) {
        practiceContainer.classList.remove('hidden');
        practiceContainer.classList.add('fade-in');
      }
      if (title) title.textContent = `Level ${level} Division Practice`;

      const backLevels = document.querySelector('button[onclick="showLevels()"]');
      if (backLevels) backLevels.style.display = 'none';

      document.querySelectorAll('.practice-card').forEach(card => {
        card.classList.add('hidden');
        card.classList.remove('flex');
      });

      document.querySelectorAll(`.group-level${level}`).forEach(card => {
        card.classList.remove('hidden');
        card.classList.add('flex');
      });

      const special = document.querySelector('a[href="special_division.html"]');
      const grid = practiceContainer?.querySelector('.grid');
      if (special && grid) {
        special.classList.remove('level-card', 'lg:col-span-4', 'sm:col-span-2');
        special.classList.add('practice-card');
        grid.appendChild(special);
        special.classList.remove('hidden');
        special.classList.add('flex');
      }
      reveal();
    });
  }

  function checkMultiplicationMaster(profile) {
    const level = Number(profile.current_level);
    const type = new URLSearchParams(location.search).get('type') || '';
    if (!(mulAllowed[level] || []).includes(type)) {
      lockedPage(`This multiplication type is not available for Level ${level}.`);
      return;
    }
    reveal();
  }

  function checkDivisionMaster(profile) {
    const level = Number(profile.current_level);
    const type = new URLSearchParams(location.search).get('type') || '';
    if (!(divAllowed[level] || []).includes(type)) {
      lockedPage(`This division type is not available for Level ${level}.`);
      return;
    }
    reveal();
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
        .select('full_name,current_level,role,is_active')
        .eq('id', session.user.id)
        .single();

      if (error || !profile) throw error || new Error('Profile not found');
      if (profile.is_active === false) {
        location.replace('login.html');
        return;
      }

      setStudentSession(profile, session);

      if (profile.role !== 'student') {
        reveal();
        return;
      }

      switch (page) {
        case 'practice-options': applyPracticeDashboard(profile); break;
        case 'multiplication': showMultiplicationMenu(profile); break;
        case 'division': showDivisionMenu(profile); break;
        case 'multiplication-master': checkMultiplicationMaster(profile); break;
        case 'division-master': checkDivisionMaster(profile); break;
        case 'mastery-500':
          if (Number(profile.current_level) < 4) lockedPage('500 practice is available from Level 4 onwards.');
          else reveal();
          break;
        case 'special-division':
          if (Number(profile.current_level) < 5) lockedPage('Special Mission division is available from Level 5 onwards.');
          else reveal();
          break;
        default: reveal();
      }
    } catch (err) {
      console.error('Level access check failed:', err);
      onReady(reveal);
    }
  }

  run();
})();