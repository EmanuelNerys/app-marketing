from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    app_name: str = "App Marketing"
    debug: bool = False

    database_url: str = "postgresql+asyncpg://marketing_user:marketing_pass@localhost:5432/app_marketing"

    meta_app_id: str = ""
    meta_app_secret: str = ""
    meta_redirect_uri: str = "http://localhost:8000/api/v1/auth/meta/callback"
    meta_webhook_verify_token: str = ""

    secret_key: str = "change_this_to_a_random_secret_key"
    cors_origins: str = '["http://localhost:5173"]'

    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.cors_origins)

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
