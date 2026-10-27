(function () {
  'use strict';
  const loading = new Map();
  const captures = new WeakMap();

  function load(name, url) {
    if (typeof window[name] === 'function') return Promise.resolve(window[name]);
    if (loading.has(name)) return loading.get(name);
    const ready = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      const timeout = setTimeout(() => fail(new Error(name + ' download timed out')), 20000);
      function fail(error) {
        clearTimeout(timeout);
        script.onload = script.onerror = null;
        script.remove();
        reject(error);
      }
      script.onload = () => {
        if (typeof window[name] !== 'function') return fail(new Error(name + ' unavailable'));
        clearTimeout(timeout);
        resolve(window[name]);
      };
      script.onerror = () => fail(new Error(name + ' download failed'));
      document.head.appendChild(script);
    }).catch(error => {
      loading.delete(name);
      throw error;
    });
    loading.set(name, ready);
    return ready;
  }

  function captureReport(target, options, complete) {
    if (typeof options === 'function') {
      complete = options;
      options = {};
    }
    if (!target) return Promise.resolve(null);
    if (captures.has(target)) return captures.get(target);
    target.setAttribute('aria-busy', 'true');
    const button = document.activeElement;
    const showProgress = button?.tagName === 'BUTTON' && /download/i.test(button.textContent);
    const label = showProgress ? button.innerHTML : null;
    if (showProgress) {
      button.disabled = true;
      button.textContent = 'Preparing report…';
    }
    const ready = load('html2canvas', 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
      .then(render => render(target, options || {}))
      .then(canvas => {
        if (complete) complete(canvas);
        return canvas;
      })
      .catch(error => {
        console.error('Report download:', error);
        window.alert('The report could not be downloaded. Please check your connection and try again.');
        return null;
      })
      .finally(() => {
        captures.delete(target);
        target.removeAttribute('aria-busy');
        if (showProgress) {
          button.disabled = false;
          button.innerHTML = label;
        }
      });
    captures.set(target, ready);
    return ready;
  }

  function withConfetti(celebrate) {
    return load('confetti', 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js')
      .then(celebrate)
      .catch(error => console.warn('Celebration unavailable:', error));
  }

  window.lilChampsOptional = { captureReport, withConfetti };
})();
