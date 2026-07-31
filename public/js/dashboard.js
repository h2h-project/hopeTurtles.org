const statusChartEl = document.getElementById("statusChart");
const telemetryChartEl = document.getElementById("telemetryChart");
let statusChart;
let telemetryChart;
const BOTTLE_CELEBRATION_FRAMES = 4;

const parseJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Unexpected response from server.");
  }
};

const profileEmojiPill = document.querySelector("[data-profile-emoji-pill]");
if (profileEmojiPill) {
  const valueElement = profileEmojiPill.querySelector(
    "[data-profile-emoji-value]",
  );
  const defaultEmoji =
    profileEmojiPill.dataset.defaultEmoji?.trim() ||
    valueElement?.textContent?.trim() ||
    "👤";
  const showDefaultEmoji = () => {
    if (valueElement) {
      valueElement.textContent = defaultEmoji;
    }
  };
  const showEditEmoji = () => {
    if (valueElement) {
      valueElement.textContent = "✏️";
    }
  };
  profileEmojiPill.addEventListener("mouseenter", showEditEmoji);
  profileEmojiPill.addEventListener("focus", showEditEmoji);
  profileEmojiPill.addEventListener("mouseleave", showDefaultEmoji);
  profileEmojiPill.addEventListener("blur", showDefaultEmoji);
  profileEmojiPill.addEventListener("click", showDefaultEmoji);
}

const buildStatusChart = (ctx, stats) => {
  const labels = stats.missionsByStatus.map((row) => row.status);
  const missionData = stats.missionsByStatus.map((row) => row.total);
  const turtleData = stats.turtlesByStatus.map((row) => row.total);

  statusChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Missions",
          data: missionData,
          backgroundColor: "#017919",
        },
        {
          label: "Turtles",
          data: turtleData,
          backgroundColor: "#23b053",
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
        },
      },
    },
  });
};

const buildTelemetryChart = (ctx, stats) => {
  const labels = stats.telemetryRate.map((row) => row.bucket);
  const values = stats.telemetryRate.map((row) => row.readings);
  telemetryChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Telemetry readings/hour",
          data: values,
          borderColor: "#5ba26b",
          fill: false,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
        },
      },
    },
  });
};

const refreshStats = async () => {
  const response = await fetch("/api/stats");
  const json = await parseJsonResponse(response);
  if (!json.success) return;
  if (!statusChart) {
    buildStatusChart(statusChartEl, json.data);
  } else {
    statusChart.data.labels = json.data.missionsByStatus.map(
      (row) => row.status,
    );
    statusChart.data.datasets[0].data = json.data.missionsByStatus.map(
      (row) => row.total,
    );
    statusChart.data.datasets[1].data = json.data.turtlesByStatus.map(
      (row) => row.total,
    );
    statusChart.update();
  }

  if (!telemetryChart) {
    buildTelemetryChart(telemetryChartEl, json.data);
  } else {
    telemetryChart.data.labels = json.data.telemetryRate.map(
      (row) => row.bucket,
    );
    telemetryChart.data.datasets[0].data = json.data.telemetryRate.map(
      (row) => row.readings,
    );
    telemetryChart.update();
  }
};

if (statusChartEl && telemetryChartEl) {
  refreshStats().catch(() => {});
  setInterval(refreshStats, 30000);
}

const dashboardAlertContainer = document.querySelector(
  "[data-dashboard-alerts]",
);

const bottleAsciiSources = [
  "/turtles-ascii-logo-3.txt",
  "/turtles-ascii-logo-2.txt",
  "/turtles-ascii-logo.txt",
];
let bottleAsciiCache = null;
let bottleCelebrationTimers = [];
let bottleCelebrationStopRequested = false;
const bottleCelebrationDialog = document.getElementById(
  "bottleCelebrationDialog",
);
const bottleCelebrationAscii =
  bottleCelebrationDialog?.querySelector("[data-bottle-celebration-ascii]") ??
  null;
const closeBottleCelebrationButtons = bottleCelebrationDialog
  ? bottleCelebrationDialog.querySelectorAll("[data-close-bottle-celebration]")
  : [];

const updateDashboardAlertState = () => {
  if (!dashboardAlertContainer) {
    return;
  }
  const alerts = dashboardAlertContainer.querySelectorAll(
    "[data-dashboard-alert]",
  );
  const hasAlerts = alerts.length > 0;
  dashboardAlertContainer.hidden = !hasAlerts;
};

if (dashboardAlertContainer) {
  dashboardAlertContainer.addEventListener("click", (event) => {
    const dismissButton = event.target.closest(
      "[data-dashboard-alert-dismiss]",
    );
    if (!dismissButton) {
      return;
    }
    event.preventDefault();
    const alertRow = dismissButton.closest("[data-dashboard-alert]");
    if (alertRow) {
      alertRow.remove();
      updateDashboardAlertState();
    }
  });
  updateDashboardAlertState();
}

const loadBottleAsciiFrames = async () => {
  if (bottleAsciiCache) {
    return bottleAsciiCache;
  }

  const frames = await Promise.all(
    bottleAsciiSources.map((source) =>
      fetch(source)
        .then((response) => (response.ok ? response.text() : ""))
        .then((text) => text.replace(/\s+$/u, ""))
        .catch(() => ""),
    ),
  );

  const [frameThree, frameTwo, finalFrame] = frames;
  bottleAsciiCache = {
    frames: [frameThree, frameTwo].filter(Boolean),
    final: finalFrame || frameThree || "HopeTurtles",
  };
  return bottleAsciiCache;
};

