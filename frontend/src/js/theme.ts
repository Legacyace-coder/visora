(() => {
  type Theme = "light" | "dark";
  const storageKey = "visora-theme";
  const preference = window.matchMedia("(prefers-color-scheme: dark)");
  let savedTheme: Theme | null = null;
  let storageAvailable = true;

  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark") savedTheme = stored;
  } catch (error) {
    storageAvailable = false;
    console.warn("Theme preference storage is unavailable.", error);
  }

  const systemTheme = (): Theme => preference.matches ? "dark" : "light";

  function applyTheme(theme: Theme): void {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]").forEach((button) => {
      const next = theme === "dark" ? "light" : "dark";
      button.setAttribute("aria-label", `Switch to ${next} mode`);
      const label = button.querySelector<HTMLElement>("[data-theme-label]");
      const icon = button.querySelector<HTMLElement>("[data-theme-icon]");
      if (label) label.textContent = `${next === "dark" ? "Dark" : "Light"} mode`;
      if (icon) icon.textContent = next === "dark" ? "☾" : "☀";
      button.hidden = false;
    });
  }

  function reportStorageFailure(): void {
    const button = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
    if (!button) return;
    let status = document.querySelector<HTMLElement>("[data-theme-status]");
    if (!status) {
      status = document.createElement("span");
      status.dataset.themeStatus = "";
      status.className = "theme-status";
      status.setAttribute("role", "status");
      button.insertAdjacentElement("afterend", status);
    }
    status.textContent = "Theme preference cannot be saved in this browser.";
  }

  applyTheme(savedTheme || systemTheme());
  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(savedTheme || systemTheme());
    if (!storageAvailable) reportStorageFailure();
    document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        savedTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        applyTheme(savedTheme);
        try {
          localStorage.setItem(storageKey, savedTheme);
        } catch (error) {
          console.warn("Theme preference could not be saved.", error);
          reportStorageFailure();
        }
      });
    });
  });
  preference.addEventListener("change", () => {
    if (!savedTheme) applyTheme(systemTheme());
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey) return;
    savedTheme = event.newValue === "light" || event.newValue === "dark" ? event.newValue : null;
    applyTheme(savedTheme || systemTheme());
  });
})();
