const lookupPage = document.querySelector("[data-lookup-page]");
const lookupTabs = document.querySelectorAll("[data-lookup-tab]");
const lookupPanels = document.querySelectorAll("[data-lookup-panel]");
const lookupFeedback = document.querySelector("[data-lookup-feedback]");
const lookupResults = document.querySelector("[data-lookup-results]");
const lookupResultsTitle = document.querySelector("[data-lookup-results-title]");
const lookupList = document.querySelector("[data-lookup-list]");
const lookupEmpty = document.querySelector("[data-lookup-empty]");

const bottleModal = document.getElementById("bottleLookupModal");
const bottleModalSerial = document.querySelector("[data-bottle-lookup-modal-serial]");
const bottleModalStatus = document.querySelector("[data-bottle-lookup-modal-status]");
const bottleModalPhoto = document.querySelector("[data-bottle-lookup-modal-photo]");
const bottleModalPhotoImg = document.querySelector("[data-bottle-lookup-modal-photo-img]");
const bottleModalDetails = document.querySelector("[data-bottle-lookup-modal-details]");
const closeBottleModalButtons = bottleModal
  ? bottleModal.querySelectorAll("[data-close-bottle-lookup-modal]")
  : [];

const turtleModal = document.getElementById("turtleLookupModal");
const turtleModalName = document.querySelector("[data-turtle-lookup-modal-name]");
const turtleModalStatus = document.querySelector("[data-turtle-lookup-modal-status]");
const turtleModalPhoto = document.querySelector("[data-turtle-lookup-modal-photo]");
const turtleModalPhotoImg = document.querySelector("[data-turtle-lookup-modal-photo-img]");
const turtleModalDetails = document.querySelector("[data-turtle-lookup-modal-details]");
const closeTurtleModalButtons = turtleModal
  ? turtleModal.querySelectorAll("[data-close-turtle-lookup-modal]")
  : [];

const setFeedback = (message, isError) => {
  if (!lookupFeedback) return;
  lookupFeedback.textContent = message || "";
  lookupFeedback.hidden = !message;
  lookupFeedback.classList.toggle("is-error", Boolean(isError));
  lookupFeedback.classList.toggle("is-success", Boolean(message) && !isError);
};

const formatDate = (value) => {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatStatus = (status) =>
  (status || "unknown")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const switchLookupTab = (type) => {
  lookupTabs.forEach((tab) => {
    const isActive = tab.dataset.lookupTab === type;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
    tab.tabIndex = isActive ? 0 : -1;
  });

  lookupPanels.forEach((panel) => {
    panel.hidden = panel.dataset.lookupPanel !== type;
  });

  setFeedback("", false);
  if (lookupResults) lookupResults.hidden = true;
  if (lookupPage) lookupPage.classList.remove("has-results");
};

lookupTabs.forEach((tab) => {
  tab.addEventListener("click", () => switchLookupTab(tab.dataset.lookupTab));
});

const renderBottleResults = (bottles) => {
  if (!lookupList) return;
  lookupList.innerHTML = "";

  if (!bottles.length) {
    if (lookupEmpty) lookupEmpty.hidden = false;
    return;
  }

  if (lookupEmpty) lookupEmpty.hidden = true;

  bottles.forEach((bottle) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "turtle-bottle-card lookup-result";
    button.dataset.bottleId = bottle.bottle_id;

    const photoMarkup = bottle.basic_photo_url
      ? `<div class="turtle-bottle-card__photo"><img src="${bottle.basic_photo_url}" alt="" /></div>`
      : `<div class="turtle-bottle-card__photo turtle-bottle-card__photo--placeholder"><span class="turtle-bottle-card__placeholder">No photo</span></div>`;

    button.innerHTML = `
      ${photoMarkup}
      <div class="turtle-bottle-card__body">
        <h3>#${bottle.serial_number}</h3>
        <p class="turtle-bottle-card__contents">${formatStatus(bottle.status)}${bottle.mission_name ? ` &middot; ${bottle.mission_name}` : ""}</p>
      </div>
    `;

    button.addEventListener("click", () => openBottleModal(bottle));
    item.appendChild(button);
    lookupList.appendChild(item);
  });
};

const renderTurtleResults = (turtles) => {
  if (!lookupList) return;
  lookupList.innerHTML = "";

  if (!turtles.length) {
    if (lookupEmpty) lookupEmpty.hidden = false;
    return;
  }

  if (lookupEmpty) lookupEmpty.hidden = true;

  turtles.forEach((turtle) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "turtle-bottle-card lookup-result";
    button.dataset.turtleId = turtle.turtle_id;

    const photoMarkup = turtle.profile_photo_url
      ? `<div class="turtle-bottle-card__photo"><img src="${turtle.profile_photo_url}" alt="" /></div>`
      : `<div class="turtle-bottle-card__photo turtle-bottle-card__photo--placeholder"><span class="turtle-bottle-card__placeholder">No photo</span></div>`;

    button.innerHTML = `
      ${photoMarkup}
      <div class="turtle-bottle-card__body">
        <h3>${turtle.name}</h3>
        <p class="turtle-bottle-card__contents">${formatStatus(turtle.status)}${turtle.mission_name ? ` &middot; ${turtle.mission_name}` : ""}</p>
      </div>
    `;

    button.addEventListener("click", () => openTurtleModal(turtle));
    item.appendChild(button);
    lookupList.appendChild(item);
  });
};

