(function initManagedTurtles() {
// Localized strings the secret/delete buttons swap into themselves at runtime.
// The dialog partial injects the current language's `turtle_dialog_*` keys.
const TURTLE_DIALOG_STRINGS = (() => {
  const defaults = {
    turtle_dialog_view_secret: 'View secret',
    turtle_dialog_copy_secret: 'Copy secret',
    turtle_dialog_loading: 'Loading…',
    turtle_dialog_deleting: 'Deleting…'
  };
  const node = document.getElementById('turtle-dialog-i18n');
  if (!node) return defaults;
  try {
    return Object.assign(defaults, JSON.parse(node.textContent));
  } catch (error) {
    return defaults;
  }
})();
const manageTurtleDialog = document.getElementById('manageTurtleDialog');
const manageTurtleForm = manageTurtleDialog
  ? manageTurtleDialog.querySelector('[data-manage-turtle-form]')
  : null;
const manageTurtleCloseButtons = manageTurtleDialog
  ? manageTurtleDialog.querySelectorAll('[data-close-manage-turtle]')
  : [];
const secretButton = manageTurtleDialog
  ? manageTurtleDialog.querySelector('[data-secret-action]')
  : null;
const secretCard = manageTurtleDialog
  ? manageTurtleDialog.querySelector('[data-secret-card]')
  : null;
const secretValue = manageTurtleDialog
  ? manageTurtleDialog.querySelector('[data-managed-turtle-secret]')
  : null;
const secretFeedback = manageTurtleDialog
  ? manageTurtleDialog.querySelector('[data-managed-secret-feedback]')
  : null;
const deviceIdValue = manageTurtleDialog
  ? manageTurtleDialog.querySelector('[data-managed-turtle-device-id]')
  : null;
const deviceConfigBlock = manageTurtleDialog
  ? manageTurtleDialog.querySelector('[data-device-config-block]')
  : null;
const deviceConfigSnippet = manageTurtleDialog
  ? manageTurtleDialog.querySelector('[data-device-config-snippet]')
  : null;
const deviceConfigCopyButton = manageTurtleDialog
  ? manageTurtleDialog.querySelector('[data-copy-device-config]')
  : null;
const formFeedback = manageTurtleDialog
  ? manageTurtleDialog.querySelector('[data-managed-turtle-feedback]')
  : null;
const deleteTurtleButton = manageTurtleDialog
  ? manageTurtleDialog.querySelector('[data-delete-turtle]')
  : null;
const featurePhotoPreview = manageTurtleDialog
  ? manageTurtleDialog.querySelector('[data-feature-photo-preview]')
  : null;
const featurePhotoImage = manageTurtleDialog
  ? manageTurtleDialog.querySelector('[data-feature-photo-image]')
  : null;

const getManageableRow = (element) => {
  if (!element) {
    return null;
  }
  if (element.matches && element.matches('[data-manageable-turtle]')) {
    return element;
  }
  return element.closest ? element.closest('[data-manageable-turtle]') : null;
};

const launchTurtleDialog = document.getElementById('launchTurtleDialog');
const launchTurtleForm = launchTurtleDialog
  ? launchTurtleDialog.querySelector('[data-launch-turtle-form]')
  : null;
const launchTurtleCloseButtons = launchTurtleDialog
  ? launchTurtleDialog.querySelectorAll('[data-close-launch-turtle]')
  : [];
const launchFeedback = launchTurtleDialog
  ? launchTurtleDialog.querySelector('[data-launch-turtle-feedback]')
  : null;
const launchSubmitButton = launchTurtleDialog
  ? launchTurtleDialog.querySelector('button[type="submit"]')
  : null;
const launchSuccessState = launchTurtleDialog
  ? launchTurtleDialog.querySelector('[data-launch-success]')
  : null;
const launchSuccessAscii = launchSuccessState
  ? launchSuccessState.querySelector('[data-launch-success-ascii]')
  : null;
const launchSuccessCloseButton = launchSuccessState
  ? launchSuccessState.querySelector('[data-launch-success-close]')
  : null;
const launchDeviceConfig = launchSuccessState
  ? launchSuccessState.querySelector('[data-launch-device-config]')
  : null;
const launchApiBaseValue = launchSuccessState
  ? launchSuccessState.querySelector('[data-launch-api-base]')
  : null;
const launchDeviceIdValue = launchSuccessState
  ? launchSuccessState.querySelector('[data-launch-device-id]')
  : null;
const launchDeviceKeyValue = launchSuccessState
  ? launchSuccessState.querySelector('[data-launch-device-key]')
  : null;
const launchCopyApiBaseButton = launchSuccessState
  ? launchSuccessState.querySelector('[data-copy-launch-api-base]')
  : null;
const launchCopyDeviceIdButton = launchSuccessState
  ? launchSuccessState.querySelector('[data-copy-launch-device-id]')
  : null;
const launchCopyDeviceKeyButton = launchSuccessState
  ? launchSuccessState.querySelector('[data-copy-launch-device-key]')
  : null;
const launchConfigFeedback = launchSuccessState
  ? launchSuccessState.querySelector('[data-launch-config-feedback]')
  : null;
const launchTurtleTriggers = document.querySelectorAll('[data-launch-turtle]');

const turtleAsciiSources = [
  '/turtles-ascii-logo-3.txt',
  '/turtles-ascii-logo-2.txt',
  '/turtles-ascii-logo.txt'
];
let turtleAsciiCache = null;
let celebrationTimers = [];
let stopCelebrationRequested = false;
let hoverCelebrationRunning = false;
const LAUNCH_CELEBRATION_FRAMES = 4;

const clearCelebrationTimers = () => {
  if (!celebrationTimers.length) return;
  celebrationTimers.forEach((timerId) => window.clearTimeout(timerId));
  celebrationTimers = [];
};

const wait = (duration) =>
  new Promise((resolve) => {
    const timerId = window.setTimeout(resolve, duration);
    celebrationTimers.push(timerId);
  });

const loadAsciiFrames = async () => {
  if (turtleAsciiCache) {
    return turtleAsciiCache;
  }
  const frames = await Promise.all(
    turtleAsciiSources.map((source) =>
      fetch(source)
        .then((response) => (response.ok ? response.text() : ''))
        .then((text) => text.replace(/\s+$/u, ''))
        .catch(() => '')
    )
  );
  const [frameThree, frameTwo, finalFrame] = frames;
  turtleAsciiCache = {
    frames: [frameThree, frameTwo].filter(Boolean),
    final: finalFrame || frameThree || 'HopeTurtles'
  };
  return turtleAsciiCache;
};

const renderAsciiFrame = (text) => {
  if (!launchSuccessAscii || !text) return;
  launchSuccessAscii.textContent = text;
};

const turtleCelebration = async (frameCount = LAUNCH_CELEBRATION_FRAMES, { loop = false } = {}) => {
  const asciiAssets = await loadAsciiFrames();
  const animationFrames = asciiAssets.frames.length ? asciiAssets.frames : [asciiAssets.final];
  stopCelebrationRequested = false;
  clearCelebrationTimers();

  const playOnce = async () => {
    for (let index = 0; index < frameCount; index += 1) {
      if (stopCelebrationRequested) return;
      renderAsciiFrame(animationFrames[index % animationFrames.length]);
      await wait(400);
    }
  };

  do {
    await playOnce();
  } while (loop && !stopCelebrationRequested);

  renderAsciiFrame(asciiAssets.final);
};

const stopTurtleCelebration = async () => {
  stopCelebrationRequested = true;
  clearCelebrationTimers();
  const asciiAssets = await loadAsciiFrames();
  renderAsciiFrame(asciiAssets.final);
};

const startHoverCelebration = () => {
  if (hoverCelebrationRunning || !launchSuccessAscii) return;
  hoverCelebrationRunning = true;
  turtleCelebration(LAUNCH_CELEBRATION_FRAMES, { loop: true }).finally(() => {
    hoverCelebrationRunning = false;
  });
};

const endHoverCelebration = () => {
  hoverCelebrationRunning = false;
  stopTurtleCelebration();
};

if (launchSuccessAscii) {
  loadAsciiFrames()
    .then((assets) => renderAsciiFrame(assets.final))
    .catch(() => {});
}

const supportsNativeDialog = (dialog) => Boolean(dialog && typeof dialog.showModal === 'function');

const delegateClick = (selector, handler) => {
  if (!selector || typeof handler !== 'function') {
    return;
  }
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest(selector);
    if (!trigger) {
      return;
    }
    handler(event, trigger);
  });
};

