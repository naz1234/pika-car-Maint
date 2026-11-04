(() => {
  const key = 'pika-garage-theme';
  let current = 'light';
  try { if (localStorage.getItem(key) === 'dark') current = 'dark'; } catch {}

  function apply(theme) {
    current = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = current;
    document.documentElement.style.colorScheme = current;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', current === 'dark' ? '#101c1b' : '#f6f7f3');
    window.dispatchEvent(new CustomEvent('pika-theme-change'));
  }

  window.PikaTheme = {
    get: () => current,
    set(theme) {
      apply(theme);
      try { localStorage.setItem(key, current); } catch {}
    }
  };
  apply(current);
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) apply(event.newValue); });
})();
