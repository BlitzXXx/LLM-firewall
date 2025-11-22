"""
Dynamic Content Anonymization Module
Replaces PII with realistic substitutes (not just redaction)
Preserves context for LLM to provide useful responses
"""

import hashlib
import random
import string
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
import json

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

from ..config import config
from ..logger import get_logger

logger = get_logger(__name__)


@dataclass
class AnonymizationMapping:
    """Stores mapping between real and fake values"""
    original_value: str
    fake_value: str
    entity_type: str
    timestamp: float


class ContentAnonymizer:
    """
    Dynamic content anonymizer with entity linking and reversible mappings
    """

    # Fake email domains for anonymization
    FAKE_EMAIL_DOMAINS = [
        "example.com",
        "example.org",
        "example.net",
        "test.com",
        "demo.io",
    ]

    # Fake area codes for phone numbers (reserved ranges)
    FAKE_AREA_CODES = ["555", "510", "520", "530"]

    # Fake name prefixes for person entities
    FAKE_NAME_PREFIXES = ["Person", "User", "Individual", "Entity"]

    # Fake location prefixes
    FAKE_LOCATION_PREFIXES = ["Location", "Place", "City", "Area"]

    def __init__(self):
        """Initialize the anonymizer"""
        self.enabled = config.feature_anonymization
        self.use_redis = REDIS_AVAILABLE and hasattr(config, 'redis_enabled') and config.redis_enabled
        self.redis_client = None
        self.mapping_ttl = 3600  # 1 hour TTL for mappings
        self.local_cache: Dict[str, AnonymizationMapping] = {}

        if self.enabled and self.use_redis:
            self._initialize_redis()

        logger.info(
            f"Content Anonymizer initialized. "
            f"Enabled: {self.enabled}, Redis: {self.use_redis}"
        )

    def _initialize_redis(self):
        """Initialize Redis connection for mapping storage"""
        try:
            if not REDIS_AVAILABLE:
                logger.warning("Redis not available. Using local cache for anonymization mappings.")
                return

            # Connect to Redis
            self.redis_client = redis.Redis(
                host=getattr(config, 'redis_host', 'localhost'),
                port=getattr(config, 'redis_port', 6379),
                password=getattr(config, 'redis_password', None),
                db=getattr(config, 'redis_db', 0),
                decode_responses=True,
            )

            # Test connection
            self.redis_client.ping()
            logger.info("Redis connection established for anonymization mappings")

        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}. Using local cache.")
            self.redis_client = None
            self.use_redis = False

    def anonymize_entities(
        self,
        text: str,
        detected_entities: List[Dict],
        request_id: str
    ) -> Tuple[str, Dict[str, str]]:
        """
        Anonymize entities with realistic substitutes

        Args:
            text: Original text
            detected_entities: List of detected PII entities
            request_id: Request ID for mapping context

        Returns:
            Tuple of (anonymized_text, mapping_dict)
        """
        if not self.enabled or not detected_entities:
            return text, {}

        anonymized_text = text
        mappings = {}

        # Sort entities by position (reverse order to preserve indices)
        sorted_entities = sorted(
            detected_entities,
            key=lambda x: x["start"],
            reverse=True
        )

        for entity in sorted_entities:
            original_value = entity["text"]
            entity_type = entity["type"]
            start = entity["start"]
            end = entity["end"]

            # Generate or retrieve fake value
            fake_value = self._get_fake_value(
                original_value,
                entity_type,
                request_id
            )

            # Replace in text
            anonymized_text = (
                anonymized_text[:start] +
                fake_value +
                anonymized_text[end:]
            )

            # Store mapping
            mappings[original_value] = fake_value

            # Store in cache/Redis for de-anonymization
            self._store_mapping(
                request_id,
                original_value,
                fake_value,
                entity_type
            )

        logger.info(
            f"Anonymized {len(detected_entities)} entities in request {request_id}"
        )

        return anonymized_text, mappings

    def _get_fake_value(
        self,
        original_value: str,
        entity_type: str,
        request_id: str
    ) -> str:
        """
        Generate realistic fake value for entity

        Args:
            original_value: Original entity value
            entity_type: Type of entity (EMAIL, PHONE, etc.)
            request_id: Request ID for entity linking

        Returns:
            Fake value that preserves format
        """
        # Check if we already have a fake value for this entity in this request
        cache_key = f"anon:{request_id}:{original_value}"
        cached = self._get_cached_mapping(cache_key)
        if cached:
            return cached

        # Generate new fake value based on entity type
        if entity_type in ["EMAIL", "PHONE_NUMBER", "PHONE"]:
            fake_value = self._generate_fake_email(original_value)
        elif entity_type == "PHONE":
            fake_value = self._generate_fake_phone(original_value)
        elif entity_type == "PERSON":
            fake_value = self._generate_fake_person_name(original_value)
        elif entity_type == "LOCATION":
            fake_value = self._generate_fake_location(original_value)
        elif entity_type in ["CREDIT_CARD", "SSN"]:
            fake_value = self._generate_fake_number(original_value, entity_type)
        elif entity_type == "IP_ADDRESS":
            fake_value = self._generate_fake_ip()
        elif entity_type == "API_KEY":
            fake_value = f"<{entity_type}_REDACTED>"
        else:
            fake_value = f"<{entity_type}_ANONYMIZED>"

        return fake_value

    def _generate_fake_email(self, original: str) -> str:
        """Generate fake email preserving format"""
        # Create deterministic hash for consistency
        hash_suffix = hashlib.md5(original.encode()).hexdigest()[:6]
        domain = random.choice(self.FAKE_EMAIL_DOMAINS)
        return f"user_{hash_suffix}@{domain}"

    def _generate_fake_phone(self, original: str) -> str:
        """Generate fake phone number in reserved range"""
        # Preserve format (dashes, parentheses, etc.)
        area_code = random.choice(self.FAKE_AREA_CODES)
        suffix = ''.join(random.choices(string.digits, k=7))

        # Try to match original format
        if '(' in original and ')' in original:
            return f"({area_code}) {suffix[:3]}-{suffix[3:]}"
        elif '-' in original:
            return f"{area_code}-{suffix[:3]}-{suffix[3:]}"
        else:
            return f"{area_code}{suffix}"

    def _generate_fake_person_name(self, original: str) -> str:
        """Generate fake person name"""
        # Create deterministic identifier
        hash_suffix = hashlib.md5(original.encode()).hexdigest()[:4].upper()
        prefix = random.choice(self.FAKE_NAME_PREFIXES)
        return f"{prefix} {hash_suffix}"

    def _generate_fake_location(self, original: str) -> str:
        """Generate fake location"""
        hash_suffix = hashlib.md5(original.encode()).hexdigest()[:4].upper()
        prefix = random.choice(self.FAKE_LOCATION_PREFIXES)
        return f"{prefix} {hash_suffix}"

    def _generate_fake_number(self, original: str, entity_type: str) -> str:
        """Generate fake credit card or SSN"""
        # For sensitive numbers, use redaction not fake values
        return f"<{entity_type}_REDACTED>"

    def _generate_fake_ip(self) -> str:
        """Generate fake IP in reserved range (192.0.2.0/24)"""
        return f"192.0.2.{random.randint(1, 254)}"

    def _store_mapping(
        self,
        request_id: str,
        original: str,
        fake: str,
        entity_type: str
    ):
        """Store anonymization mapping for de-anonymization"""
        mapping = AnonymizationMapping(
            original_value=original,
            fake_value=fake,
            entity_type=entity_type,
            timestamp=0  # Would use time.time() in production
        )

        cache_key = f"anon:{request_id}:{original}"

        if self.use_redis and self.redis_client:
            try:
                # Store as JSON with TTL
                mapping_json = json.dumps({
                    "original": original,
                    "fake": fake,
                    "type": entity_type
                })
                self.redis_client.setex(
                    cache_key,
                    self.mapping_ttl,
                    mapping_json
                )
            except Exception as e:
                logger.error(f"Failed to store mapping in Redis: {e}")
                # Fallback to local cache
                self.local_cache[cache_key] = mapping
        else:
            # Use local cache
            self.local_cache[cache_key] = mapping

    def _get_cached_mapping(self, cache_key: str) -> Optional[str]:
        """Retrieve cached fake value"""
        if self.use_redis and self.redis_client:
            try:
                mapping_json = self.redis_client.get(cache_key)
                if mapping_json:
                    mapping_dict = json.loads(mapping_json)
                    return mapping_dict["fake"]
            except Exception as e:
                logger.error(f"Failed to retrieve mapping from Redis: {e}")

        # Check local cache
        mapping = self.local_cache.get(cache_key)
        return mapping.fake_value if mapping else None

    def de_anonymize(
        self,
        anonymized_text: str,
        request_id: str
    ) -> Tuple[str, bool]:
        """
        De-anonymize text (requires authorization)

        Args:
            anonymized_text: Anonymized text
            request_id: Request ID to retrieve mappings

        Returns:
            Tuple of (original_text, success)
        """
        if not self.enabled:
            return anonymized_text, False

        # This would require retrieving all mappings for request_id
        # and reversing them - implementation left for production
        logger.warning("De-anonymization not yet implemented")
        return anonymized_text, False


# Create global instance
try:
    content_anonymizer = ContentAnonymizer()
except Exception as e:
    logger.error(f"Failed to create content anonymizer instance: {e}")
    content_anonymizer = None