const showDialog = (dialog) => {
  if (!dialog) return;
  if (supportsNativeDialog(dialog)) {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
    dialog.removeAttribute('hidden');
    dialog.setAttribute('data-open', 'true');
  }
};

const hideDialog = (dialog) => {
  if (!dialog) return;
  if (supportsNativeDialog(dialog)) {
    dialog.close();
  } else {
    dialog.removeAttribute('data-open');
    dialog.removeAttribute('open');
    dialog.setAttribute('hidden', '');
  }
};

const parseJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Unexpected response from server.');
  }
};

const turtleBottlesDialog = document.getElementById('turtleBottlesDialog');
const turtleBottlesList = turtleBottlesDialog
  ? turtleBottlesDialog.querySelector('[data-turtle-bottles-list]')
  : null;
const turtleBottlesEmptyState = turtleBottlesDialog
  ? turtleBottlesDialog.querySelector('[data-turtle-bottles-empty]')
  : null;
const turtleBottlesFeedback = turtleBottlesDialog
  ? turtleBottlesDialog.querySelector('[data-turtle-bottles-feedback]')
  : null;
const turtleBottlesSummary = turtleBottlesDialog
  ? turtleBottlesDialog.querySelector('[data-turtle-bottles-summary]')
  : null;
const turtleBottlesCloseButton = turtleBottlesDialog
  ? turtleBottlesDialog.querySelector('[data-close-turtle-bottles]')
  : null;
const turtleBottlesIntro = turtleBottlesDialog
  ? turtleBottlesDialog.querySelector('[data-turtle-bottles-intro]')
  : null;

const detachBottleDialog = document.getElementById('detachBottleConfirmDialog');
const detachBottleMessage = detachBottleDialog
  ? detachBottleDialog.querySelector('[data-detach-message]')
  : null;
const detachBottleFeedback = detachBottleDialog
  ? detachBottleDialog.querySelector('[data-detach-feedback]')
  : null;
const detachBottleCloseButton = detachBottleDialog
  ? detachBottleDialog.querySelector('[data-close-detach-bottle]')
  : null;
