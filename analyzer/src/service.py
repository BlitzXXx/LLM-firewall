"""
Firewall Service Implementation
Implements the gRPC service handlers
"""

import time
from typing import Optional
import grpc

from . import firewall_pb2
from . import firewall_pb2_grpc
from .config import config
from .logger import (
    get_logger,
    log_grpc_request,
    log_grpc_response,
    log_error,
    log_security_event,
)

# Service start time for uptime tracking
SERVICE_START_TIME = time.time()

# Get logger
logger = get_logger(__name__)


class FirewallServicer(firewall_pb2_grpc.FirewallServiceServicer):
    """
    Firewall service implementation
    Handles security analysis for LLM requests
    """

    def __init__(self):
        """Initialize the service"""
        self.logger = logger
        self.start_time = SERVICE_START_TIME

    def HealthCheck(
        self,
        request: firewall_pb2.HealthCheckRequest,
        context: grpc.ServicerContext,
    ) -> firewall_pb2.HealthCheckResponse:
        """
        Health check RPC
        Returns service status and uptime

        Args:
            request: HealthCheckRequest
            context: gRPC context

        Returns:
            HealthCheckResponse with service status
        """
        request_id = self._get_request_id(context)
        start_time = time.time()

        try:
            # Log request
            log_grpc_request(
                self.logger,
                request_id,
                "HealthCheck",
                service=request.service if request.service else "default",
            )

            # Calculate uptime
            uptime_seconds = int(time.time() - self.start_time)

            # Build response
            response = firewall_pb2.HealthCheckResponse(
                status=firewall_pb2.HealthCheckResponse.SERVING,
                version=config.service_version,
                uptime_seconds=uptime_seconds,
            )

            # Log response
            duration_ms = (time.time() - start_time) * 1000
            log_grpc_response(
                self.logger,
                request_id,
                "HealthCheck",
                duration_ms,
                status="SERVING",
                uptime_seconds=uptime_seconds,
            )

            return response

        except Exception as e:
            log_error(self.logger, e, request_id, method="HealthCheck")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Health check failed: {str(e)}")
            return firewall_pb2.HealthCheckResponse(
                status=firewall_pb2.HealthCheckResponse.NOT_SERVING
            )

    def CheckContent(
        self,
        request: firewall_pb2.CheckContentRequest,
        context: grpc.ServicerContext,
    ) -> firewall_pb2.CheckContentResponse:
        """
        Check content for security issues (STUB - Phase 1.3)
        Returns is_safe=True with empty detections for now

        Full implementation will be added in Phase 2.1 (PII Detection)
        and Phase 2.2 (Prompt Injection Detection)

        Args:
            request: CheckContentRequest with content to analyze
            context: gRPC context

        Returns:
            CheckContentResponse with analysis results
        """
        request_id = request.request_id or self._get_request_id(context)
        start_time = time.time()

        try:
            # Log request
            log_grpc_request(
                self.logger,
                request_id,
                "CheckContent",
                content_length=len(request.content),
                metadata=dict(request.metadata),
            )

            # TODO: Phase 2.1 - Implement PII detection using Presidio
            # TODO: Phase 2.2 - Implement prompt injection detection
            # TODO: Phase 5.2 - Implement dynamic anonymization

            # For skeleton phase, always return safe
            # This is intentional - we're just testing gRPC communication
            response = firewall_pb2.CheckContentResponse(
                is_safe=True,  # Mock: Always safe in skeleton phase
                redacted_text=request.content,  # Mock: No redaction yet
                detected_issues=[],  # Mock: No issues detected
                confidence_score=1.0,  # Mock: 100% confidence (no real analysis)
                request_id=request_id,
            )

            # Log response
            duration_ms = (time.time() - start_time) * 1000
            log_grpc_response(
                self.logger,
                request_id,
                "CheckContent",
                duration_ms,
                is_safe=response.is_safe,
                detected_issues_count=len(response.detected_issues),
                confidence_score=response.confidence_score,
            )

            return response

        except Exception as e:
            log_error(self.logger, e, request_id, method="CheckContent")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Content check failed: {str(e)}")

            # Return error response
            return firewall_pb2.CheckContentResponse(
                is_safe=False,
                redacted_text="",
                detected_issues=[],
                confidence_score=0.0,
                request_id=request_id,
            )

    def _get_request_id(self, context: grpc.ServicerContext) -> str:
        """
        Extract request ID from gRPC metadata

        Args:
            context: gRPC context

        Returns:
            Request ID string
        """
        metadata = dict(context.invocation_metadata())
        return metadata.get("x-request-id", "unknown")
