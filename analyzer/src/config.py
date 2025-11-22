"""
Configuration Module
Loads and validates environment variables for the Analyzer service
"""

import os
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class AnalyzerConfig:
    """Analyzer Service Configuration"""

    def __init__(self):
        # Server Configuration
        self.port: int = int(os.getenv("ANALYZER_PORT", "50051"))
        self.host: str = os.getenv("ANALYZER_HOST", "0.0.0.0")
        self.env: str = os.getenv("ENVIRONMENT", "development")

        # Logging Configuration
        self.log_level: str = os.getenv("LOG_LEVEL", "info").upper()

        # gRPC Configuration
        self.grpc_max_workers: int = int(os.getenv("GRPC_MAX_WORKERS", "10"))
        self.grpc_max_message_size: int = int(
            os.getenv("GRPC_MAX_MESSAGE_SIZE", "4194304")
        )  # 4MB
        self.grpc_keepalive_time_ms: int = int(
            os.getenv("GRPC_KEEPALIVE_TIME_MS", "10000")
        )

        # Security Configuration
        self.pii_confidence_threshold: float = float(
            os.getenv("PII_CONFIDENCE_THRESHOLD", "0.7")
        )
        self.pii_entities: list = (
            os.getenv(
                "PII_ENTITIES",
                "EMAIL,PHONE_NUMBER,CREDIT_CARD,SSN,IP_ADDRESS,PERSON,LOCATION",
            )
            .strip()
            .split(",")
        )

        # Prompt Injection Configuration
        self.prompt_injection_enabled: bool = (
            os.getenv("PROMPT_INJECTION_ENABLED", "true").lower() == "true"
        )
        self.prompt_injection_sensitivity: str = os.getenv(
            "PROMPT_INJECTION_SENSITIVITY", "moderate"
        )
        self.special_char_threshold: float = float(
            os.getenv("SPECIAL_CHAR_THRESHOLD", "0.1")
        )

        # Content Limits
        self.max_content_length: int = int(os.getenv("MAX_CONTENT_LENGTH", "10240"))
        self.min_content_length: int = int(os.getenv("MIN_CONTENT_LENGTH", "1"))

        # Feature Flags
        self.feature_pii_detection: bool = (
            os.getenv("FEATURE_PII_DETECTION", "true").lower() == "true"
        )
        self.feature_prompt_injection: bool = (
            os.getenv("FEATURE_PROMPT_INJECTION", "true").lower() == "true"
        )
        self.feature_anonymization: bool = (
            os.getenv("FEATURE_ANONYMIZATION", "false").lower() == "true"
        )
        self.feature_ml_jailbreak: bool = (
            os.getenv("FEATURE_ML_JAILBREAK", "false").lower() == "true"
        )

        # Observability Configuration
        self.otel_enabled: bool = (
            os.getenv("OTEL_ENABLED", "true").lower() == "true"
        )
        self.service_name: str = os.getenv(
            "OTEL_SERVICE_NAME", "llm-firewall-analyzer"
        )
        self.service_version: str = os.getenv("OTEL_SERVICE_VERSION", "1.0.0")

        # Graceful Shutdown
        self.shutdown_timeout: int = int(os.getenv("SHUTDOWN_TIMEOUT_MS", "10000"))

    def validate(self) -> bool:
        """Validate critical configuration"""
        errors = []

        # Validate port range
        if not (1 <= self.port <= 65535):
            errors.append(
                f"Invalid ANALYZER_PORT: {self.port}. Must be between 1-65535."
            )

        # Validate log level
        valid_log_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if self.log_level not in valid_log_levels:
            errors.append(
                f"Invalid LOG_LEVEL: {self.log_level}. "
                f"Must be one of: {', '.join(valid_log_levels)}"
            )

        # Validate environment
        valid_envs = ["development", "production", "test"]
        if self.env not in valid_envs:
            errors.append(
                f"Invalid ENVIRONMENT: {self.env}. "
                f"Must be one of: {', '.join(valid_envs)}"
            )

        # Validate confidence threshold
        if not (0.0 <= self.pii_confidence_threshold <= 1.0):
            errors.append(
                f"Invalid PII_CONFIDENCE_THRESHOLD: {self.pii_confidence_threshold}. "
                "Must be between 0.0 and 1.0."
            )

        if errors:
            raise ValueError(
                f"Configuration validation failed:\n" + "\n".join(errors)
            )

        return True

    def get_summary(self) -> dict:
        """Get configuration summary (safe for logging - no secrets)"""
        return {
            "environment": self.env,
            "server": {
                "host": self.host,
                "port": self.port,
            },
            "grpc": {
                "max_workers": self.grpc_max_workers,
                "max_message_size": self.grpc_max_message_size,
            },
            "features": {
                "pii_detection": self.feature_pii_detection,
                "prompt_injection": self.feature_prompt_injection,
                "anonymization": self.feature_anonymization,
                "ml_jailbreak": self.feature_ml_jailbreak,
            },
            "observability": {
                "enabled": self.otel_enabled,
                "service_name": self.service_name,
                "service_version": self.service_version,
            },
        }


# Create global config instance
config = AnalyzerConfig()