const detachBottleCancelButton = detachBottleDialog
  ? detachBottleDialog.querySelector('[data-cancel-detach-bottle]')
  : null;
const detachBottleConfirmButton = detachBottleDialog
  ? detachBottleDialog.querySelector('[data-confirm-detach-bottle]')
  : null;

const escapeHtml = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).replace(/[&<>'"]/gu, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
};

const formatBottleStatusLabel = (value) => {
  if (!value) {
    return '—';
  }
  return value
    .split(/\s+/gu)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatBottleWeight = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return '—';
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return '—';
  }
  return `${numeric.toLocaleString()} g`;
};

const formatBottleContents = (value) => {
  if (!value) {
    return '—';
  }
  return escapeHtml(value).replace(/\r?\n/gu, '<br />');
};

const setTurtleBottlesIntro = (turtle) => {
  if (!turtleBottlesIntro) {
    return;
  }
  const turtleName = (turtle?.name || '').trim();
  const turtleId = turtle?.turtle_id || turtleBottlesCurrentId;
  const displayName = turtleName || (turtleId ? `Turtle #${turtleId}` : 'this turtle');
  const introText = turtleId
    ? `The aid bottles have been assigned to ${displayName} (hope turtle #${turtleId}).`
    : '';
  turtleBottlesIntro.textContent = introText;
  turtleBottlesIntro.hidden = !introText;
};

const setTurtleBottlesSummary = (turtle, fallbackHubName) => {
  if (!turtleBottlesSummary) {
    return;
  }
  const turtleName = (turtle?.name || '').trim();
  const turtleLabel = turtleName || (turtle?.turtle_id ? `Turtle #${turtle.turtle_id}` : 'This turtle');
  const hubLabel = (turtle?.hub_name || fallbackHubName || '').trim();
  turtleBottlesSummary.textContent = hubLabel ? `${turtleLabel} · ${hubLabel}` : turtleLabel;
};

const updateTurtleBottleCount = (count) => {
  if (!turtleBottlesRow) {
    return;
  }
  const pillCount = turtleBottlesRow.querySelector('.turtle-bottles-pill span:last-child');
  if (pillCount) {
    pillCount.textContent = Number(count || 0).toLocaleString();
  }
};

const createTurtleBottleCard = (bottle) => {
  const card = document.createElement('li');
  card.className = 'turtle-bottle-card';
  const serialLabel = bottle.serial_number ? `#${escapeHtml(bottle.serial_number)}` : 'Unnumbered bottle';
  const photoUrl = bottle.basic_photo_url ? escapeHtml(bottle.basic_photo_url) : '';
  const weightLabel = formatBottleWeight(bottle.weight_grams);
  const statusLabel = formatBottleStatusLabel(bottle.status);
  const contentsMarkup = formatBottleContents(bottle.contents);
  const photoMarkup = photoUrl
    ? `<img src="${photoUrl}" alt="Bottle photo ${serialLabel}" loading="lazy" />`
    : '<span class="turtle-bottle-card__placeholder">No photo</span>';

  card.innerHTML = `
    <div class="turtle-bottle-card__photo ${photoUrl ? '' : 'turtle-bottle-card__photo--placeholder'}">
      ${photoMarkup}
    </div>
    <div class="turtle-bottle-card__body">
      <div class="turtle-bottle-card__header">
        <h3>${serialLabel}</h3>
        <div class="turtle-bottle-card__actions">
          <button
            type="button"
            class="button ghost button-small danger"
            data-remove-bottle-from-turtle
            data-bottle-id="${escapeHtml(bottle.bottle_id)}"
            data-turtle-id="${escapeHtml(bottle.turtle_id)}"
          >
            ❌ Remove Bottle
          </button>
        </div>
      </div>
      <p class="turtle-bottle-card__contents">${contentsMarkup}</p>
      <dl>
        <div>
          <dt>Weight</dt>
          <dd>${escapeHtml(weightLabel)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>${escapeHtml(statusLabel)}</dd>
        </div>
      </dl>
    </div>
  `;

  return card;
};

const setTurtleBottlesFeedback = (message, isError = false) => {
  if (!turtleBottlesFeedback) {
    return;
  }
  turtleBottlesFeedback.textContent = message || '';
  turtleBottlesFeedback.hidden = !message;
  turtleBottlesFeedback.classList.toggle('is-error', Boolean(isError));
  turtleBottlesFeedback.classList.toggle('is-success', Boolean(message && !isError));
};

const renderTurtleBottles = (bottles) => {
  if (!turtleBottlesList || !turtleBottlesEmptyState) {
    return;
  }
  turtleBottlesList.innerHTML = '';
  if (!bottles || bottles.length === 0) {
    turtleBottlesEmptyState.hidden = false;
    return;
  }
  turtleBottlesEmptyState.hidden = true;
  bottles.forEach((bottle) => {
    turtleBottlesList.appendChild(createTurtleBottleCard(bottle));
  });
};

let turtleBottlesCurrentId = null;
let turtleBottlesRow = null;
let detachContext = { bottleId: null, turtleId: null };

