$ErrorActionPreference = "Stop"

$root = (Get-Location).Path
$requiredPaths = @(
    "backend/requirements.txt",
    "frontend/vercel.json",
    "backend/app/main.py",
    "backend/tests/test_health.py",
    "supabase/migrations"
)
foreach ($path in $requiredPaths) {
    if (-not (Test-Path (Join-Path $root $path))) {
        throw "Run this script from the Visora repository root. Missing: $path"
    }
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [Parameter(Mandatory = $true)][string]$Content
    )
    $fullPath = Join-Path $root $RelativePath
    $directory = Split-Path -Parent $fullPath
    if (-not (Test-Path $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($fullPath, $Content, $encoding)
}

# 1. Update the three dependency pins without changing unrelated requirements.
$requirementsPath = Join-Path $root "backend/requirements.txt"
$requirements = [System.IO.File]::ReadAllText($requirementsPath)
$pinUpdates = [ordered]@{
    "python-dotenv" = @{ Old = "1.0.1"; New = "1.2.2" }
    "python-multipart" = @{ Old = "0.0.20"; New = "0.0.31" }
    "Pillow" = @{ Old = "12.3.0"; New = "13.0.0" }
}
foreach ($package in $pinUpdates.Keys) {
    $oldPin = "$package==$($pinUpdates[$package].Old)"
    $newPin = "$package==$($pinUpdates[$package].New)"
    if ($requirements.Contains($oldPin)) {
        $requirements = $requirements.Replace($oldPin, $newPin)
    } elseif (-not $requirements.Contains($newPin)) {
        throw "Unexpected $package pin. Expected '$oldPin' or '$newPin'."
    }
}
Write-Utf8NoBom "backend/requirements.txt" $requirements

# 2. Add baseline security headers to the static frontend.
$frontendConfigPath = Join-Path $root "frontend/vercel.json"
$frontendConfig = Get-Content -Raw $frontendConfigPath | ConvertFrom-Json
$frontendConfig | Add-Member -NotePropertyName headers -Force -NotePropertyValue @(
    @{
        source = "/(.*)"
        headers = @(
            @{ key = "Strict-Transport-Security"; value = "max-age=31536000; includeSubDomains" }
            @{ key = "X-Content-Type-Options"; value = "nosniff" }
            @{ key = "X-Frame-Options"; value = "DENY" }
            @{ key = "Referrer-Policy"; value = "strict-origin-when-cross-origin" }
            @{ key = "Permissions-Policy"; value = "camera=(self), microphone=(), geolocation=()" }
        )
    }
)
$frontendJson = $frontendConfig | ConvertTo-Json -Depth 100
Write-Utf8NoBom "frontend/vercel.json" ($frontendJson + "`n")

# 3. Add the same baseline headers at the FastAPI boundary.
$mainPath = Join-Path $root "backend/app/main.py"
$main = [System.IO.File]::ReadAllText($mainPath)
if (-not $main.Contains("class SecurityHeadersMiddleware")) {
    $needle = "class SuspendedAccountMiddleware(BaseHTTPMiddleware):"
    if (-not $main.Contains($needle)) {
        throw "Could not find the middleware insertion point in backend/app/main.py"
    }

    $middleware = @'
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Referrer-Policy", "strict-origin-when-cross-origin"
        )
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(self), microphone=(), geolocation=()",
        )
        return response


'@
    $main = $main.Replace($needle, $middleware + $needle)
}
$registration = "app.add_middleware(SecurityHeadersMiddleware)"
if (-not $main.Contains($registration)) {
    $existing = "app.add_middleware(SuspendedAccountMiddleware)"
    if (-not $main.Contains($existing)) {
        throw "Could not find the middleware registration in backend/app/main.py"
    }
    $main = $main.Replace($existing, $existing + "`n" + $registration)
}
Write-Utf8NoBom "backend/app/main.py" $main

# 4. Add a regression test for the response headers.
$healthTestPath = Join-Path $root "backend/tests/test_health.py"
$healthTest = [System.IO.File]::ReadAllText($healthTestPath)
if (-not $healthTest.Contains("def test_security_headers_are_present")) {
    $test = @'


def test_security_headers_are_present():
    response = client.get("/health")

    assert response.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["permissions-policy"] == "camera=(self), microphone=(), geolocation=()"
'@
    Write-Utf8NoBom "backend/tests/test_health.py" ($healthTest.TrimEnd() + $test + "`n")
}

# 5. Restore the migration files corresponding to the security migrations.
# These exact versions are already recorded in the linked Supabase project.
$functionMigration = @'
revoke execute on function public.get_withdrawal_settings() from public, anon;
revoke execute on function public.list_withdrawal_requests(integer) from public, anon;
revoke execute on function public.pay_withdrawal_request(uuid,text) from public, anon;
revoke execute on function public.reject_withdrawal_request(uuid,text,text) from public, anon;
revoke execute on function public.set_account_suspension(uuid,boolean,text) from public, anon;
revoke execute on function public.set_withdrawal_fee_recipient(text) from public, anon;
revoke execute on function public.prevent_suspended_profile_changes() from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
'@
Write-Utf8NoBom "supabase/migrations/20261123120239_harden_privileged_function_grants.sql" $functionMigration

$schemaMigration = @'
-- Anonymous access is limited to the explicitly public gallery/settings surface.
revoke all privileges on all tables in schema public from anon;
grant select on table public.gallery_publications, public.platform_public_settings, public.public_gallery_photos to anon;
revoke all privileges on all sequences in schema public from anon;

-- RLS does not protect TRUNCATE. Authenticated clients do not need these privileges.
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- Keep future objects restrictive by default for the postgres owner.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from authenticated;
'@
Write-Utf8NoBom "supabase/migrations/20261123120916_restrict_public_schema_grants.sql" $schemaMigration

Write-Host ""
Write-Host "Visora security hardening files have been updated locally." -ForegroundColor Green
Write-Host "Review changes with: git diff"
Write-Host "Then run:"
Write-Host "  cd backend; python -m pytest tests -q"
Write-Host "  cd ../frontend; npm ci; npm run build; npm audit --audit-level=high"
Write-Host "  cd ..; pip-audit -r backend/requirements.txt"
Write-Host ""
