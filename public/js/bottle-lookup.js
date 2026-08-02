const bottleLookupPage = document.querySelector("[data-bottle-lookup-page]");
const bottleLookupForm = document.querySelector("[data-bottle-lookup-form]");
const bottleLookupInput = document.querySelector("[data-bottle-lookup-input]");
const bottleLookupSubmit = document.querySelector(
  "[data-bottle-lookup-submit]",
);
const bottleLookupFeedback = document.querySelector(
  "[data-bottle-lookup-feedback]",
);
const bottleLookupResults = document.querySelector(
  "[data-bottle-lookup-results]",
);
const bottleLookupList = document.querySelector("[data-bottle-lookup-list]");
const bottleLookupEmpty = document.querySelector(
  "[data-bottle-lookup-empty]",
);

const bottleLookupModal = document.getElementById("bottleLookupModal");
const bottleLookupModalSerial = document.querySelector(
  "[data-bottle-lookup-modal-serial]",
);
const bottleLookupModalStatus = document.querySelector(
  "[data-bottle-lookup-modal-status]",
);
const bottleLookupModalPhoto = document.querySelector(
  "[data-bottle-lookup-modal-photo]",
);
const bottleLookupModalPhotoImg = document.querySelector(
  "[data-bottle-lookup-modal-photo-img]",
);
const bottleLookupModalDetails = document.querySelector(
  "[data-bottle-lookup-modal-details]",
);
const closeBottleLookupModalButtons = bottleLookupModal
  ? bottleLookupModal.querySelectorAll("[data-close-bottle-lookup-modal]")
  : [];

let bottleLookupCurrentResults = [];

const setFeedback = (message, isError) => {
  if (!bottleLookupFeedback) return;
  bottleLookupFeedback.textContent = message || "";
  bottleLookupFeedback.hidden = !message;
  bottleLookupFeedback.classList.toggle("is-error", Boolean(isError));
  bottleLookupFeedback.classList.toggle(
    "is-success",
    Boolean(message) && !isError,
  );
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

const renderResults = (bottles) => {
  if (!bottleLookupList) return;
  bottleLookupList.innerHTML = "";

  if (!bottles.length) {
    if (bottleLookupEmpty) bottleLookupEmpty.hidden = false;
    return;
  }

  if (bottleLookupEmpty) bottleLookupEmpty.hidden = true;

  bottles.forEach((bottle) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "turtle-bottle-card bottle-lookup-result";
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

    button.addEventListener("click", () => openBottleLookupModal(bottle));
    item.appendChild(button);
    bottleLookupList.appendChild(item);
  });
};

const openBottleLookupModal = (bottle) => {
  if (!bottleLookupModal) return;

  if (bottleLookupModalSerial) {
    bottleLookupModalSerial.textContent = `Bottle #${bottle.serial_number}`;
  }
  if (bottleLookupModalStatus) {
    bottleLookupModalStatus.textContent = `${formatStatus(bottle.status)}${bottle.verified ? " · Verified" : ""}`;
  }

  if (bottleLookupModalPhoto && bottleLookupModalPhotoImg) {
    if (bottle.basic_photo_url) {
      bottleLookupModalPhotoImg.src = bottle.basic_photo_url;
      bottleLookupModalPhoto.hidden = false;
    } else {
      bottleLookupModalPhoto.hidden = true;
    }
  }

  if (bottleLookupModalDetails) {
    const rows = [
      ["Mission", bottle.mission_name],
      ["Carried by turtle", bottle.turtle_name],
      ["Launch hub", bottle.hub_name],
      ["Contents", bottle.contents],
      ["Brand", bottle.brand],
      ["Volume", bottle.volume_ml ? `${bottle.volume_ml} mL` : null],
      ["Date packed", bottle.date_packed ? formatDate(bottle.date_packed) : null],
    ].filter(([, value]) => Boolean(value));

    bottleLookupModalDetails.innerHTML = rows
      .map(
        ([label, value]) =>
          `<dt>${label}</dt><dd>${value}</dd>`,
      )
      .join("");
  }

  if (typeof bottleLookupModal.showModal === "function") {
    bottleLookupModal.showModal();
  }
};

closeBottleLookupModalButtons.forEach((button) => {
  button.addEventListener("click", () => bottleLookupModal.close());
});

if (bottleLookupModal) {
  bottleLookupModal.addEventListener("click", (event) => {
    if (event.target === bottleLookupModal) {
      bottleLookupModal.close();
    }
  });
}

if (bottleLookupForm) {
  bottleLookupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const serial = (bottleLookupInput?.value || "").trim();

    if (serial.length < 2) {
      setFeedback("Please enter at least 2 characters of the serial number.", true);
      return;
    }

    setFeedback("Searching…", false);
    if (bottleLookupSubmit) bottleLookupSubmit.disabled = true;

    try {
      const response = await fetch(
        `/api/bottle-lookup?serial=${encodeURIComponent(serial)}`,
      );
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.message || "Unable to search for that bottle.");
      }

      bottleLookupCurrentResults = json.data || [];
      setFeedback("", false);

      if (bottleLookupPage) bottleLookupPage.classList.add("has-results");
      if (bottleLookupResults) bottleLookupResults.hidden = false;

      renderResults(bottleLookupCurrentResults);
    } catch (error) {
      setFeedback(error?.message || "Unable to search for that bottle.", true);
    } finally {
      if (bottleLookupSubmit) bottleLookupSubmit.disabled = false;
    }
  });
}