const clearBottleCelebrationTimers = () => {
  if (!bottleCelebrationTimers.length) return;
  bottleCelebrationTimers.forEach((timerId) => window.clearTimeout(timerId));
  bottleCelebrationTimers = [];
};

const waitForBottleCelebrationFrame = (duration) =>
  new Promise((resolve) => {
    const timerId = window.setTimeout(resolve, duration);
    bottleCelebrationTimers.push(timerId);
  });

const renderBottleAsciiFrame = (text) => {
  if (bottleCelebrationAscii && typeof text === "string") {
    bottleCelebrationAscii.textContent = text;
  }
};

const runBottleCelebration = async (
  frameCount = BOTTLE_CELEBRATION_FRAMES,
  { loop = false } = {},
) => {
  const asciiAssets = await loadBottleAsciiFrames();
  const animationFrames = asciiAssets.frames.length
    ? asciiAssets.frames
    : [asciiAssets.final];
  bottleCelebrationStopRequested = false;
  clearBottleCelebrationTimers();

  const playOnce = async () => {
    for (let index = 0; index < frameCount; index += 1) {
      if (bottleCelebrationStopRequested) return;
      renderBottleAsciiFrame(animationFrames[index % animationFrames.length]);
      await waitForBottleCelebrationFrame(400);
    }
  };

  do {
    await playOnce();
  } while (loop && !bottleCelebrationStopRequested);

  renderBottleAsciiFrame(asciiAssets.final);
};

const stopBottleCelebration = async () => {
  bottleCelebrationStopRequested = true;
  clearBottleCelebrationTimers();
  try {
    const asciiAssets = await loadBottleAsciiFrames();
    renderBottleAsciiFrame(asciiAssets.final);
  } catch (error) {
    renderBottleAsciiFrame("HopeTurtles");
  }
};

if (bottleCelebrationAscii) {
  loadBottleAsciiFrames()
    .then((assets) => renderBottleAsciiFrame(assets.final))
    .catch(() => {});
}

const registerBottleDialog = document.getElementById("registerBottleDialog");
const registerBottleForm =
  registerBottleDialog?.querySelector("[data-register-bottle-form]") ?? null;
const registerBottleFeedback =
  registerBottleDialog?.querySelector("[data-register-bottle-feedback]") ??
  null;
const openRegisterBottleButton = document.querySelector(
  "[data-open-register-bottle]",
);
const closeRegisterBottleButtons = registerBottleDialog
  ? registerBottleDialog.querySelectorAll("[data-close-register-bottle]")
  : [];
const bottlesTableWrapper = document.querySelector("[data-my-bottles-table]");
const bottlesTableBody = document.querySelector("[data-my-bottles-body]");
const bottlesEmptyState = document.querySelector("[data-my-bottles-empty]");
const bottlesFeedback = document.querySelector("[data-my-bottles-feedback]");
const bottleDeliveryDialog = document.getElementById(
  "bottleDeliveryDetailsDialog",
);
const bottleDeliverySerialValue =
  bottleDeliveryDialog?.querySelector("[data-bottle-delivery-serial-value]") ??
  null;
const bottleDeliveryHubSection =
  bottleDeliveryDialog?.querySelector("[data-bottle-delivery-hub]") ?? null;
const bottleDeliveryHubName =
  bottleDeliveryDialog?.querySelector("[data-bottle-delivery-hub-name]") ??
  null;
const bottleDeliveryHubAddress =
  bottleDeliveryDialog?.querySelector("[data-bottle-delivery-hub-address]") ??
  null;
const closeBottleDeliveryButtons = bottleDeliveryDialog
  ? bottleDeliveryDialog.querySelectorAll("[data-close-bottle-delivery]")
  : [];
const bottleDeliveryForm =
  bottleDeliveryDialog?.querySelector("[data-bottle-delivery-form]") ?? null;
const bottleDeliveryFeedback =
  bottleDeliveryDialog?.querySelector("[data-bottle-delivery-feedback]") ??
  null;
const bottleDeliverySubmitButton =
  bottleDeliveryDialog?.querySelector("[data-bottle-delivery-submit]") ?? null;
const deleteBottleButton =
  bottleDeliveryDialog?.querySelector("[data-delete-bottle]") ?? null;
const reassignBottleDialog = document.getElementById("reassignBottleDialog");
const reassignBottleForm =
  reassignBottleDialog?.querySelector("[data-reassign-bottle-form]") ?? null;
const reassignBottleSelect =
  reassignBottleForm?.querySelector("[data-reassign-bottle-select]") ?? null;
const reassignBottleFeedback =
  reassignBottleForm?.querySelector("[data-reassign-bottle-feedback]") ?? null;
const reassignBottleHubLabel =
  reassignBottleForm?.querySelector("[data-reassign-bottle-hub]") ?? null;
const reassignBottleSummaryLabel =
  reassignBottleForm?.querySelector("[data-reassign-bottle-summary]") ?? null;
const reassignBottleEmptyState =
  reassignBottleForm?.querySelector("[data-reassign-bottle-empty]") ?? null;
const reassignBottleSubmitButton =
  reassignBottleForm?.querySelector('button[type="submit"]') ?? null;
const closeReassignButtons = reassignBottleDialog
  ? reassignBottleDialog.querySelectorAll("[data-close-reassign-bottle]")
  : [];

