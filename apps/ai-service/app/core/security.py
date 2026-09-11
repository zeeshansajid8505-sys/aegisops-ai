from fastapi import Security, HTTPException, status
from fastapi.security import APIKeyHeader
from app.core.config import settings

api_key_header = APIKeyHeader(name="X-Internal-Service-Key", auto_error=False)

def verify_internal_api_key(api_key: str = Security(api_key_header)) -> str:
    """Validate server-to-server pre-shared key for internal microservice communication."""
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing internal service authentication key in X-Internal-Service-Key header",
        )
    if api_key != settings.AI_INTERNAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal service authentication key",
        )
    return api_key

