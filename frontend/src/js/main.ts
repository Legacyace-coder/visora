type AccountRole = "admin" | "photographer" | "agent";

interface SessionUser {
  id: string;
  email: string;
  role: AccountRole;
  display_name: string;
  referral_code?: string | null;
  agent_code?: string | null;
}

interface ApiResult {
  message?: string;
  detail?: string;
  confirmation_required?: boolean;
  user?: SessionUser;
}

const apiBaseUrl =
  document.querySelector<HTMLMetaElement>('meta[name="api-base-url"]')
    ?.content.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

const year = document.querySelector<HTMLElement>("#year");

if (year) {
  year.textContent = String(new Date().getFullYear());
}

const message = document.querySelector<HTMLElement>("#form-message");

function dashboardPath(role: AccountRole): string {
  const paths: Record<AccountRole, string> = {
    photographer: "/photographer/dashboard.html",
    agent: "/agent/dashboard.html",
    admin: "/admin/dashboard.html",
  };

  return paths[role];
}

async function getSessionUser(): Promise<SessionUser | null> {
  try {
    let response = await fetch(`${apiBaseUrl}/auth/me`, {
      method: "GET",
      credentials: "include",
    });

    if (response.status === 401) {
      const refreshResponse = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (!refreshResponse.ok) {
        return null;
      }

      response = await fetch(`${apiBaseUrl}/auth/me`, {
        method: "GET",
        credentials: "include",
      });
    }

    if (!response.ok) {
      return null;
    }

    const result = (await response.json()) as ApiResult;
    return result.user ?? null;
  } catch {
    return null;
  }
}

// Registration
const registerForm =
  document.querySelector<HTMLFormElement>("#register-form");

const accountType =
  document.querySelector<HTMLSelectElement>("#account-type");

const referralFields = document.querySelector<HTMLElement>(
  "#photographer-referral-fields"
);

const displayNameCaption = document.querySelector<HTMLElement>(
  "#display-name-caption"
);

function updateRegistrationFields(): void {
  if (!accountType || !referralFields) return;

  const isPhotographer = accountType.value === "photographer";

  referralFields.hidden = !isPhotographer;

  referralFields
    .querySelectorAll<HTMLInputElement>("input")
    .forEach((input) => {
      input.disabled = !isPhotographer;
    });

  if (displayNameCaption) {
    displayNameCaption.textContent = isPhotographer
      ? "Photographer / studio name"
      : "Agency / public name";
  }
}

accountType?.addEventListener("change", updateRegistrationFields);
updateRegistrationFields();

