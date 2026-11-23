type AccountRole = "admin" | "photographer" | "agent";

interface SessionUser {
  id: string;
  email: string;
  role: AccountRole;
  display_name: string;
  referral_code?: string | null;
  agent_code?: string | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
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

document.querySelectorAll<HTMLElement>("[data-photo-carousel]").forEach((carousel) => {
  const slides = Array.from(carousel.querySelectorAll<HTMLElement>("[data-photo-slide]"));
  const controls = carousel.querySelector<HTMLElement>("[data-carousel-controls]");
  const previous = carousel.querySelector<HTMLButtonElement>("[data-carousel-prev]");
  const next = carousel.querySelector<HTMLButtonElement>("[data-carousel-next]");
  const status = carousel.querySelector<HTMLElement>("[data-carousel-status]");
  if (slides.length < 2 || !controls || !previous || !next || !status) return;

  let current = 0;
  const showSlide = (index: number): void => {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => { slide.hidden = slideIndex !== current; });
    status.textContent = `${current + 1} / ${slides.length}`;
  };
  const autoplayDelay = 7000;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let timer: number | undefined;
  let hovered = false;
  let focused = false;

  const stop = (): void => {
    window.clearInterval(timer);
    timer = undefined;
  };
  const start = (): void => {
    stop();
    if (hovered || focused || reducedMotion.matches || document.hidden) return;
    timer = window.setInterval(() => showSlide(current + 1), autoplayDelay);
  };

  previous.addEventListener("click", () => { showSlide(current - 1); start(); });
  next.addEventListener("click", () => { showSlide(current + 1); start(); });
  carousel.addEventListener("mouseenter", () => { hovered = true; stop(); });
  carousel.addEventListener("mouseleave", () => { hovered = false; start(); });
  carousel.addEventListener("focusin", () => { focused = true; stop(); });
  carousel.addEventListener("focusout", (event) => {
    if (event.relatedTarget instanceof Node && carousel.contains(event.relatedTarget)) return;
    focused = false;
    start();
  });
  document.addEventListener("visibilitychange", start);
  reducedMotion.addEventListener("change", start);

  showSlide(0);
  controls.hidden = false;
  start();
});

// Scroll-reveal animation for the home page story sections and similar blocks.
const revealTargets = document.querySelectorAll<HTMLElement>(
  ".photo-stories-heading, .photo-stories-grid figure, .how-it-works-heading, .how-it-works-steps li, .how-it-works-rates, .agent-notice, .about-story, .feature-list article, .simple-callout, .intro, .gallery article, .collection-card"
);
if (revealTargets.length && "IntersectionObserver" in window &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.documentElement.classList.add("reveal-ready");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  revealTargets.forEach((element, index) => {
    element.classList.add("reveal");
    element.style.setProperty("--reveal-delay", `${(index % 3) * 120}ms`);
    observer.observe(element);
  });
}

const message = document.querySelector<HTMLElement>("#form-message");

