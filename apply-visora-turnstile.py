from pathlib import Path

def patch(path, old, new):
    p = Path(path)
    content = p.read_text(encoding="utf-8-sig")
    if new in content:
        print(f"Already patched: {path}")
        return
    if old not in content:
        raise SystemExit(f"PATCH STOPPED: expected code not found in {path}")
    p.write_text(content.replace(old, new, 1), encoding="utf-8")
    print(f"Patched: {path}")

patch(
    "backend/app/core/config.py",
    '    supabase_secret_key: str = ""\n',
    '    supabase_secret_key: str = ""\n'
    '    turnstile_site_key: str = ""\n'
)

patch(
    "backend/.env.example",
    "SUPABASE_SECRET_KEY=\n",
    "SUPABASE_SECRET_KEY=\n\n"
    "# Public Cloudflare Turnstile site key (never put the secret here)\n"
    "TURNSTILE_SITE_KEY=\n"
)

patch(
    "backend/app/api/auth.py",
    '    password: str = Field(min_length=8, max_length=128)\n',
    '    password: str = Field(min_length=8, max_length=128)\n'
    '    captcha_token: str = Field(min_length=1, max_length=4096)\n'
)

patch(
    "backend/app/api/auth.py",
    '@router.post("/register", status_code=201)\n',
    '''@router.get("/captcha-config")
def captcha_config() -> dict:
    site_key = settings.turnstile_site_key.strip()
    return {
        "enabled": bool(site_key),
        "site_key": site_key or None,
    }


@router.post("/register", status_code=201)
'''
)

patch(
    "backend/app/api/auth.py",
    '                "data": metadata,\n                "email_redirect_to": (\n',
    '                "data": metadata,\n'
    '                "captcha_token": payload.captcha_token,\n'
    '                "email_redirect_to": (\n'
)

patch(
    "backend/tests/test_auth_registration.py",
    '        "password": "StrongPassword123",\n',
    '        "password": "StrongPassword123",\n'
    '        "captcha_token": "test-turnstile-token",\n'
)

patch(
    "backend/tests/test_auth_registration.py",
    '    metadata = fake.auth.payload["options"]["data"]\n',
    '    assert fake.auth.payload["options"]["captcha_token"] == "test-turnstile-token"\n'
    '    metadata = fake.auth.payload["options"]["data"]\n'
)

patch(
    "backend/tests/test_auth_registration.py",
    '\ndef test_agent_registration_requires_admin(monkeypatch):\n',
    '''
def test_registration_requires_captcha_token(monkeypatch):
    configure_fake_supabase(monkeypatch)
    payload = base_payload()
    payload.pop("captcha_token")

    response = client.post("/auth/register", json=payload)

    assert response.status_code == 422


def test_captcha_config_returns_public_site_key(monkeypatch):
    monkeypatch.setattr(auth.settings, "turnstile_site_key", "test-public-site-key")

    response = client.get("/auth/captcha-config")

    assert response.status_code == 200
    assert response.json() == {
        "enabled": True,
        "site_key": "test-public-site-key",
    }


def test_agent_registration_requires_admin(monkeypatch):
'''
)

patch(
    "frontend/register.html",
    '''      <button class="button button-dark" type="submit">
        Create account →
      </button>
''',
    '''      <div class="captcha-field">
        <div id="turnstile-container"></div>
        <p id="turnstile-status" class="hint" role="status" aria-live="polite">
          Loading human verification...
        </p>
      </div>

      <button class="button button-dark" type="submit" disabled>
        Create account →
      </button>
'''
)

patch(
    "frontend/src/js/main.ts",
    '''interface ApiResult {
  message?: string;
  detail?: string;
  confirmation_required?: boolean;
  user?: SessionUser;
}
''',
    '''interface ApiResult {
  message?: string;
  detail?: string;
  confirmation_required?: boolean;
  user?: SessionUser;
}

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ): string;
  reset(widgetId?: string): void;
}

interface Window {
  turnstile?: TurnstileApi;
}
'''
)

