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
  document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector<HTMLElement>(".site-header");
    const toggle = header?.querySelector<HTMLButtonElement>("[data-menu-toggle]");
    if (!header || !toggle) return;
    const desktop = window.matchMedia("(min-width: 761px)");
    const setOpen = (open: boolean, restoreFocus = false): void => {
      header.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", window.siteMenuLabel?.(open) ?? (open ? "Close menu" : "Open menu"));
      if (!open && restoreFocus) toggle.focus();
    };
    toggle.addEventListener("click", () => setOpen(!header.classList.contains("menu-open")));
    header.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("nav a, .header-actions > a")) setOpen(false);
    });
    document.addEventListener("click", (event) => {
      if (!header.contains(event.target as Node)) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && header.classList.contains("menu-open")) setOpen(false, true);
    });
    desktop.addEventListener("change", () => { if (desktop.matches) setOpen(false); });
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
