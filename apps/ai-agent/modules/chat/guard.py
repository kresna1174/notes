import random
import re

# ── Sensitive patterns ────────────────────────────────────────────────────────
# Patterns that indicate a user is trying to extract sensitive info,
# probe the tech stack/environment, or inject adversarial prompts.

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
    r"you\s+are\s+now\s+(?!mindspace|the\s+mindspace)",
    r"pretend\s+(you|to|that)",
    r"jailbreak", r"bypass", r"override\s+(your\s+)?instructions?",
    r"act\s+as\s+(if\s+you\s+are|a|an)\s+(?!notes|assistant|ai)",
    r"new\s+persona", r"roleplay\s+as",
    r"disregard\s+(your|all|previous)", r"abaikan\s+(instruksi|perintah)",
    r"lupakan\s+(semua|instruksi|aturan)", r"sekarang\s+kamu\s+adalah",
    r"mulai\s+sekarang\s+kamu", r"ganti\s+peran",
    r"sistem\s+baru", r"mode\s+baru", r"persona\s+baru",
    r"you\s+are\s+dan", r"kamu\s+adalah\s+(?!asisten|mindspace)",
    # Tech stack / infrastructure probing
    r"(apa|what|which|pakai|menggunakan|pake|using)\s+(framework|library|stack|teknologi|tech\s*stack)",
    r"(apa|what)\s+(bahasa\s+pemrograman|programming\s+language)\s+(yang\s+)?(digunakan|kamu|anda|you)",
    r"(pakai|pake|menggunakan|built\s+with|dibuat\s+dengan|using)\s+(react|next\.?js|fastapi|flask|django|node|express|laravel|rails|spring|vue|angular|svelte|remix|nuxt)",
    r"(apa|what)\s+(database|db)\s+(yang\s+)?(digunakan|kamu|anda|you)",
    r"(pakai|pake|menggunakan|using)\s+(postgres|postgresql|mysql|sqlite|mongodb|redis|supabase|firebase|chroma|pinecone|weaviate|milvus)",
    r"(apa|what)\s+(model|llm|ai\s+model)\s+(yang\s+)?(digunakan|kamu|anda|you|pakai)",
    r"(pakai|pake|using)\s+(gpt|gemini|claude|llama|mistral|openai|anthropic|openrouter|groq|together)",
    r"(apa|what).{0,20}(infrastruktur|infrastructure|server|hosting|cloud|deployment)",
    r"(pakai|pake|using|hosted\s+on)\s+(aws|gcp|azure|vercel|netlify|fly\.io|railway|render|heroku|digitalocean|vps)",
    r"(berapa|how\s+many)\s+(server|instance|pod|container|node)",
    r"(apa|what).{0,20}(arsitektur|architecture).{0,20}(kamu|anda|you|sistem|system|aplikasi)",
    r"(version|versi)\s+(python|node|npm|bun|deno|rust|go|java)",
    r"(apa|what).{0,20}(vector\s+(store|db|database)|embedding\s+model|embedding)",
    r"(model|ai).{0,10}(openrouter|openai|gemini|claude|gpt)",
    r"reveal\s+(your|the)\s+(system|prompt|instruction|tech|stack|model|infrastructure)",
    r"(tell|show|give)\s+me\s+(your\s+)?(system\s+prompt|instructions|config|configuration|tech\s+stack)",
    r"(apa|what).{0,15}(system\s+prompt|instruksi\s+sistem|prompt\s+sistem)",
    r"(tampilkan|tunjukkan|beritahu|ceritakan).{0,20}(instruksi|system\s+prompt|konfigurasi|config)",
    # RCE / shell command injection
    r"exec(ute)?\s+command", r"run\s+shell", r"terminal", r"bash",
    r"curl\s+", r"wget\s+", r"chmod\s+", r"rm\s+-",
]

# ── Reject-only patterns (harder block, no redirect) ─────────────────────────
# These are unambiguous adversarial attempts — return a firm rejection.
_HARD_REJECT_PATTERNS = [
    r"ignore\s+(previous|all|prior)\s+instructions?",
    r"forget\s+(everything|your|all)",
    r"jailbreak",
    r"disregard\s+(your|all|previous)",
    r"abaikan\s+(instruksi|perintah)",
    r"lupakan\s+(semua|instruksi|aturan)",
    r"override\s+(your\s+)?instructions?",
    r"reveal\s+(your|the)\s+(system|prompt|instruction)",
    r"(tell|show|give)\s+me\s+(your\s+)?system\s+prompt",
    r"(tampilkan|tunjukkan|beritahu).{0,20}(instruksi|system\s+prompt)",
]

_HARD_REJECT_RESPONSE = (
    "Maaf, saya tidak bisa membantu dengan permintaan tersebut. "
    "Silakan ajukan pertanyaan yang berkaitan dengan catatan, penulisan, atau riset."
)

# ── Soft deflection topics ────────────────────────────────────────────────────
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
    """
    Check message for sensitive, adversarial, or tech-probing patterns.

    Returns:
    - Hard rejection string for unambiguous injection/extraction attempts.
    - Soft deflection string for tech stack / environment questions.
    - None if the message is clean.
    """
    msg_lower = message.lower()

    # Hard reject first — firm, no redirect
    for pattern in _HARD_REJECT_PATTERNS:
        if re.search(pattern, msg_lower):
            return _HARD_REJECT_RESPONSE

    # Soft deflect — curious/probing but not necessarily adversarial
    for pattern in _SENSITIVE_PATTERNS:
        if re.search(pattern, msg_lower):
            topic = random.choice(_REDIRECT_TOPICS)
            return f"Saya tidak mengerti yang anda maksud. Tanyakan soal **{topic}** saja 😊"

    return None
