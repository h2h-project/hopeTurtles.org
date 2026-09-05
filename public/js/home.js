const contributeButtons = document.querySelectorAll('[data-contribute-action]');

if (contributeButtons.length) {
  contributeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      window.alert("Sorry, we're still building out this functionality of hopeTurtles.org.");
    });
  });
}
