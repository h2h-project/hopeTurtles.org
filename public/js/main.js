const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
const root = document.documentElement;
const themeToggle = document.getElementById('themeToggle');

const updateThemeToggleVisuals = (theme) => {
  if (!themeToggle) return;
  const isDark = theme === 'dark';
  const icon = themeToggle.querySelector('.theme-icon');
  themeToggle.setAttribute('aria-pressed', String(isDark));
  themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  if (icon) {
    icon.innerHTML = isDark
      ? '<i class="fa-regular fa-sun" aria-hidden="true"></i>'
      : '<i class="fa-regular fa-moon" aria-hidden="true"></i>';
  }
};

// Color mode follows the Buwana contract: localStorage key `color_mode`, the
// `theme` cookie the server renders from, and Buwana's users_tb.color_mode as
// the source of truth. The <head> script in partials/header.ejs has already
// resolved the mode before paint and recorded where it came from.
const saveTheme = (theme, { sync = true } = {}) => {
  try {
    localStorage.setItem('color_mode', theme);
  } catch (e) {}
  // Cookie for server rendering; sync pushes the choice to Buwana when logged in.
  return fetch('/theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme, sync })
  }).catch(() => {});
};

const applyTheme = (theme) => {
  root.dataset.theme = theme;
  updateThemeToggleVisuals(theme);
};

const initialTheme = root.dataset.theme || 'light';
applyTheme(initialTheme);

// A mode found only in localStorage (no cookie yet): give it to the server so
// the next page renders in it without relying on the head script. Not a fresh
// choice, so don't push it to Buwana.
if (root.dataset.themeSource === 'storage') {
  saveTheme(initialTheme, { sync: false });
}

// With no saved choice, keep following the OS setting.
prefersDark.addEventListener('change', (event) => {
  if (root.dataset.themeSource === 'system' || root.dataset.themeSource === 'default') {
    applyTheme(event.matches ? 'dark' : 'light');
  }
});

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    root.dataset.themeSource = 'server';
    saveTheme(next);
  });
}

const languageButton = document.getElementById('languageButton');
const languageMenu = document.getElementById('languageMenu');
const languageOptions = languageMenu?.querySelectorAll('.lang-option');
const mobileMenu = document.getElementById('mobileMenu');
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const mobileMenuClose = document.getElementById('mobileMenuClose');

const closeLanguageMenu = () => {
  if (!languageButton || !languageMenu) return;
  languageButton.setAttribute('aria-expanded', 'false');
  languageMenu.hidden = true;
};

if (languageButton && languageMenu && languageOptions) {
  languageButton.addEventListener('click', () => {
    const expanded = languageButton.getAttribute('aria-expanded') === 'true';
    languageButton.setAttribute('aria-expanded', String(!expanded));
    languageMenu.hidden = expanded;
    if (!expanded) {
      const selected = languageMenu.querySelector('.lang-option[aria-selected="true"]');
      (selected || languageOptions[0]).focus();
    }
  });

  languageOptions.forEach((option) => {
    option.addEventListener('click', () => {
      const lang = option.dataset.lang;
      if (!lang) return;
      localStorage.setItem('ht-lang', lang);
      languageOptions.forEach((opt) => {
        opt.setAttribute('aria-selected', String(opt === option));
      });
      const codeEl = languageButton.querySelector('.lang-button-code');
      if (codeEl) {
        codeEl.textContent = lang.toUpperCase();
      }
      closeLanguageMenu();
      fetch('/language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang })
      })
        .then(() => window.location.reload())
        .catch(() => window.location.reload());
    });
  });

  document.addEventListener('click', (event) => {
    if (!languageMenu.hidden) {
      const target = event.target;
      if (!languageMenu.contains(target) && !languageButton.contains(target)) {
        closeLanguageMenu();
      }
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeLanguageMenu();
      languageButton?.focus();
    }
  });
}

const setMobileMenuState = (isOpen) => {
  if (!mobileMenu || !mobileMenuToggle) return;
  mobileMenu.hidden = !isOpen;
  mobileMenuToggle.setAttribute('aria-expanded', String(isOpen));
  if (document.body) {
    document.body.classList.toggle('mobile-menu-open', isOpen);
  }
};

if (mobileMenu && mobileMenuToggle) {
  mobileMenuToggle.addEventListener('click', () => setMobileMenuState(true));
  mobileMenuClose?.addEventListener('click', () => setMobileMenuState(false));

  mobileMenu.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.dataset && target.dataset.closeMenu !== undefined) {
      setMobileMenuState(false);
    }
  });

  const mobileMenuLinks = mobileMenu.querySelectorAll('a');
  mobileMenuLinks.forEach((link) => {
    link.addEventListener('click', () => setMobileMenuState(false));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setMobileMenuState(false);
    }
  });
}

document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[href^="#"]');
  if (anchor) {
    const targetId = anchor.getAttribute('href').slice(1);
    const target = document.getElementById(targetId);
    if (target) {
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
});

// Compact header on scroll
const siteHeader = document.querySelector('.site-header');
if (siteHeader) {
  const onScroll = () => siteHeader.classList.toggle('is-scrolled', window.scrollY > 50);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Page fade-in effect
requestAnimationFrame(() => {
  root.classList.add('page-ready');
  if (document.body) {
    document.body.classList.add('page-ready');
  }
});
