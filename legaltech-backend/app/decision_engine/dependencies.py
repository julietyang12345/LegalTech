from pathlib import Path
import json


RULE_PATH = Path(__file__).parent / "rules" / "construction_extras_v1.json"


def load_rule_set() -> dict:
    return json.loads(RULE_PATH.read_text())


def determine_affected_nodes(signal_types: list[str]) -> list[str]:
    rules = load_rule_set()
    affected: list[str] = []
    for node in rules["nodes"]:
        if any(signal_type in node["depends_on"] for signal_type in signal_types):
            affected.append(node["node_id"])
    return affected