const escapeHtml = (value) => {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).replace(/[&<>'"]/gu, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
};

const escapeAttribute = (value) => escapeHtml(value).replace(/`/gu, "&#96;");

const slugifyStatus = (value) =>
  value
    ? value
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-|-$/gu, "")
    : "";

const formatBottleStatusLabel = (value) => {
  if (!value) {
    return "—";
  }
  return value
    .split(/\s+/gu)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatBottleWeight = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return "—";
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return "—";
  }
  return `${numeric.toLocaleString()} g`;
};

const formatDashboardBottleContents = (value) => {
  if (!value) {
    return "—";
  }
  return escapeHtml(value).replace(/\r?\n/gu, "<br />");
};

const formatMultilineText = (value) => {
  if (!value) {
    return "";
  }
  return escapeHtml(value).replace(/\r?\n/gu, "<br />");
};

const toggleBottlesTableState = () => {
  if (!bottlesTableWrapper || !bottlesEmptyState || !bottlesTableBody) {
    return;
  }
  const hasRows = bottlesTableBody.children.length > 0;
  bottlesTableWrapper.hidden = !hasRows;
  bottlesEmptyState.hidden = hasRows;
};

const getBottleDataFromRow = (row) => {
  if (!row) {
    return null;
  }

  const bottleIdRaw = row.dataset.bottleId;
  const parsedId = bottleIdRaw ? Number(bottleIdRaw) : null;
  const bottleId = Number.isFinite(parsedId) ? parsedId : null;

  return {
    bottle_id: bottleId,
    serial_number: row.dataset.serialNumber || "",
    hub_name: row.dataset.hubName || "",
    hub_mailing_address: row.dataset.hubAddress || "",
  };
};

const removeBottleRowById = (bottleId) => {
  if (!bottlesTableBody || !bottleId) {
    return null;
  }

  const rows = Array.from(
    bottlesTableBody.querySelectorAll("tr[data-bottle-row]"),
  );
  const targetRow = rows.find(
    (node) => node.dataset.bottleId === String(bottleId),
  );
  if (targetRow) {
    targetRow.remove();
  }
  return targetRow || null;
};

const openBottleDialogFromRow = (row) => {
  const bottle = getBottleDataFromRow(row);
  if (!bottle || !bottle.bottle_id) {
    return;
  }

  showBottleDeliveryModal(bottle);
};

const resetBottleDeliveryForm = () => {
  if (!bottleDeliveryForm) {
    return;
  }
  bottleDeliveryForm.reset();
  bottleDeliveryForm.dataset.bottleId = "";
  if (bottleDeliveryFeedback) {
    bottleDeliveryFeedback.textContent = "";
    bottleDeliveryFeedback.hidden = true;
    bottleDeliveryFeedback.classList.remove("is-error", "is-success");
  }
  if (deleteBottleButton) {
    deleteBottleButton.disabled = true;
  }
};

const updateBottleRow = (bottle) => {
  if (!bottlesTableBody || !bottle) {
    return;
  }

  const bottleId = bottle.bottle_id ? String(bottle.bottle_id) : "";
  const existingRow = bottleId
    ? bottlesTableBody.querySelector(
        `tr[data-bottle-row][data-bottle-id="${bottleId}"]`,
      )
    : null;
  const newRow = createBottleRow(bottle);
  if (existingRow) {
    existingRow.replaceWith(newRow);
  } else {
    bottlesTableBody.prepend(newRow);
  }
};

const showBottleDeliveryModal = (bottle) => {
  if (!bottleDeliveryDialog || !bottle) {
    return;
  }

  resetBottleDeliveryForm();

  if (bottleDeliveryForm) {
    bottleDeliveryForm.dataset.bottleId = bottle.bottle_id
      ? String(bottle.bottle_id)
      : "";
  }

  if (deleteBottleButton) {
    deleteBottleButton.disabled = !bottle?.bottle_id;
  }

  const serialNumber = bottle.serial_number ? String(bottle.serial_number) : "";
  if (bottleDeliverySerialValue) {
    bottleDeliverySerialValue.textContent = serialNumber || "—";
  }

  const hubName = bottle.hub_name ? String(bottle.hub_name) : "";
  const hubAddress = bottle.hub_mailing_address
    ? String(bottle.hub_mailing_address)
    : "";
  const hasHubInfo = Boolean(hubName || hubAddress);

  if (bottleDeliveryHubSection) {
    bottleDeliveryHubSection.hidden = !hasHubInfo;
  }

  if (hasHubInfo) {
    if (bottleDeliveryHubName) {
      bottleDeliveryHubName.textContent = hubName;
    }
    if (bottleDeliveryHubAddress) {
      bottleDeliveryHubAddress.innerHTML = formatMultilineText(hubAddress);
    }
  } else {
    if (bottleDeliveryHubName) {
      bottleDeliveryHubName.textContent = "";
    }
    if (bottleDeliveryHubAddress) {
      bottleDeliveryHubAddress.innerHTML = "";
    }
  }

  bottleDeliveryDialog.showModal();
};

const openBottleCelebration = () => {
  if (!bottleCelebrationDialog) {
    return;
  }

  if (typeof bottleCelebrationDialog.showModal === "function") {
    bottleCelebrationDialog.showModal();
  } else {
    bottleCelebrationDialog.removeAttribute("hidden");
    bottleCelebrationDialog.setAttribute("data-open", "true");
  }

  runBottleCelebration(BOTTLE_CELEBRATION_FRAMES).catch(() => {});
};

const closeBottleCelebration = () => {
  if (!bottleCelebrationDialog) {
    return;
  }

  if (typeof bottleCelebrationDialog.close === "function") {
    bottleCelebrationDialog.close();
  } else {
    bottleCelebrationDialog.setAttribute("data-open", "false");
    bottleCelebrationDialog.setAttribute("hidden", "");
  }
  stopBottleCelebration().catch(() => {});
};

const handleBottleDeliverySubmit = async (event) => {
  event.preventDefault();

  if (!bottleDeliveryForm) {
    return;
  }

  const bottleId = bottleDeliveryForm.dataset.bottleId;
  if (!bottleId) {
    if (bottleDeliveryFeedback) {
      bottleDeliveryFeedback.textContent =
        "Something went wrong. Please try again.";
      bottleDeliveryFeedback.hidden = false;
      bottleDeliveryFeedback.classList.add("is-error");
      bottleDeliveryFeedback.classList.remove("is-success");
    }
    return;
  }

  const formData = new FormData(bottleDeliveryForm);
  if (bottleDeliveryFeedback) {
    bottleDeliveryFeedback.textContent = "";
    bottleDeliveryFeedback.hidden = true;
    bottleDeliveryFeedback.classList.remove("is-error", "is-success");
  }

  if (bottleDeliverySubmitButton) {
    bottleDeliverySubmitButton.disabled = true;
  }

  try {
    const response = await fetch(
      `/api/my-bottles/${encodeURIComponent(bottleId)}/delivery`,
      {
        method: "POST",
        body: formData,
      },
    );
    const json = await parseJsonResponse(response);

    if (!response.ok || !json.success) {
      throw new Error(json.message || "Unable to save delivery details.");
    }

    if (json.data) {
      updateBottleRow(json.data);
      toggleBottlesTableState();
    }

    showBottlesFeedback("Delivery details saved. Thank you!", false);
    bottleDeliveryDialog.close();
    openBottleCelebration();
  } catch (error) {
    const message = error?.message || "Unable to save delivery details.";
    if (bottleDeliveryFeedback) {
      bottleDeliveryFeedback.textContent = message;
      bottleDeliveryFeedback.hidden = false;
      bottleDeliveryFeedback.classList.add("is-error");
      bottleDeliveryFeedback.classList.remove("is-success");
    } else {
      showBottlesFeedback(message, true);
    }
  } finally {
    if (bottleDeliverySubmitButton) {
      bottleDeliverySubmitButton.disabled = false;
    }
  }
};

const handleDeleteBottle = async () => {
  if (!bottleDeliveryForm) {
    return;
  }

  const bottleId = bottleDeliveryForm.dataset.bottleId;
  if (!bottleId) {
    return;
  }

  const confirmDelete = window.confirm(
    "Are you sure you want to delete this aid bottle? This action cannot be undone.",
  );
  if (!confirmDelete) {
    return;
  }

  if (bottleDeliveryFeedback) {
    bottleDeliveryFeedback.textContent = "";
    bottleDeliveryFeedback.hidden = true;
    bottleDeliveryFeedback.classList.remove("is-error", "is-success");
  }

  if (deleteBottleButton) {
    deleteBottleButton.disabled = true;
  }

  try {
    const response = await fetch(
      `/api/my-bottles/${encodeURIComponent(bottleId)}`,
      {
        method: "DELETE",
      },
    );
    const json = await parseJsonResponse(response);

    if (!response.ok || !json.success) {
      throw new Error(json.message || "Unable to delete bottle.");
    }

    removeBottleRowById(bottleId);
    toggleBottlesTableState();
    if (bottleDeliveryDialog) {
      bottleDeliveryDialog.close();
    }
    showBottlesFeedback("Bottle deleted.", false);
  } catch (error) {
    const message = error?.message || "Unable to delete bottle.";
    if (bottleDeliveryFeedback) {
      bottleDeliveryFeedback.textContent = message;
      bottleDeliveryFeedback.hidden = false;
      bottleDeliveryFeedback.classList.add("is-error");
      bottleDeliveryFeedback.classList.remove("is-success");
    } else {
      showBottlesFeedback(message, true);
    }
  } finally {
    if (deleteBottleButton) {
      deleteBottleButton.disabled = false;
    }
  }
};

const showBottlesFeedback = (message, isError = false) => {
  if (!bottlesFeedback) {
    return;
  }

  if (!message) {
    bottlesFeedback.textContent = "";
    bottlesFeedback.hidden = true;
    bottlesFeedback.classList.remove("is-error", "is-success");
    return;
  }

  bottlesFeedback.textContent = message;
  bottlesFeedback.hidden = false;
  bottlesFeedback.classList.toggle("is-error", Boolean(isError));
  bottlesFeedback.classList.toggle("is-success", !isError);
};

const resetRegisterBottleForm = () => {
  if (!registerBottleForm) {
    return;
  }
  registerBottleForm.reset();
  if (registerBottleFeedback) {
    registerBottleFeedback.textContent = "";
    registerBottleFeedback.classList.remove("is-error", "is-success");
  }
};

const createBottleRow = (bottle) => {
  const row = document.createElement("tr");
  const bottleId = bottle.bottle_id ? String(bottle.bottle_id) : "";
  row.dataset.bottleId = bottleId;
  row.setAttribute("data-bottle-row", "");
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  const accessibleLabel = bottle.serial_number
    ? `Open delivery details for aid bottle #${bottle.serial_number}`
    : "Open delivery details for this aid bottle";
  row.setAttribute("aria-label", accessibleLabel);

  const basicPhotoUrl = bottle.basic_photo_url;
  const serialLabel = bottle.serial_number
    ? `#${escapeHtml(bottle.serial_number)}`
    : "—";
  const photoAlt = bottle.serial_number
    ? `Aid bottle #${bottle.serial_number}`
    : "Aid bottle photo";
  const missionLabel = bottle.mission_name
    ? escapeHtml(bottle.mission_name)
    : "—";
  const statusSlug = slugifyStatus(bottle.status);
  const statusLabel = formatBottleStatusLabel(bottle.status);
  const weightLabel = formatBottleWeight(bottle.weight_grams);
  const isVerified =
    String(bottle.verified) === "1" ||
    bottle.verified === 1 ||
    bottle.verified === true;
  const verifiedValue = isVerified ? "true" : "false";
  const verifiedLabel = isVerified ? "Verified" : "Pending";
  const hubName = bottle.hub_name ? String(bottle.hub_name) : "";
  const hubAddress = bottle.hub_mailing_address
    ? String(bottle.hub_mailing_address)
    : "";
  const turtleName = bottle.turtle_name ? String(bottle.turtle_name) : "";
  const turtleLabel = turtleName || "Assign turtle";

  const photoMarkup = basicPhotoUrl
    ? `<img src="${escapeAttribute(basicPhotoUrl)}" alt="${escapeAttribute(photoAlt)}" loading="lazy" />`
    : '<span class="bottle-photo__placeholder">No photo</span>';

  row.innerHTML = `
    <td data-label="Aid Bottle">
      <div class="bottle-cell">
        <div class="bottle-photo ${basicPhotoUrl ? "" : "bottle-photo--placeholder"}">
          ${photoMarkup}
          <span class="bottle-photo__serial">${serialLabel}</span>
        </div>
      </div>
    </td>
    <td data-label="Turtle">
      <button
        type="button"
        class="pill-button bottle-turtle-pill"
        data-open-reassign-bottle
        aria-label="Change turtle connection"
      >
        ${escapeHtml(turtleLabel)}
      </button>
    </td>
    <td data-label="Mission">${missionLabel}</td>
    <td data-label="Contents"><div class="bottle-contents">${formatDashboardBottleContents(bottle.contents)}</div></td>
    <td data-label="Weight">${escapeHtml(weightLabel)}</td>
    <td data-label="Verified">
      <span class="status-pill verified-pill" data-verified="${verifiedValue}">
        ${escapeHtml(verifiedLabel)}
      </span>
    </td>
    <td data-label="Status">
      <span
        class="status-pill bottle-status-pill"
        data-status="${escapeAttribute(statusSlug)}"
        data-open-delivery-details
      >
        ${escapeHtml(statusLabel)}
      </span>
    </td>
  `;

  row.dataset.serialNumber = bottle.serial_number
    ? String(bottle.serial_number)
    : "";
  row.dataset.hubName = hubName;
  row.dataset.hubAddress = hubAddress;
  row.dataset.turtleId = bottle.turtle_id ? String(bottle.turtle_id) : "";
  row.dataset.turtleName = turtleName;
  row.dataset.hubId = bottle.hub_id ? String(bottle.hub_id) : "";

  return row;
};

const managedTurtlesData = Array.from(
  document.querySelectorAll("[data-manageable-turtle]"),
)
  .map((row) => {
    const idRaw = row.dataset.turtleId;
    const hubIdRaw = row.dataset.turtleHub;
    const parsedId = idRaw ? Number(idRaw) : null;
    if (!Number.isFinite(parsedId)) {
      return null;
    }
    return {
      id: parsedId,
      name: row.dataset.turtleName?.trim() || `Turtle #${idRaw}`,
      hubId: hubIdRaw ? String(hubIdRaw) : "",
      hubName: row.dataset.turtleHubName?.trim() || "",
    };
  })
  .filter(Boolean);

const getManagedTurtlesForHub = (hubId) => {
  if (!hubId) {
    return [];
  }
  return managedTurtlesData.filter(
    (turtle) => turtle.hubId && String(turtle.hubId) === String(hubId),
  );
};

const setReassignFeedback = (message, isError = false) => {
  if (!reassignBottleFeedback) {
    return;
  }
  reassignBottleFeedback.textContent = message || "";
  reassignBottleFeedback.hidden = !message;
  reassignBottleFeedback.classList.toggle("is-error", Boolean(isError));
  reassignBottleFeedback.classList.toggle(
    "is-success",
    Boolean(message && !isError),
  );
};

const resetReassignDialog = () => {
  if (reassignBottleForm) {
    reassignBottleForm.reset();
    reassignBottleForm.dataset.bottleId = "";
  }
  if (reassignBottleSelect) {
    reassignBottleSelect.innerHTML = "";
    reassignBottleSelect.disabled = false;
  }
  if (reassignBottleEmptyState) {
    reassignBottleEmptyState.hidden = true;
  }
  setReassignFeedback("");
};

const populateReassignOptions = (hubId, currentTurtleId) => {
  if (!reassignBottleSelect) {
    return false;
  }
  reassignBottleSelect.innerHTML = "";
  const turtles = getManagedTurtlesForHub(hubId);
  turtles.forEach((turtle) => {
    const option = document.createElement("option");
    option.value = String(turtle.id);
    option.textContent = turtle.name;
    if (currentTurtleId && String(turtle.id) === String(currentTurtleId)) {
      option.selected = true;
    }
    reassignBottleSelect.appendChild(option);
  });
  return turtles.length > 0;
};

const showReassignDialog = () => {
  if (!reassignBottleDialog) {
    return;
  }
  if (typeof reassignBottleDialog.showModal === "function") {
    reassignBottleDialog.showModal();
  } else {
    reassignBottleDialog.removeAttribute("hidden");
    reassignBottleDialog.setAttribute("data-open", "true");
  }
};

const hideReassignDialog = () => {
  if (!reassignBottleDialog) {
    return;
  }
  if (typeof reassignBottleDialog.close === "function") {
    reassignBottleDialog.close();
  } else {
    reassignBottleDialog.setAttribute("data-open", "false");
    reassignBottleDialog.setAttribute("hidden", "");
  }
};

const openReassignDialogFromRow = (row) => {
  if (!row || !reassignBottleDialog) {
    return;
  }
  const bottleId = row.dataset.bottleId ? Number(row.dataset.bottleId) : null;
  if (!Number.isFinite(bottleId) || !reassignBottleForm) {
    return;
  }
  const serialNumber = row.dataset.serialNumber?.trim();
  const hubName = row.dataset.hubName?.trim();
  const hubId = row.dataset.hubId ? String(row.dataset.hubId) : "";
  const currentTurtleId = row.dataset.turtleId
    ? Number(row.dataset.turtleId)
    : null;
  reassignBottleForm.dataset.bottleId = String(bottleId);
  if (reassignBottleSummaryLabel) {
    reassignBottleSummaryLabel.textContent = serialNumber
      ? `Bottle #${serialNumber}`
      : "Bottle without serial number";
  }
  if (reassignBottleHubLabel) {
    reassignBottleHubLabel.textContent = hubName
      ? `Hub: ${hubName}`
      : "Hub not assigned yet";
  }
  const hasOptions = populateReassignOptions(hubId, currentTurtleId);
  if (reassignBottleEmptyState) {
    if (!hubId) {
      reassignBottleEmptyState.textContent =
        "Assign this bottle to a hub before connecting it to a turtle.";
    } else {
      reassignBottleEmptyState.textContent =
        "You do not have any turtles connected to this hub yet.";
    }
    reassignBottleEmptyState.hidden = hasOptions;
  }
  if (reassignBottleSelect) {
    reassignBottleSelect.disabled = !hasOptions;
  }
  if (reassignBottleSubmitButton) {
    reassignBottleSubmitButton.disabled = !hasOptions;
  }
  setReassignFeedback("");
  showReassignDialog();
};

const closeReassignDialog = () => {
  resetReassignDialog();
  hideReassignDialog();
};

const handleReassignSubmit = async (event) => {
  event.preventDefault();
  if (!reassignBottleForm || !reassignBottleSelect) {
    return;
  }
  const bottleId = reassignBottleForm.dataset.bottleId;
  if (!bottleId) {
    setReassignFeedback("Missing bottle information.", true);
    return;
  }
  const selectedTurtle = reassignBottleSelect.value;
  if (!selectedTurtle) {
    setReassignFeedback("Please choose a turtle.", true);
    return;
  }
  const payload = { turtle_id: Number(selectedTurtle) };
  if (!Number.isFinite(payload.turtle_id)) {
    setReassignFeedback("Please choose a valid turtle.", true);
    return;
  }
  setReassignFeedback("Saving…", false);
  if (reassignBottleSubmitButton) {
    reassignBottleSubmitButton.disabled = true;
  }
  try {
    const response = await fetch(
      `/api/my-bottles/${encodeURIComponent(bottleId)}/turtle`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    const json = await parseJsonResponse(response);
    if (!response.ok || !json.success) {
      throw new Error(json?.message || "Unable to update bottle.");
    }
    updateBottleRow(json.data);
    showBottlesFeedback("Bottle connection updated.", false);
    closeReassignDialog();
  } catch (error) {
    setReassignFeedback(error.message || "Unable to update bottle.", true);
  } finally {
    if (reassignBottleSubmitButton) {
      reassignBottleSubmitButton.disabled = false;
    }
  }
};

const addBottleRow = (bottle) => {
  if (!bottlesTableBody) {
    return;
  }
  const row = createBottleRow(bottle);
  bottlesTableBody.prepend(row);
  toggleBottlesTableState();
};

let pendingDeliveryBottle = null;

const handleRegisterBottleSubmit = async (event) => {
  event.preventDefault();
  if (!registerBottleForm) {
    return;
  }

  const submitButton = registerBottleForm.querySelector(
    'button[type="submit"]',
  );
  if (registerBottleFeedback) {
    registerBottleFeedback.textContent = "";
    registerBottleFeedback.classList.remove("is-error", "is-success");
  }

  const formData = new FormData(registerBottleForm);
  const payload = {};

  const missionId = formData.get("mission_id");
  if (missionId && String(missionId).trim() !== "") {
    const parsedMission = Number(missionId);
    if (!Number.isNaN(parsedMission)) {
      payload.mission_id = parsedMission;
    }
  }

  const brand = formData.get("brand");
  if (brand && String(brand).trim()) {
    payload.brand = String(brand).trim();
  }

  const volume = formData.get("volume_ml");
  if (volume && String(volume).trim() !== "") {
    const parsedVolume = Number(volume);
    if (!Number.isNaN(parsedVolume) && parsedVolume >= 0) {
      payload.volume_ml = parsedVolume;
    }
  }

  const hubId = formData.get("hub_id");
  if (hubId && String(hubId).trim() !== "") {
    const parsedHub = Number(hubId);
    if (!Number.isNaN(parsedHub)) {
      payload.hub_id = parsedHub;
    }
  }

  const turtleId = formData.get("turtle_id");
  if (turtleId && String(turtleId).trim() !== "") {
    const parsedTurtle = Number(turtleId);
    if (!Number.isNaN(parsedTurtle)) {
      payload.turtle_id = parsedTurtle;
    }
  }

  const weight = formData.get("weight_grams");
  if (weight && String(weight).trim() !== "") {
    const parsedWeight = Number(weight);
    if (!Number.isNaN(parsedWeight)) {
      payload.weight_grams = parsedWeight;
    }
  }

  const contents = formData.get("contents");
  if (contents && String(contents).trim()) {
    payload.contents = String(contents).trim();
  }

  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    const response = await fetch("/api/my-bottles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await parseJsonResponse(response);
    if (!response.ok || !json.success) {
      throw new Error(json.message || "Unable to register bottle.");
    }

    let createdBottle = null;
    if (json.data) {
      addBottleRow(json.data);
      showBottlesFeedback("Bottle registered successfully.", false);
      window.setTimeout(() => {
        showBottlesFeedback("", false);
      }, 5000);
      createdBottle = json.data;
    }

    // Defer the delivery popup until the register dialog has fully closed.
    // Opening a second modal <dialog> in the same tick as closing this one
    // leaves the register dialog's backdrop/inert state lingering, which makes
    // the delivery modal's file input and Save button unresponsive (the reason
    // image upload failed in the add flow but worked from the edit flow).
    pendingDeliveryBottle = createdBottle;
    if (registerBottleDialog) {
      registerBottleDialog.close();
    } else {
      resetRegisterBottleForm();
      if (pendingDeliveryBottle) {
        const bottleToDeliver = pendingDeliveryBottle;
        pendingDeliveryBottle = null;
        showBottleDeliveryModal(bottleToDeliver);
      }
    }
  } catch (error) {
    if (registerBottleFeedback) {
      registerBottleFeedback.textContent =
        error.message || "Unable to register bottle.";
      registerBottleFeedback.classList.add("is-error");
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
};

if (registerBottleForm) {
  registerBottleForm.addEventListener("submit", handleRegisterBottleSubmit);
}

if (registerBottleDialog) {
  registerBottleDialog.addEventListener("close", () => {
    resetRegisterBottleForm();
    if (pendingDeliveryBottle) {
      const bottleToDeliver = pendingDeliveryBottle;
      pendingDeliveryBottle = null;
      // Open on the next frame so the register dialog is fully removed from the
      // top layer before the delivery modal takes over.
      window.requestAnimationFrame(() => {
        showBottleDeliveryModal(bottleToDeliver);
      });
    }
  });

  registerBottleDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    registerBottleDialog.close();
  });
}

if (openRegisterBottleButton && registerBottleDialog) {
  openRegisterBottleButton.addEventListener("click", () => {
    resetRegisterBottleForm();
    registerBottleDialog.showModal();
    const firstInput =
      registerBottleForm?.querySelector('input[name="brand"]') ??
      registerBottleForm?.querySelector("select, input, textarea");
    if (firstInput) {
      firstInput.focus();
    }
  });
}

if (closeRegisterBottleButtons && registerBottleDialog) {
  closeRegisterBottleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      registerBottleDialog.close();
    });
  });
}