async function authenticationRequest(path: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(`${apiBaseUrl}${path}`, options);
  } catch (error) {
    console.error("Authentication request failed.", error);
    throw new Error(
      isLocalDevelopment
        ? "Cannot reach the authentication service. Start the backend and check the allowed frontend origin."
        : "Cannot reach the authentication service. Please try again later."
    );
  }
}

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
    const response = await authenticationRequest("/auth/register", {
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
    const response = await authenticationRequest("/auth/login", {
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
  capture_date: string | null;
  location: string | null;
  keywords: string[];
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
  status: "pending" | "processing" | "accepted" | "rejected" | "withdrawn";
  submitted_at: string;
  reviewed_at: string | null;
  photographer_feedback: string | null;
}

interface PhotographerPhotosResponse {
  photos: PhotographerPhoto[];
  total: number;
  has_more: boolean;
}

interface PhotographerCollectionsResponse {
  collections: PhotographerCollection[];
}

interface PhotographerSubmissionsResponse {
  submissions: PhotographerSubmission[];
  has_more: boolean;
}

interface AdminSubmission {
  id: string;
  photographer_id: string;
  submission_type: "individual" | "collection";
  title: string;
  cover_note: string | null;
  status: "pending" | "under_review" | "accepted" | "rejected" | "withdrawn";
  submitted_at: string;
  reviewed_at: string | null;
  photographer_feedback: string | null;
}

interface AdminSubmissionDetail {
  submission: AdminSubmission;
  photos: { id: string; title: string | null; description: string | null; original_filename: string }[];
  private_notes: string | null;
}

interface AcquisitionOffer {
  id: string;
  submission_id: string;
  photographer_id: string;
  amount_cents: string;
  currency: string;
  rights_type: "license" | "assignment";
  exclusive: boolean;
  territory: string;
  permitted_uses: string;
  attribution: string;
  agreement_terms: string;
  expires_on: string | null;
  gallery_permission: boolean;
  gallery_terms: string;
  consent_statement: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
  responded_at: string | null;
  photos: { id: string; title: string }[];
}

interface GalleryPublication {
  id: string;
  offer_id: string;
  photo_id: string;
  photographer_id: string;
  title: string;
  attribution: string;
  expires_on: string | null;
  published_at: string;
  unpublished_at: string | null;
}

interface PhotographerPreviewResponse {
  photo_id: string;
  preview_url: string;
  expires_in: number;
}

let photographerPhotos: PhotographerPhoto[] = [];
let photographerCollections: PhotographerCollection[] = [];
let photographerSubmissionOffset = 0;
let adminSubmissionOffset = 0;
let photographerSubmissionRequest = 0;
let adminSubmissionRequest = 0;

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

  const description = document.createElement("p");
  description.textContent = photo.description || "";
  const extraMetadata = document.createElement("p");
  extraMetadata.textContent = [
    photo.capture_date,
    photo.location,
    photo.keywords.join(", "),
  ].filter(Boolean).join(" · ");

  const editor = document.createElement("details");
  editor.className = "portfolio-editor";
  const summary = document.createElement("summary");
  summary.textContent = "Edit photograph details";
  const form = document.createElement("form");
  form.className = "workspace-form";

  function addField(
    name: string,
    labelText: string,
    value: string,
    maxLength: number,
    multiline = false
  ): void {
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = multiline
      ? document.createElement("textarea")
      : document.createElement("input");
    input.name = name;
    input.value = value;
    input.maxLength = maxLength;
    if (input instanceof HTMLInputElement && name === "capture_date") {
      input.type = "date";
    }
    label.appendChild(input);
    form.appendChild(label);
  }

  addField("title", "Title", photo.title || "", 160);
  addField("description", "Description", photo.description || "", 3000, true);
  addField("capture_date", "Capture date", photo.capture_date || "", 10);
  addField("location", "Location", photo.location || "", 255);
  addField("keywords", "Keywords (comma-separated)", photo.keywords.join(", "), 2429);

  const save = document.createElement("button");
  save.type = "submit";
  save.className = "button button-dark small";
  save.textContent = "Save details";
  const editStatus = document.createElement("p");
  editStatus.setAttribute("role", "status");
  editStatus.setAttribute("aria-live", "polite");
  form.append(save, editStatus);
  editor.append(summary, form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const keywordText = String(values.get("keywords") || "").trim();
    const keywords = keywordText ? keywordText.split(",").map((word) => word.trim()) : [];
    if (keywords.length > 30 || keywords.some((word) => !word || word.length > 80)) {
      editStatus.textContent = "Enter up to 30 keywords, each 1 to 80 characters long.";
      return;
    }
    save.disabled = true;
    editStatus.textContent = "Saving details...";
    try {
      const response = await fetch(
        `${apiBaseUrl}/photographer/photos/${encodeURIComponent(photo.id)}`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: String(values.get("title") || ""),
            description: String(values.get("description") || ""),
            capture_date: String(values.get("capture_date") || "") || null,
            location: String(values.get("location") || ""),
            keywords,
          }),
        }
      );
      if (!response.ok) {
        const result = (await response.json()) as ApiResult;
        throw new Error(typeof result.detail === "string" ? result.detail : "Details could not be saved.");
      }
      await loadPhotographerPortfolio();
    } catch (error) {
      editStatus.textContent = error instanceof Error ? error.message : "Details could not be saved.";
    } finally {
      save.disabled = false;
    }
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "button button-dark small";
  deleteButton.textContent = "Delete photograph";
  const deleteStatus = document.createElement("p");
  deleteStatus.setAttribute("role", "status");
  deleteStatus.setAttribute("aria-live", "polite");
  deleteButton.addEventListener("click", async () => {
    if (!window.confirm("Delete this photograph? Submitted photographs cannot be deleted.")) return;
    deleteButton.disabled = true;
    deleteStatus.textContent = "Deleting photograph...";
    try {
      const response = await fetch(
        `${apiBaseUrl}/photographer/photos/${encodeURIComponent(photo.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      const result = (await response.json()) as ApiResult;
      if (!response.ok) {
        if (response.status === 502) {
          await Promise.all([loadPhotographerPortfolio(), loadPhotographerOverview()]);
          const cleanupStatus = document.querySelector<HTMLElement>("#photo-cleanup-status");
          if (cleanupStatus) cleanupStatus.textContent = result.detail || "The photograph could not be deleted.";
          return;
        }
        throw new Error(result.detail || "The photograph could not be deleted.");
      }
      await Promise.all([loadPhotographerPortfolio(), loadPhotographerOverview()]);
    } catch (error) {
      deleteStatus.textContent = error instanceof Error ? error.message : "The photograph could not be deleted.";
    } finally {
      deleteButton.disabled = false;
    }
  });

  const selectionLabel = document.createElement("label");
  selectionLabel.className = "portfolio-selection";

  const selection = document.createElement("input");
  selection.type = "checkbox";
  selection.name = "photo_ids";
  selection.value = photo.id;

  const selectionText = document.createElement("span");
  selectionText.textContent = "Select for individual submission";

  selectionLabel.append(selection, selectionText);
  details.append(title, metadata, filename, description, extraMetadata, selectionLabel, editor, deleteButton, deleteStatus);
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

async function loadPhotographerSubmissions(append = false): Promise<void> {
  const list = document.querySelector<HTMLElement>("#submission-list");
  const more = document.querySelector<HTMLButtonElement>("#submission-more");
  if (!list || !more) return;
  const requestId = ++photographerSubmissionRequest;

  if (!append) {
    photographerSubmissionOffset = 0;
    list.replaceChildren();
    more.hidden = true;
  }
  more.disabled = true;

  try {
    const response = await fetch(`${apiBaseUrl}/photographer/submissions?offset=${photographerSubmissionOffset}`, {
      method: "GET",
      credentials: "include",
    });
    const result = (await response.json()) as
      | PhotographerSubmissionsResponse
      | ApiResult;
    if (requestId !== photographerSubmissionRequest) return;

    if (!response.ok) {
      const errorResult = result as ApiResult;
      throw new Error(errorResult.detail || "Submission history could not be loaded.");
    }

    const submissions =
      (result as PhotographerSubmissionsResponse).submissions ?? [];
    photographerSubmissionOffset += submissions.length;
    more.hidden = !(result as PhotographerSubmissionsResponse).has_more;

    if (submissions.length === 0 && !append) {
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
      if (submission.reviewed_at) {
        const reviewed = document.createElement("p");
        reviewed.textContent = `Reviewed ${new Date(submission.reviewed_at).toLocaleDateString()}`;
        card.appendChild(reviewed);
      }
      if (submission.photographer_feedback) {
        const feedback = document.createElement("p");
        feedback.textContent = `Review feedback: ${submission.photographer_feedback}`;
        card.appendChild(feedback);
      }
      list.appendChild(card);
    });
  } catch (error) {
    if (requestId !== photographerSubmissionRequest) return;
    const status = document.createElement("p");
    status.className = "workspace-hint";
    status.textContent =
      error instanceof Error
        ? error.message
        : "Submission history could not be loaded.";
    list.appendChild(status);
  } finally {
    if (requestId === photographerSubmissionRequest) more.disabled = false;
  }
}

document.querySelector<HTMLButtonElement>("#submission-refresh")
  ?.addEventListener("click", () => void loadPhotographerSubmissions());
document.querySelector<HTMLButtonElement>("#submission-more")
  ?.addEventListener("click", () => void loadPhotographerSubmissions(true));

async function loadAdminSubmissions(append = false): Promise<void> {
  const list = document.querySelector<HTMLElement>("#admin-submission-list");
  const status = document.querySelector<HTMLElement>("#admin-submissions-status");
  const more = document.querySelector<HTMLButtonElement>("#admin-submissions-more");
  if (!list || !status || !more) return;
  const requestId = ++adminSubmissionRequest;
  if (!append) {
    adminSubmissionOffset = 0;
    list.replaceChildren();
    more.hidden = true;
  }
  more.disabled = true;
  status.textContent = "Loading submissions...";
  try {
    const response = await fetch(`${apiBaseUrl}/admin/submissions?offset=${adminSubmissionOffset}`, {
      credentials: "include",
    });
    const result = (await response.json()) as ApiResult & { submissions?: AdminSubmission[]; has_more?: boolean };
    if (requestId !== adminSubmissionRequest) return;
    if (!response.ok) throw new Error(result.detail || "Submissions could not be loaded.");
    const submissions = result.submissions || [];
    adminSubmissionOffset += submissions.length;
    more.hidden = !result.has_more;
    status.textContent = submissions.length || append ? "" : "No submissions to review.";
    submissions.forEach((submission) => {
      const card = document.createElement("article");
      card.className = "submission-card";
      const title = document.createElement("h4");
      title.textContent = submission.title;
      const info = document.createElement("p");
      const statusText = submission.status === "under_review" ? "processing" : submission.status;
      info.textContent = `${submission.submission_type} · ${statusText} · ${new Date(submission.submitted_at).toLocaleDateString()} · Photographer ${submission.photographer_id}`;
      const open = document.createElement("button");
      open.type = "button";
      open.className = "button button-dark small";
      open.textContent = "View submission";
      const detail = document.createElement("div");
      open.addEventListener("click", () => void loadAdminSubmissionDetail(submission.id, detail));
      card.append(title, info, open, detail);
      list.appendChild(card);
    });
  } catch (error) {
    if (requestId !== adminSubmissionRequest) return;
    status.textContent = error instanceof Error ? error.message : "Submissions could not be loaded.";
  } finally {
    if (requestId === adminSubmissionRequest) more.disabled = false;
  }
}

async function loadAdminSubmissionDetail(id: string, container: HTMLElement): Promise<void> {
  container.textContent = "Loading submission...";
  try {
    const response = await fetch(`${apiBaseUrl}/admin/submissions/${encodeURIComponent(id)}`, {
      credentials: "include",
    });
    const result = (await response.json()) as AdminSubmissionDetail & ApiResult;
    if (!response.ok) throw new Error(result.detail || "Submission could not be loaded.");
    container.replaceChildren();
    const note = document.createElement("p");
    note.textContent = `Cover note: ${result.submission.cover_note || "None"}`;
    const privateNote = document.createElement("p");
    privateNote.textContent = `Internal notes (admin only): ${result.private_notes || "None"}`;
    const feedback = document.createElement("p");
    feedback.textContent = `Photographer feedback: ${result.submission.photographer_feedback || "None"}`;
    container.append(note, privateNote, feedback);

    const photoGrid = document.createElement("div");
    photoGrid.className = "submission-photo-grid";
    result.photos.forEach((photo) => {
      const figure = document.createElement("figure");
      const image = document.createElement("img");
      image.alt = photo.title || photo.original_filename;
      image.loading = "lazy";
      const caption = document.createElement("figcaption");
      caption.textContent = photo.title || photo.original_filename;
      if (photo.description) caption.textContent += ` — ${photo.description}`;
      const previewStatus = document.createElement("p");
      previewStatus.textContent = "Loading preview...";
      figure.append(image, caption, previewStatus);
      photoGrid.appendChild(figure);
      void (async () => {
        try {
          const previewResponse = await fetch(
            `${apiBaseUrl}/admin/submissions/${encodeURIComponent(id)}/photos/${encodeURIComponent(photo.id)}/preview`,
            { credentials: "include" }
          );
          const preview = (await previewResponse.json()) as ApiResult & { preview_url?: string };
          if (!previewResponse.ok || !preview.preview_url) {
            throw new Error(preview.detail || "Preview unavailable.");
          }
          image.addEventListener("error", () => { previewStatus.textContent = "Preview unavailable."; });
          image.src = preview.preview_url;
          previewStatus.textContent = "";
        } catch (error) {
          previewStatus.textContent = error instanceof Error ? error.message : "Preview unavailable.";
        }
      })();
    });
    if (!result.photos.length) {
      const empty = document.createElement("p");
      empty.textContent = "No photographs found in this submission.";
      container.appendChild(empty);
    }
    container.appendChild(photoGrid);

    const current = result.submission.status;
    if (current === "accepted") {
      container.appendChild(createAcquisitionOfferForm(result));
    }
    if (current !== "pending" && current !== "under_review") return;
    const form = document.createElement("form");
    form.className = "workspace-form";
    const statusLabel = document.createElement("label");
    statusLabel.textContent = "Review outcome";
    const select = document.createElement("select");
    select.required = true;
    select.add(new Option("Choose an outcome", ""));
    if (current === "pending") select.add(new Option("Processing", "under_review"));
    select.add(new Option("Accepted", "accepted"));
    select.add(new Option("Rejected", "rejected"));
    statusLabel.appendChild(select);
    const feedbackLabel = document.createElement("label");
    feedbackLabel.textContent = "Feedback visible to the photographer";
    const feedbackInput = document.createElement("textarea");
    feedbackInput.maxLength = 5000;
    feedbackInput.value = result.submission.photographer_feedback || "";
    feedbackLabel.appendChild(feedbackInput);
    const hint = document.createElement("p");
    hint.textContent = "Feedback is required for rejection. Accepted and rejected decisions are final.";
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "button button-dark small";
    save.textContent = "Save review";
    const message = document.createElement("p");
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    form.append(statusLabel, feedbackLabel, hint, save, message);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const feedbackValue = feedbackInput.value.trim();
      if (select.value === "rejected" && !feedbackValue) {
        message.textContent = "Feedback is required when rejecting a submission.";
        return;
      }
      if ((select.value === "accepted" || select.value === "rejected") &&
          !window.confirm("This decision is final. Continue?")) return;
      save.disabled = true;
      message.textContent = "Saving review...";
      try {
        const reviewResponse = await fetch(
          `${apiBaseUrl}/admin/submissions/${encodeURIComponent(id)}/review`,
          {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expected_status: current,
              status: select.value,
              photographer_feedback: feedbackValue || null,
            }),
          }
        );
        const review = (await reviewResponse.json()) as ApiResult;
        if (!reviewResponse.ok) throw new Error(review.detail || "Review could not be saved.");
        await loadAdminSubmissions();
      } catch (error) {
        message.textContent = error instanceof Error ? error.message : "Review could not be saved.";
      } finally {
        save.disabled = false;
      }
    });
    container.appendChild(form);
  } catch (error) {
    container.textContent = error instanceof Error ? error.message : "Submission could not be loaded.";
  }
}

document.querySelector<HTMLButtonElement>("#admin-submissions-refresh")
  ?.addEventListener("click", () => void loadAdminSubmissions());
document.querySelector<HTMLButtonElement>("#admin-submissions-more")
  ?.addEventListener("click", () => void loadAdminSubmissions(true));

function formatUsdCents(cents: string): string {
  const amount = BigInt(cents);
  return `$${(amount / 100n).toLocaleString("en-US")}.${String(amount % 100n).padStart(2, "0")}`;
}

function isExpired(date: string | null): boolean {
  return date !== null && date < new Date().toISOString().slice(0, 10);
}

function createAcquisitionOfferForm(detail: AdminSubmissionDetail): HTMLElement {
  const section = document.createElement("details");
  const heading = document.createElement("summary");
  heading.textContent = "Create acquisition offer";
  const form = document.createElement("form");
  form.className = "workspace-form acquisition-form";
  form.innerHTML = `
    <p>Select the photographs covered by this offer (up to 100).</p>
    <div class="offer-photo-selection"></div>
    <p>The offer amount is calculated at $120 per partner photo and $100 per non-partner photo, based on partnership status at each photo's first approval. Acceptance credits the photographer's available wallet.</p>
    <label>Rights <select name="rights_type" required><option value="">Choose rights</option><option value="license">License</option><option value="assignment">Assignment</option></select></label>
    <label class="offer-checkbox"><input type="checkbox" name="exclusive"> Exclusive</label>
    <label>Territory <input name="territory" maxlength="500" required></label>
    <label>Permitted uses <textarea name="permitted_uses" maxlength="5000" required></textarea></label>
    <label>Photographer attribution <input name="attribution" maxlength="500" required></label>
    <label>Full agreement terms <textarea name="agreement_terms" maxlength="10000" required></textarea></label>
    <label>Agreement ends on <input name="expires_on" type="date"></label>
    <p>Leave the end date blank only for a perpetual agreement.</p>
    <label class="offer-checkbox"><input type="checkbox" name="gallery_permission"> Request permission to publish downloadable originals worldwide in the Visora gallery</label>
    <p>With permission: visitors can view and download originals, and saved copies may remain after removal. Permission lasts until the agreement expires or publication is withdrawn.</p>
    <p>Use reviewed agreement terms. Offers cannot be edited once sent; cancel and replace a pending offer instead.</p>
    <button class="button button-dark small" type="submit">Send offer</button>
    <p class="offer-form-status" role="status" aria-live="polite"></p>
  `;
  const selections = form.querySelector<HTMLElement>(".offer-photo-selection");
  const status = form.querySelector<HTMLElement>(".offer-form-status");
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (selections) {
    detail.photos.forEach((photo) => {
      const label = document.createElement("label");
      label.className = "offer-checkbox";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "photo_ids";
      checkbox.value = photo.id;
      const text = document.createElement("span");
      text.textContent = photo.title || photo.original_filename;
      label.append(checkbox, text);
      selections.appendChild(label);
    });
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!status || !submit) return;
    const data = new FormData(form);
    const photoIds = data.getAll("photo_ids").map(String);
    if (photoIds.length < 1 || photoIds.length > 100) {
      status.textContent = "Select between 1 and 100 photographs.";
      return;
    }
    submit.disabled = true;
    status.textContent = "Calculating offer...";
    let sending = false;
    try {
      const quoteResponse = await fetch(`${apiBaseUrl}/admin/acquisition-offers/quote`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: detail.submission.id, photo_ids: photoIds }),
      });
      const quote = (await quoteResponse.json()) as ApiResult & {
        amount_cents?: string; partner_count?: number; non_partner_count?: number;
      };
      if (!quoteResponse.ok) throw new Error(typeof quote.detail === "string" ? quote.detail : "Offer amount could not be calculated.");
      if (typeof quote.amount_cents !== "string" || !/^[1-9][0-9]{0,6}$/.test(quote.amount_cents) ||
          !Number.isInteger(quote.partner_count) || !Number.isInteger(quote.non_partner_count) ||
          typeof quote.partner_count !== "number" || typeof quote.non_partner_count !== "number" ||
          quote.partner_count < 0 || quote.non_partner_count < 0 ||
          quote.partner_count + quote.non_partner_count !== photoIds.length ||
          Number(quote.amount_cents) !== quote.partner_count * 12000 + quote.non_partner_count * 10000) {
        throw new Error("The server returned an invalid offer amount.");
      }
      if (!window.confirm(`Send this binding offer for ${formatUsdCents(quote.amount_cents)} USD? ${quote.partner_count} partner-rate and ${quote.non_partner_count} non-partner-rate photographs. Terms cannot be edited after sending.`)) {
        status.textContent = "Offer cancelled.";
        return;
      }
      sending = true;
      status.textContent = "Sending offer...";
      const response = await fetch(`${apiBaseUrl}/admin/acquisition-offers`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: detail.submission.id,
          photo_ids: photoIds,
          amount_cents: quote.amount_cents,
          rights_type: String(data.get("rights_type") || ""),
          exclusive: data.has("exclusive"),
          territory: String(data.get("territory") || "").trim(),
          permitted_uses: String(data.get("permitted_uses") || "").trim(),
          attribution: String(data.get("attribution") || "").trim(),
          agreement_terms: String(data.get("agreement_terms") || "").trim(),
          expires_on: String(data.get("expires_on") || "") || null,
          gallery_permission: data.has("gallery_permission"),
        }),
      });
      if (response.status === 408 || response.status >= 500) {
        throw new Error("The offer could not be confirmed. Refresh offers before trying again.");
      }
      const result = (await response.json()) as ApiResult & { id?: unknown };
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Offer could not be sent. Check all fields.");
      if (!result || typeof result.id !== "string" || !result.id) {
        throw new Error("The offer could not be confirmed. Refresh offers before trying again.");
      }
      form.reset();
      status.textContent = "Offer sent.";
      await refreshAdminOffers();
    } catch (error) {
      status.textContent = sending && (error instanceof TypeError || error instanceof SyntaxError)
        ? "The offer could not be confirmed. Refresh offers before trying again."
        : error instanceof Error ? error.message : "Offer could not be sent.";
    } finally {
      submit.disabled = false;
    }
  });
  section.append(heading, form);
  return section;
}

function setupPagedList<T>(
  id: string,
  endpoint: string,
  key: "offers" | "publications" | "applications" | "withdrawals",
  emptyMessage: string,
  render: (item: T) => HTMLElement
): () => Promise<void> {
  let offset = 0;
  let requestId = 0;
  const list = document.getElementById(id);
  const status = document.getElementById(`${id}-status`);
  const more = document.querySelector<HTMLButtonElement>(`#${id}-more`);
  const refresh = document.querySelector<HTMLButtonElement>(`#${id}-refresh`);

  async function load(append: boolean): Promise<void> {
    if (!list || !status || !more) return;
    const currentRequest = ++requestId;
    if (!append) {
      offset = 0;
      list.replaceChildren();
      more.hidden = true;
    }
    more.disabled = true;
    status.textContent = "Loading...";
    try {
      const response = await fetch(`${apiBaseUrl}${endpoint}?offset=${offset}`, { credentials: "include" });
      const result = (await response.json()) as ApiResult & { offers?: T[]; publications?: T[]; applications?: T[]; withdrawals?: T[]; has_more?: boolean };
      if (currentRequest !== requestId) return;
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Could not load records.");
      const items = result[key];
      if (!Array.isArray(items) || typeof result.has_more !== "boolean") {
        throw new Error("The server returned an invalid response.");
      }
      offset += items.length;
      more.hidden = !result.has_more;
      status.textContent = items.length || append ? "" : emptyMessage;
      items.forEach((item) => list.appendChild(render(item)));
    } catch (error) {
      if (currentRequest === requestId) {
        status.textContent = error instanceof Error ? error.message : "Could not load records.";
      }
    } finally {
      if (currentRequest === requestId) more.disabled = false;
    }
  }
  refresh?.addEventListener("click", () => void load(false));
  more?.addEventListener("click", () => void load(true));
  return () => load(false);
}

let walletRequest = 0;

async function loadWallet(): Promise<void> {
  const status = document.getElementById("wallet-status");
  const available = document.getElementById("wallet-available");
  const pending = document.getElementById("wallet-pending");
  if (!status || !available || !pending) return;
  const requestId = ++walletRequest;
  available.textContent = "—";
  pending.textContent = "—";
  status.textContent = "Loading wallet...";
  try {
    const response = await fetch(`${apiBaseUrl}/photographer/wallet`, { credentials: "include" });
    const result = (await response.json()) as ApiResult & {
      wallet?: { currency: string; available_balance_cents: string; pending_balance_cents: string } | null;
    };
    if (requestId !== walletRequest) return;
    if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Wallet could not be loaded.");
    if (result.wallet === null) {
      status.textContent = "No wallet account yet. Your balance will appear here when an account is created.";
    } else if (result.wallet && result.wallet.currency === "USD" &&
        typeof result.wallet.available_balance_cents === "string" && /^\d+$/.test(result.wallet.available_balance_cents) &&
        typeof result.wallet.pending_balance_cents === "string" && /^\d+$/.test(result.wallet.pending_balance_cents)) {
      available.textContent = formatUsdCents(result.wallet.available_balance_cents);
      pending.textContent = formatUsdCents(result.wallet.pending_balance_cents);
      status.textContent = "";
    } else {
      throw new Error("The server returned an invalid wallet response.");
    }
  } catch (error) {
    if (requestId !== walletRequest) return;
    status.textContent = error instanceof Error ? error.message : "Wallet could not be loaded.";
  }
}

document.querySelector<HTMLButtonElement>("#wallet-refresh")
  ?.addEventListener("click", () => void loadWallet());

interface Withdrawal {
  id: string;
  photographer_id?: string;
  amount_cents: string;
  currency: string;
  method: string | null;
  destination: string | null;
  status: string;
  fee_status: string;
  withdrawal_fee_cents: string | null;
  company_charge_cents: string | null;
  fee_total_cents: string | null;
  fee_recipient: string | null;
  fee_receipt_reference: string | null;
  payout_receipt_reference: string | null;
  refund_receipt_reference: string | null;
  reviewer_notes: string | null;
  requested_at?: string;
  paid_at?: string | null;
  refunded_at?: string | null;
}

function createPhotographerWithdrawalCard(withdrawal: Withdrawal): HTMLElement {
  const card = document.createElement("article");
  card.className = "submission-card wallet-activity-card";
  const top = document.createElement("div");
  top.className = "wallet-activity-top";
  const heading = document.createElement("h4");
  heading.textContent = `${formatUsdCents(withdrawal.amount_cents)} USD`;
  const state = document.createElement("span");
  state.className = "wallet-activity-badge";
  state.textContent = withdrawal.status.replace(/_/g, " ");
  top.append(heading, state);
  const details = document.createElement("p");
  const feeCents = withdrawal.fee_total_cents;
  const fee = typeof feeCents !== "string" || !/^\d+$/.test(feeCents)
    ? "Fee unavailable"
    : feeCents === "0"
      ? "No fee required"
      : `Fee ${formatUsdCents(feeCents)} USD · ${typeof withdrawal.fee_status === "string" ? withdrawal.fee_status.replace(/_/g, " ") : "status unavailable"}`;
  details.textContent = `${withdrawal.method ? withdrawal.method.replace(/_/g, " ") : "Method pending"} · ${fee}`;
  card.append(top);
  if (withdrawal.requested_at) {
    const date = new Date(withdrawal.requested_at);
    if (Number.isFinite(date.getTime())) {
      const timestamp = document.createElement("p");
      timestamp.className = "wallet-activity-date";
      timestamp.textContent = `Requested ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date)}`;
      card.append(timestamp);
    }
  }
  const notice = document.createElement("p");
  notice.textContent = withdrawal.reviewer_notes ? `Review: ${withdrawal.reviewer_notes}` : "Wallet balances are not proof that a payout was sent.";
  card.append(details, notice);
  if (typeof feeCents === "string" && /^\d+$/.test(feeCents) && feeCents !== "0") {
    const recipient = document.createElement("p");
    recipient.textContent = `Fee recipient: ${withdrawal.fee_recipient || "Not configured; contact Visora before paying."}`;
    card.appendChild(recipient);
  }
  return card;
}

const refreshPhotographerWithdrawals = setupPagedList<Withdrawal>(
  "withdrawals", "/photographer/withdrawals", "withdrawals", "No withdrawal requests yet.",
  createPhotographerWithdrawalCard,
);

const withdrawalForm = document.querySelector<HTMLFormElement>("#withdrawal-form");
withdrawalForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector<HTMLElement>("#withdrawal-form-status");
  const submit = withdrawalForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!status || !submit) return;
  const data = new FormData(withdrawalForm);
  let creatingRequest = false;
  submit.disabled = true;
  status.textContent = "Calculating the fee...";
  try {
    const amount = String(data.get("amount_cents") || "");
    if (!/^[1-9][0-9]{0,18}$/.test(amount) || BigInt(amount) < 1500000n || BigInt(amount) > 9223372036854775807n) {
      throw new Error("Enter an amount of at least $15,000 within the supported range.");
    }
    const quoteResponse = await fetch(`${apiBaseUrl}/photographer/withdrawals/fee-quote`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount_cents: amount }),
    });
    const quote = await quoteResponse.json() as ApiResult & {
      exempt?: boolean; fee_total_cents?: string; withdrawal_fee_cents?: string; company_charge_cents?: string; fee_recipient?: string | null;
    };
    if (!quoteResponse.ok) throw new Error(typeof quote.detail === "string" ? quote.detail : "The withdrawal fee could not be calculated.");
    if (typeof quote.exempt !== "boolean" ||
        typeof quote.fee_total_cents !== "string" || !/^(0|[1-9][0-9]*)$/.test(quote.fee_total_cents) ||
        typeof quote.withdrawal_fee_cents !== "string" || !/^(0|[1-9][0-9]*)$/.test(quote.withdrawal_fee_cents) ||
        typeof quote.company_charge_cents !== "string" || !/^(0|[1-9][0-9]*)$/.test(quote.company_charge_cents) ||
        (quote.fee_recipient !== null && typeof quote.fee_recipient !== "string") ||
        BigInt(quote.fee_total_cents) !== BigInt(quote.withdrawal_fee_cents) + BigInt(quote.company_charge_cents) ||
        (quote.exempt && quote.fee_total_cents !== "0")) {
      throw new Error("The server returned an invalid fee quote.");
    }
    if (!quote.exempt && !quote.fee_recipient?.trim()) {
      throw new Error("The fee recipient is not configured. Contact Visora before requesting a withdrawal.");
    }
    const confirmFee = window.confirm(
      quote.exempt
        ? "No separate fee is required for this withdrawal. Submit the withdrawal request?"
        : `This request requires a separate ${formatUsdCents(quote.fee_total_cents)} USD fee: ${formatUsdCents(quote.withdrawal_fee_cents)} withdrawal fee and ${formatUsdCents(quote.company_charge_cents)} company charge.\n\nRecipient: ${quote.fee_recipient || "Not configured; contact Visora before paying."}\nThe fee is paid separately before payout and verified by an administrator. A paid fee must be refunded if the request is rejected.\n\nSubmit the withdrawal request?`,
    );
    if (!confirmFee) {
      status.textContent = "Withdrawal request cancelled.";
      return;
    }
    creatingRequest = true;
    status.textContent = "Submitting...";
    const response = await fetch(`${apiBaseUrl}/photographer/withdrawals`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount_cents: amount,
        method: data.get("method"),
        destination: data.get("destination"),
        expected_fee_total_cents: quote.fee_total_cents,
        expected_withdrawal_fee_cents: quote.withdrawal_fee_cents,
        expected_company_charge_cents: quote.company_charge_cents,
        expected_fee_recipient: quote.fee_recipient,
      }),
    });
    if (response.status === 408 || response.status >= 500) {
      throw new Error("The request could not be confirmed. Refresh withdrawals before submitting again.");
    }
    let result: ApiResult & { id?: unknown };
    try {
      result = await response.json() as ApiResult & { id?: unknown };
    } catch (error) {
      console.error("Could not read the withdrawal response.", error);
      throw new Error(response.ok
        ? "The request could not be confirmed. Refresh withdrawals before submitting again."
        : "Withdrawal could not be requested.");
    }
    if (!response.ok) throw new Error(result && typeof result.detail === "string" ? result.detail : "Withdrawal could not be requested.");
    if (!result || typeof result.id !== "string" || !result.id) {
      throw new Error("The request could not be confirmed. Refresh withdrawals before submitting again.");
    }
    withdrawalForm.reset();
    status.textContent = "Withdrawal request submitted.";
    await Promise.all([loadWallet(), refreshPhotographerWithdrawals()]);
  } catch (error) {
    status.textContent = creatingRequest && error instanceof TypeError
      ? "The request could not be confirmed. Refresh withdrawals before submitting again."
      : error instanceof Error ? error.message : "Withdrawal could not be requested.";
  } finally {
    submit.disabled = false;
  }
});

