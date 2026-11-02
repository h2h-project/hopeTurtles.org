// Report a Found Turtle — three-step flow:
//   1. identify: finder types the 4-character code painted on the turtle's
//      fin; we confirm it against GET /api/success/turtle/:code.
//   2. form:     the report form (turtle_id prefilled, hidden), with a
//      "Use my current location" button for lat/lng.
//   3. bluetooth: after a successful submit, instructions to press the red
//      action button on the control bottle so the turtle can call home.

const readI18n = () => {
  try {
    return JSON.parse(document.getElementById('report-i18n')?.textContent || '{}');
  } catch {
    return {};
  }
};

const i18n = readI18n();

const steps = {
  identify: document.getElementById('reportStepIdentify'),
  form: document.getElementById('reportStepForm'),
  bluetooth: document.getElementById('reportStepBluetooth')
};

const lookupForm = document.getElementById('turtleLookupForm');
const lookupInput = document.getElementById('turtleNumber');
const lookupFeedback = document.getElementById('turtleLookupFeedback');

const successForm = document.getElementById('successForm');
const successFeedback = document.getElementById('successFeedback');
const turtleIdInput = document.getElementById('reportTurtleId');
const dateInput = document.getElementById('reportDateFound');
const latInput = document.getElementById('reportLat');
const lngInput = document.getElementById('reportLng');
const locationButton = document.getElementById('useLocationButton');
const locationFeedback = document.getElementById('locationFeedback');

const showStep = (name) => {
  Object.entries(steps).forEach(([key, el]) => {
    if (el) el.hidden = key !== name;
  });
  const target = steps[name];
  if (!target) return;
  const focusable =
    name === 'identify' ? lookupInput : name === 'form' ? dateInput : target;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  focusable?.focus({ preventScroll: true });
};

const todayIso = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

// ── Step 1: identify ────────────────────────────────────────────────────────

// Mirrors utils/finCode.js normalizeFinCode(): Crockford Base32, so O reads
// as 0 and I/L as 1; the server re-checks.
const FIN_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const normalizeFinCode = (input) => {
  const code = String(input || '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return code.length === 4 && [...code].every((ch) => FIN_CODE_ALPHABET.includes(ch)) ? code : null;
};

// Upper-case as they type, so what's on screen matches what's on the fin.
lookupInput?.addEventListener('input', () => {
  const { selectionStart, selectionEnd } = lookupInput;
  lookupInput.value = lookupInput.value.toUpperCase();
  lookupInput.setSelectionRange(selectionStart, selectionEnd);
});

const setConfirmedTurtle = (turtle) => {
  turtleIdInput.value = turtle.turtle_id;
  document.getElementById('confirmedTurtleNumber').textContent = turtle.fin_code || turtle.turtle_id;
  document.getElementById('confirmedTurtleName').textContent =
    turtle.name || `${i18n.turtleNumber || 'Turtle #'}${turtle.turtle_id}`;
  const mission = document.getElementById('confirmedTurtleMission');
  mission.textContent = turtle.mission_name ? `${i18n.missionPrefix || ''}${turtle.mission_name}` : '';
  mission.hidden = !turtle.mission_name;
};

lookupForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = normalizeFinCode(lookupInput.value);
  if (!code) {
    lookupFeedback.textContent = i18n.lookupEmpty || '';
    lookupInput.focus();
    return;
  }

  const submitButton = lookupForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  lookupFeedback.textContent = i18n.lookupChecking || '';
  try {
    const response = await fetch(`/api/success/turtle/${encodeURIComponent(code)}`, {
      headers: { Accept: 'application/json' }
    });
    const json = await response.json().catch(() => ({}));
    if (response.ok && json.success && json.data) {
      lookupFeedback.textContent = '';
      setConfirmedTurtle(json.data);
      if (!dateInput.value) dateInput.value = todayIso();
      showStep('form');
    } else if (response.status === 404) {
      lookupFeedback.textContent = i18n.lookupNotFound || '';
    } else {
      lookupFeedback.textContent = json.message || i18n.lookupError || '';
    }
  } catch {
    lookupFeedback.textContent = i18n.lookupError || '';
  } finally {
    submitButton.disabled = false;
  }
});

document.getElementById('changeTurtleButton')?.addEventListener('click', () => {
  turtleIdInput.value = '';
  showStep('identify');
  lookupInput.select();
});

// ── Step 2: location + submit ───────────────────────────────────────────────

locationButton?.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    locationFeedback.textContent = i18n.locationUnsupported || '';
    return;
  }
  locationButton.disabled = true;
  locationFeedback.textContent = i18n.locationLocating || '';
  navigator.geolocation.getCurrentPosition(
    (position) => {
      latInput.value = position.coords.latitude.toFixed(6);
      lngInput.value = position.coords.longitude.toFixed(6);
      locationFeedback.textContent = i18n.locationDone || '';
      locationButton.disabled = false;
    },
    (error) => {
      locationFeedback.textContent =
        error.code === error.PERMISSION_DENIED
          ? i18n.locationDenied || ''
          : i18n.locationFailed || '';
      locationButton.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
  );
});

successForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!turtleIdInput.value) {
    showStep('identify');
    return;
  }
  const submitButton = successForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  successFeedback.textContent = i18n.submitUploading || '';
  try {
    const response = await fetch('/api/success', {
      method: 'POST',
      body: new FormData(successForm)
    });
    const json = await response.json().catch(() => ({}));
    if (response.ok && json.success) {
      successFeedback.textContent = '';
      showStep('bluetooth');
    } else {
      successFeedback.textContent = json.message || i18n.submitFailed || '';
    }
  } catch {
    successFeedback.textContent = i18n.submitNetwork || '';
  } finally {
    submitButton.disabled = false;
  }
});

// ── Step 3: start over ──────────────────────────────────────────────────────

document.getElementById('reportAnotherButton')?.addEventListener('click', () => {
  successForm.reset();
  turtleIdInput.value = '';
  locationFeedback.textContent = '';
  lookupForm.reset();
  lookupFeedback.textContent = '';
  showStep('identify');
});
