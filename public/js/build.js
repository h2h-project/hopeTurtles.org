// /turtles/build — open the step a link or the URL hash points at, so
// "#build-step-6" deep links land on an expanded panel rather than a closed one.
(() => {
  const openStep = (id, scroll) => {
    const panel = id ? document.getElementById(id) : null;
    if (!panel || panel.tagName !== 'DETAILS') {
      return;
    }
    panel.open = true;
    if (scroll) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  openStep(window.location.hash.slice(1), false);

  window.addEventListener('hashchange', () => {
    openStep(window.location.hash.slice(1), true);
  });

  document.querySelectorAll('[data-build-open]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      openStep(link.dataset.buildOpen, true);
    });
  });
})();