function createOfferCard(offer: AcquisitionOffer, admin: boolean): HTMLElement {
  const card = document.createElement("article");
  card.className = "submission-card";
  const heading = document.createElement("h4");
  heading.textContent = `${formatUsdCents(offer.amount_cents)} USD · ${offer.status}`;
  const info = document.createElement("p");
  info.textContent = `Offered ${new Date(offer.created_at).toLocaleDateString()}${offer.responded_at ? ` · Responded ${new Date(offer.responded_at).toLocaleDateString()}` : ""}${admin ? ` · Photographer ${offer.photographer_id} · Submission ${offer.submission_id}` : ""}`;
  const photos = document.createElement("p");
  photos.textContent = `Photographs: ${offer.photos.map((photo) => `${photo.title} (${photo.id})`).join(", ")}`;
  const photoDetails = document.createElement("details");
  const photoSummary = document.createElement("summary");
  photoSummary.textContent = "View photographs in this offer";
  const photoGrid = document.createElement("div");
  photoGrid.className = "submission-photo-grid";
  photoDetails.append(photoSummary, photoGrid);
  photoDetails.addEventListener("toggle", () => {
    if (!photoDetails.open) return;
    photoGrid.replaceChildren();
    offer.photos.forEach((photo) => {
      const figure = document.createElement("figure");
      const caption = document.createElement("figcaption");
      caption.textContent = `${photo.title} (${photo.id})`;
      const image = document.createElement("img");
      image.alt = photo.title;
      image.loading = "lazy";
      const imageStatus = document.createElement("p");
      imageStatus.textContent = "Loading preview...";
      figure.append(image, caption, imageStatus);
      photoGrid.appendChild(figure);
      const endpoint = admin
        ? `/admin/submissions/${encodeURIComponent(offer.submission_id)}/photos/${encodeURIComponent(photo.id)}/preview`
        : `/photographer/photos/${encodeURIComponent(photo.id)}/preview`;
      void (async () => {
        try {
          const response = await fetch(`${apiBaseUrl}${endpoint}`, { credentials: "include" });
          const preview = (await response.json()) as ApiResult & { preview_url?: string };
          if (!response.ok || !preview.preview_url) throw new Error("Preview unavailable.");
          image.addEventListener("error", () => { imageStatus.textContent = "Preview unavailable."; });
          image.src = preview.preview_url;
          imageStatus.textContent = "";
        } catch (error) {
          imageStatus.textContent = error instanceof Error ? error.message : "Preview unavailable.";
        }
      })();
    });
  });
  const terms = document.createElement("p");
  terms.className = "agreement-text";
  terms.textContent = [
    `Rights: ${offer.rights_type}; ${offer.exclusive ? "exclusive" : "non-exclusive"}`,
    `Territory: ${offer.territory}`,
    `Permitted uses: ${offer.permitted_uses}`,
    `Attribution: ${offer.attribution}`,
    `Duration: ${offer.expires_on ? `through ${offer.expires_on} (UTC)` : "perpetual"}`,
    `Gallery: ${offer.gallery_terms}`,
    `Agreement terms:\n${offer.agreement_terms}`,
  ].join("\n");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  card.append(heading, info, photos, photoDetails, terms, status);
  if (offer.status === "pending" && !admin) {
    const consent = document.createElement("label");
    consent.className = "offer-checkbox";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const text = document.createElement("span");
    text.textContent = offer.consent_statement;
    consent.append(checkbox, text);
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "button button-dark small";
    accept.textContent = "Accept offer";
    accept.disabled = isExpired(offer.expires_on);
    const decline = document.createElement("button");
    decline.type = "button";
    decline.className = "button button-dark small";
    decline.textContent = "Decline offer";
    if (accept.disabled) status.textContent = "This offer has expired.";
    async function respond(accepted: boolean): Promise<void> {
      if (accepted && !checkbox.checked) {
        status.textContent = "Confirm that you agree to the terms before accepting.";
        return;
      }
      if (!window.confirm(accepted
        ? "Accept this agreement and credit the stated amount to your available wallet? This cannot be undone."
        : "Decline this offer?")) return;
      accept.disabled = true;
      decline.disabled = true;
      status.textContent = "Saving your response...";
      try {
        const response = await fetch(`${apiBaseUrl}/photographer/acquisition-offers/${encodeURIComponent(offer.id)}/response`, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accept: accepted, confirm_terms: accepted && checkbox.checked }),
        });
        const result = (await response.json()) as ApiResult;
        if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Response could not be saved.");
        await Promise.all([refreshPhotographerOffers(), loadWallet(), loadAcquisitionLimit()]);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Response could not be saved.";
        if (accepted) void loadAcquisitionLimit();
      } finally {
        accept.disabled = isExpired(offer.expires_on);
        decline.disabled = false;
      }
    }
    accept.addEventListener("click", () => void respond(true));
    decline.addEventListener("click", () => void respond(false));
    card.append(consent, accept, decline);
  }
  if (admin && offer.status === "pending") {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "button button-dark small";
    cancel.textContent = "Cancel offer";
    cancel.addEventListener("click", async () => {
      if (!window.confirm("Cancel this pending offer?")) return;
      cancel.disabled = true;
      try {
        const response = await fetch(`${apiBaseUrl}/admin/acquisition-offers/${encodeURIComponent(offer.id)}/cancel`, {
          method: "POST", credentials: "include",
        });
        const result = (await response.json()) as ApiResult;
        if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Offer could not be cancelled.");
        await refreshAdminOffers();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Offer could not be cancelled.";
      } finally {
        cancel.disabled = false;
      }
    });
    card.appendChild(cancel);
  }
  if (admin && offer.status === "accepted" && offer.gallery_permission && !isExpired(offer.expires_on)) {
    offer.photos.forEach((photo) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-dark small";
      button.textContent = `Publish ${photo.title}`;
      button.addEventListener("click", async () => {
        if (!window.confirm("Publish this original publicly in the Visora gallery?")) return;
        button.disabled = true;
        try {
          const response = await fetch(`${apiBaseUrl}/admin/publications`, {
            method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ offer_id: offer.id, photo_id: photo.id }),
          });
          const result = (await response.json()) as ApiResult;
          if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Publication failed.");
          status.textContent = "Photograph published.";
          await refreshAdminPublications();
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : "Publication failed.";
        } finally {
          button.disabled = false;
        }
      });
      card.appendChild(button);
    });
  }
  return card;
}

