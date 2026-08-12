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
    if (response.status === 413) {
      throw new Error(
        "That file is too large for the server to accept. Please upload a smaller photo (under 8MB) and try again.",
      );
    }
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
const reassignBottleHubSelect =
  reassignBottleForm?.querySelector("[data-reassign-bottle-hub-select]") ??
  null;
const reassignBottleFeedback =
  reassignBottleForm?.querySelector("[data-reassign-bottle-feedback]") ?? null;
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
        <i class="fa-solid fa-gear" aria-hidden="true"></i>
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

const hubTurtlesCache = new Map();

const fetchTurtlesForHub = async (hubId) => {
  if (!hubId) {
    return [];
  }
  if (hubTurtlesCache.has(hubId)) {
    return hubTurtlesCache.get(hubId);
  }
  const response = await fetch(`/api/hubs/${encodeURIComponent(hubId)}/turtles`);
  const json = await parseJsonResponse(response);
  if (!response.ok || !json.success) {
    throw new Error(json?.message || "Unable to load turtles for that hub.");
  }
  const turtles = Array.isArray(json.data) ? json.data : [];
  hubTurtlesCache.set(hubId, turtles);
  return turtles;
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
  if (reassignBottleHubSelect) {
    reassignBottleHubSelect.value = "";
  }
  if (reassignBottleEmptyState) {
    reassignBottleEmptyState.hidden = true;
  }
  setReassignFeedback("");
};

