// Contribute page: right-hand action sidebar (Contribute modal → Stripe
// Checkout, OpenBooks notice).
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

  const showFeedback = (message) => {
    if (!contributeFeedback) return;
    contributeFeedback.hidden = false;
    contributeFeedback.textContent = message;
  };

  // Ask the server for a Stripe Checkout session, then hand over to Stripe.
  // The server validates the amount; nothing here is trusted for the charge.
  if (contributeForm) {
    const submitButton = contributeForm.querySelector('button[type="submit"]');
    contributeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const amount = Number(contributeAmountInput?.value);
      if (!Number.isInteger(amount) || amount < 1) {
        showFeedback("Please enter a whole-dollar amount of at least $1.");
        return;
      }

      if (submitButton) submitButton.disabled = true;
      showFeedback("Taking you to our secure payment page…");
      try {
        const response = await fetch("/api/contributions/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.success && result.data?.url) {
          window.location.assign(result.data.url);
          return;
        }
        showFeedback(
          result.message || "Something went wrong. Please try again in a moment.",
        );
      } catch {
        showFeedback("We couldn't reach the server. Please check your connection and try again.");
      }
      if (submitButton) submitButton.disabled = false;
    });
  }

  // The landing page's "Contribute Directly" button links to /contribute#give.
  if (window.location.hash === "#give" && openContributeButton) {
    openContributeButton.click();
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
