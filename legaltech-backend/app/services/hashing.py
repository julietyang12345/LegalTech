from hashlib import sha256


def sha256_bytes(content: bytes) -> str:
    return f"sha256:{sha256(content).hexdigest()}"


def stable_text_hash(text: str) -> str:
    normalized = " ".join(text.lower().split())
    return sha256_bytes(normalized.encode("utf-8"))