patch(
    "frontend/src/js/main.ts",
    '''const registerForm =
  document.querySelector<HTMLFormElement>("#register-form");

registerForm?.addEventListener("submit", async (event: SubmitEvent) => {
''',
    '''const registerForm =
  document.querySelector<HTMLFormElement>("#register-form");

const turnstileContainer =
  document.querySelector<HTMLElement>("#turnstile-container");
const turnstileStatus =
  document.querySelector<HTMLElement>("#turnstile-status");

let registrationCaptchaToken: string | null = null;
let registrationTurnstileWidgetId: string | null = null;

function setRegistrationCaptchaState(
  verified: boolean,
  statusText: string,
): void {
  registrationCaptchaToken = null;
  if (turnstileStatus) turnstileStatus.textContent = statusText;

  const button =
    registerForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = !verified;
}

async function loadTurnstileApi(): Promise<void> {
  if (window.turnstile) return;

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Cloudflare human verification could not be loaded."));
    document.head.appendChild(script);
  });

  if (!window.turnstile) {
    throw new Error("Cloudflare human verification is unavailable.");
  }
}

async function initializeRegistrationCaptcha(): Promise<void> {
  if (!registerForm || !turnstileContainer || !turnstileStatus) return;

  setRegistrationCaptchaState(false, "Loading human verification...");

  try {
    const response = await fetch(`${apiBaseUrl}/auth/captcha-config`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Human verification configuration could not be loaded.");
    }

    const config = await response.json() as {
      enabled?: boolean;
      site_key?: string | null;
    };

    if (!config.enabled || !config.site_key) {
      throw new Error(
        "Human verification is not configured. Please contact Visora support.",
      );
    }

    await loadTurnstileApi();

    registrationTurnstileWidgetId = window.turnstile!.render(
      turnstileContainer,
      {
        sitekey: config.site_key,
        callback: (token: string) => {
          registrationCaptchaToken = token;
          const button =
            registerForm.querySelector<HTMLButtonElement>('button[type="submit"]');
          if (button) button.disabled = false;
          turnstileStatus.textContent = "Human verification completed.";
        },
        "expired-callback": () => {
          setRegistrationCaptchaState(
            false,
            "Verification expired. Please complete it again.",
          );
        },
        "error-callback": () => {
          setRegistrationCaptchaState(
            false,
            "Verification failed. Please try again.",
          );
        },
      },
    );
  } catch (error) {
    setRegistrationCaptchaState(
      false,
      error instanceof Error
        ? error.message
        : "Human verification is unavailable.",
    );
  }
}

void initializeRegistrationCaptcha();

registerForm?.addEventListener("submit", async (event: SubmitEvent) => {
'''
)

patch(
    "frontend/src/js/main.ts",
    '''  if (!message) return;

  const submitButton =
    registerForm.querySelector<HTMLButtonElement>('button[type="submit"]');

  const formData = new FormData(registerForm);
''',
    '''  if (!message) return;

  if (!registrationCaptchaToken) {
    message.textContent = "Please complete human verification before registering.";
    return;
  }

  const submitButton =
    registerForm.querySelector<HTMLButtonElement>('button[type="submit"]');

  const formData = new FormData(registerForm);
'''
)

patch(
    "frontend/src/js/main.ts",
    '''    password: String(formData.get("password") ?? ""),
    referral_code: String(formData.get("referral_code") ?? "").trim().toUpperCase() || null,
''',
    '''    password: String(formData.get("password") ?? ""),
    captcha_token: registrationCaptchaToken,
    referral_code: String(formData.get("referral_code") ?? "").trim().toUpperCase() || null,
'''
)

patch(
    "frontend/src/js/main.ts",
    '''  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Create account →";
    }
  }
});

// Login
''',
    '''  } finally {
    registrationCaptchaToken = null;

    if (registrationTurnstileWidgetId && window.turnstile) {
      window.turnstile.reset(registrationTurnstileWidgetId);
    }

    if (turnstileStatus) {
      turnstileStatus.textContent = "Please complete human verification again.";
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Create account →";
    }
  }
});

// Login
'''
)

print("\\nVisora Turnstile code patch completed.")
