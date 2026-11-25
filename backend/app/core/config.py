from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "production"
    app_name: str = "Photography Publishing API"

    frontend_url: str = "https://visora-frontend-lx-a-nexus.vercel.app"
    frontend_origins: str = (
        "https://visora-frontend-lx-a-nexus.vercel.app,"
        "http://127.0.0.1:5500,http://localhost:5500"
    )

    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    turnstile_site_key: str = ""

    paystack_secret_key: str = ""
    partnership_proof_encryption_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.frontend_origins.split(",")
            if origin.strip()
        ]


settings = Settings()