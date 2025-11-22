"""
Prompt Injection Detection Module
Detects common prompt injection and jailbreak attempts
Based on OWASP LLM01:2025 - Prompt Injection
"""

import re
import base64
from typing import List, Dict, Tuple
from ..config import config
from ..logger import get_logger

logger = get_logger(__name__)


class PromptInjectionDetector:
    """
    Detects prompt injection attempts using pattern matching
    """

    # Direct injection patterns (OWASP LLM01)
    DIRECT_INJECTION_PATTERNS = [
        # Instruction override attempts
        r"ignore\s+(previous|all|above|prior)\s+(instructions?|prompts?|commands?|rules?)",
        r"disregard\s+(previous|all|above|prior)\s+(instructions?|prompts?|commands?|rules?)",
        r"forget\s+(previous|all|above|prior)\s+(instructions?|prompts?|commands?|rules?)",
        r"override\s+(previous|all|above|prior)\s+(instructions?|prompts?|commands?|rules?)",
        # System prompt leakage attempts
        r"(show|display|reveal|print|output)\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?)",
        r"what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?|rules?)",
        r"repeat\s+(your|the)\s+(system\s+)?(prompt|instructions?)",
        # Role-playing / mode switching
        r"you\s+are\s+now\s+(in|a|an)\s+(developer|admin|debug|god)\s+mode",
        r"enable\s+(developer|admin|debug|god)\s+mode",
        r"(act|pretend|behave)\s+as\s+(if\s+you\s+are\s+)?(a|an)\s+(jailbroken|unrestricted|evil|malicious|hacker)",
        r"from\s+now\s+on,?\s+you\s+(are|will\s+be|should\s+be)",
        # DAN (Do Anything Now) variants
        r"\bDAN\b.*mode",
        r"do\s+anything\s+now",
        # Escape sequence attempts
        r"<\|im_(start|end)\|>",
        r"\[INST\].*\[/INST\]",
        r"###\s*(Instruction|System|Human|Assistant)",
        # Delimiter injection
        r"---+\s*(end|start)\s+of\s+(prompt|instructions?)",
        r"\*\*\*+\s*(end|start)\s+of\s+(prompt|instructions?)",
        # Encoded payload indicators
        r"base64:",
        r"eval\s*\(",
        r"exec\s*\(",
        # XML/JSON injection
        r"<\s*system\s*>",
        r"<\s*instruction\s*>",
        r'"role"\s*:\s*"system"',
        # Multilingual injection attempts
        r"traduire|traduzir|übersetzen|翻译",  # "translate" in other languages
    ]

    # Jailbreak patterns
    JAILBREAK_PATTERNS = [
        r"hypothetically",
        r"in\s+a\s+fictional\s+(world|universe|scenario|story)",
        r"for\s+(educational|research|academic)\s+purposes\s+only",
        r"no\s+consequences",
        r"without\s+any\s+(restrictions?|limitations?|filters?|guidelines?)",
        r"bypass\s+(safety|content)\s+(filters?|guidelines?|restrictions?)",
        r"unfiltered\s+response",
        r"(pretend|imagine)\s+you\s+have\s+no\s+(restrictions?|limitations?|ethics?)",
    ]

    # Excessive special character patterns
    SPECIAL_CHAR_THRESHOLD = config.special_char_threshold

    def __init__(self):
        """Initialize the detector"""
        self.sensitivity = config.prompt_injection_sensitivity
        self.enabled = config.prompt_injection_enabled

        # Compile patterns for efficiency
        self.direct_patterns = [
            re.compile(pattern, re.IGNORECASE) for pattern in self.DIRECT_INJECTION_PATTERNS
        ]
        self.jailbreak_patterns = [
            re.compile(pattern, re.IGNORECASE) for pattern in self.JAILBREAK_PATTERNS
        ]

        logger.info(
            f"Prompt Injection Detector initialized. "
            f"Sensitivity: {self.sensitivity}, Enabled: {self.enabled}"
        )

    def detect(self, text: str) -> Tuple[List[Dict], float]:
        """
        Detect prompt injection attempts

        Args:
            text: Text to analyze

        Returns:
            Tuple of (detected_issues, confidence_score)
        """
        if not self.enabled:
            return [], 1.0

        detected_issues = []

        try:
            # Check for direct injection patterns
            direct_matches = self._check_direct_injection(text)
            detected_issues.extend(direct_matches)

            # Check for jailbreak patterns
            jailbreak_matches = self._check_jailbreak_attempts(text)
            detected_issues.extend(jailbreak_matches)

            # Check for encoded payloads
            encoded_matches = self._check_encoded_payloads(text)
            detected_issues.extend(encoded_matches)

            # Check for excessive special characters
            special_char_matches = self._check_special_characters(text)
            detected_issues.extend(special_char_matches)

            # Check for delimiter injection
            delimiter_matches = self._check_delimiter_injection(text)
            detected_issues.extend(delimiter_matches)

            # Calculate confidence score
            if detected_issues:
                # Higher number of detections = higher confidence
                confidence = min(0.95, 0.7 + (len(detected_issues) * 0.1))
            else:
                confidence = 1.0

            if detected_issues:
                logger.warning(
                    f"Detected {len(detected_issues)} prompt injection indicators. "
                    f"Confidence: {confidence:.2f}"
                )

            return detected_issues, confidence

        except Exception as e:
            logger.error(f"Error during prompt injection detection: {e}", exc_info=True)
            return [], 0.5  # Low confidence on error

    def _check_direct_injection(self, text: str) -> List[Dict]:
        """Check for direct injection patterns"""
        matches = []
        for pattern in self.direct_patterns:
            for match in pattern.finditer(text):
                matches.append(
                    {
                        "type": "PROMPT_INJECTION",
                        "text": match.group(),
                        "start": match.start(),
                        "end": match.end(),
                        "confidence": 0.9,
                        "replacement": "<PROMPT_INJECTION_DETECTED>",
                        "category": "direct_injection",
                    }
                )
        return matches

    def _check_jailbreak_attempts(self, text: str) -> List[Dict]:
        """Check for jailbreak attempts"""
        matches = []
        for pattern in self.jailbreak_patterns:
            for match in pattern.finditer(text):
                matches.append(
                    {
                        "type": "JAILBREAK",
                        "text": match.group(),
                        "start": match.start(),
                        "end": match.end(),
                        "confidence": 0.8,
                        "replacement": "<JAILBREAK_DETECTED>",
                        "category": "jailbreak_attempt",
                    }
                )
        return matches

    def _check_encoded_payloads(self, text: str) -> List[Dict]:
        """Check for base64 and other encoded payloads"""
        matches = []

        # Check for base64-like strings (at least 20 chars)
        base64_pattern = re.compile(r"[A-Za-z0-9+/]{20,}={0,2}")
        for match in base64_pattern.finditer(text):
            try:
                # Try to decode
                decoded = base64.b64decode(match.group())
                # Check if decoded content contains suspicious keywords
                decoded_text = decoded.decode("utf-8", errors="ignore").lower()
                suspicious_keywords = [
                    "system",
                    "prompt",
                    "instruction",
                    "ignore",
                    "override",
                    "admin",
                ]
                if any(keyword in decoded_text for keyword in suspicious_keywords):
                    matches.append(
                        {
                            "type": "ENCODED_PAYLOAD",
                            "text": match.group()[:50] + "...",  # Truncate for logging
                            "start": match.start(),
                            "end": match.end(),
                            "confidence": 0.85,
                            "replacement": "<ENCODED_PAYLOAD_DETECTED>",
                            "category": "encoded_injection",
                        }
                    )
            except Exception:
                # Not valid base64 or not suspicious
                pass

        return matches

    def _check_special_characters(self, text: str) -> List[Dict]:
        """Check for excessive special characters"""
        # Count special characters
        special_chars = re.findall(r"[^a-zA-Z0-9\s]", text)
        special_char_ratio = len(special_chars) / len(text) if text else 0

        if special_char_ratio > self.SPECIAL_CHAR_THRESHOLD:
            return [
                {
                    "type": "EXCESSIVE_SPECIAL_CHARS",
                    "text": f"Special character ratio: {special_char_ratio:.2%}",
                    "start": 0,
                    "end": 0,
                    "confidence": 0.7,
                    "replacement": "",
                    "category": "suspicious_pattern",
                }
            ]

        return []

    def _check_delimiter_injection(self, text: str) -> List[Dict]:
        """Check for delimiter-based injection attempts"""
        matches = []

        # Common delimiters used in prompts
        delimiter_patterns = [
            r"-{3,}",  # Three or more dashes
            r"={3,}",  # Three or more equals
            r"\*{3,}",  # Three or more asterisks
            r"#{3,}",  # Three or more hashes
        ]

        for pattern_str in delimiter_patterns:
            pattern = re.compile(pattern_str)
            delimiters = list(pattern.finditer(text))

            # If we find multiple delimiters, it might be an injection attempt
            if len(delimiters) >= 2:
                for match in delimiters:
                    matches.append(
                        {
                            "type": "PROMPT_INJECTION",
                            "text": match.group(),
                            "start": match.start(),
                            "end": match.end(),
                            "confidence": 0.6,
                            "replacement": "",
                            "category": "delimiter_injection",
                        }
                    )

        return matches


# Create global instance
try:
    prompt_injection_detector = PromptInjectionDetector()
except Exception as e:
    logger.error(f"Failed to create prompt injection detector instance: {e}")
    prompt_injection_detector = None