const closeTurtleBottlesDialog = () => {
  turtleBottlesCurrentId = null;
  turtleBottlesRow = null;
  setTurtleBottlesFeedback('');
  if (turtleBottlesList) {
    turtleBottlesList.innerHTML = '';
  }
  if (turtleBottlesEmptyState) {
    turtleBottlesEmptyState.hidden = true;
  }
  if (turtleBottlesIntro) {
    turtleBottlesIntro.textContent = '';
    turtleBottlesIntro.hidden = true;
  }
  hideDialog(turtleBottlesDialog);
};

const openTurtleBottlesDialog = async (sourceElement) => {
  const row = getManageableRow(sourceElement);
  if (!row || !turtleBottlesDialog) {
    return;
  }
  const turtleIdRaw = row.dataset.turtleId;
  const turtleId = turtleIdRaw ? Number(turtleIdRaw) : null;
  if (!Number.isFinite(turtleId)) {
    return;
  }
  turtleBottlesCurrentId = turtleId;
  turtleBottlesRow = row;
  const turtleName = row.dataset.turtleName?.trim() || `Turtle #${row.dataset.turtleId}`;
  const hubName = row.dataset.turtleHubName?.trim();
  const endpointTemplate = row.dataset.bottlesEndpoint || `/api/my-bottles/turtles/{id}`;
  const endpoint = endpointTemplate.includes('{id}')
    ? endpointTemplate.replace('{id}', encodeURIComponent(turtleId))
    : endpointTemplate;
  setTurtleBottlesSummary({ name: turtleName, turtle_id: turtleId, hub_name: hubName }, hubName);
  setTurtleBottlesIntro({ name: turtleName, turtle_id: turtleId });
  if (turtleBottlesList) {
    turtleBottlesList.innerHTML = '';
  }
  if (turtleBottlesEmptyState) {
    turtleBottlesEmptyState.hidden = true;
  }
  setTurtleBottlesFeedback('Loading connected bottles…', false);
  showDialog(turtleBottlesDialog);

  try {
    const response = await fetch(endpoint);
    const json = await parseJsonResponse(response);
    if (!response.ok || !json.success) {
      throw new Error(json?.message || 'Unable to load bottles.');
    }
    if (turtleBottlesCurrentId !== turtleId) {
      return;
    }
    const turtleData = json.data?.turtle || { name: turtleName, turtle_id: turtleId, hub_name: hubName };
    const bottles = json.data?.bottles || [];
    setTurtleBottlesSummary(turtleData, hubName);
    setTurtleBottlesIntro(turtleData);
    renderTurtleBottles(bottles);
    updateTurtleBottleCount(bottles.length);
    setTurtleBottlesFeedback('');
  } catch (error) {
    if (turtleBottlesCurrentId !== turtleId) {
      return;
    }
    if (turtleBottlesList) {
      turtleBottlesList.innerHTML = '';
    }
    setTurtleBottlesFeedback(error.message || 'Unable to load bottles.', true);
  }
};

const closeDetachBottleDialog = () => {
  detachContext = { bottleId: null, turtleId: null };
  if (detachBottleFeedback) {
    detachBottleFeedback.textContent = '';
    detachBottleFeedback.hidden = true;
  }
  if (detachBottleConfirmButton) {
    detachBottleConfirmButton.disabled = false;
    detachBottleConfirmButton.textContent = '❌ Remove Bottle';
  }
  hideDialog(detachBottleDialog);
};

const openDetachBottleDialog = (bottleId, turtleId) => {
  detachContext = { bottleId, turtleId };
  if (detachBottleConfirmButton) {
    detachBottleConfirmButton.disabled = false;
    detachBottleConfirmButton.textContent = '❌ Remove Bottle';
  }
  if (detachBottleFeedback) {
    detachBottleFeedback.textContent = '';
    detachBottleFeedback.hidden = true;
  }
  showDialog(detachBottleDialog);
};

const confirmDetachBottle = async () => {
  if (!detachContext?.bottleId || !turtleBottlesCurrentId) {
    return;
  }

  if (detachBottleConfirmButton) {
    detachBottleConfirmButton.disabled = true;
    detachBottleConfirmButton.textContent = 'Removing…';
  }

  if (detachBottleFeedback) {
    detachBottleFeedback.hidden = true;
    detachBottleFeedback.textContent = '';
  }

  try {
    const response = await fetch(`/api/my-bottles/${encodeURIComponent(detachContext.bottleId)}/turtle`, {
      method: 'DELETE'
    });
    const json = await parseJsonResponse(response);
    if (!response.ok || !json.success) {
      throw new Error(json?.message || 'Unable to remove bottle.');
    }
    const bottles = json.data?.bottles || [];
    renderTurtleBottles(bottles);
    updateTurtleBottleCount(bottles.length);
    setTurtleBottlesFeedback('Bottle removed from this turtle.', false);
    closeDetachBottleDialog();
  } catch (error) {
    if (detachBottleFeedback) {
      detachBottleFeedback.textContent = error.message || 'Unable to remove bottle.';
      detachBottleFeedback.hidden = false;
    }
  } finally {
    if (detachBottleConfirmButton) {
      detachBottleConfirmButton.disabled = false;
      detachBottleConfirmButton.textContent = '❌ Remove Bottle';
    }
  }
};

let currentTurtleId = null;
let launchWasSuccessful = false;