function createPublicationCard(publication: GalleryPublication, admin: boolean): HTMLElement {
  const card = document.createElement("article");
  card.className = "submission-card";
  const title = document.createElement("h4");
  title.textContent = publication.title;
  const info = document.createElement("p");
  const state = publication.unpublished_at ? "Unpublished" : isExpired(publication.expires_on) ? "Expired" : "Published";
  info.textContent = `${state} · ${publication.attribution} · ${new Date(publication.published_at).toLocaleDateString()}`;
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  card.append(title, info, status);
  if (state === "Published") {
    const link = document.createElement("a");
    link.href = `${apiBaseUrl}/gallery/${encodeURIComponent(publication.id)}/image`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View published original";
    card.appendChild(link);
  }
  if (admin && !publication.unpublished_at) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-dark small";
    button.textContent = "Unpublish";
    button.addEventListener("click", async () => {
      if (!window.confirm("Remove this original from the public gallery?")) return;
      button.disabled = true;
      try {
        const response = await fetch(`${apiBaseUrl}/admin/publications/${encodeURIComponent(publication.id)}/unpublish`, {
          method: "POST", credentials: "include",
        });
        const result = (await response.json()) as ApiResult;
        if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Could not unpublish.");
        await refreshAdminPublications();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Could not unpublish.";
      } finally {
        button.disabled = false;
      }
    });
    card.appendChild(button);
  }
  return card;
}

function createPublicGalleryCard(publication: GalleryPublication): HTMLElement {
  const card = document.createElement("article");
  card.className = "portfolio-card";
  const image = document.createElement("img");
  image.className = "portfolio-image";
  image.loading = "lazy";
  image.alt = publication.title;
  image.src = `${apiBaseUrl}/gallery/${encodeURIComponent(publication.id)}/image`;
  const link = document.createElement("a");
  link.className = "portfolio-image-link";
  link.href = image.src;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.appendChild(image);
  const imageFrame = document.createElement("div");
  imageFrame.className = "portfolio-image-frame";
  imageFrame.appendChild(link);
  const details = document.createElement("div");
  details.className = "portfolio-card-details";
  const title = document.createElement("h3");
  title.textContent = publication.title;
  const attribution = document.createElement("p");
  attribution.textContent = publication.attribution;
  const status = document.createElement("p");
  image.addEventListener("error", () => { status.textContent = "Photograph is unavailable."; });
  details.append(title, attribution, status);
  card.append(imageFrame, details);
  return card;
}

