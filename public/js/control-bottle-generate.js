/* /turtles/generate_control_bottle — form layout only for now. Fills the
   bottle fields from a saved profile; generation is not wired up yet (the
   next step is driving turtle_body's control-bottle SCAD modules). */
(() => {
  const form = document.getElementById('cb-generate');
  const picker = document.querySelector('[data-cb-profile-picker]');
  if (!form || !picker) {
    return;
  }

  let profiles = [];
  try {
    profiles = JSON.parse(document.getElementById('cb-profiles')?.textContent || '[]');
  } catch {
    profiles = [];
  }

  const el = (id) => document.getElementById(id);
  const oneDecimal = (value) =>
    value === null || value === undefined || value === '' ? '' : String(Number(value));

  // Profile column → form field. Wall thickness and cut height aren't saved
  // in bottle profiles yet, so they're left for the user to fill in.
  const FIELD_MAP = [
    ['cb-brand', 'brand'],
    ['cb-volume', 'volume_ml'],
    ['cb-diameter', 'diameter_mm'],
    ['cb-height', 'height_mm'],
    ['cb-cap', 'cap_mm'],
    ['cb-collar', 'collar_mm'],
    ['cb-cap-height', 'cap_height_mm'],
    ['cb-top-tapper', 'top_tapper_mm'],
  ];

  const photoPreview = document.querySelector('[data-cb-photo-preview]');
  const photoPreviewImg = document.querySelector('[data-cb-photo-preview-img]');
  const showPhoto = (url) => {
    if (!photoPreview || !photoPreviewImg) return;
    photoPreview.hidden = !url;
    if (url) photoPreviewImg.src = url;
    else photoPreviewImg.removeAttribute('src');
  };

  const openPanel = (name) => {
    const panel = document.querySelector(`.eco-panel[data-panel="${name}"]`);
    if (panel) panel.open = true;
  };

  picker.addEventListener('change', () => {
    picker.classList.remove('is-pulsing');
    const profile = profiles.find((p) => String(p.profile_id) === picker.value);
    FIELD_MAP.forEach(([id, key]) => {
      const input = el(id);
      if (!input) return;
      const value = profile ? profile[key] : '';
      input.value = key === 'brand' ? value || '' : oneDecimal(value);
    });
    showPhoto(profile?.bottle_photo_url);
    openPanel('bottle');
    openPanel('specs');
    document.querySelector('.eco-panel[data-panel="bottle"]')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  });

  const photoInput = el('cb-bottle-photo');
  if (photoInput) {
    photoInput.addEventListener('change', () => {
      const file = photoInput.files?.[0];
      if (file) showPhoto(URL.createObjectURL(file));
    });
  }

  const pending = document.querySelector('[data-cb-pending]');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (pending) pending.hidden = false;
  });
})();