const resetSecretState = () => {
  if (!secretButton) return;
  secretButton.disabled = false;
  secretButton.textContent = TURTLE_DIALOG_STRINGS.turtle_dialog_view_secret;
  secretButton.dataset.action = 'view';
  if (secretCard) {
    secretCard.hidden = true;
  }
  if (secretValue) {
    secretValue.textContent = '';
  }
  if (secretFeedback) {
    secretFeedback.textContent = '';
  }
  if (deviceConfigBlock) {
    deviceConfigBlock.hidden = true;
  }
  if (deviceConfigSnippet) {
    deviceConfigSnippet.textContent = '';
  }
};

const buildDeviceConfigSnippet = (turtleId, secret) =>
  JSON.stringify(
    {
      api_base: 'http://hopeturtles.org',
      device_id: String(turtleId),
      device_key: secret
    },
    null,
    2
  );

const updateFeaturePhotoPreview = (url) => {
  if (!featurePhotoPreview || !featurePhotoImage) {
    return;
  }
  if (url) {
    featurePhotoImage.src = url;
    featurePhotoPreview.hidden = false;
  } else {
    featurePhotoImage.removeAttribute('src');
    featurePhotoPreview.hidden = true;
  }
};

const toggleLaunchSuccessState = (isVisible) => {
  if (launchTurtleForm) {
    launchTurtleForm.hidden = Boolean(isVisible);
  }
  if (launchSuccessState) {
    launchSuccessState.hidden = !isVisible;
  }
  if (isVisible) {
    turtleCelebration(LAUNCH_CELEBRATION_FRAMES).catch(() => {});
  } else {
    stopTurtleCelebration();
  }
};

const isUsableFile = (file) => {
  if (typeof File === 'undefined') {
    return false;
  }
  return file instanceof File && file.size > 0;
};

const readFileAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });

const getThumbnailMimeType = (file) => {
  if (file?.type && file.type.includes('png')) {
    return 'image/png';
  }
  if (file?.type && file.type.includes('webp')) {
    return 'image/webp';
  }
  return 'image/jpeg';
};

const getFileExtension = (file) => {
  if (!file) {
    return '';
  }
  if (file.name && file.name.includes('.')) {
    return file.name.slice(file.name.lastIndexOf('.'));
  }
  const mime = file.type || '';
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  return '.jpg';
};

const getFileBaseName = (file) => {
  if (!file || typeof file.name !== 'string' || !file.name.trim()) {
    return 'photo';
  }
  const trimmed = file.name.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot === -1) {
    return trimmed;
  }
  return trimmed.slice(0, lastDot) || 'photo';
};

const buildThumbnailFileName = (file) => `${getFileBaseName(file)}-thumb${getFileExtension(file)}`;

const createImageThumbnailBlob = async (file, maxSize = 320) => {
  if (!isUsableFile(file)) {
    return null;
  }
  const dataUrl = await readFileAsDataURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const maxDimension = Math.max(image.width, image.height) || 1;
      const scale = Math.min(1, maxSize / maxDimension);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(null);
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      const mimeType = getThumbnailMimeType(file);
      const quality = mimeType === 'image/jpeg' ? 0.85 : undefined;
      canvas.toBlob(
        (blob) => {
          resolve(blob || null);
        },
        mimeType,
        quality
      );
    };
    image.onerror = () => reject(new Error('Unable to process photo.'));
    image.src = dataUrl;
  });
};

const preparePhotoThumbnail = async (
  formData,
  { sourceFieldName = 'profile_photo', thumbnailFieldName = 'profile_photo_thumbnail', maxSize = 320 } = {}
) => {
  if (!formData) {
    return;
  }
  const file = formData.get(sourceFieldName);
  if (!isUsableFile(file)) {
    formData.delete(thumbnailFieldName);
    return;
  }
  try {
    const blob = await createImageThumbnailBlob(file, maxSize);
    if (!blob) {
      formData.delete(thumbnailFieldName);
      return;
    }
    const fileName = buildThumbnailFileName(file);
    const type = blob.type || getThumbnailMimeType(file);
    const thumbnailFile = new File([blob], fileName, { type });
    formData.set(thumbnailFieldName, thumbnailFile);
  } catch (error) {
    formData.delete(thumbnailFieldName);
  }
};

const clearLaunchDeviceConfig = () => {
  if (launchDeviceConfig) {
    launchDeviceConfig.hidden = true;
  }
  if (launchDeviceIdValue) {
    launchDeviceIdValue.textContent = '';
  }
  if (launchDeviceKeyValue) {
    launchDeviceKeyValue.textContent = '';
  }
  if (launchConfigFeedback) {
    launchConfigFeedback.textContent = '';
  }
};

const showLaunchDeviceConfig = (turtleId, secret) => {
  if (!turtleId || !secret) {
    clearLaunchDeviceConfig();
    return;
  }
  if (launchDeviceIdValue) {
    launchDeviceIdValue.textContent = String(turtleId);
  }
  if (launchDeviceKeyValue) {
    launchDeviceKeyValue.textContent = secret;
  }
  if (launchDeviceConfig) {
    launchDeviceConfig.hidden = false;
  }
};

const resetLaunchDialog = () => {
  if (launchTurtleForm && typeof launchTurtleForm.reset === 'function') {
    launchTurtleForm.reset();
  }
  clearLaunchDeviceConfig();
  if (launchSubmitButton) {
    launchSubmitButton.disabled = false;
    launchSubmitButton.textContent = 'Launch turtle';
  }
  if (launchFeedback) {
    launchFeedback.textContent = '';
  }
  toggleLaunchSuccessState(false);
  launchWasSuccessful = false;
};