const refreshPhotographerOffers = setupPagedList<AcquisitionOffer>(
  "photographer-offers", "/photographer/acquisition-offers", "offers", "No acquisition offers yet.",
  (offer) => createOfferCard(offer, false)
);
const refreshAdminOffers = setupPagedList<AcquisitionOffer>(
  "admin-offers", "/admin/acquisition-offers", "offers", "No acquisition offers yet.",
  (offer) => createOfferCard(offer, true)
);
const refreshPhotographerPublications = setupPagedList<GalleryPublication>(
  "photographer-publications", "/photographer/publications", "publications", "No publication history yet.",
  (publication) => createPublicationCard(publication, false)
);
const refreshAdminPublications = setupPagedList<GalleryPublication>(
  "admin-publications", "/admin/publications", "publications", "No publication history yet.",
  (publication) => createPublicationCard(publication, true)
);
const refreshPublicGallery = setupPagedList<GalleryPublication>(
  "public-gallery", "/gallery", "publications", "No photographs have been published yet.",
  createPublicGalleryCard
);
if (document.getElementById("public-gallery")) void refreshPublicGallery();

interface PartnershipApplication {
  id: string;
  photographer_id: string;
  proof_type: "code" | "image";
  status: "pending" | "approved" | "rejected";
  partnership_id: string | null;
  submitted_at: string;
  review_reason: string | null;
  proof_deleted_at: string | null;
}

function createPartnershipCard(application: PartnershipApplication, admin: boolean): HTMLElement {
  const card = document.createElement("article");
  card.className = "submission-card";
  const heading = document.createElement("h3");
  heading.textContent = `Partnership · ${application.status}`;
  const detail = document.createElement("p");
  detail.textContent = `Submitted ${new Date(application.submitted_at).toLocaleDateString()}${admin ? ` · Photographer ${application.photographer_id}` : ""}`;
  card.append(heading, detail);
  if (application.partnership_id) {
    const id = document.createElement("p");
    id.textContent = `Partnership ID: ${application.partnership_id}`;
    card.appendChild(id);
  }
  if (application.review_reason) {
    const reason = document.createElement("p");
    reason.textContent = `Review: ${application.review_reason}`;
    card.appendChild(reason);
  }
  if (application.proof_deleted_at) {
    const deleted = document.createElement("p");
    deleted.textContent = "Proof deleted by an administrator; the application record is retained.";
    card.appendChild(deleted);
  }
  if (!admin) return card;

  if (application.proof_deleted_at) return card;
  const proofButton = document.createElement("button");
  proofButton.type = "button";
  proofButton.className = "button button-dark small";
  proofButton.textContent = "View proof";
  const proofContainer = document.createElement("div");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  proofButton.addEventListener("click", async () => {
    if (proofContainer.hasChildNodes()) {
      proofContainer.replaceChildren();
      proofButton.textContent = "View proof";
      return;
    }
    proofButton.disabled = true;
    status.textContent = "Loading proof...";
    try {
      const response = await fetch(`${apiBaseUrl}/admin/partnership-applications/${encodeURIComponent(application.id)}/proof`, {
        credentials: "include", cache: "no-store",
      });
      const result = await response.json() as ApiResult & {
        proof_type?: "code" | "image";
        proof?: { code?: string; mime_type?: string; base64?: string };
      };
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Proof could not be loaded.");
      if (result.proof_type === "code" && typeof result.proof?.code === "string") {
        const code = document.createElement("p");
        code.textContent = `Card code: ${result.proof.code}`;
        proofContainer.appendChild(code);
      } else if (result.proof_type === "image" && result.proof?.base64 &&
        ["image/jpeg", "image/png", "image/webp"].includes(result.proof.mime_type || "")) {
        const image = document.createElement("img");
        image.alt = "Submitted partnership card";
        image.style.maxWidth = "100%";
        image.src = `data:${result.proof.mime_type};base64,${result.proof.base64}`;
        proofContainer.appendChild(image);
      } else {
        throw new Error("The server returned invalid proof.");
      }
      proofButton.textContent = "Hide proof";
      status.textContent = "";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Proof could not be loaded.";
    } finally {
      proofButton.disabled = false;
    }
  });
  card.append(proofButton, proofContainer, status);
  if (application.status === "pending") {
    const reason = document.createElement("textarea");
    reason.maxLength = 2000;
    reason.placeholder = "Reason (required for rejection)";
    reason.setAttribute("aria-label", "Partnership review reason");
    const approve = document.createElement("button");
    approve.type = "button";
    approve.className = "button button-dark small";
    approve.textContent = "Approve partnership";
    const reject = document.createElement("button");
    reject.type = "button";
    reject.className = "button button-dark small";
    reject.textContent = "Reject application";
    async function review(approved: boolean): Promise<void> {
      if (!approved && !reason.value.trim()) {
        status.textContent = "Enter a reason for rejection.";
        return;
      }
      if (approved && !window.confirm("Confirm that you independently verified the card purchase. Approval issues a partnership ID.")) return;
      approve.disabled = true;
      reject.disabled = true;
      status.textContent = "Saving decision...";
      try {
        const response = await fetch(`${apiBaseUrl}/admin/partnership-applications/${encodeURIComponent(application.id)}/review`, {
          method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approve: approved, reason: reason.value.trim() }),
        });
        const result = await response.json() as ApiResult;
        if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Decision could not be saved.");
        await refreshAdminPartnerships();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Decision could not be saved.";
      } finally {
        approve.disabled = false;
        reject.disabled = false;
      }
    }
    approve.addEventListener("click", () => void review(true));
    reject.addEventListener("click", () => void review(false));
    card.append(reason, approve, reject);
  } else {
    const deletionReason = document.createElement("textarea");
    deletionReason.maxLength = 2000;
    deletionReason.placeholder = "Reason for deleting proof";
    deletionReason.setAttribute("aria-label", "Proof deletion reason");
    const deleteProof = document.createElement("button");
    deleteProof.type = "button";
    deleteProof.className = "button button-dark small";
    deleteProof.textContent = "Delete proof";
    deleteProof.addEventListener("click", async () => {
      if (!deletionReason.value.trim()) {
        status.textContent = "Enter a reason for deleting the proof.";
        return;
      }
      if (!window.confirm("Remove the card proof from the active application? Backups may retain copies. The application and audit record will remain.")) return;
      deleteProof.disabled = true;
      status.textContent = "Deleting proof...";
      try {
        const response = await fetch(`${apiBaseUrl}/admin/partnership-applications/${encodeURIComponent(application.id)}/delete-proof`, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: deletionReason.value.trim() }),
        });
        const result = await response.json() as ApiResult;
        if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Proof could not be deleted.");
        await refreshAdminPartnerships();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Proof could not be deleted.";
      } finally {
        deleteProof.disabled = false;
      }
    });
    card.append(deletionReason, deleteProof);
  }
  return card;
}

const refreshPhotographerPartnerships = setupPagedList<PartnershipApplication>(
  "photographer-partnerships", "/photographer/partnership-applications", "applications", "No partnership applications yet.",
  (application) => createPartnershipCard(application, false),
);
const refreshAdminPartnerships = setupPagedList<PartnershipApplication>(
  "admin-partnerships", "/admin/partnership-applications", "applications", "No partnership applications yet.",
  (application) => createPartnershipCard(application, true),
);

const partnershipForm = document.querySelector<HTMLFormElement>("#partnership-form");
partnershipForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector<HTMLElement>("#partnership-form-status");
  const button = partnershipForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  const code = document.querySelector<HTMLInputElement>("#partnership-code");
  const file = document.querySelector<HTMLInputElement>("#partnership-file");
  if (!status || !button || !code || !file) return;
  if (Boolean(code.value.trim()) === Boolean(file.files?.length)) {
    status.textContent = "Provide either a card code or a card image.";
    return;
  }
  if (file.files?.[0] && file.files[0].size > 2 * 1024 * 1024) {
    status.textContent = "Card images must be 2 MB or smaller.";
    return;
  }
  button.disabled = true;
  status.textContent = "Submitting...";
  try {
    const body = new FormData(partnershipForm);
    if (!file.files?.length) body.delete("file");
    const response = await fetch(`${apiBaseUrl}/photographer/partnership-applications`, {
      method: "POST", credentials: "include", body,
    });
    const result = await response.json() as ApiResult;
    if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Application could not be submitted.");
    partnershipForm.reset();
    status.textContent = "Application submitted for review.";
    await refreshPhotographerPartnerships();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Application could not be submitted.";
  } finally {
    button.disabled = false;
  }
});

let photographerOverviewRequest = 0;
let weeklyTargetRequest = 0;
let weeklyTargetTimer: number | undefined;
let acquisitionLimitRequest = 0;

async function loadAcquisitionLimit(): Promise<void> {
  const section = document.querySelector<HTMLElement>("#acquisition-limit");
  const status = document.querySelector<HTMLElement>("#acquisition-limit-status");
  const count = document.querySelector<HTMLElement>("#acquisition-limit-count");
  const progress = document.querySelector<HTMLProgressElement>("#acquisition-limit-progress");
  const remaining = document.querySelector<HTMLElement>("#acquisition-limit-remaining");
  if (!section || !status || !count || !progress || !remaining) return;
  const requestId = ++acquisitionLimitRequest;
  section.hidden = true;
  status.textContent = "Loading photo allowance...";
  try {
    const response = await fetch(`${apiBaseUrl}/photographer/acquisition-limit`, { credentials: "include" });
    const result = await response.json() as {
      is_partner?: boolean; limit?: number; acquired_count?: number; remaining?: number; detail?: string;
    };
    if (requestId !== acquisitionLimitRequest) return;
    if (!response.ok) throw new Error(result.detail || "Photo allowance could not be loaded.");
    const { is_partner: isPartner, limit, acquired_count: acquired, remaining: left } = result;
    if (typeof isPartner !== "boolean" || typeof limit !== "number" || !Number.isSafeInteger(limit) || limit <= 0 ||
        typeof acquired !== "number" || !Number.isSafeInteger(acquired) || acquired < 0 ||
        typeof left !== "number" || !Number.isSafeInteger(left) || left !== Math.max(limit - acquired, 0)) {
      throw new Error("Photo allowance could not be loaded.");
    }
    if (!isPartner) {
      count.textContent = `${acquired} / ${limit}`;
      progress.max = limit;
      progress.value = Math.min(acquired, limit);
      progress.setAttribute("aria-valuetext", `${acquired} of ${limit} photos acquired`);
      remaining.textContent = left
        ? `${left} photo${left === 1 ? "" : "s"} remaining in your allowance.`
        : "You have reached the limit. Become an approved partner to submit more photos or accept further offers.";
      section.hidden = false;
    }
    status.textContent = "";
  } catch (error) {
    if (requestId !== acquisitionLimitRequest) return;
    status.textContent = error instanceof Error ? error.message : "Photo allowance could not be loaded.";
  }
}