if (closeBottleDeliveryButtons && bottleDeliveryDialog) {
  closeBottleDeliveryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      bottleDeliveryDialog.close();
    });
  });
}

if (bottleDeliveryDialog) {
  bottleDeliveryDialog.addEventListener("close", () => {
    resetBottleDeliveryForm();
  });

  bottleDeliveryDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    bottleDeliveryDialog.close();
  });
}

if (bottleDeliveryForm) {
  bottleDeliveryForm.addEventListener("submit", handleBottleDeliverySubmit);
}

if (deleteBottleButton) {
  deleteBottleButton.addEventListener("click", handleDeleteBottle);
}

if (bottleCelebrationDialog) {
  if (typeof bottleCelebrationDialog.addEventListener === "function") {
    bottleCelebrationDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeBottleCelebration();
    });
  }
  closeBottleCelebrationButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      closeBottleCelebration();
    });
  });
}

if (bottlesTableBody) {
  bottlesTableBody.addEventListener("click", (event) => {
    const reassignButton = event.target.closest("[data-open-reassign-bottle]");
    if (reassignButton) {
      event.preventDefault();
      event.stopPropagation();
      const row = reassignButton.closest("tr[data-bottle-row]");
      if (row) {
        openReassignDialogFromRow(row);
      }
      return;
    }
    const row = event.target.closest("tr[data-bottle-row]");
    if (!row) {
      return;
    }
    openBottleDialogFromRow(row);
  });

  bottlesTableBody.addEventListener("keydown", (event) => {
    const isActivationKey = event.key === "Enter" || event.key === " ";
    if (!isActivationKey) {
      return;
    }
    const reassignButton = event.target.closest("[data-open-reassign-bottle]");
    if (reassignButton) {
      event.preventDefault();
      const row = reassignButton.closest("tr[data-bottle-row]");
      if (row) {
        openReassignDialogFromRow(row);
      }
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const row = event.target.closest("tr[data-bottle-row]");
    if (!row) {
      return;
    }
    event.preventDefault();
    openBottleDialogFromRow(row);
  });
}

if (reassignBottleDialog) {
  if (typeof reassignBottleDialog.addEventListener === "function") {
    reassignBottleDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeReassignDialog();
    });
  }
  closeReassignButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      closeReassignDialog();
    });
  });
}