toggleLaunchSuccessState(false);

const populateManageForm = (turtle) => {
  if (!manageTurtleForm) {
    return;
  }

  if (typeof manageTurtleForm.reset === 'function') {
    manageTurtleForm.reset();
  }

  const { name, status, missionId, hubId, boatId, photoUrl } = turtle;
  const nameField = manageTurtleForm.querySelector('[name="name"]');
  const statusField = manageTurtleForm.querySelector('[name="status"]');
  const missionField = manageTurtleForm.querySelector('[name="mission_id"]');
  const hubField = manageTurtleForm.querySelector('[name="hub_id"]');
  const boatField = manageTurtleForm.querySelector('[name="boat_id"]');

  if (nameField) {
    nameField.value = name || '';
  }
  if (statusField) {
    statusField.value = status || '';
  }
  if (missionField) {
    missionField.value = missionId || '';
  }
  if (hubField) {
    hubField.value = hubId || '';
  }
  if (boatField) {
    boatField.value = boatId || '';
  }
  updateFeaturePhotoPreview(photoUrl || '');
};

const openManageTurtleDialog = (sourceElement) => {
  if (!manageTurtleDialog || !manageTurtleForm) {
    return;
  }

  const row = getManageableRow(sourceElement);
  if (!row) {
    return;
  }

  const turtleIdRaw = row.dataset.turtleId;
  const parsedId = turtleIdRaw ? Number(turtleIdRaw) : null;
  if (!Number.isFinite(parsedId)) {
    return;
  }

  currentTurtleId = parsedId;

  const turtleData = {
    name: row.dataset.turtleName || '',
    status: row.dataset.turtleStatus || '',
    missionId: row.dataset.turtleMission || '',
    hubId: row.dataset.turtleHub || '',
    boatId: row.dataset.turtleBoat || '',
    photoUrl: row.dataset.turtlePhotoUrl || ''
  };

  manageTurtleForm.dataset.endpoint = `/api/turtles/${encodeURIComponent(currentTurtleId)}`;
  if (deviceIdValue) {
    deviceIdValue.textContent = String(currentTurtleId);
  }
  resetSecretState();
  populateManageForm(turtleData);

  if (formFeedback) {
    formFeedback.textContent = '';
  }

  showDialog(manageTurtleDialog);
};

const closeManageTurtleDialog = () => {
  hideDialog(manageTurtleDialog);
  resetSecretState();
  updateFeaturePhotoPreview('');
  currentTurtleId = null;
};

delegateClick('[data-trigger-manage-turtle]', (event, button) => {
  event.preventDefault();
  event.stopPropagation();
  console.log('[Managed turtles] Manage turtle trigger clicked', {
    trigger: button,
    turtleRow: getManageableRow(button)
  });
  openManageTurtleDialog(button);
});

delegateClick('[data-trigger-manage-bottles]', (event, button) => {
  event.preventDefault();
  event.stopPropagation();
  console.log('[Managed turtles] Manage bottles trigger clicked', {
    trigger: button,
    turtleRow: getManageableRow(button)
  });
  openTurtleBottlesDialog(button);
});

delegateClick('[data-remove-bottle-from-turtle]', (event, button) => {
  event.preventDefault();
  event.stopPropagation();
  const bottleId = Number(button.dataset.bottleId);
  const turtleId = Number(button.dataset.turtleId || turtleBottlesCurrentId);
  if (!Number.isFinite(bottleId) || !Number.isFinite(turtleId)) {
    return;
  }
  if (detachBottleMessage) {
    detachBottleMessage.textContent =
      'Are you sure you want to remove this bottle from this turtle? Later you can reassign the bottle to this turtle or another.';
  }
  openDetachBottleDialog(bottleId, turtleId);
});

const openLaunchTurtleDialog = () => {
  if (!launchTurtleDialog) {
    return;
  }
  resetLaunchDialog();
  showDialog(launchTurtleDialog);
};

const closeLaunchTurtleDialog = () => {
  if (!launchTurtleDialog) {
    return;
  }
  hideDialog(launchTurtleDialog);
  const shouldReload = launchWasSuccessful;
  resetLaunchDialog();
  if (shouldReload) {
    window.location.reload();
  }
};

if (manageTurtleDialog) {
  if (supportsNativeDialog(manageTurtleDialog)) {
    manageTurtleDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeManageTurtleDialog();
    });
  }

  manageTurtleCloseButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      closeManageTurtleDialog();
    });
  });
}

if (turtleBottlesDialog) {
  if (supportsNativeDialog(turtleBottlesDialog)) {
    turtleBottlesDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeTurtleBottlesDialog();
    });
  }
  if (turtleBottlesCloseButton) {
    turtleBottlesCloseButton.addEventListener('click', (event) => {
      event.preventDefault();
      closeTurtleBottlesDialog();
    });
  }
}

