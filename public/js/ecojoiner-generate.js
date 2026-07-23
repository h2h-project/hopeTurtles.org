/* Ecojoiner spec generator — form UX + inline validation.
   Spec generation itself is not built yet; this only validates input and,
   when everything checks out, tells the user the generator is still cooking. */
(function () {
  const form = document.getElementById('eco-generate');
  if (!form) return;

  const el = (id) => document.getElementById(id);

  // Read a numeric field. Returns null when empty / not a number.
  const num = (id) => {
    const node = el(id);
    if (!node || node.value.trim() === '') return null;
    const value = Number(node.value);
    return Number.isFinite(value) ? value : null;
  };

  const ICONS = {
    ok: '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> ',
    warn: '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ',
    error: '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> '
  };

  // Paint the inline feedback line beneath a field.
  const setFeedback = (key, level, msg) => {
    const node = form.querySelector(`.eco-feedback[data-for="${key}"]`);
    if (!node) return;
    node.classList.remove('eco-feedback--ok', 'eco-feedback--warn', 'eco-feedback--error');
    if (!level || !msg) {
      node.innerHTML = '';
      return;
    }
    node.classList.add(`eco-feedback--${level}`);
    node.innerHTML = (ICONS[level] || '') + msg;
  };

  // Each validator sets its own feedback and returns whether the field is
  // acceptable for generation (soft warnings still return true).
  const validators = {
    'eco-brand': () => {
      const node = el('eco-brand');
      const filled = node && node.value.trim() !== '';
      setFeedback('eco-brand', '', '');
      return filled;
    },

    'eco-volume': () => {
      const v = num('eco-volume');
      if (v === null) return setFeedback('eco-volume', '', ''), false;
      if (v > 3000) {
        setFeedback('eco-volume', 'warn', 'This bottle size might be too big for our generator’s logic.');
        return false;
      }
      if (v < 500) {
        setFeedback('eco-volume', 'warn', 'This may be too small for the system.');
        return false;
      }
      setFeedback('eco-volume', 'ok', 'Great — a workable bottle volume.');
      return true;
    },

    'eco-diameter': () => {
      const v = num('eco-diameter');
      if (v === null) return setFeedback('eco-diameter', '', ''), false;
      if (v < 60 || v > 200) {
        setFeedback('eco-diameter', 'error', 'This doesn’t look right.');
        return false;
      }
      setFeedback('eco-diameter', 'ok', 'Looks good.');
      return true;
    },

    'eco-cap': () => {
      const v = num('eco-cap');
      if (v === null) return setFeedback('eco-cap', '', ''), false;
      if (v < 25 || v > 40) {
        setFeedback('eco-cap', 'error', 'This doesn’t look right.');
        return false;
      }
      setFeedback('eco-cap', 'ok', 'Looks good.');
      return true;
    },

    'eco-collar': () => {
      const v = num('eco-collar');
      if (v === null) return setFeedback('eco-collar', '', ''), false;
      if (v < 25 || v > 45) {
        setFeedback('eco-collar', 'error', 'This doesn’t look right.');
        return false;
      }
      setFeedback('eco-collar', 'ok', 'Looks good.');
      return true;
    },

    'eco-height': () => {
      const v = num('eco-height');
      if (v === null || v <= 0) return setFeedback('eco-height', '', ''), false;
      setFeedback('eco-height', 'ok', 'Looks good.');
      return true;
    },

    // Top tapper: soft warnings only. Ideal < 15% of bottle height, flag > 25%.
    'eco-top-tapper': () => {
      const v = num('eco-top-tapper');
      const height = num('eco-height');
      if (v === null) return setFeedback('eco-top-tapper', '', ''), false;
      if (height && height > 0) {
        const ratio = v / height;
        if (ratio > 0.25) {
          setFeedback('eco-top-tapper', 'warn', 'That’s a long top tapper — not an ideal bottle type. Aim for under 15%.');
          return true;
        }
        if (ratio > 0.15) {
          setFeedback('eco-top-tapper', 'warn', 'A touch tall — ideally the top tapper is under 15% of the height.');
          return true;
        }
      }
      setFeedback('eco-top-tapper', 'ok', 'Nice short tapper.');
      return true;
    },

    // Bottom tapper: soft warning when over 15% of bottle height.
    'eco-bottom-tapper': () => {
      const v = num('eco-bottom-tapper');
      const height = num('eco-height');
      if (v === null) return setFeedback('eco-bottom-tapper', '', ''), false;
      if (height && height > 0 && v / height > 0.15) {
        setFeedback('eco-bottom-tapper', 'warn', 'That’s a deep bottom tapper — not the ideal bottle type.');
        return true;
      }
      setFeedback('eco-bottom-tapper', 'ok', 'Nice flat base.');
      return true;
    },

    'eco-material': () => {
      const value = el('eco-material').value;
      if (!value) return setFeedback('eco-material', '', ''), false;
      if (value === 'solid-wood') {
        setFeedback('eco-material', 'ok', 'Nice. This will last months at sea.');
      } else if (value === 'plywood' || value === 'particle-board') {
        setFeedback('eco-material', 'warn', 'Good for prototyping. Duration at sea is weeks.');
      } else {
        setFeedback('eco-material', '', '');
      }
      return true;
    },

    // Descriptive guidance says 8–25mm; the stated error bounds were
    // contradictory, so we hard-flag outside a permissive 4–26mm window.
    'eco-thickness': () => {
      const v = num('eco-thickness');
      if (v === null) return setFeedback('eco-thickness', '', ''), false;
      if (v < 4 || v > 26) {
        setFeedback('eco-thickness', 'error', 'That thickness doesn’t look right — aim for 8–25mm.');
        return false;
      }
      setFeedback('eco-thickness', 'ok', 'Good thickness.');
      return true;
    },

    'eco-fabrication': () => {
      const chosen = el('eco-fab-carpentry').checked || el('eco-fab-3d').checked;
      if (!chosen) return setFeedback('eco-fabrication', '', ''), false;
      setFeedback('eco-fabrication', 'ok', 'Fabrication selected.');
      return true;
    },

    'eco-type': () => {
      const value = el('eco-type').value;
      if (!value) return setFeedback('eco-type', '', ''), false;
      setFeedback('eco-type', '', '');
      return true;
    }
  };

  // Run one validator by key.
  const check = (key) => (validators[key] ? validators[key]() : true);

  // Live feedback as the user edits.
  form.addEventListener('input', (event) => {
    const key = event.target.id;
    if (validators[key]) check(key);
    // Tapper ratios depend on height, so re-run them when height changes.
    if (key === 'eco-height') {
      if (el('eco-top-tapper').value !== '') check('eco-top-tapper');
      if (el('eco-bottom-tapper').value !== '') check('eco-bottom-tapper');
    }
  });
  form.addEventListener('change', (event) => {
    if (event.target.id === 'eco-material') check('eco-material');
    if (event.target.id === 'eco-type') check('eco-type');
    if (event.target.id === 'eco-fab-carpentry' || event.target.id === 'eco-fab-3d') {
      check('eco-fabrication');
    }
  });

  // Ensure a panel is open so the user can see a flagged field.
  const openPanelFor = (key) => {
    const feedbackNode = form.querySelector(`.eco-feedback[data-for="${key}"]`);
    const panel = feedbackNode ? feedbackNode.closest('.eco-panel') : null;
    if (panel && !panel.open) panel.open = true;
    return panel;
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const order = [
      'eco-brand', 'eco-volume',
      'eco-diameter', 'eco-cap', 'eco-collar', 'eco-height', 'eco-top-tapper', 'eco-bottom-tapper',
      'eco-material', 'eco-thickness',
      'eco-fabrication', 'eco-type'
    ];

    let firstInvalid = null;
    order.forEach((key) => {
      const valid = check(key);
      if (!valid && !firstInvalid) firstInvalid = key;
    });

    if (firstInvalid) {
      const panel = openPanelFor(firstInvalid);
      const focusTarget = el(firstInvalid) || (panel && panel.querySelector('input, select'));
      if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        focusTarget.focus({ preventScroll: true });
      }
      return;
    }

    // Everything checks out — but the generator itself isn't built yet.
    window.alert('The generation of ecojoiners is still in development. Hold tight!');
  });

  const saveBtn = el('eco-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      window.alert('Saving ecojoiners is still in development. Hold tight!');
    });
  }
})();
