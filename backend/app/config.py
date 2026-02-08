import os
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://shipping:shipping123@localhost:5432/shipping_db"

    # EasyPost - both keys stored, environment determines which is used
    EASYPOST_API_KEY_PRODUCTION: str = ""
    EASYPOST_API_KEY_TEST: str = ""

    # Legacy key support (falls back if specific keys not set)
    EASYPOST_API_KEY: str = ""

    # App
    APP_NAME: str = "Shipping Management Platform"
    DEBUG: bool = False

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore"
    }

    def get_production_key(self) -> str:
        """Get production API key."""
        return self.EASYPOST_API_KEY_PRODUCTION or self.EASYPOST_API_KEY

    def get_test_key(self) -> str:
        """Get test API key."""
        # Also check for legacy key that starts with EZTK
        if self.EASYPOST_API_KEY_TEST:
            return self.EASYPOST_API_KEY_TEST
        # Fallback: check if legacy key is a test key
        if self.EASYPOST_API_KEY and self.EASYPOST_API_KEY.startswith("EZTK"):
            return self.EASYPOST_API_KEY
        return ""


@lru_cache()
def get_settings() -> Settings:
    return Settings()
