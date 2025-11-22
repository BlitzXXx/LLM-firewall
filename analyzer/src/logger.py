"""
Logger Module
Configures structured logging for the Analyzer service
"""

import logging
import json
import sys
from datetime import datetime
from typing import Any, Dict, Optional
from .config import config


class StructuredFormatter(logging.Formatter):
    """
    Custom formatter that outputs logs as structured JSON
    """

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON"""
        log_data = {
            "level": record.levelname.lower(),
            "time": datetime.utcnow().isoformat() + "Z",
            "service": config.service_name,
            "version": config.service_version,
            "environment": config.env,
            "name": record.name,
            "msg": record.getMessage(),
        }

        # Add request ID if present
        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id

        # Add extra fields
        if hasattr(record, "extra_fields"):
            log_data.update(record.extra_fields)

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data)


class PrettyFormatter(logging.Formatter):
    """
    Formatter for development that outputs human-readable logs
    """

    COLORS = {
        "DEBUG": "\033[36m",  # Cyan
        "INFO": "\033[32m",  # Green
        "WARNING": "\033[33m",  # Yellow
        "ERROR": "\033[31m",  # Red
        "CRITICAL": "\033[35m",  # Magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        """Format log record with colors"""
        color = self.COLORS.get(record.levelname, "")
        timestamp = datetime.utcnow().strftime("%H:%M:%S.%f")[:-3]

        # Build message
        parts = [
            f"{color}{record.levelname:8}{self.RESET}",
            f"{timestamp}",
            f"[{record.name}]",
        ]

        # Add request ID if present
        if hasattr(record, "request_id"):
            parts.append(f"[{record.request_id}]")

        # Add message
        parts.append(record.getMessage())

        message = " ".join(parts)

        # Add exception if present
        if record.exc_info:
            message += "\n" + self.formatException(record.exc_info)

        return message


def setup_logger(name: Optional[str] = None) -> logging.Logger:
    """
    Setup and configure logger

    Args:
        name: Logger name (defaults to root logger)

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, config.log_level))

    # Remove existing handlers
    logger.handlers.clear()

    # Create console handler
    handler = logging.StreamHandler(sys.stdout)

    # Use pretty formatter in development, JSON in production
    if config.env == "development":
        formatter = PrettyFormatter()
    else:
        formatter = StructuredFormatter()

    handler.setFormatter(formatter)
    logger.addHandler(handler)

    # Prevent propagation to root logger
    logger.propagate = False

    return logger


def get_logger(name: str) -> logging.Logger:
    """
    Get or create a logger with the given name

    Args:
        name: Logger name

    Returns:
        Logger instance
    """
    return setup_logger(name)


class LoggerAdapter(logging.LoggerAdapter):
    """
    Logger adapter that adds context to log messages
    """

    def process(
        self, msg: str, kwargs: Dict[str, Any]
    ) -> tuple[str, Dict[str, Any]]:
        """Add extra context to log messages"""
        if "extra" not in kwargs:
            kwargs["extra"] = {}

        # Merge adapter context with message context
        kwargs["extra"].update(self.extra)

        return msg, kwargs


def create_logger_with_context(name: str, **context) -> LoggerAdapter:
    """
    Create a logger with additional context

    Args:
        name: Logger name
        **context: Additional context to add to all log messages

    Returns:
        LoggerAdapter with context
    """
    logger = get_logger(name)
    return LoggerAdapter(logger, {"extra_fields": context})


# Log helper functions


def log_startup(logger: logging.Logger, config_summary: Dict[str, Any]) -> None:
    """Log startup information"""
    logger.info(
        "Starting service",
        extra={
            "extra_fields": {
                "type": "startup",
                "config": config_summary,
            }
        },
    )


def log_shutdown(logger: logging.Logger, reason: str) -> None:
    """Log shutdown information"""
    logger.info(
        f"Shutting down: {reason}",
        extra={"extra_fields": {"type": "shutdown", "reason": reason}},
    )


def log_grpc_request(
    logger: logging.Logger, request_id: str, method: str, **details
) -> None:
    """Log gRPC request"""
    logger.info(
        f"gRPC request: {method}",
        extra={
            "request_id": request_id,
            "extra_fields": {
                "type": "grpc_request",
                "method": method,
                **details,
            },
        },
    )


def log_grpc_response(
    logger: logging.Logger,
    request_id: str,
    method: str,
    duration_ms: float,
    **details,
) -> None:
    """Log gRPC response"""
    logger.info(
        f"gRPC response: {method} [{duration_ms:.2f}ms]",
        extra={
            "request_id": request_id,
            "extra_fields": {
                "type": "grpc_response",
                "method": method,
                "duration_ms": duration_ms,
                **details,
            },
        },
    )


def log_error(
    logger: logging.Logger,
    error: Exception,
    request_id: Optional[str] = None,
    **context,
) -> None:
    """Log error with context"""
    logger.error(
        str(error),
        exc_info=True,
        extra={
            "request_id": request_id,
            "extra_fields": {
                "type": "error",
                "error_type": type(error).__name__,
                **context,
            },
        },
    )


def log_security_event(
    logger: logging.Logger,
    event_type: str,
    request_id: Optional[str] = None,
    **details,
) -> None:
    """Log security event"""
    logger.warning(
        f"Security event: {event_type}",
        extra={
            "request_id": request_id,
            "extra_fields": {
                "type": "security_event",
                "event_type": event_type,
                **details,
            },
        },
    )


def log_performance(
    logger: logging.Logger, metric: str, value: float, unit: str = "ms", **context
) -> None:
    """Log performance metric"""
    logger.debug(
        f"Performance: {metric} = {value}{unit}",
        extra={
            "extra_fields": {
                "type": "performance",
                "metric": metric,
                "value": value,
                "unit": unit,
                **context,
            }
        },
    )


# Create default logger
default_logger = setup_logger("analyzer")
