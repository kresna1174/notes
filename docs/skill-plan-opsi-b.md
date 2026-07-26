# Rencana Implementasi — Opsi B (Progressive Disclosure: katalog + `load_skill`)

Referensi keputusan: lihat [`docs/skill-imp.md`](./skill-imp.md).
Target: agent memakai skill dari tabel `ai_skills` dengan pola *progressive
disclosure* — hanya `name + description` yang selalu ada di prompt (katalog
ringan); isi lengkap (`content`) dimuat on-demand lewat tool `load_skill`.

## Prinsip desain (dua level disclosure)

```
Level 1 — Katalog (selalu di prompt, murah):
  ## AVAILABLE SKILLS — panggil load_skill(name) untuk memuat instruksi lengkap
  - financial-analysis: Analisis laporan keuangan, rasio, proyeksi arus kas
  - sop-writer: Menyusun SOP standar perusahaan dengan format baku

Level 2 — Konten (on-demand, saat dipilih agent):
  agent -> load_skill("sop-writer") -> content lengkap masuk ke context turn ini
```

Alur data (semua di dalam `apps/ai-agent`, DB dibagi bersama web app):

```
chat_stream (api.py)
  └─ _build_agent_with_memory()
       ├─ get_skills_catalog()      # SELECT name,description WHERE enabled  (cache 60s)
       ├─ format_skills_catalog()   # -> blok "## AVAILABLE SKILLS"
       └─ final_instructions = katalog + memory_block + fresh_instructions
  └─ Runner.run_streamed(parent_agent, ...)
       └─ agent memanggil tool load_skill(name)
            └─ get_skill_content(name)  # SELECT content WHERE name AND enabled
```

Titik integrasi kunci (semuanya sudah ada, tinggal ditumpangi):
- `modules/chat/api.py :: _build_agent_with_memory()` — sudah menempel `memory_block`.
- `modules/chat/tools.py` — pola `@function_tool` + `RunContextWrapper[dict]`.
- `modules/chat/agent_defs.py :: parent_agent.tools` — daftar tool.
- `core/langfuse_client.py` — pola cache TTL 60s yang akan ditiru.
- `core/models.py` / `modules/memory/methods.py` — pola model + akses DB.

---

## Fase 0 — Prasyarat data (web app)

Tabel `ai_skills` sudah ada, tapi `name` **belum unik**. `load_skill` mencari
berdasarkan `name`, jadi duplikat nama bikin ambigu.

**Aksi:** tambah kolom `slug` unik (disarankan) **atau** unique constraint pada
`name`. Rekomendasi: `slug` — stabil, ramah-URL, tidak berubah saat admin
mengedit judul.

- `apps/web/drizzle/schema.ts` — tambah `slug: text('slug').notNull().unique()`.
- `apps/web/src/modules/server/api.ts` — generate slug saat `POST/PUT /api/admin/skills`
  (mis. slugify `name`, tolak jika bentrok).
- Backfill slug untuk baris lama (skrip migrasi singkat).

> Jika ingin menunda Fase 0: `load_skill` bisa sementara match `name`
> case-insensitive dan mengambil baris `enabled` pertama. Katalog tetap pakai
> `name`. Tandai sebagai utang teknis.

Untuk sisa rencana, "identifier skill" = `slug` (fallback: `name`).

---

## Fase 1 — Lapisan akses data (Python, read-only)

Buat `modules/skills/` meniru `modules/memory/`.

### 1a. Model — `core/models.py`

Map read-only ke tabel yang dibuat web app (jangan buat ulang tabelnya):

```python
class AiSkill(Base):
    __tablename__ = "ai_skills"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, nullable=True)         # setelah Fase 0
    description: Mapped[str] = mapped_column(Text, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
```

> Agent **tidak** menjalankan `CREATE TABLE` untuk `ai_skills` — pemilik skema
> adalah Drizzle di web app. Model ini murni untuk membaca.

### 1b. Methods — `modules/skills/methods.py`

```python
# cache in-process, pola meniru core/langfuse_client.py
_catalog_cache: tuple[list[dict], float] | None = None
_CATALOG_TTL = 60.0

async def get_skills_catalog() -> list[dict]:
    """[{slug,name,description}] untuk skill enabled. Cache 60s. Fail-open -> []."""

async def get_skill_content(identifier: str) -> str | None:
    """content dari 1 skill enabled berdasarkan slug (fallback name, case-insensitive)."""

def format_skills_catalog(catalog: list[dict]) -> str:
    """-> blok '## AVAILABLE SKILLS ...' atau '' jika kosong."""
```

