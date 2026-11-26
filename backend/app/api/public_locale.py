from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

router = APIRouter(prefix="/public", tags=["Public locale"])

# Country headers set by common CDNs and reverse proxies. Only trusted when
# the deployment sits behind one of them; otherwise they are simply absent.
COUNTRY_HEADERS = (
    "cf-ipcountry",
    "x-vercel-ip-country",
    "cloudfront-viewer-country",
    "x-country-code",
)

COUNTRY_LANGUAGES = {
    "JP": "ja",
    "KR": "ko",
    "KP": "ko",
    "CN": "zh",
    "TW": "zh",
    "HK": "zh",
    "MO": "zh",
    "SG": "zh",
    "VN": "vi",
    "DE": "de",
    "AT": "de",
    "CH": "de",
    "LI": "de",
    "ES": "es",
    "MX": "es",
    "AR": "es",
    "CO": "es",
    "CL": "es",
    "PE": "es",
    "VE": "es",
    "EC": "es",
    "GT": "es",
    "CU": "es",
    "BO": "es",
    "DO": "es",
    "HN": "es",
    "PY": "es",
    "SV": "es",
    "NI": "es",
    "CR": "es",
    "PA": "es",
    "UY": "es",
    "PR": "es",
    "GQ": "es",
}


class LocaleResponse(BaseModel):
    country: str | None
    language: str | None


def country_from_headers(request: Request) -> str | None:
    for header in COUNTRY_HEADERS:
        value = request.headers.get(header, "").strip().upper()
        if len(value) == 2 and value.isalpha() and value not in {"XX", "T1"}:
            return value
    return None


@router.get("/locale", response_model=LocaleResponse)
async def detect_locale(request: Request, response: Response) -> LocaleResponse:
    response.headers["Cache-Control"] = "no-store"
    country = country_from_headers(request)
    return LocaleResponse(
        country=country,
        language=COUNTRY_LANGUAGES.get(country, "en") if country else None,
    )