if (detachBottleDialog) {
  if (supportsNativeDialog(detachBottleDialog)) {
    detachBottleDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDetachBottleDialog();
    });
  }
  if (detachBottleCloseButton) {
    detachBottleCloseButton.addEventListener('click', (event) => {
      event.preventDefault();
      closeDetachBottleDialog();
    });
  }
  if (detachBottleCancelButton) {
    detachBottleCancelButton.addEventListener('click', (event) => {
      event.preventDefault();
      closeDetachBottleDialog();
    });
  }
  if (detachBottleConfirmButton) {
    detachBottleConfirmButton.addEventListener('click', (event) => {
      event.preventDefault();
      confirmDetachBottle();
    });
  }
}

if (launchTurtleDialog) {
  if (supportsNativeDialog(launchTurtleDialog)) {
    launchTurtleDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeLaunchTurtleDialog();
    });
  }

  launchTurtleCloseButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      closeLaunchTurtleDialog();
    });
  });
}

if (launchSuccessCloseButton) {
  launchSuccessCloseButton.addEventListener('click', (event) => {
    event.preventDefault();
    closeLaunchTurtleDialog();
  });
}

if (launchSuccessAscii) {
  launchSuccessAscii.addEventListener('mouseenter', startHoverCelebration);
  launchSuccessAscii.addEventListener('mouseleave', endHoverCelebration);
  launchSuccessAscii.addEventListener('focus', startHoverCelebration);
  launchSuccessAscii.addEventListener('blur', endHoverCelebration);
  launchSuccessAscii.addEventListener('click', () => {
    turtleCelebration(LAUNCH_CELEBRATION_FRAMES).catch(() => {});
  });
  launchSuccessAscii.addEventListener(
    'touchstart',
    () => {
      turtleCelebration(LAUNCH_CELEBRATION_FRAMES).catch(() => {});
    },
    { passive: true }
  );
}

delegateClick('[data-launch-turtle]', (event) => {
  event.preventDefault();
  console.log('[Managed turtles] Launch turtle trigger clicked', { target: event.target });
  openLaunchTurtleDialog();
});

launchTurtleTriggers.forEach((trigger) => {
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    console.log('[Managed turtles] Launch turtle button clicked', { trigger });
    openLaunchTurtleDialog();
  });
});

if (launchTurtleForm) {
  launchTurtleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(launchTurtleForm);
    const trimmedName = (formData.get('name') || '').trim();
    if (!trimmedName) {
      if (launchFeedback) {
        launchFeedback.textContent = 'Please give your turtle a name.';
      }
      return;
    }
    formData.set('name', trimmedName);
    ['mission_id', 'hub_id', 'boat_id'].forEach((field) => {
      const value = formData.get(field);
      if (typeof value === 'string') {
        formData.set(field, value.trim());
      }
    });
    await preparePhotoThumbnail(formData);

    if (launchFeedback) {
      launchFeedback.textContent = 'Launching…';
    }
    if (launchSubmitButton) {
      launchSubmitButton.disabled = true;
      launchSubmitButton.textContent = 'Launching…';
    }

    try {
      const response = await fetch('/api/turtles/launch', {
        method: 'POST',
        body: formData
      });
      const json = await parseJsonResponse(response);
      if (!json.success) {
        throw new Error(json.message || 'Request failed');
      }

      launchWasSuccessful = true;
      if (launchFeedback) {
        launchFeedback.textContent = '';
      }
      if (launchTurtleForm && typeof launchTurtleForm.reset === 'function') {
        launchTurtleForm.reset();
      }
      // The plaintext secret is only ever returned by this response —
      // surface the device config now instead of sending the user to
      // the manage dialog (which would rotate the secret again).
      showLaunchDeviceConfig(json.data?.turtle_id, json.secret);
      toggleLaunchSuccessState(true);
      if (launchSubmitButton) {
        launchSubmitButton.disabled = false;
        launchSubmitButton.textContent = 'Launch turtle';
      }
    } catch (error) {
      launchWasSuccessful = false;
      if (launchFeedback) {
        launchFeedback.textContent = error.message || 'Unable to launch turtle.';
      }
      if (launchSubmitButton) {
        launchSubmitButton.disabled = false;
        launchSubmitButton.textContent = 'Launch turtle';
      }
    }
  });
}

const copySecretToClipboard = async (secret) => {
  if (!secret) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(secret);
    return true;
  } catch (error) {
    const textarea = document.createElement('textarea');
    textarea.value = secret;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (execError) {
      copied = false;
    }
    document.body.removeChild(textarea);
    return copied;
  }
};

const requestSecret = async () => {
  if (!secretButton || !currentTurtleId) {
    return;
  }

  secretButton.disabled = true;
  const originalText = secretButton.textContent;
  secretButton.textContent = TURTLE_DIALOG_STRINGS.turtle_dialog_loading;
  secretButton.dataset.action = 'loading';

  try {
    const response = await fetch(`/api/turtles/${encodeURIComponent(currentTurtleId)}/secret`, {
      method: 'POST'
    });
    const json = await parseJsonResponse(response);
    if (!json.success || !json.secret) {
      throw new Error(json.message || 'Unable to retrieve secret');
    }
    if (secretValue) {
      secretValue.textContent = json.secret;
    }
    if (secretCard) {
      secretCard.hidden = false;
    }
    if (deviceConfigSnippet && currentTurtleId) {
      deviceConfigSnippet.textContent = buildDeviceConfigSnippet(currentTurtleId, json.secret);
    }
    if (deviceConfigBlock) {
      deviceConfigBlock.hidden = false;
    }
    if (secretFeedback) {
      secretFeedback.textContent = 'Secret ready to copy.';
    }
    secretButton.textContent = TURTLE_DIALOG_STRINGS.turtle_dialog_copy_secret;
    secretButton.dataset.action = 'copy';
  } catch (error) {
    if (secretFeedback) {
      secretFeedback.textContent = 'Unable to retrieve the secret right now.';
    }
    secretButton.textContent = originalText;
    secretButton.dataset.action = 'view';
    secretButton.disabled = false;
  } finally {
    secretButton.disabled = false;
  }
};