Akses DB pakai `AsyncSessionLocal`/`engine` dari `core.database` (persis
`get_all_memories`). Semua fungsi **fail-open**: error DB → katalog kosong,
chat tetap jalan (sama seperti memory yang di-`try/except` di `_build_agent...`).

---

## Fase 2 — Injeksi katalog ke prompt

Di `modules/chat/api.py :: _build_agent_with_memory()`, sisipkan katalog di depan
instruksi — sejajar dengan `memory_block` yang sudah ada:

```python
# setelah fresh_instructions & memory_block dibangun
skills_block = ""
try:
    catalog = await get_skills_catalog()
    skills_block = format_skills_catalog(catalog)
except Exception as e:
    logger.warning(f"Failed to load skills catalog: {e}")

parts = [p for p in (skills_block, memory_block, fresh_instructions) if p]
final_instructions = "\n\n".join(parts)
```

Sisa fungsi tak berubah: cek `if final_instructions == base_agent.instructions:
return base_agent`, selain itu clone `Agent(...)`. Karena katalog hanya
disuntik ke agent yang di-*resolve* (default `parent_agent`), skill hanya aktif
di orchestrator utama — sesuai kebutuhan.

---

## Fase 3 — Tool `load_skill`

Di `modules/chat/tools.py` (pola `@function_tool` async + `tool_error`):

```python
@function_tool
async def load_skill(name: str) -> str:
    """Muat instruksi lengkap sebuah skill dari katalog "AVAILABLE SKILLS".
    Panggil ini SETELAH melihat skill relevan di katalog, SEBELUM mengerjakan tugas.

    Args:
        name: slug/nama skill persis seperti tertera di katalog.
    """
    from modules.skills.methods import get_skill_content
    content = await get_skill_content(name)
    if not content:
        return tool_error("skill_not_found", f"Skill '{name}' tidak ditemukan / nonaktif.")
    return content
```

Catatan: karena ini `@function_tool`, event `tool-input-available` /
`tool-output-available` di `chat_event_generator` otomatis mengirim ke UI —
user melihat "skill X dimuat" tanpa kerja tambahan.

---

## Fase 4 — Registrasi tool + panduan prompt

### 4a. Daftarkan tool — `modules/chat/agent_defs.py`

- Import `load_skill` dari `modules.chat.tools`.
- Tambahkan ke `parent_agent.tools` (orchestrator yang membaca katalog).
- Opsional: tambahkan juga ke sub-agent yang relevan (`writer_agent`,
  `researcher_agent`) bila skill sering dipakai saat menulis. Mulai dari parent
  saja agar sederhana.

### 4b. Panduan singkat di prompt — `core/prompt.py`

Tambah 2–3 kalimat di `MAIN_ASSISTANT_PROMPT` (via `_PARENT_TOOL_CONTEXT`) agar
agent disiplin memakai katalog:

```
### Skills
Jika daftar "AVAILABLE SKILLS" muncul di atas dan salah satu relevan dengan
permintaan user, panggil load_skill(name) untuk memuat instruksinya SEBELUM
mengerjakan tugas, lalu ikuti instruksi skill tersebut. Jika tak ada yang
relevan, abaikan.
```

> Karena prompt di-*refresh* dari Langfuse (`get_prompt`), teks final juga bisa
> diubah lewat dashboard tanpa redeploy. Pastikan fallback string di
> `core/prompt.py` sudah memuat panduan ini.

---

## Fase 5 — Cache & invalidasi

- Katalog & konten skill: cache TTL 60s (pola `core/langfuse_client.py`).
  Perubahan admin efektif ≤60 detik tanpa restart.
- Sediakan `invalidate_skills_cache()` untuk dipakai bila nanti web app kirim
  sinyal (opsional). Untuk v1, TTL sudah cukup.

---

## Fase 6 — Edge cases & keamanan

- **Katalog kosong / semua nonaktif** → `format_skills_catalog` kembalikan `""`;
  tak ada blok yang disuntik; tool `load_skill` tetap ada tapi mengembalikan
  `skill_not_found`. Aman.