if (reassignBottleForm) {
  reassignBottleForm.addEventListener("submit", handleReassignSubmit);
}

toggleBottlesTableState();

// --- Right-hand action sidebar: Contribute / Manifest / OpenBooks -----------
const contributeDialog = document.getElementById("contributeDialog");
const contributeForm =
  contributeDialog?.querySelector("[data-contribute-form]") ?? null;
const contributeFeedback =
  contributeDialog?.querySelector("[data-contribute-feedback]") ?? null;
const contributeAmountInput = contributeDialog?.querySelector(
  "[data-contribute-amount-input]",
);
const openContributeButton = document.querySelector("[data-open-contribute]");
const closeContributeButtons = contributeDialog
  ? contributeDialog.querySelectorAll("[data-close-contribute]")
  : [];
const contributeAmountPills = contributeDialog
  ? contributeDialog.querySelectorAll("[data-contribute-amount]")
  : [];

if (openContributeButton && contributeDialog) {
  openContributeButton.addEventListener("click", () => {
    if (contributeFeedback) {
      contributeFeedback.hidden = true;
      contributeFeedback.textContent = "";
    }
    contributeAmountPills.forEach((pill) =>
      pill.setAttribute("aria-pressed", "false"),
    );
    contributeDialog.showModal();
    contributeAmountInput?.focus();
  });
}

closeContributeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    contributeDialog.close();
  });
});

contributeAmountPills.forEach((pill) => {
  pill.addEventListener("click", () => {
    contributeAmountPills.forEach((other) =>
      other.setAttribute("aria-pressed", String(other === pill)),
    );
    if (contributeAmountInput) {
      contributeAmountInput.value = pill.dataset.contributeAmount;
    }
  });
});

if (contributeForm) {
  contributeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (contributeFeedback) {
      contributeFeedback.hidden = false;
      contributeFeedback.textContent =
        "Thanks for your generosity! Online contributions are still being wired up — check back soon.";
    }
  });
}

const openbooksNoticeLink = document.querySelector("[data-openbooks-notice]");
if (openbooksNoticeLink) {
  openbooksNoticeLink.addEventListener("click", (event) => {
    event.preventDefault();
    window.alert(
      "Sorry! Our entire financial system is still in development.",
    );
  });
}

// --- My Saved Ecojoiner Designs panel ---------------------------------------
(function () {
  const designsTable = document.querySelector(
    "[data-my-ecojoiner-designs-table]",
  );
  const designsEmpty = document.querySelector(
    "[data-my-ecojoiner-designs-empty]",
  );

  const toggleDesignsTableState = () => {
    const remaining = document.querySelectorAll("[data-eco-design-row]").length;
    if (designsTable) designsTable.hidden = remaining === 0;
    if (designsEmpty) designsEmpty.hidden = remaining > 0;
  };

  document.querySelectorAll("[data-delete-eco-design]").forEach((button) => {
    button.addEventListener("click", async () => {
      const designId = button.dataset.designId;
      if (!designId) return;
      if (!window.confirm("Delete this saved design? This cannot be undone."))
        return;
      button.disabled = true;
      try {
        const response = await fetch(
          `/api/ecojoiner/designs/${encodeURIComponent(designId)}`,
          {
            method: "DELETE",
          },
        );
        const json = await parseJsonResponse(response);
        if (!response.ok || !json.success) {
          throw new Error(json.message || "Unable to delete design.");
        }
        const row = document.querySelector(
          `[data-eco-design-row][data-design-id="${designId}"]`,
        );
        if (row) row.remove();
        toggleDesignsTableState();
      } catch (error) {
        window.alert(error?.message || "Unable to delete design.");
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-delete-eco-profile]").forEach((button) => {
    button.addEventListener("click", async () => {
      const profileId = button.dataset.profileId;
      if (!profileId) return;
      if (
        !window.confirm(
          "Delete this saved bottle profile? This cannot be undone.",
        )
      )
        return;
      button.disabled = true;
      try {
        const response = await fetch(
          `/api/ecojoiner/profiles/${encodeURIComponent(profileId)}`,
          {
            method: "DELETE",
          },
        );
        const json = await parseJsonResponse(response);
        if (!response.ok || !json.success) {
          throw new Error(json.message || "Unable to delete profile.");
        }
        const item = button.closest("li");
        if (item) item.remove();
      } catch (error) {
        window.alert(error?.message || "Unable to delete profile.");
        button.disabled = false;
      }
    });
  });

  document
    .querySelectorAll("[data-toggle-eco-visibility]")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const designId = button.dataset.designId;
        const next =
          button.dataset.currentVisibility === "public" ? "private" : "public";
        button.disabled = true;
        try {
          const response = await fetch(
            `/api/ecojoiner/designs/${encodeURIComponent(designId)}/visibility`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ visibility: next }),
            },
          );
          const json = await parseJsonResponse(response);
          if (!response.ok || !json.success) {
            throw new Error(json.message || "Unable to update visibility.");
          }
          button.dataset.currentVisibility = json.data.visibility;
          button.textContent =
            json.data.visibility === "public" ? "Public" : "Private";
          const row = button.closest("[data-eco-design-row]");
          if (row) {
            row.dataset.visibility = json.data.visibility;
            if (json.data.share_url)
              row.dataset.shareToken = json.data.share_url.split("/").pop();
          }
          if (json.data.share_url) {
            window.prompt("Shareable link (copy it now):", json.data.share_url);
          }
        } catch (error) {
          window.alert(error?.message || "Unable to update visibility.");
        } finally {
          button.disabled = false;
        }
      });
    });

  document.querySelectorAll("[data-copy-eco-share]").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("[data-eco-design-row]");
      const token = row?.dataset.shareToken;
      if (!token) return;
      const url = `${window.location.origin}/api/ecojoiner/designs/shared/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        button.textContent = "Copied!";
        setTimeout(() => {
          button.textContent = "Copy link";
        }, 1500);
      } catch {
        window.prompt("Shareable link (copy it now):", url);
      }
    });
  });
})();
