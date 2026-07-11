import random
import re

# Suspicious patterns that indicate a user is trying to extract
# sensitive files, credentials, env vars, or server internals.
_SENSITIVE_PATTERNS = [
    # .env / environment variables
    r"\.env", r"env\s+file", r"environment\s+variable", r"environtment",
    r"api[_\s]?key", r"secret[_\s]?key", r"private[_\s]?key", r"access[_\s]?token",
    r"bearer[_\s]?token", r"auth[_\s]?token", r"jwt[_\s]?secret",
    # Credentials / passwords
    r"password", r"passwd", r"credentials", r"database[_\s]?url",
    r"db[_\s]?pass", r"db[_\s]?password", r"connection[_\s]?string",
    # System / config files
    r"sessions?\.db", r"config\.json", r"/etc/passwd", r"/etc/shadow",
    r"id_rsa", r"\.ssh", r"authorized_keys", r"known_hosts",
    r"docker-compose", r"dockerfile",
    # Source code fishing
    r"source\s+code", r"show\s+me\s+your\s+code", r"baca\s+file",
    r"tampilkan\s+file", r"isi\s+file", r"lihat\s+file",
    r"buka\s+file", r"akses\s+file", r"read\s+file",
    r"cat\s+\.", r"ls\s+-", r"dir\s+/",
    # Prompt injection attempts
    r"ignore\s+(previous|all|prior)\s+instructions?",
    r"forget\s+(everything|your|all)",
    r"you\s+are\s+now", r"pretend\s+(you|to|that)",
    r"jailbreak", r"bypass", r"override\s+(your\s+)?instructions?",
    r"act\s+as\s+(if\s+you\s+are|a|an)\s+(?!notes|assistant|ai)",
    r"new\s+persona", r"roleplay\s+as",
    # RCE / shell command injection
    r"exec(ute)?\s+command", r"run\s+shell", r"terminal", r"bash",
    r"curl\s+", r"wget\s+", r"chmod\s+", r"rm\s+-",
]

# Random redirect topics shown inside the deflection message
_REDIRECT_TOPICS = [
    "cara membuat ringkasan catatan yang efektif",
    "perbedaan arsitektur monolith dan microservices",
    "tips produktivitas saat mencatat ide",
    "cara mengorganisasi catatan proyek",
    "teknik Zettelkasten untuk manajemen pengetahuan",
    "cara menulis dokumentasi teknis yang baik",
    "strategi belajar dengan spaced repetition",
    "cara membuat outline artikel yang menarik",
    "perbedaan antara SQL dan NoSQL database",
    "tips debugging kode Python yang efisien",
]


def check_input_guardrail(message: str) -> str | None:
    """Return a deflection message string if message contains sensitive patterns, else None."""
    msg_lower = message.lower()
    for pattern in _SENSITIVE_PATTERNS:
        if re.search(pattern, msg_lower):
            topic = random.choice(_REDIRECT_TOPICS)
            return f"Saya tidak mengerti yang anda maksud. Tanyakan soal **{topic}** saja 😊"
    return None