async function loadWeeklyTarget(): Promise<void> {
  const section = document.querySelector<HTMLElement>("#weekly-target");
  const status = document.querySelector<HTMLElement>("#weekly-target-status");
  const count = document.querySelector<HTMLElement>("#weekly-target-count");
  const progress = document.querySelector<HTMLProgressElement>("#weekly-target-progress");
  const remaining = document.querySelector<HTMLElement>("#weekly-target-remaining");
  const period = document.querySelector<HTMLElement>("#weekly-target-period");
  if (!section || !status || !count || !progress || !remaining || !period) return;

  const requestId = ++weeklyTargetRequest;
  window.clearTimeout(weeklyTargetTimer);
  section.hidden = true;
  status.textContent = "Loading weekly target...";
  try {
    const response = await fetch(`${apiBaseUrl}/photographer/weekly-target`, { credentials: "include" });
    const result = await response.json() as {
      is_partner?: boolean; target?: number; approved_count?: number;
      week_start?: string; week_end?: string; detail?: string;
    };
    if (requestId !== weeklyTargetRequest) return;
    if (!response.ok) throw new Error(result.detail || "Weekly target could not be loaded.");
    if (result.is_partner === false) {
      status.textContent = "";
      return;
    }
    const target = result.target;
    const approved = result.approved_count;
    const start = new Date(result.week_start || "");
    const end = new Date(result.week_end || "");
    if (result.is_partner !== true || typeof target !== "number" || !Number.isSafeInteger(target) || target <= 0 ||
        typeof approved !== "number" || !Number.isSafeInteger(approved) || approved < 0 ||
        !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
      throw new Error("Weekly target could not be loaded.");
    }
    const dateFormat = new Intl.DateTimeFormat("en", {
      timeZone: "UTC", month: "short", day: "numeric", year: "numeric",
    });
    count.textContent = `${approved} / ${target}`;
    progress.max = target;
    progress.value = Math.min(approved, target);
    progress.setAttribute("aria-valuetext", `${approved} of ${target} approved photographs`);
    const left = Math.max(0, target - approved);
    remaining.textContent = left ? `${left} more approved photograph${left === 1 ? "" : "s"} to reach your target.` : "Weekly target reached.";
    period.textContent = `Week of ${dateFormat.format(start)}. Resets ${dateFormat.format(end)} at 00:00 UTC.`;
    section.hidden = false;
    status.textContent = "";
    const untilReset = end.getTime() - Date.now();
    weeklyTargetTimer = window.setTimeout(() => void loadWeeklyTarget(), untilReset > 0 ? untilReset + 1000 : 60000);
  } catch (error) {
    if (requestId !== weeklyTargetRequest) return;
    status.textContent = error instanceof Error ? error.message : "Weekly target could not be loaded.";
  }
}

async function loadPhotographerOverview(): Promise<void> {
  const status = document.querySelector<HTMLElement>("#overview-status");
  if (!status) return;
  const requestId = ++photographerOverviewRequest;
  const stats = document.querySelectorAll<HTMLElement>("[data-overview-stat]");
  status.textContent = "Loading statistics...";
  try {
    const response = await fetch(`${apiBaseUrl}/photographer/overview`, {
      credentials: "include",
    });
    const result = await response.json() as { statistics?: Record<string, number>; detail?: string };
    if (requestId !== photographerOverviewRequest) return;
    if (!response.ok || !result.statistics) {
      throw new Error(result.detail || "Statistics could not be loaded.");
    }
    stats.forEach((element) => {
      const value = result.statistics?.[element.dataset.overviewStat || ""];
      element.textContent = typeof value === "number" ? String(value) : "—";
    });
    status.textContent = "";
  } catch (error) {
    if (requestId !== photographerOverviewRequest) return;
    stats.forEach((element) => { element.textContent = "—"; });
    status.textContent = error instanceof Error ? error.message : "Statistics could not be loaded.";
  }
}

document.querySelector<HTMLButtonElement>("#overview-refresh")
  ?.addEventListener("click", () => {
    void loadPhotographerOverview();
    void loadWeeklyTarget();
    void loadAcquisitionLimit();
  });

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && document.querySelector("#weekly-target")) {
    void loadWeeklyTarget();
    void loadAcquisitionLimit();
  }
});

let photographerPortfolioRequest = 0;
let photographerPortfolioOffset = 0;

async function loadPhotographerPortfolio(append = false): Promise<void> {
  const status = document.querySelector<HTMLElement>("#portfolio-status");
  const grid = document.querySelector<HTMLElement>("#portfolio-grid");
  const count = document.querySelector<HTMLElement>("#portfolio-count");
  const more = document.querySelector<HTMLButtonElement>("#portfolio-more");

  if (!status || !grid || !count || !more) return;

  const requestId = ++photographerPortfolioRequest;
  if (!append) {
    photographerPortfolioOffset = 0;
    grid.replaceChildren();
    more.hidden = true;
  }
  more.disabled = true;
  status.textContent = "Loading your photographs...";

  try {
    const response = await fetch(`${apiBaseUrl}/photographer/photos?offset=${photographerPortfolioOffset}`, {
      method: "GET",
      credentials: "include",
    });

    const result = (await response.json()) as
      | PhotographerPhotosResponse
      | ApiResult;
    if (requestId !== photographerPortfolioRequest) return;

    if (!response.ok) {
      const errorResult = result as ApiResult;
      throw new Error(
        errorResult.detail || "Your portfolio could not be loaded."
      );
    }

    const { photos, total, has_more: hasMore } = result as PhotographerPhotosResponse;
    if (!Array.isArray(photos) || !Number.isSafeInteger(total) || total < 0 || typeof hasMore !== "boolean") {
      throw new Error("The server returned an invalid portfolio response.");
    }

    if (!append && photos.length === 0) {
      photographerPhotos = [];
      count.textContent = String(total);
      status.textContent = "Your portfolio is empty. Your uploaded photographs will appear here.";
      renderPhotographerCollections();
      return;
    }

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

    if (requestId !== photographerPortfolioRequest) return;
    photographerPortfolioOffset += photos.length;
    photographerPhotos = append ? [...photographerPhotos, ...photos] : photos;
    count.textContent = String(total);
    status.textContent = `Showing ${photographerPhotos.length} of ${total} photographs.`;
    more.hidden = !hasMore;
    if (append) grid.append(...cards);
    else grid.replaceChildren(...cards);
    renderPhotographerCollections();
  } catch (error) {
    if (requestId !== photographerPortfolioRequest) return;
    if (!append) count.textContent = "—";
    status.textContent =
      error instanceof Error
        ? error.message
        : "Your portfolio could not be loaded. Please try again.";
    if (!append) {
      photographerPhotos = [];
      renderPhotographerCollections();
    }
  } finally {
    if (requestId === photographerPortfolioRequest) more.disabled = false;
  }
}

document.querySelector<HTMLButtonElement>("#portfolio-more")
  ?.addEventListener("click", () => void loadPhotographerPortfolio(true));

const photoUploadForm =
  document.querySelector<HTMLFormElement>("#photo-upload-form");
const photoFileInput = document.querySelector<HTMLInputElement>("#photo-file");
const photoSelectionStatus = document.querySelector<HTMLElement>("#photo-selection-status");
const photoUploadResults = document.querySelector<HTMLElement>("#photo-upload-results");
let pendingPhotoUploads: File[] = [];
let uncertainPhotoUploads: string[] = [];
let photoUploadInProgress = false;

photoFileInput?.addEventListener("change", () => {
  pendingPhotoUploads = Array.from(photoFileInput.files || []);
  uncertainPhotoUploads = [];
  if (photoUploadResults) photoUploadResults.replaceChildren();
  const status = document.querySelector<HTMLElement>("#photo-upload-status");
  if (status) status.textContent = "";
  if (photoSelectionStatus) {
    photoSelectionStatus.textContent = pendingPhotoUploads.length
      ? `${pendingPhotoUploads.length} photograph${pendingPhotoUploads.length === 1 ? "" : "s"} selected.`
      : "No photographs selected.";
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!photoUploadInProgress) return;
  event.preventDefault();
  event.returnValue = "";
});

photoUploadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const status = document.querySelector<HTMLElement>("#photo-upload-status");
  if (!status || !photoFileInput || !photoUploadResults || !photoSelectionStatus || photoUploadInProgress) return;

  const formData = new FormData(photoUploadForm);
  if (!pendingPhotoUploads.length || pendingPhotoUploads.length > 50) {
    status.textContent = "Select between 1 and 50 photographs.";
    return;
  }
  const invalidFile = pendingPhotoUploads.find((file) => file.size === 0 || file.size > 25 * 1024 * 1024);
  if (invalidFile) {
    status.textContent = `${invalidFile.name}: images must be non-empty and no larger than 25 MB.`;
    return;
  }
  const keywordText = String(formData.get("keywords") || "").trim();
  const keywords = keywordText ? keywordText.split(",").map((word) => word.trim()) : [];
  if (keywords.length > 30 || keywords.some((word) => !word || word.length > 80)) {
    status.textContent = "Enter up to 30 keywords, each 1 to 80 characters long.";
    return;
  }
  const files = pendingPhotoUploads.slice();
  const failed: File[] = [];
  let uploaded = 0;
  let connectionLost = false;
  const controls = Array.from(photoUploadForm.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>("input, textarea, button"));
  const disabledStates = controls.map((control) => control.disabled);
  controls.forEach((control) => { control.disabled = true; });
  photoUploadInProgress = true;
  photoUploadResults.replaceChildren();
  const showUncertainUpload = (filename: string): void => {
    const item = document.createElement("li");
    item.textContent = `${filename}: upload status is unknown. Check your portfolio before selecting this file again.`;
    photoUploadResults.appendChild(item);
  };
  uncertainPhotoUploads.forEach(showUncertainUpload);
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      status.textContent = `Uploading ${index + 1} of ${files.length}: ${file.name}`;
      formData.set("file", file);
      let response: Response;
      try {
        response = await fetch(`${apiBaseUrl}/photographer/photos`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
      } catch (error) {
        console.error("Photo upload connection failed.", error);
        uncertainPhotoUploads.push(file.name);
        showUncertainUpload(file.name);
        failed.push(...files.slice(index + 1));
        connectionLost = true;
        break;
      }
      if (response.ok) {
        uploaded += 1;
      } else if (response.status === 408 || response.status >= 500) {
        console.error(`Photo upload returned HTTP ${response.status}; its outcome is unknown.`);
        uncertainPhotoUploads.push(file.name);
        showUncertainUpload(file.name);
        failed.push(...files.slice(index + 1));
        connectionLost = true;
        break;
      } else {
        let detail = `Upload failed (HTTP ${response.status}).`;
        try {
          const result = await response.json() as ApiResult;
          if (typeof result.detail === "string") detail = result.detail;
        } catch (error) {
          console.error("Could not read the photo upload error response.", error);
        }
        failed.push(file);
        const item = document.createElement("li");
        item.textContent = `${file.name}: ${detail}`;
        photoUploadResults.appendChild(item);
      }
    }
    pendingPhotoUploads = failed;
    if (!failed.length) {
      photoUploadForm.reset();
      photoSelectionStatus.textContent = "No photographs selected.";
    } else {
      photoSelectionStatus.textContent = `${failed.length} photograph${failed.length === 1 ? "" : "s"} remaining. Submit again to retry; choosing new files replaces this selection.`;
    }
    status.textContent = `${uploaded} of ${files.length} photographs uploaded.${uncertainPhotoUploads.length ? " Some uploads could not be confirmed; check your portfolio." : ""}${failed.length ? " See results below and retry the remaining photographs." : ""}`;
    if (uploaded || connectionLost) await Promise.all([loadPhotographerPortfolio(), loadPhotographerOverview()]);
  } finally {
    photoUploadInProgress = false;
    controls.forEach((control, index) => { control.disabled = disabledStates[index]; });
  }
});