if (secretButton) {
  secretButton.addEventListener('click', async (event) => {
    event.preventDefault();
    const action = secretButton.dataset.action || 'view';
    if (action === 'copy') {
      if (!secretValue) {
        return;
      }
      const secret = secretValue.textContent.trim();
      if (!secret) {
        return;
      }
      const copied = await copySecretToClipboard(secret);
      if (secretFeedback) {
        secretFeedback.textContent = copied
          ? 'Secret copied to clipboard.'
          : 'Copy failed. Please copy manually.';
      }
      return;
    }
    if (!secretButton.disabled) {
      requestSecret();
    }
  });
}

const attachLaunchCopyHandler = (button, getValueFn, label) => {
  if (!button) return;
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    const value = getValueFn();
    if (!value) return;
    const copied = await copySecretToClipboard(value);
    if (copied) {
      button.textContent = '✓ Copy';
      window.setTimeout(() => {
        button.textContent = 'Copy';
      }, 2000);
    }
    if (launchConfigFeedback) {
      launchConfigFeedback.textContent = copied
        ? `${label} copied.`
        : 'Copy failed. Please copy manually.';
    }
  });
};

attachLaunchCopyHandler(
  launchCopyApiBaseButton,
  () => (launchApiBaseValue ? launchApiBaseValue.textContent.trim() : ''),
  'api_base'
);
attachLaunchCopyHandler(
  launchCopyDeviceIdButton,
  () => (launchDeviceIdValue ? launchDeviceIdValue.textContent.trim() : ''),
  'device_id'
);
attachLaunchCopyHandler(
  launchCopyDeviceKeyButton,
  () => (launchDeviceKeyValue ? launchDeviceKeyValue.textContent.trim() : ''),
  'device_key'
);

if (deviceConfigCopyButton) {
  deviceConfigCopyButton.addEventListener('click', async (event) => {
    event.preventDefault();
    const snippet = deviceConfigSnippet ? deviceConfigSnippet.textContent.trim() : '';
    if (!snippet) {
      return;
    }
    const copied = await copySecretToClipboard(snippet);
    if (secretFeedback) {
      secretFeedback.textContent = copied
        ? 'config.json copied to clipboard.'
        : 'Copy failed. Please copy manually.';
    }
  });
}

if (manageTurtleForm) {
  manageTurtleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentTurtleId) {
      return;
    }

    const formData = new FormData(manageTurtleForm);
    const stringFields = ['name', 'status', 'mission_id', 'hub_id', 'boat_id'];
    stringFields.forEach((field) => {
      const value = formData.get(field);
      if (typeof value === 'string') {
        formData.set(field, value.trim());
      }
    });
    if (typeof formData.get('name') === 'string' && !formData.get('name')) {
      formData.set('name', '');
    }
    await preparePhotoThumbnail(formData);

    if (formFeedback) {
      formFeedback.textContent = 'Saving…';
    }

    try {
      const response = await fetch(manageTurtleForm.dataset.endpoint, {
        method: manageTurtleForm.dataset.method || 'PUT',
        body: formData
      });
      const json = await parseJsonResponse(response);
      if (!json.success) {
        throw new Error(json.message || 'Request failed');
      }
      if (formFeedback) {
        formFeedback.textContent = 'Saved!';
      }
      window.setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (error) {
      if (formFeedback) {
        formFeedback.textContent = error.message || 'Unable to save changes.';
      }
    }
  });
}

if (deleteTurtleButton) {
  deleteTurtleButton.addEventListener('click', async (event) => {
    event.preventDefault();
    if (!currentTurtleId) {
      return;
    }
    const confirmed = window.confirm(
      'Delete this Turtle? This action cannot be undone.'
    );
    if (!confirmed) {
      return;
    }
    const originalText = deleteTurtleButton.textContent;
    deleteTurtleButton.disabled = true;
    deleteTurtleButton.textContent = TURTLE_DIALOG_STRINGS.turtle_dialog_deleting;
    if (formFeedback) {
      formFeedback.textContent = 'Removing turtle…';
    }
    try {
      const response = await fetch(`/api/turtles/${encodeURIComponent(currentTurtleId)}`, {
        method: 'DELETE'
      });
      const json = await parseJsonResponse(response);
      if (!json.success) {
        throw new Error(json.message || 'Unable to delete turtle.');
      }
      if (formFeedback) {
        formFeedback.textContent = 'Turtle deleted.';
      }
      window.setTimeout(() => {
        window.location.reload();
      }, 400);
    } catch (error) {
      if (formFeedback) {
        formFeedback.textContent = error.message || 'Unable to delete turtle.';
      }
      deleteTurtleButton.disabled = false;
      deleteTurtleButton.textContent = originalText;
    }
  });
}
})();