registerForm?.addEventListener("submit", async (event: SubmitEvent) => {
  event.preventDefault();

  if (!message) return;

  const submitButton =
    registerForm.querySelector<HTMLButtonElement>('button[type="submit"]');

  const formData = new FormData(registerForm);
  const selectedType = String(formData.get("account_type"));

  const payload = {
    account_type: selectedType,
    full_name: String(formData.get("full_name") ?? "").trim(),
    display_name: String(formData.get("display_name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    referral_code:
      selectedType === "photographer"
        ? String(formData.get("referral_code") ?? "").trim().toUpperCase() || null
        : null,
    agent_code:
      selectedType === "photographer"
        ? String(formData.get("agent_code") ?? "").trim().toUpperCase() || null
        : null,
  };

  message.textContent = "Creating your account...";

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Please wait...";
  }

  try {
    const response = await fetch(`${apiBaseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as ApiResult;

    if (!response.ok) {
      throw new Error(result.detail || "Registration could not be completed.");
    }

    message.textContent =
      result.message || "Account created. You can now sign in.";

    registerForm.reset();
    updateRegistrationFields();
  } catch (error) {
    message.textContent =
      error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.";
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Create account →";
    }
  }
});

// Login
const loginForm = document.querySelector<HTMLFormElement>("#login-form");

loginForm?.addEventListener("submit", async (event: SubmitEvent) => {
  event.preventDefault();

  if (!message) return;

  const submitButton =
    loginForm.querySelector<HTMLButtonElement>('button[type="submit"]');

  const formData = new FormData(loginForm);

  const payload = {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };

  message.textContent = "Signing you in...";

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Please wait...";
  }

  try {
    const response = await fetch(`${apiBaseUrl}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as ApiResult;

    if (!response.ok) {
      throw new Error(result.detail || "Sign-in could not be completed.");
    }

    if (!result.user) {
      throw new Error("The server did not return an account profile.");
    }

    message.textContent = "Signed in. Opening your workspace...";

    window.location.assign(dashboardPath(result.user.role));
  } catch (error) {
    message.textContent =
      error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.";
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Continue →";
    }
  }
});

interface PhotographerPhoto {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  width: number | null;
  height: number | null;
  title: string | null;
  description: string | null;
  created_at: string;
}

interface PhotographerPhotosResponse {
  photos: PhotographerPhoto[];
}

interface PhotographerPreviewResponse {
  photo_id: string;
  preview_url: string;
  expires_in: number;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Size unavailable";

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createPortfolioCard(
  photo: PhotographerPhoto,
  previewUrl: string | null
): HTMLElement {
  const card = document.createElement("article");
  card.className = "portfolio-card";

  const imageFrame = document.createElement("div");
  imageFrame.className = "portfolio-image-frame";

  if (previewUrl) {
    const image = document.createElement("img");
    image.src = previewUrl;
    image.alt = photo.title || photo.original_filename || "Portfolio photograph";
    image.loading = "lazy";
    image.decoding = "async";
    image.className = "portfolio-image";

    image.addEventListener("error", () => {
      imageFrame.replaceChildren();

      const unavailable = document.createElement("span");
      unavailable.className = "portfolio-image-unavailable";
      unavailable.textContent = "Preview unavailable";
      imageFrame.appendChild(unavailable);
    });

    const openLink = document.createElement("a");
    openLink.href = previewUrl;
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.className = "portfolio-image-link";
    openLink.setAttribute(
      "aria-label",
      `Open ${photo.title || photo.original_filename} in a new tab`
    );

    openLink.appendChild(image);
    imageFrame.appendChild(openLink);
  } else {
    const unavailable = document.createElement("span");
    unavailable.className = "portfolio-image-unavailable";
    unavailable.textContent = "Preview unavailable";
    imageFrame.appendChild(unavailable);
  }

  const details = document.createElement("div");
  details.className = "portfolio-card-details";

  const title = document.createElement("h3");
  title.textContent = photo.title || photo.original_filename || "Untitled photograph";

  const metadata = document.createElement("p");
  metadata.textContent = formatFileSize(photo.file_size_bytes);

  if (photo.width && photo.height) {
    metadata.textContent += ` · ${photo.width} × ${photo.height}`;
  }

  const filename = document.createElement("p");
  filename.className = "portfolio-filename";
  filename.textContent = photo.original_filename;

  details.append(title, metadata, filename);
  card.append(imageFrame, details);

  return card;
}

async function loadPhotographerPortfolio(): Promise<void> {
  const status = document.querySelector<HTMLElement>("#portfolio-status");
  const grid = document.querySelector<HTMLElement>("#portfolio-grid");
  const count = document.querySelector<HTMLElement>("#portfolio-count");

  if (!status || !grid || !count) return;

  status.textContent = "Loading your photographs...";
  grid.replaceChildren();

  try {
    const response = await fetch(`${apiBaseUrl}/photographer/photos`, {
      method: "GET",
      credentials: "include",
    });

    const result = (await response.json()) as
      | PhotographerPhotosResponse
      | ApiResult;

    if (!response.ok) {
      const errorResult = result as ApiResult;
      throw new Error(
        errorResult.detail || "Your portfolio could not be loaded."
      );
    }

    const photos = (result as PhotographerPhotosResponse).photos ?? [];

    count.textContent = String(photos.length);

    if (photos.length === 0) {
      status.textContent = "Your portfolio is empty. Your uploaded photographs will appear here.";
      return;
    }

    status.textContent = `Showing ${photos.length} photograph${photos.length === 1 ? "" : "s"}.`;

    const cards = await Promise.all(
      photos.map(async (photo) => {
        try {
          const previewResponse = await fetch(
            `${apiBaseUrl}/photographer/photos/${encodeURIComponent(photo.id)}/preview`,
            {
              method: "GET",
              credentials: "include",
            }
          );

          if (!previewResponse.ok) {
            return createPortfolioCard(photo, null);
          }

          const preview = (await previewResponse.json()) as PhotographerPreviewResponse;

          return createPortfolioCard(
            photo,
            preview.preview_url || null
          );
        } catch {
          return createPortfolioCard(photo, null);
        }
      })
    );

    grid.replaceChildren(...cards);
  } catch (error) {
    count.textContent = "—";
    status.textContent =
      error instanceof Error
        ? error.message
        : "Your portfolio could not be loaded. Please try again.";
  }
}
// Protected dashboard pages
const dashboard = document.querySelector<HTMLElement>(
  "[data-required-role]"
);

if (dashboard) {
  void (async () => {
    const requiredRole = dashboard.dataset.requiredRole as AccountRole;
    const user = await getSessionUser();

    if (!user) {
      window.location.replace("/login.html");
      return;
    }

    if (user.role !== requiredRole) {
      window.location.replace(dashboardPath(user.role));
      return;
    }

    const nameElement = document.querySelector<HTMLElement>(
      "#dashboard-name"
    );

    const emailElement = document.querySelector<HTMLElement>(
      "#dashboard-email"
    );

    const codeElement = document.querySelector<HTMLElement>(
      "#account-code"
    );

    if (nameElement) {
      nameElement.textContent = user.display_name;
    }

    if (emailElement) {
      emailElement.textContent = user.email;
    }

    const accountCode =
      user.role === "agent" ? user.agent_code : user.referral_code;

    if (codeElement) {
      codeElement.textContent = accountCode || "Not assigned";
    }

    dashboard.hidden = false;

    if (requiredRole === "photographer") {
      void loadPhotographerPortfolio();
    }
  })();
}

// Logout
const logoutButton =
  document.querySelector<HTMLButtonElement>("#logout-button");

logoutButton?.addEventListener("click", async () => {
  logoutButton.disabled = true;
  logoutButton.textContent = "Signing out...";

  try {
    await fetch(`${apiBaseUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } finally {
    window.location.replace("/login.html");
  }
});