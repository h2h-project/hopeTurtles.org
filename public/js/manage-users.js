(function () {
  const ready = (callback) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  };

  ready(() => {
    const container = document.querySelector('main.manage-users');
    if (!container) {
      return;
    }

    const canEdit = String(container.dataset.canEdit).toLowerCase() === 'true';
    if (!canEdit) {
      return;
    }

    let roleOptions = [];
    try {
      roleOptions = JSON.parse(container.dataset.roleOptions || '[]');
    } catch (error) {
      console.warn('Unable to parse role options for manage users view.', error);
    }

    const getRoleLabel = (value) => {
      const match = roleOptions.find((option) => option.value === value);
      return match ? match.label : value;
    };

    const ensureFeedbackHost = () => {
      let host = container.querySelector('.manage-users-feedback');
      if (!host) {
        host = document.createElement('div');
        host.className = 'manage-users-feedback';
        host.setAttribute('role', 'status');
        host.setAttribute('aria-live', 'polite');
        host.setAttribute('aria-atomic', 'true');
        const panel = container.querySelector('.panel');
        if (panel) {
          container.insertBefore(host, panel);
        } else {
          container.appendChild(host);
        }
      }
      return host;
    };

    const ensureLiveRegion = () => {
      let region = container.querySelector('.manage-users-live');
      if (!region) {
        region = document.createElement('div');
        region.className = 'sr-only manage-users-live';
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-atomic', 'true');
        container.appendChild(region);
      }
      return region;
    };

    const feedbackHost = ensureFeedbackHost();
    const liveRegion = ensureLiveRegion();
    let hideTimeout;

    const showFeedback = (type, message) => {
      feedbackHost.textContent = message;
      feedbackHost.classList.remove(
        'manage-users-feedback--success',
        'manage-users-feedback--error',
        'manage-users-feedback--info',
        'is-visible'
      );
      feedbackHost.classList.add(`manage-users-feedback--${type}`, 'is-visible');
      liveRegion.textContent = message;
      if (hideTimeout) {
        window.clearTimeout(hideTimeout);
      }
      hideTimeout = window.setTimeout(() => {
        feedbackHost.classList.remove('is-visible');
      }, 4000);
    };

    const setRowFeedback = (row, type, message) => {
      const feedback = row?.querySelector('.role-feedback');
      if (!feedback) {
        return;
      }
      feedback.textContent = message || '';
      feedback.hidden = !message;
      feedback.classList.remove(
        'role-feedback--success',
        'role-feedback--error',
        'role-feedback--info'
      );
      if (type && message) {
        feedback.classList.add(`role-feedback--${type}`);
      }
    };

    const roleSelects = container.querySelectorAll('.role-select');
    roleSelects.forEach((select) => {
      const row = select.closest('tr');
      const saveButton = row?.querySelector('.role-save');
      if (!saveButton) {
        return;
      }

      // Reveal the Save button only once the selection differs from what's
      // currently stored; clear any stale feedback while editing.
      select.addEventListener('change', () => {
        const changed = select.value !== select.dataset.currentRole;
        saveButton.hidden = !changed;
        setRowFeedback(row, null, '');
      });

      saveButton.addEventListener('click', async () => {
        const userId = select.dataset.userId;
        const previousRole = select.dataset.currentRole;
        const newRole = select.value;
        if (!userId || !newRole || newRole === previousRole) {
          saveButton.hidden = true;
          return;
        }

        const displayName = row?.querySelector('strong')?.textContent?.trim() || `User #${userId}`;

        select.disabled = true;
        saveButton.disabled = true;
        setRowFeedback(row, 'info', 'Saving…');
        showFeedback('info', `Updating ${displayName}…`);

        try {
          const response = await fetch(`/api/users/${encodeURIComponent(userId)}/role`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: newRole })
          });

          if (!response.ok) {
            let message = 'Unable to update role.';
            try {
              const data = await response.json();
              if (data?.message) {
                message = data.message;
              }
            } catch (error) {
              console.warn('Failed to parse error response when updating role.', error);
            }
            throw new Error(message);
          }

          select.dataset.currentRole = newRole;
          saveButton.hidden = true;
          setRowFeedback(row, 'success', `Saved — now ${getRoleLabel(newRole)}.`);
          showFeedback('success', `${displayName} is now ${getRoleLabel(newRole)}.`);
        } catch (error) {
          // Keep the Save button visible so the change can be retried.
          setRowFeedback(row, 'error', error.message || 'Save failed.');
          showFeedback('error', error.message || 'Unable to update role.');
        } finally {
          select.disabled = false;
          saveButton.disabled = false;
        }
      });
    });

    // --- Manage mode: multi-select delete ---------------------------------
    const table = container.querySelector('[data-users-table]');
    const manageToggle = container.querySelector('[data-users-manage-toggle]');
    const manageActions = container.querySelector('[data-users-manage-actions]');
    const selectAll = container.querySelector('[data-users-select-all]');
    const deleteButton = container.querySelector('[data-users-delete-selected]');
    const selectedCountEl = container.querySelector('[data-users-selected-count]');

    if (table && manageToggle && manageActions && deleteButton) {
      const getRowCheckboxes = () =>
        Array.from(container.querySelectorAll('[data-users-select-row]'));
      const getSelectedIds = () =>
        getRowCheckboxes()
          .filter((box) => box.checked)
          .map((box) => box.value);

      const refreshSelectionState = () => {
        const boxes = getRowCheckboxes();
        const selected = boxes.filter((box) => box.checked);
        const count = selected.length;

        if (selectedCountEl) {
          selectedCountEl.textContent = `${count} selected`;
        }
        deleteButton.disabled = count === 0;

        if (selectAll) {
          selectAll.checked = count > 0 && count === boxes.length;
          selectAll.indeterminate = count > 0 && count < boxes.length;
        }
      };

      const setManageMode = (on) => {
        table.classList.toggle('is-managing', on);
        manageActions.hidden = !on;
        manageToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
        manageToggle.classList.toggle('is-active', on);
        if (!on) {
          getRowCheckboxes().forEach((box) => {
            box.checked = false;
          });
          if (selectAll) {
            selectAll.checked = false;
            selectAll.indeterminate = false;
          }
        }
        refreshSelectionState();
      };

      manageToggle.addEventListener('click', () => {
        setManageMode(manageToggle.getAttribute('aria-pressed') !== 'true');
      });

      if (selectAll) {
        selectAll.addEventListener('change', () => {
          getRowCheckboxes().forEach((box) => {
            box.checked = selectAll.checked;
          });
          refreshSelectionState();
        });
      }

      container.addEventListener('change', (event) => {
        if (event.target.matches('[data-users-select-row]')) {
          refreshSelectionState();
        }
      });

      deleteButton.addEventListener('click', async () => {
        const ids = getSelectedIds();
        if (!ids.length) {
          return;
        }

        const confirmed = window.confirm(
          `Permanently delete ${ids.length} user${ids.length === 1 ? '' : 's'}? This cannot be undone.`
        );
        if (!confirmed) {
          return;
        }

        deleteButton.disabled = true;
        showFeedback('info', `Deleting ${ids.length} user${ids.length === 1 ? '' : 's'}…`);

        try {
          const response = await fetch('/api/users/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
          });

          const data = await response.json().catch(() => null);
          if (!response.ok || !data?.success) {
            throw new Error(data?.message || 'Unable to delete users.');
          }

          const deleted = data.data?.deleted || [];
          deleted.forEach((id) => {
            const row = container.querySelector(`tr[data-user-id="${id}"]`);
            if (row) {
              row.remove();
            }
          });

          const skipped = data.data?.skipped || [];
          if (skipped.length) {
            const reason = skipped[0]?.reason || 'Some users could not be deleted.';
            showFeedback(
              'info',
              `Deleted ${deleted.length}. Skipped ${skipped.length}: ${reason}`
            );
          } else {
            showFeedback('success', data.message || `Deleted ${deleted.length} user(s).`);
          }
        } catch (error) {
          showFeedback('error', error.message || 'Unable to delete users.');
        } finally {
          refreshSelectionState();
        }
      });

      refreshSelectionState();
    }
  });
})();
