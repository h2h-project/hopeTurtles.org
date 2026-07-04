const adminForms = document.querySelectorAll('.admin-form');
const deleteButtons = document.querySelectorAll('.admin-table .delete');
const missionDialog = document.getElementById('createMissionDialog');
const editMissionDialog = document.getElementById('editMissionDialog');
const hubDialog = document.getElementById('createHubDialog');
const editHubDialog = document.getElementById('editHubDialog');
const boatDialog = document.getElementById('createBoatDialog');
const editBoatDialog = document.getElementById('editBoatDialog');
const turtleDialog = document.getElementById('createTurtleDialog');
const missionEditForm = editMissionDialog ? editMissionDialog.querySelector('[data-edit-mission-form]') : null;
const missionEditNameTarget = editMissionDialog ? editMissionDialog.querySelector('[data-mission-name]') : null;
const hubEditForm = editHubDialog ? editHubDialog.querySelector('[data-edit-hub-form]') : null;
const hubEditNameTarget = editHubDialog ? editHubDialog.querySelector('[data-hub-name]') : null;
const boatEditForm = editBoatDialog ? editBoatDialog.querySelector('[data-edit-boat-form]') : null;
const boatEditNameTarget = editBoatDialog ? editBoatDialog.querySelector('[data-boat-name]') : null;

const supportsNativeDialog = (dialog) => Boolean(dialog && typeof dialog.showModal === 'function');

const formatDateTimeForMysql = (value) => {
  if (!value || typeof value !== 'string') {
    return value;
  }
  const [datePart, timePartRaw] = value.split('T');
  if (!datePart) {
    return value;
  }
  if (!timePartRaw) {
    return `${datePart} 00:00:00`;
  }
  const timePart = timePartRaw.length === 5 ? `${timePartRaw}:00` : timePartRaw;
  return `${datePart} ${timePart}`;
};

const showDialog = (dialog) => {
  if (!dialog) return;
  if (supportsNativeDialog(dialog)) {
    dialog.showModal();
  } else {
    dialog.removeAttribute('hidden');
    dialog.setAttribute('data-open', 'true');
  }
};

const hideDialog = (dialog) => {
  if (!dialog) return;
  if (supportsNativeDialog(dialog)) {
    dialog.close();
  } else {
    dialog.setAttribute('data-open', 'false');
    dialog.setAttribute('hidden', '');
  }
};

const setupDialog = (dialog, triggerSelector, closeSelector) => {
  if (!dialog) {
    return;
  }

  if (!supportsNativeDialog(dialog)) {
    dialog.setAttribute('hidden', '');
  }

  if (triggerSelector) {
    const triggers = document.querySelectorAll(triggerSelector);
    triggers.forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        showDialog(dialog);
      });
    });
  }

  if (closeSelector) {
    const closeButtons = dialog.querySelectorAll(closeSelector);
    closeButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        hideDialog(dialog);
      });
    });
  }

  if (supportsNativeDialog(dialog)) {
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      hideDialog(dialog);
    });
  }
};

setupDialog(missionDialog, '[data-open-mission-form]', '[data-close-mission-form]');
setupDialog(hubDialog, '[data-open-hub-form]', '[data-close-hub-form]');
setupDialog(boatDialog, '[data-open-boat-form]', '[data-close-boat-form]');
setupDialog(turtleDialog, '[data-open-turtle-form]', '[data-close-turtle-form]');
setupDialog(editMissionDialog, null, '[data-close-edit-mission-form]');
setupDialog(editHubDialog, null, '[data-close-edit-hub-form]');
setupDialog(editBoatDialog, null, '[data-close-edit-boat-form]');

adminForms.forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const endpoint = form.dataset.endpoint;
    const method = form.dataset.method || 'POST';
    const feedback = form.querySelector('.form-feedback');
    const formData = new FormData(form);
    const usesMultipart = form.enctype === 'multipart/form-data';
    const turtleNameFromForm = formData.get('name');
    let payload = null;
    let requestBody;
    let headers;

    if (usesMultipart) {
      ['start_date', 'end_date'].forEach((field) => {
        const value = formData.get(field);
        if (value) {
          formData.set(field, formatDateTimeForMysql(value));
        }
      });
      requestBody = formData;
    } else {
      payload = Object.fromEntries(formData.entries());
      ['start_date', 'end_date'].forEach((field) => {
        if (payload[field]) {
          payload[field] = formatDateTimeForMysql(payload[field]);
        }
      });
      headers = { 'Content-Type': 'application/json' };
      requestBody = JSON.stringify(payload);
    }

    feedback.textContent = 'Saving…';
    try {
      const requestOptions = { method, body: requestBody };
      if (headers) {
        requestOptions.headers = headers;
      }
      const response = await fetch(endpoint, requestOptions);
      const json = await response.json();
      if (json.success) {
        feedback.textContent = 'Saved!';
        setTimeout(() => {
          const dialog = form.closest('dialog');
          if (dialog) {
            hideDialog(dialog);
          }
          window.location.reload();
        }, 600);
      } else {
        feedback.textContent = json.message || 'Failed to save.';
      }
    } catch (error) {
      feedback.textContent = 'Network error.';
    }
  });
});

