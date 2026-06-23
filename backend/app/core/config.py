from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    app_name: str = "adStudioAI"
    debug: bool = False

    database_url: str = "postgresql+asyncpg://marketing_user:marketing_pass@localhost:5432/adstudioai"

    meta_app_id: str = ""
    meta_app_secret: str = ""
    meta_oauth_client_secret: str = ""
    meta_api_version: str = "v21.0"
    meta_redirect_uri: str = "http://localhost:8000/api/v1/auth/meta/callback"
    meta_webhook_verify_token: str = ""

    # Instagram App (Basic Display / Instagram Login)
    ig_app_id: str = ""
    ig_app_secret: str = ""
    ig_redirect_uri: str = "http://localhost:8000/api/v1/auth/instagram/callback"

    # Fernet key for encrypting access tokens at rest.
    # Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    fernet_key: str = ""

    # Optional: n8n webhook URL for event dispatching
    n8n_webhook_url: str = ""

    secret_key: str = "change_this_to_a_random_secret_key"
    jwt_algorithm: str = "HS256"
    jwt_access_expire_minutes: int = 60
    jwt_refresh_expire_days: int = 30
    cors_origins: str = '["http://localhost:5173"]'

    # Asaas Payment Gateway
    asaas_api_key: str = ""
    asaas_mode: str = "sandbox"  # sandbox or production
    asaas_webhook_token: str = ""

    # Resend (email)
    resend_api_key: str = ""
    email_from: str = "noreply@adstudioai.com"
    email_from_name: str = "adStudioAI"
    app_url: str = "http://localhost:5173"

    @property
    def meta_graph_url(self) -> str:
        return f"https://graph.facebook.com/{self.meta_api_version}"

    @property
    def meta_dialog_url(self) -> str:
        return f"https://www.facebook.com/{self.meta_api_version}/dialog/oauth"

    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.cors_origins)

    @property
    def ig_dialog_url(self) -> str:
        return "https://www.instagram.com/oauth/authorize"

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
