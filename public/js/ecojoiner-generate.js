/* Ecojoiner spec generator — form UX, inline validation, and the two-step
   generate flow: POST /api/ecojoiner/validate to preview the derived
   dimensions, then POST /api/ecojoiner/generate to write the download files. */
(function () {
  const form = document.getElementById("eco-generate");
  if (!form) return;

  const el = (id) => document.getElementById(id);

  // Localized strings for everything this script writes into the page. The view
  // injects the current language's `gen_*` keys; the English defaults below are
  // only a safety net if that block is missing.
  const STRINGS = (() => {
    const defaults = {
      gen_fb_volume_big:
        "This bottle size might be too big for our generator's logic.",
      gen_fb_volume_small: "This may be too small for the system.",
      gen_fb_volume_ok: "Great — a workable bottle volume.",
      gen_fb_looks_wrong: "This doesn't look right.",
      gen_fb_looks_good: "Looks good.",
      gen_fb_tapper_long:
        "That's a long top tapper — not an ideal bottle type. Aim for under 20%.",
      gen_fb_tapper_tall:
        "A touch tall — ideally the top tapper is under 20% of the height.",
      gen_fb_tapper_ok: "Nice short tapper.",
      gen_fb_bottom_deep:
        "That's a deep bottom tapper — not the ideal bottle type.",
      gen_fb_bottom_ok: "Nice flat base.",
      gen_fb_material_solid: "Nice. This will last months at sea.",
      gen_fb_material_pallet:
        "Great choice! Pallette wood is easy to find around the world, organic and often free! Look for boards under 1.5cm thick.",
      gen_fb_material_proto: "Good for prototyping. Duration at sea is weeks.",
      gen_fb_material_plastic:
        "Not a good choice. Plastic will degrade into microplastics and toxins in the ocean environment.",
      gen_fb_thickness_bad:
        "That thickness doesn't look right — aim for 8–25mm.",
      gen_fb_thickness_ok: "Good thickness.",
      gen_fb_fabrication_ok: "Fabrication selected.",
      gen_alert_type_dev:
        "This ecojoiner type is still in development. For now, please choose the Normal Ecojoiner (6FC).",
      gen_alert_save_dev:
        "Saving ecojoiners is still in development. Hold tight!",
      gen_res_title: "Your ecojoiner, worked out",
      gen_res_lede:
        "Ecojoiner v{version} — check these against your bottle and your board before you cut anything.",
      gen_res_parts_title: "Parts to cut",
      gen_res_confirm: "Generate my files",
      gen_res_ready_title: "Your ecojoiner is ready",
      gen_res_ready_lede:
        "Print the carpenter sheet at 100% scale — the SVG cutting files are 1:1 in millimetres.",
      gen_res_retention:
        "Files are kept for 7 days — download them now and keep a copy.",
      gen_res_working: "Working out your cuts…",
      gen_res_generating: "Generating…",
      gen_res_err_derive: "We could not work out these measurements.",
      gen_res_err_generate: "We could not generate your files.",
      gen_res_err_network:
        "We could not reach the generator. Please try again.",
      gen_dim_port_length: "Port length",
      gen_dim_john_length: "John length",
      gen_dim_john_height: "John height",
      gen_dim_slot_width: "Slot width",
      gen_dim_slot_depth_std: "Standard slot depth",
      gen_dim_slot_depth_master: "Master slot depth",
      gen_dim_final_key: "Final Key",
      gen_dim_presser: "Presser diameter",
      gen_dim_screw: "Screw pilot hole",
      gen_save_profile_btn: "Save bottle profile",
      gen_save_profile_saving: "Saving…",
      gen_save_profile_success: "Bottle profile saved.",
      gen_save_profile_missing_fields:
        "Fill in the bottle brand and specs above before saving.",
      gen_save_profile_error: "We could not save this bottle profile.",
    };
    const node = document.getElementById("eco-i18n");
    if (!node) return defaults;
    try {
      return Object.assign(defaults, JSON.parse(node.textContent));
    } catch (error) {
      return defaults;
    }
  })();

  const s = (key) => STRINGS[key] || "";

  // Read a numeric field. Returns null when empty / not a number.
  const num = (id) => {
    const node = el(id);
    if (!node || node.value.trim() === "") return null;
    const value = Number(node.value);
    return Number.isFinite(value) ? value : null;
  };

  const ICONS = {
    ok: '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> ',
    warn: '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ',
    error: '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> ',
  };

  // Paint the inline feedback line beneath a field.
  const setFeedback = (key, level, msg) => {
    const node = form.querySelector(`.eco-feedback[data-for="${key}"]`);
    if (!node) return;
    node.classList.remove(
      "eco-feedback--ok",
      "eco-feedback--warn",
      "eco-feedback--error",
    );
    if (!level || !msg) {
      node.innerHTML = "";
      return;
    }
    node.classList.add(`eco-feedback--${level}`);
    node.innerHTML = (ICONS[level] || "") + msg;
  };

  // Each validator sets its own feedback and returns whether the field is
  // acceptable for generation (soft warnings still return true).
  const validators = {
    "eco-brand": () => {
      const node = el("eco-brand");
      const filled = node && node.value.trim() !== "";
      setFeedback("eco-brand", "", "");
      return filled;
    },

    "eco-volume": () => {
      const v = num("eco-volume");
      if (v === null) return (setFeedback("eco-volume", "", ""), false);
      if (v > 3000) {
        setFeedback("eco-volume", "warn", s("gen_fb_volume_big"));
        return false;
      }
      if (v < 500) {
        setFeedback("eco-volume", "warn", s("gen_fb_volume_small"));
        return false;
      }
      setFeedback("eco-volume", "ok", s("gen_fb_volume_ok"));
      return true;
    },

    "eco-diameter": () => {
      const v = num("eco-diameter");
      if (v === null) return (setFeedback("eco-diameter", "", ""), false);
      if (v < 60 || v > 200) {
        setFeedback("eco-diameter", "error", s("gen_fb_looks_wrong"));
        return false;
      }
      setFeedback("eco-diameter", "ok", s("gen_fb_looks_good"));
      return true;
    },

    "eco-cap": () => {
      const v = num("eco-cap");
      if (v === null) return (setFeedback("eco-cap", "", ""), false);
      if (v < 25 || v > 40) {
        setFeedback("eco-cap", "error", s("gen_fb_looks_wrong"));
        return false;
      }
      setFeedback("eco-cap", "ok", s("gen_fb_looks_good"));
      return true;
    },

    "eco-collar": () => {
      const v = num("eco-collar");
      if (v === null) return (setFeedback("eco-collar", "", ""), false);
      if (v < 25 || v > 45) {
        setFeedback("eco-collar", "error", s("gen_fb_looks_wrong"));
        return false;
      }
      setFeedback("eco-collar", "ok", s("gen_fb_looks_good"));
      return true;
    },

    "eco-height": () => {
      const v = num("eco-height");
      if (v === null || v <= 0)
        return (setFeedback("eco-height", "", ""), false);
      setFeedback("eco-height", "ok", s("gen_fb_looks_good"));
      return true;
    },

    // Top tapper: soft warnings only. Ideal < 20% of bottle height, flag > 25%.
    "eco-top-tapper": () => {
      const v = num("eco-top-tapper");
      const height = num("eco-height");
      if (v === null) return (setFeedback("eco-top-tapper", "", ""), false);
      if (height && height > 0) {
        const ratio = v / height;
        if (ratio > 0.25) {
          setFeedback("eco-top-tapper", "warn", s("gen_fb_tapper_long"));
          return true;
        }
        if (ratio > 0.2) {
          setFeedback("eco-top-tapper", "warn", s("gen_fb_tapper_tall"));
          return true;
        }
      }
      setFeedback("eco-top-tapper", "ok", s("gen_fb_tapper_ok"));
      return true;
    },

    // Bottom tapper: soft warning when over 15% of bottle height.
    "eco-bottom-tapper": () => {
      const v = num("eco-bottom-tapper");
      const height = num("eco-height");
      if (v === null) return (setFeedback("eco-bottom-tapper", "", ""), false);
      if (height && height > 0 && v / height > 0.15) {
        setFeedback("eco-bottom-tapper", "warn", s("gen_fb_bottom_deep"));
        return true;
      }
      setFeedback("eco-bottom-tapper", "ok", s("gen_fb_bottom_ok"));
      return true;
    },

    "eco-material": () => {
      const value = el("eco-material").value;
      if (!value) return (setFeedback("eco-material", "", ""), false);
      if (value === "solid-wood") {
        setFeedback("eco-material", "ok", s("gen_fb_material_solid"));
      } else if (value === "pallet-wood") {
        setFeedback("eco-material", "ok", s("gen_fb_material_pallet"));
      } else if (value === "plywood" || value === "particle-board") {
        setFeedback("eco-material", "warn", s("gen_fb_material_proto"));
      } else if (value === "plastic") {
        setFeedback("eco-material", "error", s("gen_fb_material_plastic"));
      } else {
        setFeedback("eco-material", "", "");
      }
      return true;
    },

    // Descriptive guidance says 8–25mm; the stated error bounds were
    // contradictory, so we hard-flag outside a permissive 4–26mm window.
    "eco-thickness": () => {
      const v = num("eco-thickness");
      if (v === null) return (setFeedback("eco-thickness", "", ""), false);
      if (v < 4 || v > 26) {
        setFeedback("eco-thickness", "error", s("gen_fb_thickness_bad"));
        return false;
      }
      setFeedback("eco-thickness", "ok", s("gen_fb_thickness_ok"));
      return true;
    },

    "eco-fabrication": () => {
      const chosen =
        el("eco-fab-carpentry").checked ||
        el("eco-fab-3d").checked ||
        el("eco-fab-dxf").checked ||
        el("eco-fab-svg").checked;
      if (!chosen) return (setFeedback("eco-fabrication", "", ""), false);
      setFeedback("eco-fabrication", "ok", s("gen_fb_fabrication_ok"));
      return true;
    },

    "eco-type": () => {
      const value = el("eco-type").value;
      if (!value) return (setFeedback("eco-type", "", ""), false);
      setFeedback("eco-type", "", "");
      return true;
    },
  };

  // Run one validator by key.
  const check = (key) => (validators[key] ? validators[key]() : true);

  // Live feedback as the user edits.
  const WHOLE_NUMBER_IDS = [
    "eco-volume",
    "eco-diameter",
    "eco-cap",
    "eco-collar",
    "eco-height",
    "eco-top-tapper",
    "eco-bottom-tapper",
  ];
  form.addEventListener("input", (event) => {
    const key = event.target.id;
    if (WHOLE_NUMBER_IDS.includes(key) && event.target.value.includes(".")) {
      event.target.value = event.target.value.split(".")[0];
    }
    if (validators[key]) check(key);
    // Tapper ratios depend on height, so re-run them when height changes.
    if (key === "eco-height") {
      if (el("eco-top-tapper").value !== "") check("eco-top-tapper");
      if (el("eco-bottom-tapper").value !== "") check("eco-bottom-tapper");
    }
  });
  const FAB_IDS = [
    "eco-fab-carpentry",
    "eco-fab-3d",
    "eco-fab-dxf",
    "eco-fab-svg",
  ];
  form.addEventListener("change", (event) => {
    if (event.target.id === "eco-material") check("eco-material");
    if (FAB_IDS.includes(event.target.id)) check("eco-fabrication");
  });

  // --- Connection (port fit) slider -----------------------------------------
  // Slider position 0-4 maps to a port-width offset in mm applied against the
  // bottle diameter: Loose adds 1mm, each step tighter removes 1mm more.
  const CONNECTION_STEPS = [
    { mm: 1, key: "gen_connection_loose" },
    { mm: 0, key: "gen_connection_exact" },
    { mm: -1, key: "gen_connection_snug" },
    { mm: -2, key: "gen_connection_tight" },
    { mm: -3, key: "gen_connection_supertight" },
  ];
  const connectionSlider = el("eco-connection");
  const connectionMmInput = el("eco-connection-mm");
  const connectionValueLabel = document.querySelector(
    "[data-eco-connection-value]",
  );
  const applyConnectionStep = () => {
    if (!connectionSlider) return;
    const step =
      CONNECTION_STEPS[Number(connectionSlider.value)] || CONNECTION_STEPS[1];
    if (connectionMmInput) connectionMmInput.value = String(step.mm);
    if (connectionValueLabel) connectionValueLabel.textContent = s(step.key);
  };
  if (connectionSlider) {
    applyConnectionStep();
    connectionSlider.addEventListener("input", applyConnectionStep);
  }

  // Visual ecojoiner-type picker. Only the "Normal" card is available; the rest
  // are still in development and just alert the user when clicked.
  const typeCards = Array.from(form.querySelectorAll(".eco-type-card"));
  typeCards.forEach((card) => {
    card.addEventListener("click", () => {
      if (card.dataset.available !== "true") {
        window.alert(s("gen_alert_type_dev"));
        return;
      }
      typeCards.forEach((c) => {
        c.classList.toggle("eco-type-card--selected", c === card);
        if (c.getAttribute("role") === "radio")
          c.setAttribute("aria-checked", String(c === card));
      });
      el("eco-type").value = card.dataset.type;
      check("eco-type");
    });
  });

  // --- Generation flow -----------------------------------------------------

  const results = el("eco-results");
  const submitBtn = el("eco-generate-btn");
  const submitLabel = submitBtn ? submitBtn.innerHTML : "";

  const esc = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  // Trim trailing zeros so 61.0 reads as 61mm.
  const mm = (value) =>
    value === null || value === undefined
      ? "—"
      : `${Number(value.toFixed(2))}mm`;

  const busy = (isBusy, label) => {
    if (!submitBtn) return;
    submitBtn.disabled = isBusy;
    submitBtn.innerHTML = isBusy
      ? `<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> ${label}`
      : submitLabel;
  };

  const showResults = (html) => {
    if (!results) return;
    results.innerHTML = html;
    results.hidden = false;
    results.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const hideResults = () => {
    if (!results) return;
    results.hidden = true;
    results.innerHTML = "";
  };

  const renderErrors = (message, errors) =>
    showResults(
      `<div class="eco-results__card eco-results__card--error">
         <h2 class="eco-results__title">
           <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> ${esc(message)}
         </h2>
         <ul class="eco-results__errors">
           ${(errors || []).map((e) => `<li>${esc(e)}</li>`).join("")}
         </ul>
       </div>`,
    );

  // Gather the whole form. Checkboxes send their checked state, not "on".
  const collect = () => ({
    brand: el("eco-brand").value.trim(),
    volume: el("eco-volume").value,
    diameter: el("eco-diameter").value,
    cap: el("eco-cap").value,
    collar: el("eco-collar").value,
    height: el("eco-height").value,
    topTapper: el("eco-top-tapper").value,
    bottomTapper: el("eco-bottom-tapper").value,
    material: el("eco-material").value,
    thickness: el("eco-thickness").value,
    ecojoinerType: el("eco-type").value,
    portFitMm: el("eco-connection-mm").value,
    fabCarpentry: el("eco-fab-carpentry").checked,
    fab3d: el("eco-fab-3d").checked,
    fabDxf: el("eco-fab-dxf").checked,
    fabSvg: el("eco-fab-svg").checked,
    pdfLang: el("eco-pdf-lang") ? el("eco-pdf-lang").value : "en",
  });

  const post = async (path, payload) => {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, body };
  };

  // Builds the multipart body for saving/updating a bottle profile, picking
  // up the photo from Panel 1's own file input (there's no photo field left
  // in any save dialog — the bottle photo always travels with the bottle).
  const profileFormData = (values, extra = {}) => {
    const formData = new FormData();
    Object.entries({
      brand: values.brand,
      volume: values.volume,
      diameter: values.diameter,
      cap: values.cap,
      collar: values.collar,
      height: values.height,
      topTapper: values.topTapper,
      bottomTapper: values.bottomTapper,
      material: values.material,
      thickness: values.thickness,
      portFitMm: values.portFitMm,
      ...extra,
    }).forEach(([key, value]) => {
      if (value !== null && value !== undefined) formData.set(key, value);
    });
    const bottlePhotoInput = el("eco-bottle-photo");
    if (bottlePhotoInput && bottlePhotoInput.files[0]) {
      formData.set("bottle_photo", bottlePhotoInput.files[0]);
    }
    return formData;
  };

  const renderPreview = (data) => {
    const d = data.derived || {};
    const rows = [
      [s("gen_dim_port_length"), mm(d.port_length)],
      [s("gen_dim_john_length"), mm(d.john_length)],
      [s("gen_dim_john_height"), mm(d.john_height)],
      [s("gen_dim_slot_width"), mm(d.slot_width)],
      [s("gen_dim_slot_depth_std"), mm(d.standard_slot_depth)],
      [s("gen_dim_slot_depth_master"), mm(d.master_slot_depth)],
      [
        s("gen_dim_final_key"),
        `${mm(d.final_key_length)} × ${mm(d.final_key_width)}`,
      ],
      [s("gen_dim_presser"), mm(d.presser_diameter)],
      [s("gen_dim_screw"), mm(d.presser_through_hole_diameter)],
    ];

    const lede = s("gen_res_lede").replace(
      "{version}",
      data.design_version || "3.2",
    );

    showResults(
      `<div class="eco-results__card">
         <h2 class="eco-results__title">
           <i class="fa-solid fa-ruler-combined" aria-hidden="true"></i>
           ${esc(s("gen_res_title"))}
         </h2>
         <p class="eco-results__lede">${esc(lede)}</p>
         <dl class="eco-results__dims">
           ${rows
             .map(
               ([label, value]) =>
                 `<div class="eco-results__dim"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`,
             )
             .join("")}
         </dl>
         <h3 class="eco-results__subtitle">${esc(s("gen_res_parts_title"))}</h3>
         <ul class="eco-results__parts">
           ${(data.parts || [])
             .map(
               (p) =>
                 `<li><span>${esc(STRINGS[`gen_part_${p.key}`] || p.part)}</span><strong>×${esc(
                   p.quantity,
                 )}</strong></li>`,
             )
             .join("")}
         </ul>
         <div class="eco-results__actions">
           <button type="button" class="button" id="eco-confirm">
             <i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i> ${esc(
               s("gen_res_confirm"),
             )}
           </button>
         </div>
       </div>`,
    );

    const confirm = el("eco-confirm");
    if (confirm) confirm.addEventListener("click", () => generate(confirm));
  };

  const renderDownloads = (data) => {
    const files = data.files || [];
    showResults(
      `<div class="eco-results__card eco-results__card--done">
         <h2 class="eco-results__title">
           <i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${esc(
             s("gen_res_ready_title"),
           )}
         </h2>
         <p class="eco-results__lede">${esc(s("gen_res_ready_lede"))}</p>
         <ul class="eco-results__files">
           ${files
             .map(
               (f) => `<li>
                 <a href="${esc(f.url)}" download>
                   <span class="eco-results__format">${esc(f.format)}</span>
                   <span>${esc(STRINGS[f.label_key] || f.label)}</span>
                   <i class="fa-solid fa-download" aria-hidden="true"></i>
                 </a>
               </li>`,
             )
             .join("")}
         </ul>
         ${(data.notices || [])
           .map((n) => `<p class="eco-results__notice">${esc(n)}</p>`)
           .join("")}
         <p class="eco-results__notice">${esc(s("gen_res_retention"))}</p>
       </div>`,
    );
  };

  // Set after a successful generate, so Save can persist those exact files
  // (utils/ecojoinerDesignFiles.js::persistDesignFiles) instead of saving a
  // draft with no output yet. Cleared whenever the form changes, since a
  // stale job_slug would point at geometry that no longer matches the form.
  let lastGenerated = null;

  const generate = async (button) => {
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> ${esc(
      s("gen_res_generating"),
    )}`;
    try {
      const { ok, body } = await post("/api/ecojoiner/generate", collect());
      if (!ok || !body.success) {
        renderErrors(body.message || s("gen_res_err_generate"), body.errors);
        return;
      }
      lastGenerated = body.data;
      renderDownloads(body.data);
    } catch (error) {
      renderErrors(s("gen_res_err_network"), [error.message]);
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  };

  // Any edit invalidates the preview, so the user can never download files
  // built from numbers that are no longer on screen.
  form.addEventListener("input", () => {
    hideResults();
    lastGenerated = null;
  });
  form.addEventListener("change", () => {
    hideResults();
    lastGenerated = null;
  });

  // Ensure a panel is open so the user can see a flagged field.
  const openPanelFor = (key) => {
    const feedbackNode = form.querySelector(`.eco-feedback[data-for="${key}"]`);
    const panel = feedbackNode ? feedbackNode.closest(".eco-panel") : null;
    if (panel && !panel.open) panel.open = true;
    return panel;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const order = [
      "eco-brand",
      "eco-volume",
      "eco-diameter",
      "eco-cap",
      "eco-collar",
      "eco-height",
      "eco-top-tapper",
      "eco-bottom-tapper",
      "eco-material",
      "eco-thickness",
      "eco-type",
      "eco-fabrication",
    ];

    let firstInvalid = null;
    order.forEach((key) => {
      const valid = check(key);
      if (!valid && !firstInvalid) firstInvalid = key;
    });

    if (firstInvalid) {
      hideResults();
      const panel = openPanelFor(firstInvalid);
      const focusTarget =
        el(firstInvalid) || (panel && panel.querySelector("input, select"));
      if (focusTarget && typeof focusTarget.focus === "function") {
        focusTarget.scrollIntoView({ behavior: "smooth", block: "center" });
        focusTarget.focus({ preventScroll: true });
      }
      return;
    }

    // Step 1 — the server derives the real dimensions without writing files, so
    // the user can sanity-check the geometry before committing to a download.
    busy(true, s("gen_res_working"));
    try {
      const { ok, body } = await post("/api/ecojoiner/validate", collect());
      if (!ok || !body.success) {
        renderErrors(body.message || s("gen_res_err_derive"), body.errors);
        return;
      }
      renderPreview(body.data);
    } catch (error) {
      renderErrors(s("gen_res_err_network"), [error.message]);
    } finally {
      busy(false);
    }
  });

  // --- Saved bottle profiles -----------------------------------------------

  const profilePicker = document.querySelector("[data-eco-profile-picker]");
  let profilesById = {};

  // Spec fields tracked to detect edits against an already-saved profile.
  const SPEC_FIELD_IDS = [
    "eco-diameter",
    "eco-cap",
    "eco-collar",
    "eco-height",
    "eco-top-tapper",
    "eco-bottom-tapper",
  ];
  let loadedProfileSpecs = null;

  const currentSpecValues = () =>
    SPEC_FIELD_IDS.map((id) => el(id).value);

  // Bottle spec columns are DECIMAL(x,2) in the DB, so a loaded profile hands
  // back "1500.00" etc. — round to a whole number for these fields (thickness
  // stays decimal-friendly since sheet material comes in fractional mm).
  const wholeNumber = (value) => {
    if (value === null || value === undefined || value === "") return "";
    const num = Number(value);
    return Number.isFinite(num) ? String(Math.round(num)) : "";
  };

  const bottlePhotoPreview = document.querySelector(
    "[data-eco-bottle-photo-preview]",
  );
  const bottlePhotoPreviewImg = document.querySelector(
    "[data-eco-bottle-photo-preview-img]",
  );
  const showBottlePhotoPreview = (url) => {
    if (!bottlePhotoPreview || !bottlePhotoPreviewImg) return;
    bottlePhotoPreview.hidden = !url;
    bottlePhotoPreviewImg.src = url || "";
  };

  const applyProfileToForm = (profile) => {
    el("eco-brand").value = profile.brand || "";
    el("eco-volume").value = wholeNumber(profile.volume_ml);
    el("eco-diameter").value = wholeNumber(profile.diameter_mm);
    el("eco-cap").value = wholeNumber(profile.cap_mm);
    el("eco-collar").value = wholeNumber(profile.collar_mm);
    el("eco-height").value = wholeNumber(profile.height_mm);
    el("eco-top-tapper").value = wholeNumber(profile.top_tapper_mm);
    el("eco-bottom-tapper").value = wholeNumber(profile.bottom_tapper_mm);
    el("eco-material").value = profile.material || "";
    el("eco-thickness").value = profile.thickness_mm ?? "";
    showBottlePhotoPreview(profile.bottle_photo_url);
    if (connectionSlider) {
      const mm = Number(profile.port_fit_mm ?? 0);
      const stepIndex = CONNECTION_STEPS.findIndex((step) => step.mm === mm);
      connectionSlider.value = String(stepIndex >= 0 ? stepIndex : 1);
      applyConnectionStep();
    }
    [
      "eco-brand",
      "eco-volume",
      "eco-diameter",
      "eco-cap",
      "eco-collar",
      "eco-height",
      "eco-top-tapper",
      "eco-bottom-tapper",
      "eco-material",
      "eco-thickness",
    ].forEach(check);
    hideResults();
    lastGenerated = null;
    loadedProfileSpecs = currentSpecValues();
    updateSaveChangesVisibility();
  };

  const loadProfiles = async () => {
    if (!profilePicker) return;
    try {
      const response = await fetch("/api/ecojoiner/profiles");
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) return;
      profilesById = {};
      const selected = profilePicker.value;
      profilePicker
        .querySelectorAll('option[value]:not([value=""])')
        .forEach((opt) => opt.remove());
      (body.data || []).forEach((profile) => {
        profilesById[profile.profile_id] = profile;
        const option = document.createElement("option");
        option.value = String(profile.profile_id);
        option.textContent = profile.label;
        profilePicker.appendChild(option);
      });
      if (selected && profilesById[selected]) profilePicker.value = selected;
    } catch {
      // A saved-profile list failing to load isn't fatal — the form still
      // works for a fresh, unsaved bottle.
    }
  };

  // Step 2's own "Save bottle profile" button — only useful while the user
  // is building a brand-new profile (an existing loaded one is already
  // saved), so it stays hidden whenever the Step 1 picker has a selection.
  const saveProfileFooter = document.querySelector(
    "[data-eco-save-profile-footer]",
  );
  const saveProfileBtn = el("eco-save-profile-btn");
  const saveProfileFeedback = document.querySelector(
    "[data-eco-save-profile-feedback]",
  );

  const updateSaveProfileVisibility = () => {
    if (!saveProfileFooter) return;
    const hasSelectedProfile = Boolean(profilePicker && profilePicker.value);
    saveProfileFooter.hidden = hasSelectedProfile;
  };

  const setSaveProfileFeedback = (message, isError) => {
    if (!saveProfileFeedback) return;
    saveProfileFeedback.textContent = message || "";
    saveProfileFeedback.classList.toggle("eco-feedback--error", Boolean(isError));
    saveProfileFeedback.classList.toggle("eco-feedback--ok", Boolean(message) && !isError);
  };

  // A second Step 2 footer: only relevant once a saved profile is loaded and
  // its bottle specs have since been edited, offering to update that same
  // profile rather than saving a new one.
  const saveProfileChangesFooter = document.querySelector(
    "[data-eco-save-profile-changes-footer]",
  );
  const saveProfileChangesBtn = el("eco-save-profile-changes-btn");
  const saveProfileChangesFeedback = document.querySelector(
    "[data-eco-save-profile-changes-feedback]",
  );

  const updateSaveChangesVisibility = () => {
    if (!saveProfileChangesFooter) return;
    const hasSelectedProfile = Boolean(profilePicker && profilePicker.value);
    const isDirty =
      hasSelectedProfile &&
      loadedProfileSpecs !== null &&
      JSON.stringify(currentSpecValues()) !== JSON.stringify(loadedProfileSpecs);
    saveProfileChangesFooter.hidden = !isDirty;
  };

  const setSaveProfileChangesFeedback = (message, isError) => {
    if (!saveProfileChangesFeedback) return;
    saveProfileChangesFeedback.textContent = message || "";
    saveProfileChangesFeedback.classList.toggle("eco-feedback--error", Boolean(isError));
    saveProfileChangesFeedback.classList.toggle("eco-feedback--ok", Boolean(message) && !isError);
  };

  if (profilePicker) {
    loadProfiles();
    updateSaveProfileVisibility();
    profilePicker.addEventListener("change", () => {
      const profile = profilesById[profilePicker.value];
      if (profile) applyProfileToForm(profile);
      else loadedProfileSpecs = null;
      updateSaveProfileVisibility();
      updateSaveChangesVisibility();
      setSaveProfileFeedback("");
      setSaveProfileChangesFeedback("");
    });
  }

  form.addEventListener("input", (event) => {
    if (SPEC_FIELD_IDS.includes(event.target.id)) updateSaveChangesVisibility();
  });

  if (saveProfileBtn) {
    saveProfileBtn.addEventListener("click", async () => {
      setSaveProfileFeedback("");
      const values = collect();
      const required = [
        "brand",
        "volume",
        "diameter",
        "cap",
        "collar",
        "topTapper",
        "thickness",
      ];
      const missing = required.some(
        (key) => values[key] === "" || values[key] === null || values[key] === undefined,
      );
      if (missing) {
        setSaveProfileFeedback(s("gen_save_profile_missing_fields"), true);
        return;
      }

      const trimmedLabel = values.volume
        ? `${values.brand} ${values.volume}ml`
        : values.brand;

      saveProfileBtn.disabled = true;
      const originalLabel = saveProfileBtn.innerHTML;
      saveProfileBtn.textContent = s("gen_save_profile_saving");

      try {
        const formData = profileFormData(values, { label: trimmedLabel });
        const response = await fetch("/api/ecojoiner/profiles", {
          method: "POST",
          body: formData,
        });
        const body = await response.json().catch(() => ({}));
        const ok = response.ok;
        if (!ok || !body.success) {
          setSaveProfileFeedback(
            body.message || s("gen_save_profile_error"),
            true,
          );
          return;
        }
        setSaveProfileFeedback(s("gen_save_profile_success"), false);
        await loadProfiles();
        if (profilePicker && body.data && body.data.profile_id) {
          profilePicker.value = String(body.data.profile_id);
        }
        updateSaveProfileVisibility();
      } catch (error) {
        setSaveProfileFeedback(
          error.message || s("gen_save_profile_error"),
          true,
        );
      } finally {
        saveProfileBtn.disabled = false;
        saveProfileBtn.innerHTML = originalLabel;
      }
    });
  }

  if (saveProfileChangesBtn) {
    saveProfileChangesBtn.addEventListener("click", async () => {
      const profileId = profilePicker && profilePicker.value;
      if (!profileId) return;
      setSaveProfileChangesFeedback("");
      const values = collect();

      saveProfileChangesBtn.disabled = true;
      const originalLabel = saveProfileChangesBtn.innerHTML;
      saveProfileChangesBtn.textContent = s("gen_save_profile_saving");

      try {
        const formData = profileFormData(values);
        const response = await fetch(`/api/ecojoiner/profiles/${profileId}`, {
          method: "PUT",
          body: formData,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.success) {
          setSaveProfileChangesFeedback(
            body.message || s("gen_save_profile_error"),
            true,
          );
          return;
        }
        setSaveProfileChangesFeedback(s("gen_save_profile_success"), false);
        loadedProfileSpecs = currentSpecValues();
        updateSaveChangesVisibility();
        await loadProfiles();
      } catch (error) {
        setSaveProfileChangesFeedback(
          error.message || s("gen_save_profile_error"),
          true,
        );
      } finally {
        saveProfileChangesBtn.disabled = false;
        saveProfileChangesBtn.innerHTML = originalLabel;
      }
    });
  }

  // --- Saved ecojoiner designs ----------------------------------------------
  // Loads a previously saved design (own or public) into the form: its bottle
  // specs, ecojoiner type, fabrication formats, and — for owned designs —
  // enough state for the save dialog to update it in place rather than
  // creating a duplicate.
  const designPicker = document.querySelector("[data-eco-design-picker]");
  let designsById = {};
  let loadedDesign = null;

  // ecojoiner_designs_tb.profile_snapshot / .formats are native MySQL JSON
  // columns, which can come back from the API either pre-parsed (object/
  // array) or as raw text depending on the code path — parse only if we
  // actually got a string.
  const parseIfString = (value, fallback) => {
    if (value === null || value === undefined) return fallback;
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  const designSnapshot = (design) => parseIfString(design.profile_snapshot, {});

  const designOptionLabel = (design) => {
    const snapshot = designSnapshot(design);
    return snapshot.label || snapshot.brand || "Untitled design";
  };

  const loadDesignsList = async () => {
    if (!designPicker) return;
    try {
      const [ownResponse, publicResponse] = await Promise.all([
        fetch("/api/ecojoiner/designs"),
        fetch("/api/ecojoiner/designs/public"),
      ]);
      const ownBody = await ownResponse.json().catch(() => ({}));
      const publicBody = await publicResponse.json().catch(() => ({}));
      const own = ownResponse.ok && ownBody.success ? ownBody.data || [] : [];
      const pub =
        publicResponse.ok && publicBody.success ? publicBody.data || [] : [];

      designsById = {};
      const selected = designPicker.value;
      designPicker.querySelectorAll("optgroup").forEach((group) => group.remove());

      const addGroup = (label, designs, isOwner) => {
        if (!designs.length) return;
        const group = document.createElement("optgroup");
        group.label = label;
        designs.forEach((design) => {
          designsById[design.design_id] = { ...design, is_owner: isOwner };
          const option = document.createElement("option");
          option.value = String(design.design_id);
          option.textContent = designOptionLabel(design);
          group.appendChild(option);
        });
        designPicker.appendChild(group);
      };
      addGroup("My designs", own, true);
      addGroup("Public designs", pub, false);

      if (selected && designsById[selected]) designPicker.value = selected;
    } catch {
      // A saved-design list failing to load isn't fatal — the form still
      // works for a fresh, unsaved design.
    }
  };

  const applyDesignToForm = (design) => {
    // Prefer the live profile row over the design's snapshot when the user
    // still owns it, so the bottle-spec fields (and the "dirty" baseline for
    // Save Bottle Changes) reflect its current values, not what it looked
    // like when this design was saved.
    const ownProfile = design.profile_id
      ? profilesById[design.profile_id]
      : null;
    const snapshot = designSnapshot(design);
    applyProfileToForm(ownProfile || snapshot);

    const targetType = design.ecojoiner_type || "6fc";
    typeCards.forEach((card) => {
      const match = card.dataset.type === targetType;
      card.classList.toggle("eco-type-card--selected", match);
      if (card.getAttribute("role") === "radio")
        card.setAttribute("aria-checked", String(match));
    });
    el("eco-type").value = targetType;
    check("eco-type");

    const formats = parseIfString(design.formats, []);
    el("eco-fab-carpentry").checked = formats.includes("pdf");
    el("eco-fab-3d").checked = formats.includes("scad");
    el("eco-fab-svg").checked = formats.includes("svg");
    el("eco-fab-dxf").checked = formats.includes("dxf");
    check("eco-fabrication");

    if (profilePicker) {
      if (ownProfile) {
        profilePicker.value = String(design.profile_id);
      } else {
        profilePicker.value = "";
        loadedProfileSpecs = null;
      }
      updateSaveProfileVisibility();
      updateSaveChangesVisibility();
    }

    loadedDesign = {
      design_id: design.design_id,
      // There's no separate "design name" — its display name is always the
      // bottle profile's label, same as the picker options themselves.
      label: (ownProfile && ownProfile.label) || snapshot.label || "",
      visibility: design.visibility,
      is_owner: design.is_owner !== false,
      ecojoiner_photo_url: design.ecojoiner_photo_url || null,
    };
  };

  const loadDesignById = async (designId) => {
    try {
      const response = await fetch(
        `/api/ecojoiner/designs/${encodeURIComponent(designId)}`,
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) return false;
      applyDesignToForm(body.data);
      return true;
    } catch {
      return false;
    }
  };

  // Deep link from the dashboard's design cog menu ("Open"):
  // /ecojoiners/generate?design=123
  const initialDesignId = new URLSearchParams(window.location.search).get(
    "design",
  );

  if (designPicker) {
    loadDesignsList().then(() => {
      if (!initialDesignId) return;
      loadDesignById(initialDesignId).then((ok) => {
        if (ok) designPicker.value = initialDesignId;
      });
    });
    designPicker.addEventListener("change", () => {
      if (!designPicker.value) {
        loadedDesign = null;
        return;
      }
      loadDesignById(designPicker.value);
    });
  } else if (initialDesignId) {
    loadDesignById(initialDesignId);
  }

  // --- Save flow ------------------------------------------------------------

  const saveDialog = document.getElementById("ecoSaveDialog");
  const saveForm = saveDialog
    ? saveDialog.querySelector("[data-eco-save-form]")
    : null;
  const saveFeedback = saveDialog
    ? saveDialog.querySelector("[data-eco-save-feedback]")
    : null;
  const saveShare = saveDialog
    ? saveDialog.querySelector("[data-eco-save-share]")
    : null;
  const saveLabelInput = saveDialog
    ? saveDialog.querySelector("[data-eco-save-label]")
    : null;
  const saveVisibilityToggle = saveDialog
    ? saveDialog.querySelector("[data-eco-save-visibility]")
    : null;
  const saveSuccess = saveDialog
    ? saveDialog.querySelector("[data-eco-save-success]")
    : null;
  const saveSuccessShare = saveDialog
    ? saveDialog.querySelector("[data-eco-save-success-share]")
    : null;
  const savePhotoPreview = saveDialog
    ? saveDialog.querySelector("[data-eco-save-photo-preview]")
    : null;
  const savePhotoPreviewImg = saveDialog
    ? saveDialog.querySelector("[data-eco-save-photo-preview-img]")
    : null;

  const showSavePhotoPreview = (url) => {
    if (!savePhotoPreview || !savePhotoPreviewImg) return;
    savePhotoPreview.hidden = !url;
    savePhotoPreviewImg.src = url || "";
  };

  const setSaveFeedback = (message) => {
    if (!saveFeedback) return;
    saveFeedback.hidden = !message;
    saveFeedback.textContent = message || "";
  };

  // Reset the dialog back to the editable form, hiding any prior success state.
  const showSaveForm = () => {
    if (saveForm) saveForm.hidden = false;
    if (saveSuccess) saveSuccess.hidden = true;
  };

  const showSaveSuccess = (shareUrl) => {
    if (saveForm) {
      saveForm.reset();
      saveForm.hidden = true;
    }
    if (saveSuccess) saveSuccess.hidden = false;
    if (saveSuccessShare) {
      saveSuccessShare.hidden = !shareUrl;
      saveSuccessShare.textContent = shareUrl
        ? `Shareable link: ${shareUrl}`
        : "";
    }
  };

  const saveBtn = el("eco-save");
  if (saveBtn && saveDialog) {
    saveBtn.addEventListener("click", () => {
      showSaveForm();
      setSaveFeedback("");
      if (saveShare) saveShare.hidden = true;
      // Editing an already-owned loaded design re-saves it in place, so its
      // name and photo come pre-filled; anything else (including someone
      // else's public design, loaded read-only) starts from blank.
      const editingOwnDesign = Boolean(loadedDesign && loadedDesign.is_owner);
      const selectedProfile =
        profilePicker && profilePicker.value
          ? profilesById[profilePicker.value]
          : null;
      if (saveLabelInput) {
        saveLabelInput.value = editingOwnDesign
          ? loadedDesign.label
          : (selectedProfile && selectedProfile.label) || "";
      }
      if (saveVisibilityToggle)
        saveVisibilityToggle.checked = editingOwnDesign
          ? loadedDesign.visibility === "public"
          : false;
      showSavePhotoPreview(
        editingOwnDesign ? loadedDesign.ecojoiner_photo_url : null,
      );
      if (typeof saveDialog.showModal === "function") saveDialog.showModal();
      else saveDialog.setAttribute("open", "");
    });
  }

  if (saveDialog) {
    saveDialog
      .querySelectorAll("[data-close-eco-save]")
      .forEach((btn) =>
        btn.addEventListener("click", () => saveDialog.close()),
      );
    saveDialog.addEventListener("click", (event) => {
      if (event.target === saveDialog) saveDialog.close();
    });
    // Always start fresh next time the dialog opens, regardless of how it closed.
    saveDialog.addEventListener("close", showSaveForm);
  }

  if (saveForm) {
    saveForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setSaveFeedback("");

      const profileLabel = saveLabelInput ? saveLabelInput.value.trim() : "";
      if (!profileLabel) {
        setSaveFeedback("Please give this design a name.");
        return;
      }

      const formValues = collect();
      const formData = new FormData();
      formData.set("label", profileLabel);
      formData.set("brand", formValues.brand);
      formData.set("volume", formValues.volume);
      formData.set("diameter", formValues.diameter);
      formData.set("cap", formValues.cap);
      formData.set("collar", formValues.collar);
      formData.set("height", formValues.height);
      formData.set("topTapper", formValues.topTapper);
      formData.set("bottomTapper", formValues.bottomTapper);
      formData.set("material", formValues.material);
      formData.set("thickness", formValues.thickness);
      formData.set("ecojoinerType", formValues.ecojoinerType);
      formData.set("portFitMm", formValues.portFitMm);
      formData.set(
        "formats",
        JSON.stringify(
          Object.entries({
            fabCarpentry: "pdf",
            fab3d: "scad",
            fabSvg: "svg",
          })
            .filter(([key]) => formValues[key])
            .map(([, format]) => format),
        ),
      );
      formData.set(
        "visibility",
        saveVisibilityToggle && saveVisibilityToggle.checked
          ? "public"
          : "private",
      );

      if (profilePicker && profilePicker.value) {
        formData.set("profile_id", profilePicker.value);
      }
      if (lastGenerated) {
        formData.set("job_id", lastGenerated.job_slug || "");
        formData.set("files", JSON.stringify(lastGenerated.files || []));
      }

      // The bottle photo now lives with the bottle (Panel 1), not the design.
      const bottlePhotoInput = el("eco-bottle-photo");
      const ecojoinerPhotoInput = saveForm.querySelector(
        'input[name="ecojoiner_photo"]',
      );
      if (bottlePhotoInput && bottlePhotoInput.files[0]) {
        formData.set("bottle_photo", bottlePhotoInput.files[0]);
      }
      if (ecojoinerPhotoInput && ecojoinerPhotoInput.files[0]) {
        formData.set("ecojoiner_photo", ecojoinerPhotoInput.files[0]);
      }

      const submitBtn = saveForm.querySelector('button[type="submit"]');
      const originalLabel = submitBtn ? submitBtn.textContent : "";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving…";
      }

      const editingOwnDesign = Boolean(loadedDesign && loadedDesign.is_owner);
      const url = editingOwnDesign
        ? `/api/ecojoiner/designs/${encodeURIComponent(loadedDesign.design_id)}`
        : "/api/ecojoiner/designs";

      try {
        const response = await fetch(url, {
          method: editingOwnDesign ? "PUT" : "POST",
          body: formData,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.success) {
          setSaveFeedback(body.message || "We could not save this design.");
          return;
        }
        showSaveSuccess(body.data.share_url);
        if (loadedDesign) {
          loadedDesign.label = profileLabel;
          loadedDesign.visibility = body.data.visibility;
        }
        loadProfiles();
        loadDesignsList();
      } catch (error) {
        setSaveFeedback(
          error.message || "We could not reach the server. Please try again.",
        );
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
        }
      }
    });
  }
})();
