"""
PII Detection Module
Uses Microsoft Presidio for PII detection and anonymization
"""

import re
from typing import List, Dict, Tuple
from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer, RecognizerResult
from presidio_analyzer.nlp_engine import NlpEngineProvider
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig

from ..config import config
from ..logger import get_logger

logger = get_logger(__name__)


class APIKeyRecognizer(PatternRecognizer):
    """
    Custom recognizer for API keys from various providers
    """

    def __init__(self):
        patterns = [
            Pattern(
                name="openai_api_key",
                regex=r"\bsk-[a-zA-Z0-9]{48}\b",
                score=0.9,
            ),
            Pattern(
                name="anthropic_api_key",
                regex=r"\bsk-ant-[a-zA-Z0-9\-]{95,115}\b",
                score=0.9,
            ),
            Pattern(
                name="generic_api_key",
                regex=r"\b[Aa][Pp][Ii][-_]?[Kk][Ee][Yy]\s*[:=]\s*['\"]?([a-zA-Z0-9_\-]{32,})['\"]?\b",
                score=0.7,
            ),
            Pattern(
                name="bearer_token",
                regex=r"\b[Bb]earer\s+[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\b",
                score=0.8,
            ),
            Pattern(
                name="aws_access_key",
                regex=r"\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b",
                score=0.9,
            ),
        ]

        super().__init__(
            supported_entity="API_KEY",
            patterns=patterns,
            name="API Key Recognizer",
            supported_language="en",
        )


class PIIDetector:
    """
    PII Detection and Anonymization using Presidio
    """

    def __init__(self):
        """Initialize Presidio engines"""
        try:
            # Create NLP engine provider configuration
            # Try to use spaCy if available, otherwise fall back to pattern-based detection
            try:
                nlp_configuration = {
                    "nlp_engine_name": "spacy",
                    "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
                }
                provider = NlpEngineProvider(nlp_configuration=nlp_configuration)
                nlp_engine = provider.create_engine()
                logger.info("Initialized Presidio with spaCy NLP engine")
            except Exception as spacy_error:
                # Fall back to pattern-based detection only
                logger.warning(
                    f"Could not load spaCy model: {spacy_error}. "
                    "Using pattern-based detection only."
                )
                nlp_configuration = {
                    "nlp_engine_name": "spacy",
                    "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
                }
                provider = NlpEngineProvider(nlp_configuration=nlp_configuration)
                # Use pattern recognizers only
                nlp_engine = None

            # Initialize analyzer engine
            if nlp_engine:
                self.analyzer = AnalyzerEngine(nlp_engine=nlp_engine)
            else:
                self.analyzer = AnalyzerEngine()

            # Add custom recognizers
            self.api_key_recognizer = APIKeyRecognizer()
            self.analyzer.registry.add_recognizer(self.api_key_recognizer)

            # Initialize anonymizer engine
            self.anonymizer = AnonymizerEngine()

            # Configure which entities to detect
            self.entities = config.pii_entities
            self.confidence_threshold = config.pii_confidence_threshold

            logger.info(
                f"PII Detector initialized. Entities: {self.entities}, "
                f"Threshold: {self.confidence_threshold}"
            )

        except Exception as e:
            logger.error(f"Failed to initialize PII Detector: {e}", exc_info=True)
            raise

    def detect(
        self, text: str, language: str = "en"
    ) -> Tuple[List[Dict], str, float]:
        """
        Detect PII in text

        Args:
            text: Text to analyze
            language: Language code (default: "en")

        Returns:
            Tuple of (detected_issues, redacted_text, confidence_score)
        """
        try:
            # Analyze text for PII
            results = self.analyzer.analyze(
                text=text,
                language=language,
                entities=self.entities,
                score_threshold=self.confidence_threshold,
            )

            # Convert results to our format
            detected_issues = []
            for result in results:
                issue = {
                    "type": result.entity_type,
                    "text": text[result.start : result.end],
                    "start": result.start,
                    "end": result.end,
                    "confidence": result.score,
                    "replacement": self._get_replacement_text(result.entity_type),
                }
                detected_issues.append(issue)

            # Anonymize text
            if detected_issues:
                anonymized_result = self.anonymizer.anonymize(
                    text=text,
                    analyzer_results=results,
                    operators={
                        entity: OperatorConfig("replace", {"new_value": f"<{entity}_REDACTED>"})
                        for entity in set([r.entity_type for r in results])
                    },
                )
                redacted_text = anonymized_result.text

                # Calculate overall confidence score
                if detected_issues:
                    avg_confidence = sum(
                        issue["confidence"] for issue in detected_issues
                    ) / len(detected_issues)
                else:
                    avg_confidence = 1.0
            else:
                redacted_text = text
                avg_confidence = 1.0

            logger.debug(
                f"PII detection complete. Found {len(detected_issues)} issues. "
                f"Average confidence: {avg_confidence:.2f}"
            )

            return detected_issues, redacted_text, avg_confidence

        except Exception as e:
            logger.error(f"Error during PII detection: {e}", exc_info=True)
            # Return original text on error
            return [], text, 0.0

    def _get_replacement_text(self, entity_type: str) -> str:
        """Get replacement text for a given entity type"""
        return f"<{entity_type}_REDACTED>"

    def get_supported_entities(self) -> List[str]:
        """Get list of supported entity types"""
        return self.entities


# Create global instance
try:
    pii_detector = PIIDetector()
except Exception as e:
    logger.error(f"Failed to create PII detector instance: {e}")
    pii_detector = None