const inlineSelects = document.querySelectorAll('[data-editable-select]');

const parseOptions = (element) =>
  (element.dataset.options || '')
    .split('|')
    .map((option) => option.trim())
    .filter(Boolean);

const getExtraOption = (element) => (element.dataset.extraOption || '').trim();

const formatStatusKey = (value) => (value ? value.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'unset');

const formatDisplayValue = (element, value) => {
  if (!element || !value) {
    return value;
  }
  const transform = element.dataset.displayTransform;
  if (transform === 'turtle-status') {
    return value
      .split('_')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  return value;
};

const updateInlineSelectDisplay = (element, newValue) => {
  const placeholder = element.dataset.placeholder || 'Set status';
  const badge = element.querySelector('.status-pill');
  const valueToShow = newValue ? formatDisplayValue(element, newValue) : placeholder;

  if (badge) {
    badge.textContent = valueToShow;
    badge.dataset.status = formatStatusKey(newValue);
  } else {
    element.textContent = valueToShow;
  }
};

const decodeMissionData = (element) => {
  if (!element?.dataset?.mission) {
    return null;
  }
  try {
    return JSON.parse(decodeURIComponent(element.dataset.mission));
  } catch (error) {
    console.error('Failed to parse mission data', error);
    return null;
  }
};

const storeMissionData = (element, mission) => {
  if (!element || !mission) {
    return;
  }
  try {
    element.dataset.mission = encodeURIComponent(JSON.stringify(mission));
  } catch (error) {
    console.error('Failed to store mission data', error);
  }
};

const decodeHubData = (element) => {
  if (!element?.dataset.hub) {
    return null;
  }
  try {
    return JSON.parse(decodeURIComponent(element.dataset.hub));
  } catch (error) {
    console.error('Failed to parse hub data', error);
    return null;
  }
};

const storeHubData = (element, hub) => {
  if (!element || !hub) {
    return;
  }
  try {
    element.dataset.hub = encodeURIComponent(JSON.stringify(hub));
  } catch (error) {
    console.error('Failed to store hub data', error);
  }
};

const decodeBoatData = (element) => {
  if (!element?.dataset.boat) {
    return null;
  }
  try {
    return JSON.parse(decodeURIComponent(element.dataset.boat));
  } catch (error) {
    console.error('Failed to parse boat data', error);
    return null;
  }
};

const storeBoatData = (element, boat) => {
  if (!element || !boat) {
    return;
  }
  try {
    element.dataset.boat = encodeURIComponent(JSON.stringify(boat));
  } catch (error) {
    console.error('Failed to store boat data', error);
  }
};

const prepareMissionEditForm = (mission) => {
  if (!missionEditForm || !mission) {
    return;
  }
  if (typeof missionEditForm.reset === 'function') {
    missionEditForm.reset();
  }
  missionEditForm.dataset.endpoint = `/api/missions/${mission.id}`;
  missionEditForm.dataset.method = 'PUT';
  const setFieldValue = (selector, value) => {
    const field = missionEditForm.querySelector(selector);
    if (field) {
      field.value = value ?? '';
    }
  };

  setFieldValue('[name="full_name"]', mission.fullName || '');
  setFieldValue('[name="short_name"]', mission.shortName || '');
  const descriptionField = missionEditForm.querySelector('[name="description"]');
  if (descriptionField) {
    descriptionField.value = mission.description || '';
  }
  setFieldValue('[name="status"]', mission.status || 'planned');
  setFieldValue('[name="visibility"]', mission.visibility || 'public');
  setFieldValue('[name="start_date"]', mission.startDate || '');
  setFieldValue('[name="end_date"]', mission.endDate || '');
  setFieldValue('[name="target_lat"]', mission.targetLat ?? '');
  setFieldValue('[name="target_lng"]', mission.targetLng ?? '');

  const feedback = missionEditForm.querySelector('.form-feedback');
  if (feedback) {
    feedback.textContent = '';
  }

  if (missionEditNameTarget) {
    missionEditNameTarget.textContent = mission.fullName || 'this mission';
  }
};

const openMissionEditDialog = (element) => {
  const missionData = decodeMissionData(element);
  if (!missionData) {
    return;
  }
  prepareMissionEditForm(missionData);
  showDialog(editMissionDialog);
};

const prepareHubEditForm = (hub) => {
  if (!hubEditForm || !hub) {
    return;
  }
  if (typeof hubEditForm.reset === 'function') {
    hubEditForm.reset();
  }
  hubEditForm.dataset.endpoint = `/api/hubs/${hub.id}`;
  hubEditForm.dataset.method = 'PUT';
  const setFieldValue = (selector, value) => {
    const field = hubEditForm.querySelector(selector);
    if (field) {
      field.value = value ?? '';
    }
  };
  setFieldValue('[name="name"]', hub.name || '');
  setFieldValue('[name="mission_id"]', hub.missionId || '');
  setFieldValue('[name="country"]', hub.country || '');
  setFieldValue('[name="region"]', hub.region || '');
  setFieldValue('[name="status"]', hub.status || '');
  const descriptionField = hubEditForm.querySelector('[name="description"]');
  if (descriptionField) {
    descriptionField.value = hub.description || '';
  }
  const mailingField = hubEditForm.querySelector('[name="mailing_address"]');
  if (mailingField) {
    mailingField.value = hub.mailingAddress || '';
  }
  setFieldValue('[name="coordinator_id"]', hub.coordinatorId || '');
  const feedback = hubEditForm.querySelector('.form-feedback');
  if (feedback) {
    feedback.textContent = '';
  }
  if (hubEditNameTarget) {
    hubEditNameTarget.textContent = hub.name || 'this hub';
  }
};

const openHubEditDialog = (element) => {
  const hubData = decodeHubData(element);
  if (!hubData) {
    return;
  }
  prepareHubEditForm(hubData);
  showDialog(editHubDialog);
};

const prepareBoatEditForm = (boat) => {
  if (!boatEditForm || !boat) {
    return;
  }
  if (typeof boatEditForm.reset === 'function') {
    boatEditForm.reset();
  }
  boatEditForm.dataset.endpoint = `/api/boats/${boat.id}`;
  boatEditForm.dataset.method = 'PUT';
  const setFieldValue = (selector, value) => {
    const field = boatEditForm.querySelector(selector);
    if (field) {
      field.value = value ?? '';
    }
  };
  setFieldValue('[name="name"]', boat.name || '');
  setFieldValue('[name="mission_id"]', boat.missionId || '');
  setFieldValue('[name="hub_id"]', boat.hubId || '');
  setFieldValue('[name="owner"]', boat.owner || '');
  setFieldValue('[name="registration"]', boat.registration || '');
  setFieldValue('[name="capacity_hts"]', boat.capacityHts ?? '');
  setFieldValue('[name="capacity_persons"]', boat.capacityPersons ?? '');
  setFieldValue('[name="capacity_bottles"]', boat.capacityBottles ?? '');
  setFieldValue('[name="contact"]', boat.contact || '');
  setFieldValue('[name="status"]', boat.status || '');
  const feedback = boatEditForm.querySelector('.form-feedback');
  if (feedback) {
    feedback.textContent = '';
  }
  if (boatEditNameTarget) {
    boatEditNameTarget.textContent = boat.name || 'this boat';
  }
};

const openBoatEditDialog = (element) => {
  const boatData = decodeBoatData(element);
  if (!boatData) {
    return;
  }
  prepareBoatEditForm(boatData);
  showDialog(editBoatDialog);
};

const setupEditableSelect = (element) => {
  const options = parseOptions(element);
  const extraOption = getExtraOption(element);
  if (extraOption) {
    options.push(extraOption);
  }
  if (!options.length) {
    return;
  }

  const openEditor = () => {
    if (element.dataset.editing === 'true') {
      return;
    }

    const select = document.createElement('select');
    select.className = 'inline-select__control';
    const currentValue = element.dataset.value || '';
    const label = element.dataset.label || 'Update value';
    select.setAttribute('aria-label', label);

    options.forEach((option) => {
      const optionEl = document.createElement('option');
      optionEl.value = option;
      const isExtraOption = extraOption && option === extraOption;
      const displayValue = isExtraOption ? option : formatDisplayValue(element, option) || option;
      optionEl.textContent = displayValue;
      if (option === currentValue) {
        optionEl.selected = true;
      }
      select.append(optionEl);
    });

    element.dataset.editing = 'true';
    element.classList.add('is-editing');
    element.append(select);

    const closeEditor = (restoreFocus = true) => {
      element.classList.remove('is-editing');
      element.dataset.editing = 'false';
      element.dataset.saving = 'false';
      if (select.parentElement === element) {
        select.remove();
      }
      if (restoreFocus) {
        element.focus();
      }
    };

    const commitChange = async (newValue) => {
      if (newValue === currentValue) {
        closeEditor();
        return;
      }

      if (extraOption && newValue === extraOption) {
        select.value = currentValue;
        closeEditor();
        if (element.dataset.editAction === 'mission') {
          window.setTimeout(() => {
            openMissionEditDialog(element);
          }, 0);
        }
        return;
      }

      element.dataset.saving = 'true';
      element.classList.add('is-saving');

      try {
        const response = await fetch(element.dataset.endpoint, {
          method: element.dataset.method || 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [element.dataset.field]: newValue })
        });
        const json = await response.json();
        if (!json.success) {
          throw new Error(json.message || 'Request failed');
        }
        element.dataset.value = newValue;
        updateInlineSelectDisplay(element, newValue);
        if (element.dataset.editAction === 'mission') {
          const missionRow = element.closest('[data-mission-row]');
          const missionData = decodeMissionData(missionRow);
          if (missionRow && missionData) {
            missionData.status = newValue;
            storeMissionData(missionRow, missionData);
          }
        } else if (element.dataset.editAction === 'hub') {
          const hubRow = element.closest('[data-hub-row]');
          const hubData = decodeHubData(hubRow);
          if (hubRow && hubData) {
            hubData.status = newValue;
            storeHubData(hubRow, hubData);
          }
        } else if (element.dataset.editAction === 'boat') {
          const boatRow = element.closest('[data-boat-row]');
          const boatData = decodeBoatData(boatRow);
          if (boatRow && boatData) {
            boatData.status = newValue;
            storeBoatData(boatRow, boatData);
          }
        }
      } catch (error) {
        console.error(error);
        alert('Unable to update this record right now.');
      } finally {
        element.classList.remove('is-saving');
        closeEditor();
      }
    };

    select.addEventListener('change', () => {
      commitChange(select.value).catch(() => {
        closeEditor();
      });
    });

    select.addEventListener('blur', () => {
      if (element.dataset.saving === 'true') {
        return;
      }
      closeEditor(false);
    });

    select.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeEditor();
      }
    });

    requestAnimationFrame(() => {
      select.focus();
    });
  };

  element.addEventListener('click', (event) => {
    event.preventDefault();
    openEditor();
  });

  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openEditor();
    }
  });
};

