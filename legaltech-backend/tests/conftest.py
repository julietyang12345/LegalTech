"""Keep the test suite offline and deterministic.

``app.core.config`` loads ``.env`` without overriding variables that are
already set, so pinning these before any app import stops a developer's local
AI settings from turning unit tests into live, non-deterministic model calls.
Tests that need model behaviour substitute a fake (see the CO-05 gold test).
"""

import os

os.environ["AI_EXTRACTION_ENABLED"] = "false"
os.environ["AI_RULE_DISCOVERY_ENABLED"] = "false"
os.environ["OPENAI_API_KEY"] = ""
