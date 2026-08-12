(function () {
  const form = document.getElementById("commission-form");
  if (!form) return;

  const foodstuffPanel = form.querySelector('[data-panel="foodstuffs"]');
  const bottleSixSlot = form.querySelector('[data-bottle-slot="6"]');
  const controlPanel = form.querySelector('[data-panel="control-bottle"]');
  const controlFields = form.querySelector("[data-control-fields]");

  const summaryList = document.querySelector(
    "[data-commission-summary-list]",
  );
  const summaryEmpty = document.querySelector(
    "[data-commission-summary-empty]",
  );
  const summaryTotal = document.querySelector("[data-commission-total]");
  const missionSelect = form.querySelector("#commission-mission");

  const summaryDialog = document.getElementById("commissionSummaryDialog");
  const modalList = document.querySelector("[data-commission-modal-list]");
  const modalShipping = document.querySelector(
    "[data-commission-modal-shipping]",
  );
  const modalTotal = document.querySelector("[data-commission-modal-total]");
  const feedback = document.querySelector("[data-commission-feedback]");
  const SHIPPING_ESTIMATE = 20;

  const currency = (value) => `$${Number(value || 0).toLocaleString()}`;

  const getChecked = (name) =>
    form.querySelector(`input[name="${name}"]:checked`);

  const cardTitle = (input) =>
    input?.closest(".eco-choice-card")?.querySelector(".eco-choice-card__title")
      ?.textContent || input?.value;

  function updateDeploymentVisibility() {
    const deployment = getChecked("deployment")?.value || "flotilla";
    const isFlotilla = deployment === "flotilla";
    if (foodstuffPanel) foodstuffPanel.hidden = !isFlotilla;
  }

  function updateTurtleTypeVisibility() {
    const turtleType = getChecked("turtleType")?.value || "simple";
    const isSmart = turtleType === "smart";
    if (bottleSixSlot) bottleSixSlot.hidden = isSmart;
    if (controlPanel) controlPanel.hidden = !isSmart;
    if (!isSmart && controlFields) {
      controlFields
        .querySelectorAll('input[type="checkbox"]:not(:disabled)')
        .forEach((checkbox) => {
          checkbox.checked = false;
        });
    }
  }

  function updateChoiceCardStyles() {
    form.querySelectorAll(".eco-choice-card").forEach((card) => {
      const input = card.querySelector("input");
      card.classList.toggle(
        "eco-choice-card--selected",
        Boolean(input?.checked),
      );
    });
  }

  function collectSummary() {
    const lines = [];
    const items = [];
    let total = 0;

    if (missionSelect && missionSelect.value) {
      lines.push({
        label: "Mission",
        detail: missionSelect.options[missionSelect.selectedIndex].text,
      });
    }

    const deployment = getChecked("deployment");
    if (deployment) {
      lines.push({ label: "Deployment", detail: cardTitle(deployment) });
    }

    const turtleType = getChecked("turtleType");
    if (turtleType) {
      const price = Number(turtleType.dataset.price || 0);
      total += price;
      lines.push({ label: "Turtle type", detail: cardTitle(turtleType), price });
    }

    if (foodstuffPanel && !foodstuffPanel.hidden) {
      form
        .querySelectorAll('[data-foodstuff-fields] select')
        .forEach((select) => {
          if (select.closest("[hidden]")) return;
          const option = select.options[select.selectedIndex];
          if (!option || !option.value) return;
          const price = Number(option.dataset.price || 0);
          total += price;
          lines.push({
            label: select.dataset.bottleLabel || "Bottle",
            detail: option.value
              ? option.text.replace(/\s+—.*/u, "")
              : option.text,
            price,
          });
          if (option.dataset.componentId) {
            items.push({
              component_id: Number(option.dataset.componentId),
              bottle_slot: Number(select.dataset.bottleSlot) || null,
              quantity: 1,
            });
          }
        });
    }

    const engraving = getChecked("engraving");
    if (engraving) {
      lines.push({ label: "Engraving", detail: cardTitle(engraving) });
    }

    if (controlPanel && !controlPanel.hidden) {
      form
        .querySelectorAll('[data-control-fields] input[type="checkbox"]')
        .forEach((checkbox) => {
          if (!checkbox.checked) return;
          const price = Number(checkbox.dataset.price || 0);
          total += price;
          const title = checkbox
            .closest(".eco-fab-option")
            ?.querySelector(".eco-fab-option__title")?.textContent;
          lines.push({ label: "Control bottle", detail: title, price });
          if (checkbox.dataset.componentId) {
            items.push({
              component_id: Number(checkbox.dataset.componentId),
              bottle_slot: null,
              quantity: 1,
            });
          }
        });
    }

    return { lines, total, items };
  }

  function buildPayload(status) {
    const turtleType = getChecked("turtleType");
    const deployment = getChecked("deployment");
    const engraving = getChecked("engraving");
    const { items } = collectSummary();

    return {
      mission_id: missionSelect?.value ? Number(missionSelect.value) : null,
      deployment_type: deployment?.value || "flotilla",
      turtle_base_component_id: turtleType?.dataset.componentId
        ? Number(turtleType.dataset.componentId)
        : null,
      engraving_component_id: engraving?.dataset.componentId
        ? Number(engraving.dataset.componentId)
        : null,
      status,
      items,
    };
  }

  async function submitCommission(status) {
    const response = await fetch("/api/commissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(status)),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.success) {
      throw new Error(body.message || "Something went wrong saving your turtle.");
    }
    return body.data;
  }

  const renderLine = (line) => {
    const li = document.createElement("li");
    li.className = "commission-summary__row";
    const priceMarkup =
      typeof line.price === "number"
        ? `<strong>${currency(line.price)}</strong>`
        : "";
    li.innerHTML = `<span>${line.label}: ${line.detail}</span>${priceMarkup}`;
    return li;
  };

  function renderSummary() {
    const { lines, total } = collectSummary();
    if (summaryList) {
      summaryList
        .querySelectorAll(".commission-summary__row")
        .forEach((row) => row.remove());
      lines.forEach((line) => summaryList.appendChild(renderLine(line)));
      if (summaryEmpty) summaryEmpty.hidden = lines.length > 0;
    }
    if (summaryTotal) summaryTotal.textContent = currency(total);
    return { lines, total };
  }

  form.addEventListener("change", () => {
    updateDeploymentVisibility();
    updateTurtleTypeVisibility();
    updateChoiceCardStyles();
    renderSummary();
  });

  updateDeploymentVisibility();
  updateTurtleTypeVisibility();
  updateChoiceCardStyles();
  renderSummary();

  document.querySelectorAll("[data-commission-submit]").forEach((button) => {
    button.addEventListener("click", () => {
      const { lines, total } = renderSummary();
      if (modalList) {
        modalList.innerHTML = "";
        lines.forEach((line) => modalList.appendChild(renderLine(line)));
      }
      if (modalShipping) modalShipping.textContent = currency(SHIPPING_ESTIMATE);
      if (modalTotal) modalTotal.textContent = currency(total + SHIPPING_ESTIMATE);
      summaryDialog?.showModal();
    });
  });

  document
    .querySelectorAll("[data-close-commission-summary]")
    .forEach((button) => {
      button.addEventListener("click", () => summaryDialog?.close());
    });

  document.querySelectorAll("[data-commission-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = "Saving your turtle…";
      }
      try {
        await submitCommission("draft");
        if (feedback) feedback.textContent = "Saved. You can keep editing or commission it later.";
      } catch (error) {
        if (feedback) feedback.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  });

  const modalFeedback = document.querySelector("[data-commission-modal-feedback]");
  const confirmButton = document.querySelector("[data-commission-confirm]");
  if (confirmButton) {
    confirmButton.addEventListener("click", async () => {
      confirmButton.disabled = true;
      if (modalFeedback) {
        modalFeedback.hidden = false;
        modalFeedback.textContent = "Submitting your commission…";
      }
      try {
        await submitCommission("submitted");
        if (modalFeedback) {
          modalFeedback.textContent =
            "Your turtle has been commissioned. Our team will follow up about next steps.";
        }
        if (feedback) {
          feedback.hidden = false;
          feedback.textContent = "Commission submitted — thank you!";
        }
      } catch (error) {
        if (modalFeedback) modalFeedback.textContent = error.message;
      } finally {
        confirmButton.disabled = false;
      }
    });
  }
})();
