"""Authentication defaults from the reference service for synthetic database seeding."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    environment: str = "test"
    database_url: str = "sqlite://"
    allow_guest: bool = True
    session_ttl_seconds: int = 86400
    auth_retention_seconds: int = 86400
    auth_maintenance_batch: int = 100
    auth_rate_max_buckets: int = 10000
    bootstrap_limit: int = 30
    login_limit: int = 10
    login_window_seconds: int = 60
    trusted_origins: tuple[str, ...] = ("http://testserver", "http://localhost:5173", "http://127.0.0.1:5173")
