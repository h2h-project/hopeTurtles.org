// Contribute page: right-hand action sidebar (Contribute modal / OpenBooks
// notice). Mirrors the same block in public/js/dashboard.js.
document.addEventListener("DOMContentLoaded", () => {
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
});