inlineSelects.forEach((element) => {
  updateInlineSelectDisplay(element, element.dataset.value || '');
  setupEditableSelect(element);
});

const interactiveRowSelector = 'button, a, input, select, textarea, label, [data-editable-select]';

const shouldIgnoreRowActivation = (target) => {
  if (!target) {
    return false;
  }
  return Boolean(target.closest(interactiveRowSelector));
};

const bindInteractiveRow = (row, handler) => {
  if (!row || typeof handler !== 'function') {
    return;
  }
  row.addEventListener('click', (event) => {
    if (shouldIgnoreRowActivation(event.target)) {
      return;
    }
    handler(row);
  });
  row.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    if (shouldIgnoreRowActivation(event.target)) {
      return;
    }
    event.preventDefault();
    handler(row);
  });
};

const missionRows = document.querySelectorAll('[data-mission-row]');
missionRows.forEach((row) => bindInteractiveRow(row, openMissionEditDialog));

const hubRows = document.querySelectorAll('[data-hub-row]');
hubRows.forEach((row) => bindInteractiveRow(row, openHubEditDialog));

const boatRows = document.querySelectorAll('[data-boat-row]');
boatRows.forEach((row) => bindInteractiveRow(row, openBoatEditDialog));

deleteButtons.forEach((button) => {
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    if (!confirm('Delete this record?')) return;
    const endpoint = button.dataset.endpoint;
    try {
      const response = await fetch(endpoint, { method: 'DELETE' });
      const json = await response.json();
      if (json.success) {
        window.location.reload();
      }
    } catch (error) {
      alert('Unable to delete this record right now.');
    }
  });
});

// Mission short_name is embedded in the MicroPython turtleOS code, so restrict
// it to <=10 letters/numbers (no spaces or symbols) as the user types.
document.querySelectorAll('.short-name-input').forEach((input) => {
  input.addEventListener('input', () => {
    const cleaned = input.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
    if (cleaned !== input.value) {
      input.value = cleaned;
    }
  });
});
