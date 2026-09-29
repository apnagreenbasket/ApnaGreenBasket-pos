"""
Application configuration via environment variables.
Uses pydantic-settings for validation and type coercion.
"""

from __future__ import annotations
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """All config comes from env vars — never hardcode secrets."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- Database ----
    DATABASE_URL: str = "sqlite+aiosqlite:///./menu_saas.db"
    TEST_DATABASE_URL: str = "sqlite+aiosqlite:///:memory:"
    DB_CA_CERT_PATH: str = "/app/certs/rds-ca-bundle.pem"

    # ---- Redis ----
    REDIS_URL: str = "redis://localhost:6379/0"

    # ---- Auth / JWT ----
    JWT_SECRET_KEY: str = "CHANGE-ME-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ---- Superadmin Credentials (from .env) ----
    SUPERADMIN_EMAIL: str = "official@apnagreenbasket.com"
    SUPERADMIN_PASSWORD: str = ""

    # ---- Alerts & Notifications (Email, WhatsApp, SMS) ----
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "ApnaGreen Basket <noreply@apnagreenbasket.com>"

    # Twilio (WhatsApp & SMS)
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_FROM: str = ""  # e.g. "whatsapp:+14155238886"
    TWILIO_SMS_FROM: str = ""       # e.g. "+1XXXXXXXXXX"

    # Meta WhatsApp Cloud API (Alternative)
    META_WHATSAPP_TOKEN: str = ""
    META_WHATSAPP_PHONE_ID: str = ""

    # Fast2SMS (Indian SMS Gateway)
    FAST2SMS_API_KEY: str = ""

    # MSG91 (Indian SMS Gateway)
    MSG91_AUTH_KEY: str = ""
    MSG91_SENDER_ID: str = ""
    MSG91_TEMPLATE_ID: str = ""

    # ---- Razorpay ----
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    # ---- Cloudinary Object Storage ----
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    CLOUDINARY_URL: str = ""

    # ---- App ----
    APP_ENV: str = "development"
    DEBUG: bool = True
    ALLOWED_ORIGINS: str = "https://app.apnagreenbasket.com,https://pos.apnagreenbasket.com,http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000"
    LOG_LEVEL: str = "INFO"
    DASHBOARD_RESET_TIME: str = "00:00"
    FRONTEND_URL: str | None = None
    RUNTIME_MODE: str = "cloud"  # "cloud" (deployed) or "local" (desktop terminal)
    CLOUD_BACKEND_URL: str = "http://localhost:8000"
    LOCAL_OUTLET_ID: str = ""

    @property
    def frontend_base_url(self) -> str:
        if self.FRONTEND_URL:
            return self.FRONTEND_URL.rstrip("/")
        if not self.is_production:
            return "http://localhost:3000"
        return "https://app.apnagreenbasket.com"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_cloud(self) -> bool:
        return self.RUNTIME_MODE == "cloud"

    @property
    def is_local(self) -> bool:
        return self.RUNTIME_MODE == "local"


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — reads .env once."""
    return Settings()
