from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List, Union
import json

class Settings(BaseSettings):
    PROJECT_NAME: str = "AegisOps AI Engine"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    API_PREFIX: str = "/api/v1"
    CORS_ORIGINS: Union[str, List[str]] = ["http://localhost:3000", "http://localhost:3001"]
    AI_INTERNAL_API_KEY: str = "aegisops-ai-internal-key-change-in-prod"
    RCA_EMBEDDING_DIMENSION: int = 16
    RCA_ALGORITHM_VERSION: str = "1.0.0"
    RCA_MODEL_VERSION: str = "1.0.0"

    @field_validator("CORS_ORIGINS")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            v_clean = v.strip()
            if v_clean.startswith("[") and v_clean.endswith("]"):
                return json.loads(v_clean)
            return [i.strip() for i in v_clean.split(",") if i.strip()]
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()