const openBottleModal = (bottle) => {
  if (!bottleModal) return;

  if (bottleModalSerial) {
    bottleModalSerial.textContent = `Bottle #${bottle.serial_number}`;
  }
  if (bottleModalStatus) {
    bottleModalStatus.textContent = `${formatStatus(bottle.status)}${bottle.verified ? " · Verified" : ""}`;
  }

  if (bottleModalPhoto && bottleModalPhotoImg) {
    if (bottle.basic_photo_url) {
      bottleModalPhotoImg.src = bottle.basic_photo_url;
      bottleModalPhoto.hidden = false;
    } else {
      bottleModalPhoto.hidden = true;
    }
  }

  if (bottleModalDetails) {
    const rows = [
      ["Mission", bottle.mission_name],
      ["Carried by turtle", bottle.turtle_name],
      ["Launch hub", bottle.hub_name],
      ["Contents", bottle.contents],
      ["Brand", bottle.brand],
      ["Volume", bottle.volume_ml ? `${bottle.volume_ml} mL` : null],
      ["Date packed", bottle.date_packed ? formatDate(bottle.date_packed) : null],
    ].filter(([, value]) => Boolean(value));

    bottleModalDetails.innerHTML = rows.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("");
  }

  if (typeof bottleModal.showModal === "function") {
    bottleModal.showModal();
  }
};

const openTurtleModal = (turtle) => {
  if (!turtleModal) return;

  if (turtleModalName) {
    turtleModalName.textContent = turtle.name;
  }
  if (turtleModalStatus) {
    turtleModalStatus.textContent = formatStatus(turtle.status);
  }

  if (turtleModalPhoto && turtleModalPhotoImg) {
    if (turtle.profile_photo_url) {
      turtleModalPhotoImg.src = turtle.profile_photo_url;
      turtleModalPhoto.hidden = false;
    } else {
      turtleModalPhoto.hidden = true;
    }
  }

  if (turtleModalDetails) {
    const rows = [
      ["Mission", turtle.mission_name],
      ["Launch hub", turtle.hub_name],
    ].filter(([, value]) => Boolean(value));

    turtleModalDetails.innerHTML = rows.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("");
  }

  if (typeof turtleModal.showModal === "function") {
    turtleModal.showModal();
  }
};

closeBottleModalButtons.forEach((button) => {
  button.addEventListener("click", () => bottleModal.close());
});

if (bottleModal) {
  bottleModal.addEventListener("click", (event) => {
    if (event.target === bottleModal) {
      bottleModal.close();
    }
  });
}

closeTurtleModalButtons.forEach((button) => {
  button.addEventListener("click", () => turtleModal.close());
});

if (turtleModal) {
  turtleModal.addEventListener("click", (event) => {
    if (event.target === turtleModal) {
      turtleModal.close();
    }
  });
}

const lookupConfig = {
  bottles: {
    endpoint: "/api/lookup/bottles",
    param: "serial",
    minLength: 2,
    minLengthMessage: "Please enter at least 2 characters of the serial number.",
    errorMessage: "Unable to search for that bottle.",
    emptyMessage: "No bottles found with that serial number.",
    resultsTitle: "Matching bottles",
    render: renderBottleResults,
  },
  turtles: {
    endpoint: "/api/lookup/turtles",
    param: "q",
    minLength: 2,
    minLengthMessage: "Please enter at least 2 characters of the turtle's serial number or name.",
    errorMessage: "Unable to search for that turtle.",
    emptyMessage: "No turtles found with that serial number or name.",
    resultsTitle: "Matching turtles",
    render: renderTurtleResults,
  },
};

document.querySelectorAll("[data-lookup-form]").forEach((form) => {
  const type = form.dataset.lookupForm;
  const config = lookupConfig[type];
  if (!config) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const input = form.querySelector(`[data-lookup-input="${type}"]`);
    const submitButton = form.querySelector(`[data-lookup-submit="${type}"]`);
    const value = (input?.value || "").trim();

    if (value.length < config.minLength) {
      setFeedback(config.minLengthMessage, true);
      return;
    }

    setFeedback("Searching…", false);
    if (submitButton) submitButton.disabled = true;

    try {
      const response = await fetch(`${config.endpoint}?${config.param}=${encodeURIComponent(value)}`);
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.message || config.errorMessage);
      }

      setFeedback("", false);

      if (lookupPage) lookupPage.classList.add("has-results");
      if (lookupResults) lookupResults.hidden = false;
      if (lookupResultsTitle) lookupResultsTitle.textContent = config.resultsTitle;
      if (lookupEmpty) lookupEmpty.textContent = config.emptyMessage;

      config.render(json.data || []);
    } catch (error) {
      setFeedback(error?.message || config.errorMessage, true);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
});
