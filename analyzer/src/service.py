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
from .detectors import pii_detector, prompt_injection_detector, ml_jailbreak_detector, content_anonymizer

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
        Check content for security issues (Phase 2 - Full Implementation)
        Detects PII and prompt injection attempts

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

            all_issues = []
            redacted_text = request.content
            confidence_scores = []

            # Phase 2.1 - PII Detection
            if config.feature_pii_detection and pii_detector:
                pii_issues, pii_redacted, pii_confidence = pii_detector.detect(
                    request.content
                )
                if pii_issues:
                    all_issues.extend(pii_issues)
                    redacted_text = pii_redacted
                    confidence_scores.append(pii_confidence)
                    log_security_event(
                        self.logger,
                        "PII_DETECTED",
                        request_id,
                        count=len(pii_issues),
                        types=[issue["type"] for issue in pii_issues],
                    )

            # Phase 2.2 - Prompt Injection Detection (Regex-based)
            regex_issues = []
            if config.feature_prompt_injection and prompt_injection_detector:
                (
                    injection_issues,
                    injection_confidence,
                ) = prompt_injection_detector.detect(request.content)
                if injection_issues:
                    regex_issues = injection_issues
                    all_issues.extend(injection_issues)
                    confidence_scores.append(injection_confidence)
                    log_security_event(
                        self.logger,
                        "PROMPT_INJECTION_DETECTED",
                        request_id,
                        count=len(injection_issues),
                        categories=[issue.get("category") for issue in injection_issues],
                    )

            # Phase 5.1 - ML-Based Jailbreak Detection
            ml_issues = []
            ml_metadata = {}
            if config.feature_ml_jailbreak and ml_jailbreak_detector:
                (
                    ml_jailbreak_issues,
                    ml_confidence,
                    ml_metadata,
                ) = ml_jailbreak_detector.detect(request.content)
                if ml_jailbreak_issues:
                    ml_issues = ml_jailbreak_issues

                    # A/B Testing: Compare regex vs ML detection
                    if config.ml_ab_testing_enabled:
                        regex_detected = len(regex_issues) > 0
                        ml_detected = len(ml_issues) > 0

                        # Log A/B testing results
                        log_security_event(
                            self.logger,
                            "ML_AB_TEST",
                            request_id,
                            regex_detected=regex_detected,
                            ml_detected=ml_detected,
                            agreement=(regex_detected == ml_detected),
                            ml_metadata=ml_metadata,
                        )

                    # Add ML issues to all issues
                    all_issues.extend(ml_jailbreak_issues)
                    confidence_scores.append(ml_confidence)
                    log_security_event(
                        self.logger,
                        "ML_JAILBREAK_DETECTED",
                        request_id,
                        count=len(ml_jailbreak_issues),
                        ml_metadata=ml_metadata,
                    )

            # Determine if content is safe
            is_safe = len(all_issues) == 0

            # Calculate overall confidence score
            if confidence_scores:
                overall_confidence = sum(confidence_scores) / len(confidence_scores)
            else:
                overall_confidence = 1.0

            # Convert issues to protobuf format
            proto_issues = []
            for issue in all_issues:
                # Map issue type to enum
                issue_type = self._map_issue_type(issue["type"])

                proto_issue = firewall_pb2.DetectedIssue(
                    type=issue_type,
                    text=issue["text"][:100],  # Truncate for safety
                    start=issue["start"],
                    end=issue["end"],
                    confidence=issue["confidence"],
                    replacement=issue.get("replacement", ""),
                )
                proto_issues.append(proto_issue)

            # Build response
            response = firewall_pb2.CheckContentResponse(
                is_safe=is_safe,
                redacted_text=redacted_text,
                detected_issues=proto_issues,
                confidence_score=overall_confidence,
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

    def _map_issue_type(self, type_str: str) -> int:
        """
        Map issue type string to protobuf enum

        Args:
            type_str: Issue type as string

        Returns:
            Protobuf enum value
        """
        type_mapping = {
            "API_KEY": firewall_pb2.API_KEY,
            "EMAIL": firewall_pb2.EMAIL,
            "PHONE": firewall_pb2.PHONE,
            "PHONE_NUMBER": firewall_pb2.PHONE,
            "SSN": firewall_pb2.SSN,
            "CREDIT_CARD": firewall_pb2.CREDIT_CARD,
            "IP_ADDRESS": firewall_pb2.IP_ADDRESS,
            "PERSON": firewall_pb2.PERSON,
            "LOCATION": firewall_pb2.LOCATION,
            "URL": firewall_pb2.URL,
            "PASSWORD": firewall_pb2.PASSWORD,
            "PROMPT_INJECTION": firewall_pb2.PROMPT_INJECTION,
            "JAILBREAK": firewall_pb2.JAILBREAK,
            "EXCESSIVE_SPECIAL_CHARS": firewall_pb2.EXCESSIVE_SPECIAL_CHARS,
            "ENCODED_PAYLOAD": firewall_pb2.ENCODED_PAYLOAD,
            "ML_JAILBREAK": firewall_pb2.ML_JAILBREAK,
        }
        return type_mapping.get(type_str, firewall_pb2.UNKNOWN)

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