- **Nama duplikat** (sebelum Fase 0) → ambil baris enabled pertama; dokumentasikan
  sebagai utang teknis sampai `slug` unik ada.
- **Skill dinonaktifkan saat sesi berjalan** → `get_skill_content` memfilter
  `enabled`, jadi `load_skill` menolak skill yang baru dimatikan (maks. lag TTL).
- **Konten skill besar** → batasi panjang yang di-*return* `load_skill` (mis.
  potong di ~6–8k karakter) agar tidak meledakkan context; dokumentasikan batas
  di UI editor skill.
- **Prompt injection via konten skill** → skill hanya bisa dibuat admin
  (`adminMiddleware`), jadi permukaan risiko kecil. Tetap perlakukan `content`
  sebagai instruksi tepercaya tingkat-admin, bukan input user.
- **Fail-open** di semua titik: kegagalan skill tidak boleh menggagalkan chat.

---

## Daftar perubahan file

| File | Perubahan |
|---|---|
| `apps/web/drizzle/schema.ts` | (Fase 0) tambah kolom `slug` unik pada `ai_skills` |
| `apps/web/src/modules/server/api.ts` | (Fase 0) generate/validasi `slug` di POST/PUT skills |
| `apps/ai-agent/core/models.py` | tambah model read-only `AiSkill` |
| `apps/ai-agent/modules/skills/__init__.py` | modul baru |
| `apps/ai-agent/modules/skills/methods.py` | `get_skills_catalog`, `get_skill_content`, `format_skills_catalog`, cache |
| `apps/ai-agent/modules/chat/tools.py` | tool baru `load_skill` |
| `apps/ai-agent/modules/chat/agent_defs.py` | import + daftarkan `load_skill` di `parent_agent.tools` |
| `apps/ai-agent/modules/chat/api.py` | suntik katalog di `_build_agent_with_memory` |
| `apps/ai-agent/core/prompt.py` | panduan singkat "Skills" di `_PARENT_TOOL_CONTEXT` |
| `apps/ai-agent/tests/test_skills_methods.py` | unit test (lihat bawah) |

---

## Rencana pengujian

**Unit (`tests/`, pola `test_notes_index_methods.py`):**
- `get_skills_catalog` mengembalikan hanya skill `enabled`, hormati TTL.
- `get_skill_content` cocok via slug & fallback name case-insensitive; `None`
  untuk nonaktif/tidak ada.
- `format_skills_catalog([])` → `""`.

**Integrasi manual:**
1. Admin buat skill "sop-writer" (enabled) di UI web.
2. Kirim chat "buatkan SOP onboarding" → verifikasi di log/stream event bahwa
   `load_skill` terpanggil dan output mengikuti instruksi skill.
3. Nonaktifkan skill → chat berikutnya tidak lagi memuatnya (≤60s).
4. Matikan/putus DB skill → chat tetap jalan (fail-open), tanpa katalog.

**Regresi:** pastikan jalur memory & prompt Langfuse tetap berfungsi (uji chat
dengan user yang punya `user_memory`).

---

## Urutan eksekusi (increment aman)

1. Fase 1 (methods + model) + unit test — belum mengubah perilaku chat.
2. Fase 3 (tool) + Fase 4a (registrasi) — tool ada tapi tak dipromosikan.
3. Fase 2 (injeksi katalog) + Fase 4b (panduan prompt) — fitur aktif.
4. Fase 0 (slug unik) — bisa paralel; sampai selesai pakai fallback name.
5. Fase 5–6 (cache polish + edge cases) menyertai tiap fase.

Tiap langkah bisa di-*merge* independen; fitur baru benar-benar "hidup" di
langkah 3.

---

## Peningkatan lanjutan (di luar v1)

- **Skill per-user / per-organisasi**: tambah kolom kepemilikan di `ai_skills`,
  filter katalog berdasarkan `ctx.context["user_id"]`.
- **Routing semantik hibrida (Opsi C)**: pilih otomatis skill paling relevan via
  embedding `description` untuk mengurangi 1 round-trip pada kasus jelas, tetap
  simpan `load_skill` untuk kasus multi-skill.
- **Analitik pemakaian**: catat pemanggilan `load_skill` (skill mana, berapa
  sering) untuk kurasi katalog oleh admin.
