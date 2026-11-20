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

const isLocalDevelopment =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const configuredApiBaseUrl =
  document.querySelector<HTMLMetaElement>('meta[name="api-base-url"]')
    ?.content.replace(/\/$/, "");

const apiBaseUrl = isLocalDevelopment
  ? configuredApiBaseUrl ?? "http://127.0.0.1:8000"
  : "/api";

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

interface PhotographerCollection {
  id: string;
  title: string;
  description: string | null;
}

interface PhotographerSubmission {
  id: string;
  submission_type: "individual" | "collection";
  title: string;
  status: "pending" | "processing" | "accepted" | "rejected";
  submitted_at: string;
}

interface PhotographerPhotosResponse {
  photos: PhotographerPhoto[];
}

interface PhotographerCollectionsResponse {
  collections: PhotographerCollection[];
}

interface PhotographerSubmissionsResponse {
  submissions: PhotographerSubmission[];
}

interface PhotographerPreviewResponse {
  photo_id: string;
  preview_url: string;
  expires_in: number;
}

let photographerPhotos: PhotographerPhoto[] = [];
let photographerCollections: PhotographerCollection[] = [];

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

  const selectionLabel = document.createElement("label");
  selectionLabel.className = "portfolio-selection";

  const selection = document.createElement("input");
  selection.type = "checkbox";
  selection.name = "photo_ids";
  selection.value = photo.id;

  const selectionText = document.createElement("span");
  selectionText.textContent = "Select for individual submission";

  selectionLabel.append(selection, selectionText);
  details.append(title, metadata, filename, selectionLabel);
  card.append(imageFrame, details);

  return card;
}

function renderPhotographerCollections(): void {
  const list = document.querySelector<HTMLElement>("#collection-list");
  const submissionSelect = document.querySelector<HTMLSelectElement>(
    "#submission-collection"
  );

  if (!list) return;

  list.replaceChildren();

  if (submissionSelect) {
    submissionSelect.replaceChildren(new Option("Choose a collection", ""));
    photographerCollections.forEach((collection) => {
      submissionSelect.add(new Option(collection.title, collection.id));
    });
  }

  if (photographerCollections.length === 0) {
    const empty = document.createElement("p");
    empty.className = "workspace-hint";
    empty.textContent = "You have not created any collections yet.";
    list.appendChild(empty);
    return;
  }

  photographerCollections.forEach((collection) => {
    const card = document.createElement("article");
    card.className = "collection-card";

    const title = document.createElement("h4");
    title.textContent = collection.title;

    const description = document.createElement("p");
    description.textContent = collection.description || "No description.";

    card.append(title, description);

    if (photographerPhotos.length > 0) {
      const row = document.createElement("div");
      row.className = "collection-add-row";

      const label = document.createElement("label");
      label.textContent = "Add a photograph";

      const select = document.createElement("select");
      select.add(new Option("Choose a photograph", ""));

      photographerPhotos.forEach((photo) => {
        select.add(
          new Option(
            photo.title || photo.original_filename,
            photo.id
          )
        );
      });

      label.appendChild(select);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-dark small";
      button.dataset.addToCollection = collection.id;
      button.textContent = "Add photograph";

      row.append(label, button);
      card.appendChild(row);
    } else {
      const hint = document.createElement("p");
      hint.textContent = "Upload a photograph before adding items.";
      card.appendChild(hint);
    }

    const status = document.createElement("p");
    status.dataset.collectionStatus = collection.id;
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    card.appendChild(status);

    list.appendChild(card);
  });
}

async function loadPhotographerCollections(): Promise<void> {
  const status = document.querySelector<HTMLElement>(
    "#collection-create-status"
  );

  try {
    const response = await fetch(`${apiBaseUrl}/photographer/collections`, {
      method: "GET",
      credentials: "include",
    });
    const result = (await response.json()) as
      | PhotographerCollectionsResponse
      | ApiResult;

    if (!response.ok) {
      const errorResult = result as ApiResult;
      throw new Error(errorResult.detail || "Collections could not be loaded.");
    }

    photographerCollections =
      (result as PhotographerCollectionsResponse).collections ?? [];
    renderPhotographerCollections();
  } catch (error) {
    if (status) {
      status.textContent =
        error instanceof Error ? error.message : "Collections could not be loaded.";
    }
  }
}