const photoCleanupButton =
  document.querySelector<HTMLButtonElement>("#photo-cleanup-button");

photoCleanupButton?.addEventListener("click", async () => {
  const status = document.querySelector<HTMLElement>("#photo-cleanup-status");
  if (!status) return;
  photoCleanupButton.disabled = true;
  status.textContent = "Retrying cleanup...";
  try {
    const response = await fetch(`${apiBaseUrl}/photographer/photo-deletion-cleanup`, {
      method: "POST",
      credentials: "include",
    });
    const result = (await response.json()) as ApiResult;
    if (!response.ok) throw new Error(result.detail || "Cleanup could not be completed.");
    status.textContent = "Pending original cleanup completed.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Cleanup could not be completed.";
  } finally {
    photoCleanupButton.disabled = false;
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
    await Promise.all([loadPhotographerCollections(), loadPhotographerOverview()]);
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
      if (response.status === 409) void loadAcquisitionLimit();
      throw new Error(result.detail || "The submission could not be created.");
    }

    individualSubmissionForm.reset();
    status.textContent = "Photographs submitted for review.";
    await Promise.all([loadPhotographerSubmissions(), loadPhotographerOverview()]);
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
      if (response.status === 409) void loadAcquisitionLimit();
      throw new Error(result.detail || "The collection could not be submitted.");
    }

    collectionSubmissionForm.reset();
    status.textContent = "Collection submitted for review.";
    await Promise.all([loadPhotographerSubmissions(), loadPhotographerOverview()]);
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? error.message
        : "The collection could not be submitted.";
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});
const profilePhotoForm = document.querySelector<HTMLFormElement>("#profile-photo-form");
const profilePhotoImage = document.querySelector<HTMLImageElement>("#profile-photo");
const menuProfilePhoto = document.querySelector<HTMLImageElement>("#menu-profile-photo");
const menuProfilePlaceholder = document.querySelector<HTMLElement>("#menu-profile-placeholder");
const profilePhotoStatus = document.querySelector<HTMLElement>("#profile-photo-status");
const profilePhotoDelete = document.querySelector<HTMLButtonElement>("#profile-photo-delete");
let profilePhotoUrl: string | null = null;
let profilePhotoRequest = 0;

async function loadProfilePhoto(): Promise<boolean> {
  if (!profilePhotoImage || !profilePhotoStatus || !profilePhotoDelete) return false;
  const requestId = ++profilePhotoRequest;
  try {
    const response = await fetch(`${apiBaseUrl}/account/photo`, { credentials: "include" });
    if (requestId !== profilePhotoRequest) return false;
    if (response.status === 404) {
      if (profilePhotoUrl) URL.revokeObjectURL(profilePhotoUrl);
      profilePhotoUrl = null;
      profilePhotoImage.removeAttribute("src");
      profilePhotoImage.hidden = true;
      if (menuProfilePhoto) {
        menuProfilePhoto.removeAttribute("src");
        menuProfilePhoto.hidden = true;
      }
      if (menuProfilePlaceholder) menuProfilePlaceholder.hidden = false;
      profilePhotoDelete.hidden = true;
      return true;
    }
    if (!response.ok) throw new Error("Profile photo could not be loaded.");
    const blob = await response.blob();
    if (requestId !== profilePhotoRequest) return false;
    const url = URL.createObjectURL(blob);
    if (profilePhotoUrl) URL.revokeObjectURL(profilePhotoUrl);
    profilePhotoUrl = url;
    profilePhotoImage.src = url;
    profilePhotoImage.hidden = false;
    if (menuProfilePhoto) {
      menuProfilePhoto.src = url;
      menuProfilePhoto.hidden = false;
    }
    if (menuProfilePlaceholder) menuProfilePlaceholder.hidden = true;
    profilePhotoDelete.hidden = false;
    return true;
  } catch (error) {
    if (requestId === profilePhotoRequest) {
      profilePhotoStatus.textContent = error instanceof Error ? error.message : "Profile photo could not be loaded.";
    }
    return false;
  }
}

profilePhotoForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>("#profile-photo-file");
  const button = profilePhotoForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!input?.files?.[0] || !button || !profilePhotoStatus) return;
  if (input.files[0].size > 2 * 1024 * 1024) {
    profilePhotoStatus.textContent = "Profile photos must be 2 MB or smaller.";
    return;
  }
  button.disabled = true;
  if (profilePhotoDelete) profilePhotoDelete.disabled = true;
  profilePhotoStatus.textContent = "Uploading...";
  try {
    const body = new FormData(profilePhotoForm);
    const response = await fetch(`${apiBaseUrl}/account/photo`, { method: "PUT", credentials: "include", body });
    const result = await response.json() as ApiResult;
    if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Profile photo could not be saved.");
    profilePhotoForm.reset();
    profilePhotoStatus.textContent = "Profile photo saved.";
    await loadProfilePhoto();
  } catch (error) {
    profilePhotoStatus.textContent = error instanceof Error ? error.message : "Profile photo could not be saved.";
  } finally {
    button.disabled = false;
    if (profilePhotoDelete) profilePhotoDelete.disabled = false;
  }
});

profilePhotoDelete?.addEventListener("click", async () => {
  if (!profilePhotoStatus) return;
  profilePhotoDelete.disabled = true;
  const upload = profilePhotoForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (upload) upload.disabled = true;
  profilePhotoStatus.textContent = "Removing...";
  try {
    const response = await fetch(`${apiBaseUrl}/account/photo`, { method: "DELETE", credentials: "include" });
    const result = await response.json() as ApiResult;
    if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Profile photo could not be removed.");
    if (await loadProfilePhoto()) profilePhotoStatus.textContent = result.message || "Profile photo removed.";
  } catch (error) {
    profilePhotoStatus.textContent = error instanceof Error ? error.message : "Profile photo could not be removed.";
  } finally {
    profilePhotoDelete.disabled = false;
    if (upload) upload.disabled = false;
  }
});

function setupCredentialForm(kind: "email" | "password"): void {
  const form = document.querySelector<HTMLFormElement>(`#${kind}-change-form`);
  const status = document.querySelector<HTMLElement>(`#${kind}-change-status`);
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!status || !button) return;
    const data = new FormData(form);
    const currentPassword = String(data.get("current_password") || "");
    const value = String(data.get(kind === "email" ? "new_email" : "new_password") || "");
    if (kind === "password" && value !== String(data.get("confirm_password") || "")) {
      status.textContent = "New passwords do not match.";
      return;
    }
    button.disabled = true;
    status.textContent = "Saving...";
    try {
      const payload = kind === "email"
        ? { current_password: currentPassword, new_email: value }
        : { current_password: currentPassword, new_password: value };
      const response = await fetch(`${apiBaseUrl}/account/credentials`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as ApiResult & { email?: string | null; sign_in_required?: boolean };
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Account settings could not be updated.");
      form.reset();
      status.textContent = result.message || "Account settings updated.";
      if (result.email) {
        const email = document.querySelector<HTMLElement>("#dashboard-email");
        if (email) email.textContent = result.email;
      }
      if (result.sign_in_required) {
        const link = document.querySelector<HTMLElement>("#credential-login");
        if (link) link.hidden = false;
        button.disabled = true;
        return;
      }
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Account settings could not be updated.";
    }
    button.disabled = false;
  });
}
setupCredentialForm("email");
setupCredentialForm("password");

const displayNameForm = document.querySelector<HTMLFormElement>("#display-name-form");
displayNameForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>("#display-name");
  const status = document.querySelector<HTMLElement>("#display-name-status");
  const button = displayNameForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!input || !status || !button) return;
  if (!input.value.trim()) {
    status.textContent = "Enter a display name.";
    return;
  }
  button.disabled = true;
  status.textContent = "Saving...";
  try {
    const response = await fetch(`${apiBaseUrl}/account/display-name`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: input.value.trim() }),
    });
    const result = await response.json() as ApiResult & { display_name?: string };
    if (!response.ok || !result.display_name) {
      throw new Error(result.detail || "Display name could not be saved.");
    }
    input.value = result.display_name;
    const name = document.querySelector<HTMLElement>("#dashboard-name");
    if (name) name.textContent = result.display_name;
    status.textContent = "Display name saved.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Display name could not be saved.";
  } finally {
    button.disabled = false;
  }
});

function setupWorkspaceReport<T>(
  id: string, endpoint: string, key: "photographers" | "accounts",
  statAttribute: "referralStat" | "adminStat", empty: string, render: (item: T) => HTMLElement,
): () => Promise<void> {
  let offset = 0;
  let sequence = 0;
  const list = document.querySelector<HTMLElement>(`#${id}-list`);
  const status = document.querySelector<HTMLElement>(`#${id}-status`);
  const more = document.querySelector<HTMLButtonElement>(`#${id}-more`);
  const selector = statAttribute === "referralStat" ? "[data-referral-stat]" : "[data-admin-stat]";
  async function load(append: boolean): Promise<void> {
    if (!list || !status || !more) return;
    const requestId = ++sequence;
    if (!append) {
      offset = 0;
      list.replaceChildren();
      more.hidden = true;
      document.querySelectorAll<HTMLElement>(selector).forEach((element) => { element.textContent = "—"; });
    }
    more.disabled = true;
    status.textContent = "Loading...";
    try {
      const response = await fetch(`${apiBaseUrl}${endpoint}?offset=${offset}`, { credentials: "include" });
      const result = await response.json() as ApiResult & Record<string, unknown>;
      if (requestId !== sequence) return;
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Report could not be loaded.");
      const items = result[key];
      if (!Array.isArray(items) || typeof result.has_more !== "boolean") {
        throw new Error("The server returned an invalid response.");
      }
      document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        const value = result[element.dataset[statAttribute] || ""];
        element.textContent = typeof value === "number" ? String(value) : "—";
      });
      (items as T[]).forEach((item) => list.appendChild(render(item)));
      offset += items.length;
      more.hidden = !result.has_more;
      status.textContent = offset ? "" : empty;
    } catch (error) {
      if (requestId === sequence) status.textContent = error instanceof Error ? error.message : "Report could not be loaded.";
    } finally {
      if (requestId === sequence) more.disabled = false;
    }
  }
  document.querySelector<HTMLButtonElement>(`#${id}-refresh`)?.addEventListener("click", () => void load(false));
  more?.addEventListener("click", () => void load(true));
  return () => load(false);
}

