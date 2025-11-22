from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class IssueType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    UNKNOWN: _ClassVar[IssueType]
    API_KEY: _ClassVar[IssueType]
    EMAIL: _ClassVar[IssueType]
    PHONE: _ClassVar[IssueType]
    SSN: _ClassVar[IssueType]
    CREDIT_CARD: _ClassVar[IssueType]
    IP_ADDRESS: _ClassVar[IssueType]
    PERSON: _ClassVar[IssueType]
    LOCATION: _ClassVar[IssueType]
    URL: _ClassVar[IssueType]
    PASSWORD: _ClassVar[IssueType]
    PROMPT_INJECTION: _ClassVar[IssueType]
    JAILBREAK: _ClassVar[IssueType]
    EXCESSIVE_SPECIAL_CHARS: _ClassVar[IssueType]
    ENCODED_PAYLOAD: _ClassVar[IssueType]
UNKNOWN: IssueType
API_KEY: IssueType
EMAIL: IssueType
PHONE: IssueType
SSN: IssueType
CREDIT_CARD: IssueType
IP_ADDRESS: IssueType
PERSON: IssueType
LOCATION: IssueType
URL: IssueType
PASSWORD: IssueType
PROMPT_INJECTION: IssueType
JAILBREAK: IssueType
EXCESSIVE_SPECIAL_CHARS: IssueType
ENCODED_PAYLOAD: IssueType

class CheckContentRequest(_message.Message):
    __slots__ = ("content", "request_id", "metadata")
    class MetadataEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    METADATA_FIELD_NUMBER: _ClassVar[int]
    content: str
    request_id: str
    metadata: _containers.ScalarMap[str, str]
    def __init__(self, content: _Optional[str] = ..., request_id: _Optional[str] = ..., metadata: _Optional[_Mapping[str, str]] = ...) -> None: ...

class CheckContentResponse(_message.Message):
    __slots__ = ("is_safe", "redacted_text", "detected_issues", "confidence_score", "request_id")
    IS_SAFE_FIELD_NUMBER: _ClassVar[int]
    REDACTED_TEXT_FIELD_NUMBER: _ClassVar[int]
    DETECTED_ISSUES_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_SCORE_FIELD_NUMBER: _ClassVar[int]
    REQUEST_ID_FIELD_NUMBER: _ClassVar[int]
    is_safe: bool
    redacted_text: str
    detected_issues: _containers.RepeatedCompositeFieldContainer[DetectedIssue]
    confidence_score: float
    request_id: str
    def __init__(self, is_safe: bool = ..., redacted_text: _Optional[str] = ..., detected_issues: _Optional[_Iterable[_Union[DetectedIssue, _Mapping]]] = ..., confidence_score: _Optional[float] = ..., request_id: _Optional[str] = ...) -> None: ...

class DetectedIssue(_message.Message):
    __slots__ = ("type", "text", "start", "end", "confidence", "replacement")
    TYPE_FIELD_NUMBER: _ClassVar[int]
    TEXT_FIELD_NUMBER: _ClassVar[int]
    START_FIELD_NUMBER: _ClassVar[int]
    END_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_FIELD_NUMBER: _ClassVar[int]
    REPLACEMENT_FIELD_NUMBER: _ClassVar[int]
    type: IssueType
    text: str
    start: int
    end: int
    confidence: float
    replacement: str
    def __init__(self, type: _Optional[_Union[IssueType, str]] = ..., text: _Optional[str] = ..., start: _Optional[int] = ..., end: _Optional[int] = ..., confidence: _Optional[float] = ..., replacement: _Optional[str] = ...) -> None: ...

class HealthCheckRequest(_message.Message):
    __slots__ = ("service",)
    SERVICE_FIELD_NUMBER: _ClassVar[int]
    service: str
    def __init__(self, service: _Optional[str] = ...) -> None: ...

class HealthCheckResponse(_message.Message):
    __slots__ = ("status", "version", "uptime_seconds")
    class ServingStatus(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
        __slots__ = ()
        UNKNOWN: _ClassVar[HealthCheckResponse.ServingStatus]
        SERVING: _ClassVar[HealthCheckResponse.ServingStatus]
        NOT_SERVING: _ClassVar[HealthCheckResponse.ServingStatus]
        SERVICE_UNKNOWN: _ClassVar[HealthCheckResponse.ServingStatus]
    UNKNOWN: HealthCheckResponse.ServingStatus
    SERVING: HealthCheckResponse.ServingStatus
    NOT_SERVING: HealthCheckResponse.ServingStatus
    SERVICE_UNKNOWN: HealthCheckResponse.ServingStatus
    STATUS_FIELD_NUMBER: _ClassVar[int]
    VERSION_FIELD_NUMBER: _ClassVar[int]
    UPTIME_SECONDS_FIELD_NUMBER: _ClassVar[int]
    status: HealthCheckResponse.ServingStatus
    version: str
    uptime_seconds: int
    def __init__(self, status: _Optional[_Union[HealthCheckResponse.ServingStatus, str]] = ..., version: _Optional[str] = ..., uptime_seconds: _Optional[int] = ...) -> None: ...