async function loadPhotographerSubmissions(): Promise<void> {
  const list = document.querySelector<HTMLElement>("#submission-list");
  if (!list) return;

  list.replaceChildren();

  try {
    const response = await fetch(`${apiBaseUrl}/photographer/submissions`, {
      method: "GET",
      credentials: "include",
    });
    const result = (await response.json()) as
      | PhotographerSubmissionsResponse
      | ApiResult;

    if (!response.ok) {
      const errorResult = result as ApiResult;
      throw new Error(errorResult.detail || "Submission history could not be loaded.");
    }

    const submissions =
      (result as PhotographerSubmissionsResponse).submissions ?? [];

    if (submissions.length === 0) {
      const empty = document.createElement("p");
      empty.className = "workspace-hint";
      empty.textContent = "You have not submitted any work yet.";
      list.appendChild(empty);
      return;
    }

    submissions.forEach((submission) => {
      const card = document.createElement("article");
      card.className = "submission-card";

      const title = document.createElement("h4");
      title.textContent = submission.title;

      const details = document.createElement("p");
      const submittedAt = submission.submitted_at
        ? new Date(submission.submitted_at).toLocaleDateString()
        : "Date unavailable";
      details.textContent =
        `${submission.submission_type} · ${submission.status} · ${submittedAt}`;

      card.append(title, details);
      list.appendChild(card);
    });
  } catch (error) {
    const status = document.createElement("p");
    status.className = "workspace-hint";
    status.textContent =
      error instanceof Error
        ? error.message
        : "Submission history could not be loaded.";
    list.appendChild(status);
  }
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
    photographerPhotos = photos;

    count.textContent = String(photos.length);

    if (photos.length === 0) {
      status.textContent = "Your portfolio is empty. Your uploaded photographs will appear here.";
      renderPhotographerCollections();
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
    renderPhotographerCollections();
  } catch (error) {
    count.textContent = "—";
    status.textContent =
      error instanceof Error
        ? error.message
        : "Your portfolio could not be loaded. Please try again.";
    photographerPhotos = [];
    renderPhotographerCollections();
  }
}

const photoUploadForm =
  document.querySelector<HTMLFormElement>("#photo-upload-form");

photoUploadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const status = document.querySelector<HTMLElement>("#photo-upload-status");
  const submitButton =
    photoUploadForm.querySelector<HTMLButtonElement>('button[type="submit"]');

  if (!status) return;

  const formData = new FormData(photoUploadForm);
  status.textContent = "Uploading photograph...";
  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch(`${apiBaseUrl}/photographer/photos`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    const result = (await response.json()) as ApiResult;

    if (!response.ok) {
      throw new Error(result.detail || "The photograph could not be uploaded.");
    }

    photoUploadForm.reset();
    status.textContent = "Photograph uploaded.";
    await loadPhotographerPortfolio();
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? error.message
        : "The photograph could not be uploaded.";
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

const collectionCreateForm =
  document.querySelector<HTMLFormElement>("#collection-create-form");

collectionCreateForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const status = document.querySelector<HTMLElement>(
    "#collection-create-status"
  );
  const submitButton =
    collectionCreateForm.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    );
  if (!status) return;

  const formData = new FormData(collectionCreateForm);
  status.textContent = "Creating collection...";
  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch(`${apiBaseUrl}/photographer/collections`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: String(formData.get("title") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim() || null,
      }),
    });
    const result = (await response.json()) as ApiResult;

    if (!response.ok) {
      throw new Error(result.detail || "The collection could not be created.");
    }

    collectionCreateForm.reset();
    status.textContent = "Collection created.";
    await loadPhotographerCollections();
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? error.message
        : "The collection could not be created.";
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

const collectionList =
  document.querySelector<HTMLElement>("#collection-list");

collectionList?.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const button = target.closest<HTMLButtonElement>("[data-add-to-collection]");
  if (!button) return;

  const collectionId = button.dataset.addToCollection;
  if (!collectionId) return;

  const card = button.closest<HTMLElement>(".collection-card");
  const select = card?.querySelector<HTMLSelectElement>("select");
  const status = card?.querySelector<HTMLElement>("[data-collection-status]");

  if (!select?.value || !status) {
    if (status) status.textContent = "Choose a photograph first.";
    return;
  }

  button.disabled = true;
  status.textContent = "Adding photograph...";

  try {
    const response = await fetch(
      `${apiBaseUrl}/photographer/collections/${encodeURIComponent(collectionId)}/photos`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_id: select.value }),
      }
    );
    const result = (await response.json()) as ApiResult;

    if (!response.ok) {
      throw new Error(result.detail || "The photograph could not be added.");
    }

    status.textContent = "Photograph added to collection.";
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? error.message
        : "The photograph could not be added.";
  } finally {
    button.disabled = false;
  }
});

const individualSubmissionForm =
  document.querySelector<HTMLFormElement>("#individual-submission-form");

individualSubmissionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const status = document.querySelector<HTMLElement>(
    "#individual-submission-status"
  );
  const submitButton =
    individualSubmissionForm.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    );
  if (!status) return;

  const photoIds = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      '#portfolio-grid input[name="photo_ids"]:checked'
    )
  ).map((input) => input.value);

  if (photoIds.length === 0) {
    status.textContent = "Select at least one photograph.";
    return;
  }

  const formData = new FormData(individualSubmissionForm);
  status.textContent = "Submitting photographs...";
  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch(`${apiBaseUrl}/photographer/submissions`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submission_type: "individual",
        title: String(formData.get("title") ?? "").trim(),
        cover_note: String(formData.get("cover_note") ?? "").trim() || null,
        photo_ids: photoIds,
      }),
    });
    const result = (await response.json()) as ApiResult;

    if (!response.ok) {
      throw new Error(result.detail || "The submission could not be created.");
    }

    individualSubmissionForm.reset();
    status.textContent = "Photographs submitted for review.";
    await loadPhotographerSubmissions();
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? error.message
        : "The submission could not be created.";
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

const collectionSubmissionForm =
  document.querySelector<HTMLFormElement>("#collection-submission-form");

collectionSubmissionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const status = document.querySelector<HTMLElement>(
    "#collection-submission-status"
  );
  const submitButton =
    collectionSubmissionForm.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    );
  if (!status) return;

  const formData = new FormData(collectionSubmissionForm);
  status.textContent = "Submitting collection...";
  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch(`${apiBaseUrl}/photographer/submissions`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submission_type: "collection",
        title: String(formData.get("title") ?? "").trim(),
        cover_note: String(formData.get("cover_note") ?? "").trim() || null,
        collection_id: String(formData.get("collection_id") ?? ""),
      }),
    });
    const result = (await response.json()) as ApiResult;

    if (!response.ok) {
      throw new Error(result.detail || "The collection could not be submitted.");
    }

    collectionSubmissionForm.reset();
    status.textContent = "Collection submitted for review.";
    await loadPhotographerSubmissions();
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? error.message
        : "The collection could not be submitted.";
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});
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
      void Promise.all([
        loadPhotographerCollections(),
        loadPhotographerPortfolio(),
        loadPhotographerSubmissions(),
      ]);
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
// Admin: partnership purchase destination
const partnershipPurchaseForm =
  document.querySelector<HTMLFormElement>("#partnership-purchase-form");

if (partnershipPurchaseForm) {
  const purchaseUrlInput =
    partnershipPurchaseForm.querySelector<HTMLInputElement>(
      "#partnership-purchase-url"
    );

  const purchaseStatus =
    document.querySelector<HTMLElement>(
      "#partnership-purchase-status"
    );

  const purchaseSubmit =
    partnershipPurchaseForm.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    );

  void (async () => {
    if (!purchaseUrlInput || !purchaseStatus) return;

    purchaseStatus.textContent = "Loading saved purchase destination...";

    try {
      const response = await fetch(
        `${apiBaseUrl}/admin/settings/partnership-purchase`,
        { method: "GET", credentials: "include" }
      );

      const result = (await response.json()) as ApiResult & {
        url?: string;
      };

      if (!response.ok) {
        throw new Error(result.detail || "Settings could not be loaded.");
      }

      purchaseUrlInput.value = result.url || "";
      purchaseStatus.textContent = result.url
        ? "Saved purchase destination loaded."
        : "No purchase destination is configured.";
    } catch (error) {
      purchaseStatus.textContent =
        error instanceof Error
          ? error.message
          : "Settings could not be loaded.";
    }
  })();

  partnershipPurchaseForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!purchaseUrlInput || !purchaseStatus) return;

    const url = purchaseUrlInput.value.trim();

    if (url && !purchaseUrlInput.checkValidity()) {
      purchaseUrlInput.reportValidity();
      return;
    }

    if (purchaseSubmit) {
      purchaseSubmit.disabled = true;
      purchaseSubmit.textContent = "Saving...";
    }

    purchaseStatus.textContent = "Saving purchase destination...";

    try {
      const response = await fetch(
        `${apiBaseUrl}/admin/settings/partnership-purchase`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        }
      );

      const result = (await response.json()) as ApiResult;

      if (!response.ok) {
        throw new Error(result.detail || "The purchase link could not be saved.");
      }

      purchaseStatus.textContent =
        result.message || "Purchase destination saved.";
    } catch (error) {
      purchaseStatus.textContent =
        error instanceof Error
          ? error.message
          : "The purchase link could not be saved.";
    } finally {
      if (purchaseSubmit) {
        purchaseSubmit.disabled = false;
        purchaseSubmit.textContent = "Save purchase link";
      }
    }
  });
}