const loadAgentReferrals = setupWorkspaceReport<{ display_name: string }>(
  "referrals", "/agent/referrals", "photographers", "referralStat", "No referred photographers yet.",
  (photographer) => {
    const item = document.createElement("li");
    item.textContent = photographer.display_name;
    return item;
  },
);
const loadAdminAccounts = setupWorkspaceReport<{
  id: string;
  display_name: string;
  role: string;
  suspended_at?: string | null;
  suspension_reason?: string | null;
}>(
  "admin-accounts", "/admin/workspace-report", "accounts", "adminStat", "No photographer or agent accounts.",
  (account) => {
    const card = document.createElement("article");
    card.className = "submission-card";
    const title = document.createElement("h3");
    title.textContent = account.display_name;
    const details = document.createElement("p");
    details.textContent = `${account.role} · ${account.id} · ${account.suspended_at ? "Suspended" : "Active"}`;
    if (account.suspension_reason) {
      const reason = document.createElement("p");
      reason.textContent = `Reason: ${account.suspension_reason}`;
      card.appendChild(reason);
    }
    const suspend = document.createElement("button");
    suspend.type = "button";
    suspend.className = "button button-dark small";
    suspend.textContent = account.suspended_at ? "Reinstate account" : "Suspend account";
    suspend.addEventListener("click", async () => {
      let reason: string | null = null;
      if (!account.suspended_at) {
        reason = window.prompt("Reason for suspension (required)");
        if (!reason?.trim()) return;
      }
      suspend.disabled = true;
      try {
        const response = await fetch(`${apiBaseUrl}/admin/accounts/${encodeURIComponent(account.id)}/suspension`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suspended: !account.suspended_at, reason }),
        });
        const result = await response.json() as ApiResult;
        if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Suspension could not be updated.");
        await loadAdminAccounts();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Suspension could not be updated.");
      } finally {
        suspend.disabled = false;
      }
    });
    card.append(title, details, suspend);
    return card;
  },
);

function createAdminWithdrawalCard(withdrawal: Withdrawal): HTMLElement {
  const card = document.createElement("article");
  card.className = "submission-card";
  const heading = document.createElement("h3");
  heading.textContent = `${formatUsdCents(withdrawal.amount_cents)} USD · ${withdrawal.status}`;
  const details = document.createElement("p");
  const feeExempt = withdrawal.fee_total_cents === "0";
  details.textContent = `${withdrawal.photographer_id || "Photographer"} · ${withdrawal.method || ""} · ${feeExempt ? "No fee required" : `Fee ${formatUsdCents(withdrawal.fee_total_cents || "0")} USD · ${withdrawal.fee_status}`}`;
  const destination = document.createElement("p");
  destination.textContent = `Destination: ${withdrawal.destination || "Not provided"}`;
  card.append(heading, details, destination);

  if (withdrawal.status === "pending") {
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const feeReceipt = document.createElement("input");
    feeReceipt.placeholder = "Fee receipt or verification reference";
    feeReceipt.setAttribute("aria-label", "Fee receipt or verification reference");
    feeReceipt.maxLength = 1000;
    const verifyFee = document.createElement("button");
    verifyFee.type = "button";
    verifyFee.className = "button button-dark small";
    verifyFee.textContent = "Verify fee";

    const payoutReceipt = document.createElement("input");
    payoutReceipt.placeholder = "Payout receipt reference";
    payoutReceipt.setAttribute("aria-label", "Payout receipt reference");
    payoutReceipt.maxLength = 1000;
    const pay = document.createElement("button");
    pay.type = "button";
    pay.className = "button button-dark small";
    pay.textContent = "Record payout";

    const rejectReason = document.createElement("input");
    rejectReason.placeholder = "Rejection reason";
    rejectReason.setAttribute("aria-label", "Rejection reason");
    rejectReason.maxLength = 2000;
    const refundReceipt = document.createElement("input");
    refundReceipt.placeholder = "Refund receipt (required if fee was paid)";
    refundReceipt.setAttribute("aria-label", "Refund receipt reference");
    refundReceipt.maxLength = 1000;
    const reject = document.createElement("button");
    reject.type = "button";
    reject.className = "button button-dark small";
    reject.textContent = "Reject";

    async function performAction(path: string, body: unknown): Promise<void> {
      const buttons = [verifyFee, pay, reject];
      buttons.forEach((button) => { button.disabled = true; });
      status.textContent = "Saving...";
      try {
        await adminWithdrawalAction(path, body);
        await refreshAdminWithdrawals();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Withdrawal action could not be saved.";
      } finally {
        buttons.forEach((button) => { button.disabled = false; });
      }
    }

    verifyFee.addEventListener("click", () => {
      if (!feeReceipt.value.trim()) {
        status.textContent = "Enter a fee receipt reference.";
        return;
      }
      void performAction(`/admin/withdrawals/${encodeURIComponent(withdrawal.id)}/fee`,
        { receipt_reference: feeReceipt.value.trim(), verified: true });
    });
    pay.addEventListener("click", () => {
      if (!payoutReceipt.value.trim()) {
        status.textContent = "Enter a payout receipt reference.";
        return;
      }
      void performAction(`/admin/withdrawals/${encodeURIComponent(withdrawal.id)}/pay`,
        { payout_receipt_reference: payoutReceipt.value.trim() });
    });
    reject.addEventListener("click", () => {
      if (!rejectReason.value.trim()) {
        status.textContent = "Enter a rejection reason.";
        return;
      }
      if (["paid", "verified"].includes(withdrawal.fee_status) && !refundReceipt.value.trim()) {
        status.textContent = "Enter a refund receipt reference for the paid fee.";
        return;
      }
      void performAction(`/admin/withdrawals/${encodeURIComponent(withdrawal.id)}/reject`,
        { reason: rejectReason.value.trim(), refund_receipt_reference: refundReceipt.value.trim() || null });
    });
    if (!feeExempt) card.append(feeReceipt, verifyFee);
    card.append(payoutReceipt, pay, rejectReason, refundReceipt, reject, status);
  }
  return card;
}

async function adminWithdrawalAction(path: string, body: unknown): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("Withdrawal action connection failed.", error);
    throw new Error("The action could not be confirmed. Refresh withdrawals before trying again.");
  }
  if (response.status === 408 || response.status >= 500) {
    throw new Error("The action could not be confirmed. Refresh withdrawals before trying again.");
  }
  let result: ApiResult;
  try {
    result = await response.json() as ApiResult;
  } catch (error) {
    console.error("Could not read the withdrawal action response.", error);
    throw new Error(response.ok
      ? "The action could not be confirmed. Refresh withdrawals before trying again."
      : "Withdrawal action could not be saved.");
  }
  if (!response.ok) throw new Error(result && typeof result.detail === "string" ? result.detail : "Withdrawal action could not be saved.");
  if (!result || typeof result.message !== "string" || !result.message) {
    throw new Error("The action could not be confirmed. Refresh withdrawals before trying again.");
  }
}

const refreshAdminWithdrawals = setupPagedList<Withdrawal>(
  "admin-withdrawals", "/admin/withdrawals", "withdrawals", "No withdrawal requests.",
  createAdminWithdrawalCard,
);

const feeRecipientForm = document.querySelector<HTMLFormElement>("#fee-recipient-form");
feeRecipientForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector<HTMLElement>("#fee-recipient-status");
  const input = document.querySelector<HTMLInputElement>("#withdrawal-fee-recipient");
  if (!status || !input) return;
  status.textContent = "Saving...";
  try {
    const response = await fetch(`${apiBaseUrl}/admin/withdrawal-fee-recipient`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: input.value.trim() }),
    });
    const result = await response.json() as ApiResult;
    if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Fee recipient could not be saved.");
    status.textContent = result.message || "Fee recipient saved.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Fee recipient could not be saved.";
  }
});

// Protected dashboard pages
const dashboard = document.querySelector<HTMLElement>(
  "[data-required-role]"
);

if (dashboard) {
  const views = Array.from(dashboard.querySelectorAll<HTMLElement>("[data-dashboard-view]"));
  const navigation = dashboard.querySelector<HTMLElement>(".dashboard-nav");
  const links = Array.from(navigation?.querySelectorAll<HTMLAnchorElement>('a[href^="#"]') || []);
  const portfolioSelection = document.querySelector<HTMLElement>("#portfolio-photo-selection");
  const portfolioHome = document.querySelector<HTMLElement>("#portfolio-photo-home");
  const submissionSelection = document.querySelector<HTMLElement>("#submission-photo-selection");

  function showDashboardView(focusHeading = false): void {
    let target: HTMLElement | null = null;
    try {
      target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    } catch {
      target = null;
    }
    const view = target?.closest<HTMLElement>("[data-dashboard-view]") || views[0];
    if (!view) return;
    if (portfolioSelection && portfolioHome && submissionSelection) {
      (view.contains(submissionSelection) ? submissionSelection : portfolioHome).appendChild(portfolioSelection);
    }
    views.forEach((section) => { section.hidden = section !== view; });
    links.forEach((link) => {
      const linkTarget = document.getElementById(link.hash.slice(1));
      if (linkTarget?.closest("[data-dashboard-view]") === view) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
    if (focusHeading) {
      const heading = view.querySelector<HTMLElement>("h1, h2, h3");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  }

  showDashboardView();
  window.addEventListener("hashchange", () => {
    showDashboardView(true);
    window.scrollTo(0, 0);
  });

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
    const displayNameInput = document.querySelector<HTMLInputElement>("#display-name");
    if (displayNameInput) displayNameInput.value = user.display_name;

    if (emailElement) {
      emailElement.textContent = user.email;
    }

    const accountCode =
      user.role === "agent" ? user.agent_code : user.referral_code;

    if (codeElement) {
      codeElement.textContent = accountCode || "Not assigned";
    }

    dashboard.hidden = false;
    if (profilePhotoForm) void loadProfilePhoto();

    if (requiredRole === "photographer") {
      void Promise.all([
        loadPhotographerOverview(),
        loadWeeklyTarget(),
        loadAcquisitionLimit(),
        loadPhotographerCollections(),
        loadPhotographerPortfolio(),
        loadPhotographerSubmissions(),
        loadWallet(),
        refreshPhotographerOffers(),
        refreshPhotographerPublications(),
        refreshPhotographerPartnerships(),
        refreshPhotographerWithdrawals(),
      ]);
    }
    if (requiredRole === "admin") {
      void loadAdminAccounts();
      void loadAdminSubmissions();
      void refreshAdminOffers();
      void refreshAdminPublications();
      void refreshAdminPartnerships();
      void refreshAdminWithdrawals();
      void (async () => {
        try {
          const response = await fetch(`${apiBaseUrl}/withdrawal-settings`, { credentials: "include" });
          const result = await response.json() as ApiResult & { fee_recipient?: string | null };
          if (response.ok) {
            const input = document.querySelector<HTMLInputElement>("#withdrawal-fee-recipient");
            if (input) input.value = result.fee_recipient || "";
          }
        } catch {
          // The fee recipient can be set from the form if loading it fails.
        }
      })();
    }
    if (requiredRole === "agent") void loadAgentReferrals();
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