const populateReassignTurtleOptions = async (hubId, currentTurtleId) => {
  if (!reassignBottleSelect) {
    return;
  }

  if (!hubId) {
    reassignBottleSelect.innerHTML = "";
    reassignBottleSelect.disabled = true;
    if (reassignBottleSubmitButton) {
      reassignBottleSubmitButton.disabled = true;
    }
    if (reassignBottleEmptyState) {
      reassignBottleEmptyState.textContent = "Choose a hub to see its turtles.";
      reassignBottleEmptyState.hidden = false;
    }
    return;
  }

  reassignBottleSelect.disabled = true;
  reassignBottleSelect.innerHTML = '<option value="">Loading turtles…</option>';
  if (reassignBottleSubmitButton) {
    reassignBottleSubmitButton.disabled = true;
  }
  if (reassignBottleEmptyState) {
    reassignBottleEmptyState.hidden = true;
  }

  let turtles = [];
  try {
    turtles = await fetchTurtlesForHub(hubId);
  } catch (error) {
    setReassignFeedback(
      error?.message || "Unable to load turtles for that hub.",
      true,
    );
  }

  reassignBottleSelect.innerHTML = "";
  turtles.forEach((turtle) => {
    const option = document.createElement("option");
    option.value = String(turtle.turtle_id);
    const managerLabel = turtle.manager_name ? ` — ${turtle.manager_name}` : "";
    option.textContent = `${turtle.name || `Turtle #${turtle.turtle_id}`}${managerLabel}`;
    if (currentTurtleId && String(turtle.turtle_id) === String(currentTurtleId)) {
      option.selected = true;
    }
    reassignBottleSelect.appendChild(option);
  });

  const hasOptions = turtles.length > 0;
  reassignBottleSelect.disabled = !hasOptions;
  if (reassignBottleSubmitButton) {
    reassignBottleSubmitButton.disabled = !hasOptions;
  }
  if (reassignBottleEmptyState) {
    reassignBottleEmptyState.textContent = "No turtles are connected to this hub yet.";
    reassignBottleEmptyState.hidden = hasOptions;
  }
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

const openReassignDialogFromRow = async (row) => {
  if (!row || !reassignBottleDialog) {
    return;
  }
  const bottleId = row.dataset.bottleId ? Number(row.dataset.bottleId) : null;
  if (!Number.isFinite(bottleId) || !reassignBottleForm) {
    return;
  }
  const serialNumber = row.dataset.serialNumber?.trim();
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
  if (reassignBottleHubSelect) {
    reassignBottleHubSelect.value = hubId;
  }
  setReassignFeedback("");
  showReassignDialog();
  await populateReassignTurtleOptions(hubId, currentTurtleId);
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

if (reassignBottleHubSelect) {
  reassignBottleHubSelect.addEventListener("change", () => {
    setReassignFeedback("");
    populateReassignTurtleOptions(reassignBottleHubSelect.value, null);
  });
}

toggleBottlesTableState();

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
          button.innerHTML = '<i class="fa-solid fa-link" aria-hidden="true"></i> Copy link';
        }, 1500);
      } catch {
        window.prompt("Shareable link (copy it now):", url);
      }
      closeAllRowMenus();
    });
  });

  // --- View / Edit saved ecojoiner design -------------------------------------
  // View and Edit both show the full spec — bottle geometry and joiner
  // material together — since a saved design and the bottle profile it was
  // built from are presented to the user as one thing, not two.
  const ECO_SPEC_FIELDS = [
    ["label", "Design name"],
    ["brand", "Brand"],
    ["volume_ml", "Volume (ml)"],
    ["diameter_mm", "Diameter (mm)"],
    ["cap_mm", "Cap (mm)"],
    ["collar_mm", "Collar (mm)"],
    ["height_mm", "Height (mm)"],
    ["top_tapper_mm", "Top tapper (mm)"],
    ["bottom_tapper_mm", "Bottom tapper (mm)"],
    ["material", "Material"],
    ["thickness_mm", "Thickness (mm)"],
  ];

  const CONNECTION_STEPS = [
    { mm: 1, label: "Loose" },
    { mm: 0, label: "Exact fit" },
    { mm: -1, label: "Snug" },
    { mm: -2, label: "Tight" },
    { mm: -3, label: "Super tight" },
  ];

  const connectionLabelForMm = (mm) => {
    const value = Number(mm) || 0;
    let closest = CONNECTION_STEPS[1];
    let closestDiff = Infinity;
    CONNECTION_STEPS.forEach((step) => {
      const diff = Math.abs(step.mm - value);
      if (diff < closestDiff) {
        closestDiff = diff;
        closest = step;
      }
    });
    return closest.label;
  };

  const connectionStepIndexForMm = (mm) => {
    const value = Number(mm) || 0;
    let closestIndex = 1;
    let closestDiff = Infinity;
    CONNECTION_STEPS.forEach((step, index) => {
      const diff = Math.abs(step.mm - value);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = index;
      }
    });
    return closestIndex;
  };

  const readRowSnapshot = (row) => {
    try {
      return JSON.parse(row.dataset.snapshot || "{}");
    } catch {
      return {};
    }
  };

  const viewDialog = document.getElementById("ecoDesignViewDialog");
  const viewTitle = viewDialog?.querySelector("[data-eco-view-title]");
  const viewSpecs = viewDialog?.querySelector("[data-eco-view-specs]");
  const viewBottlePhoto = viewDialog?.querySelector(
    "[data-eco-view-bottle-photo]",
  );
  const viewEcojoinerPhoto = viewDialog?.querySelector(
    "[data-eco-view-ecojoiner-photo]",
  );
  const viewCopyButton = viewDialog?.querySelector("[data-copy-eco-specs]");
  let currentViewFields = null;

  const setDesignPhoto = (container, url, iconClass) => {
    if (!container) return;
    if (url) {
      container.classList.remove("design-photo--placeholder");
      container.innerHTML = `<img src="${url}" alt="" loading="lazy" />`;
    } else {
      container.classList.add("design-photo--placeholder");
      container.innerHTML = `<i class="${iconClass}" aria-hidden="true"></i>`;
    }
  };

  const buildViewFields = (row, snapshot) => [
    ["Ecojoiner type", row.dataset.ecojoinerType || "—"],
    // "label" is shown as the dialog's heading instead (see viewTitle below),
    // so it's left out of the spec list to avoid showing it twice.
    ...ECO_SPEC_FIELDS.filter(
      ([key]) =>
        key !== "label" &&
        snapshot[key] !== undefined &&
        snapshot[key] !== null &&
        snapshot[key] !== "",
    ).map(([key, label]) => [label, snapshot[key]]),
    ["Tightness", connectionLabelForMm(snapshot.port_fit_mm)],
    ["Visibility", row.dataset.visibility === "public" ? "Public" : "Private"],
  ];

  document.querySelectorAll("[data-view-eco-design]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = document.querySelector(
        `[data-eco-design-row][data-design-id="${button.dataset.designId}"]`,
      );
      if (!row || !viewDialog) return;
      const snapshot = readRowSnapshot(row);
      const fields = buildViewFields(row, snapshot);
      currentViewFields = fields;
      if (viewTitle) {
        viewTitle.textContent =
          snapshot.label || snapshot.brand || "Untitled design";
      }
      setDesignPhoto(
        viewBottlePhoto,
        row.dataset.bottlePhoto,
        "fa-solid fa-bottle-water",
      );
      setDesignPhoto(
        viewEcojoinerPhoto,
        row.dataset.ecojoinerPhoto,
        "fa-solid fa-turtle",
      );
      if (viewSpecs) {
        viewSpecs.innerHTML = fields
          .map(
            ([label, value]) =>
              `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd>`,
          )
          .join("");
      }
      const feedback = viewDialog.querySelector("[data-eco-view-feedback]");
      if (feedback) feedback.hidden = true;
      viewDialog.showModal();
      closeAllRowMenus();
    });
  });

  viewCopyButton?.addEventListener("click", async () => {
    if (!currentViewFields) return;
    const text = currentViewFields
      .map(([label, value]) => `${label}: ${value}`)
      .join("\n");
    const feedback = viewDialog.querySelector("[data-eco-view-feedback]");
    try {
      await navigator.clipboard.writeText(text);
      if (feedback) {
        feedback.textContent = "Specs copied to clipboard.";
        feedback.classList.remove("is-error");
        feedback.classList.add("is-success");
        feedback.hidden = false;
      }
    } catch {
      window.prompt("Copy these specs:", text);
    }
  });

  viewDialog
    ?.querySelectorAll("[data-close-eco-view]")
    .forEach((btn) => btn.addEventListener("click", () => viewDialog.close()));

  const editDialog = document.getElementById("ecoDesignEditDialog");
  const editForm = editDialog?.querySelector("[data-eco-edit-form]");
  const editConnectionSlider = editForm?.querySelector(
    "[data-eco-edit-connection]",
  );
  const editConnectionMmInput = editForm?.querySelector(
    "[data-eco-edit-connection-mm]",
  );
  const editConnectionValueLabel = editForm?.querySelector(
    "[data-eco-edit-connection-value]",
  );
  const editBottlePhotoPreview = editForm?.querySelector(
    "[data-eco-edit-bottle-photo-preview]",
  );
  const editBottlePhotoPreviewImg = editForm?.querySelector(
    "[data-eco-edit-bottle-photo-preview-img]",
  );
  const editEcojoinerPhotoPreview = editForm?.querySelector(
    "[data-eco-edit-ecojoiner-photo-preview]",
  );
  const editEcojoinerPhotoPreviewImg = editForm?.querySelector(
    "[data-eco-edit-ecojoiner-photo-preview-img]",
  );
  let editDesignId = null;
  let editEcojoinerType = null;
  let editVisibility = null;

  const setPhotoPreview = (container, img, url) => {
    if (!container || !img) return;
    if (url) {
      img.src = url;
      container.hidden = false;
    } else {
      img.src = "";
      container.hidden = true;
    }
  };

  const applyEditConnectionStep = () => {
    if (!editConnectionSlider) return;
    const step =
      CONNECTION_STEPS[Number(editConnectionSlider.value)] ||
      CONNECTION_STEPS[1];
    if (editConnectionMmInput) editConnectionMmInput.value = String(step.mm);
    if (editConnectionValueLabel)
      editConnectionValueLabel.textContent = step.label;
  };

  editConnectionSlider?.addEventListener("input", applyEditConnectionStep);

  document.querySelectorAll("[data-edit-eco-design]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = document.querySelector(
        `[data-eco-design-row][data-design-id="${button.dataset.designId}"]`,
      );
      if (!row || !editForm) return;
      const snapshot = readRowSnapshot(row);
      editDesignId = row.dataset.designId;
      editEcojoinerType = row.dataset.ecojoinerType || "6fc";
      editVisibility = row.dataset.visibility || "private";
      editForm.querySelectorAll("[data-eco-edit-field]").forEach((field) => {
        const key = field.dataset.ecoEditField;
        const value = snapshot[key];
        field.value = value === undefined || value === null ? "" : value;
      });
      if (editConnectionSlider) {
        editConnectionSlider.value = String(
          connectionStepIndexForMm(snapshot.port_fit_mm ?? 0),
        );
        applyEditConnectionStep();
      }
      setPhotoPreview(
        editBottlePhotoPreview,
        editBottlePhotoPreviewImg,
        row.dataset.bottlePhoto,
      );
      setPhotoPreview(
        editEcojoinerPhotoPreview,
        editEcojoinerPhotoPreviewImg,
        row.dataset.ecojoinerPhoto,
      );
      editForm.querySelectorAll('input[type="file"]').forEach((input) => {
        input.value = "";
      });
      const feedback = editForm.querySelector("[data-eco-edit-feedback]");
      if (feedback) feedback.hidden = true;
      editDialog.showModal();
      closeAllRowMenus();
    });
  });

  editDialog
    ?.querySelectorAll("[data-close-eco-edit]")
    .forEach((btn) =>
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        editDialog.close();
      }),
    );

  editForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editDesignId) return;
    const feedback = editForm.querySelector("[data-eco-edit-feedback]");
    const submitButton = editForm.querySelector('button[type="submit"]');
    const formData = new FormData(editForm);
    formData.set("ecojoinerType", editEcojoinerType || "6fc");
    formData.set("visibility", editVisibility || "private");
    if (submitButton) submitButton.disabled = true;
    try {
      const response = await fetch(
        `/api/ecojoiner/designs/${encodeURIComponent(editDesignId)}`,
        { method: "PUT", body: formData },
      );
      const json = await parseJsonResponse(response);
      if (!response.ok || !json.success) {
        throw new Error(json.message || "Unable to save changes.");
      }
      const row = document.querySelector(
        `[data-eco-design-row][data-design-id="${editDesignId}"]`,
      );
      if (row) {
        const snapshot = readRowSnapshot(row);
        editForm.querySelectorAll("[data-eco-edit-field]").forEach((field) => {
          const key = field.dataset.ecoEditField;
          if (field.value === "") return;
          const numeric = field.type === "number";
          snapshot[key] = numeric ? Number(field.value) : field.value;
        });
        if (editConnectionMmInput)
          snapshot.port_fit_mm = Number(editConnectionMmInput.value) || 0;
        row.dataset.snapshot = JSON.stringify(snapshot);
        const labelEl = row.querySelector(".design-cell__label");
        if (labelEl)
          labelEl.textContent =
            snapshot.label || snapshot.brand || "Untitled design";

        // The save response doesn't carry photo URLs (they're only
        // resolved via a join against photos_tb), so when a new photo was
        // actually chosen, pull the freshly joined URL from the designs
        // list rather than trying to guess it client-side.
        const bottlePhotoInput = editForm.querySelector(
          'input[type="file"][name="bottle_photo"]',
        );
        const ecojoinerPhotoInput = editForm.querySelector(
          'input[type="file"][name="ecojoiner_photo"]',
        );
        if (bottlePhotoInput?.files?.length || ecojoinerPhotoInput?.files?.length) {
          try {
            const listResponse = await fetch("/api/ecojoiner/designs");
            const listJson = await parseJsonResponse(listResponse);
            const updated = Array.isArray(listJson.data)
              ? listJson.data.find(
                  (design) => String(design.design_id) === editDesignId,
                )
              : null;
            if (updated) {
              row.dataset.bottlePhoto = updated.bottle_photo_url || "";
              row.dataset.ecojoinerPhoto = updated.ecojoiner_photo_url || "";
              const bottleCell = row.querySelector(
                '.design-photo[title="Bottle"]',
              );
              const ecojoinerCell = row.querySelector(
                '.design-photo[title="Ecojoiner"]',
              );
              setDesignPhoto(
                bottleCell,
                updated.bottle_photo_url,
                "fa-solid fa-bottle-water",
              );
              setDesignPhoto(
                ecojoinerCell,
                updated.ecojoiner_photo_url,
                "fa-solid fa-turtle",
              );
            }
          } catch (refreshError) {
            console.error(
              "Unable to refresh design photos after save",
              refreshError,
            );
          }
        }
      }
      editDialog.close();
    } catch (error) {
      if (feedback) {
        feedback.textContent = error?.message || "Unable to save changes.";
        feedback.classList.remove("is-success");
        feedback.classList.add("is-error");
        feedback.hidden = false;
      } else {
        window.alert(error?.message || "Unable to save changes.");
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  // --- Row action menus (cog button + popup) --------------------------------
  const closeAllRowMenus = () => {
    document.querySelectorAll("[data-row-menu-panel]").forEach((panel) => {
      panel.hidden = true;
    });
    document.querySelectorAll("[data-row-menu-trigger]").forEach((trigger) => {
      trigger.setAttribute("aria-expanded", "false");
    });
  };

  // The panel is `position: fixed` (see main.css) so it can escape the
  // table's `overflow-x: auto` clipping and always paint above whatever
  // follows the table in the document (e.g. the "Saved bottle profiles"
  // list). Position it here, relative to the viewport, from the trigger's
  // own rect rather than relying on normal-flow placement under it.
  const positionRowMenuPanel = (trigger, panel) => {
    const rect = trigger.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 6}px`;
    const left = rect.right - panel.offsetWidth;
    panel.style.left = `${Math.max(8, left)}px`;
  };

  document.querySelectorAll("[data-row-menu]").forEach((menu) => {
    const trigger = menu.querySelector("[data-row-menu-trigger]");
    const panel = menu.querySelector("[data-row-menu-panel]");
    if (!trigger || !panel) return;
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = !panel.hidden;
      closeAllRowMenus();
      if (!isOpen) {
        panel.hidden = false;
        positionRowMenuPanel(trigger, panel);
        trigger.setAttribute("aria-expanded", "true");
      }
    });
  });

  document.addEventListener("click", () => closeAllRowMenus());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllRowMenus();
  });
  window.addEventListener("scroll", () => closeAllRowMenus(), true);
  window.addEventListener("resize", () => closeAllRowMenus());
})();
