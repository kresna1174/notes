# Penggunaan AI Skill dari Database — Opsi Implementasi

> Status saat ini: tabel `ai_skills` sudah ada (`apps/web/drizzle/schema.ts`) dengan
> kolom `name`, `description`, `content` (markdown), `enabled`. Admin sudah bisa
> CRUD lewat `/api/admin/skills`. **Yang belum ada: agent belum benar-benar memakai
> skill ini.** Komentar di schema pun menyebut *"used later for AI routing"* —
> dokumen ini membahas cara mengaktifkannya.

## Konteks arsitektur yang relevan

Tiga fakta ini menentukan pilihan implementasi:

1. **DB dibagi bersama.** `apps/ai-agent/core/database.py` default ke Postgres
   `notesdb` yang sama dengan web app. Jadi agent Python bisa membaca tabel
   `ai_skills` **langsung via SQLAlchemy**, sama seperti ia sudah membaca `notes`
   dan `user_memory`. Tidak perlu HTTP call balik ke web app.
2. **Sudah ada preseden injeksi instruksi dinamis per-request.**
   `_build_agent_with_memory()` di `modules/chat/api.py` meng-clone agent tiap
   request lalu menempelkan `memory_block` ke depan `instructions`. Memory bahkan
   di-filter berdasarkan relevansi semantik (`_filter_relevant_memories`, cosine
   similarity, top-k). Mekanisme skill bisa dibangun **persis** di jalur ini.
3. **Sudah ada semantic router.** `detect_intent_semantic()` di `agent_defs.py`
   meng-embed deskripsi tiap agent dan me-route dengan cosine similarity. Infra
   embedding (`generate_embeddings`, `generate_query_embedding`) siap dipakai ulang
   untuk memilih skill.

Konsekuensi: apa pun opsinya, **titik integrasi utamanya adalah
`_build_agent_with_memory`** (atau sebuah helper `_load_relevant_skills` yang
dipanggil di sebelahnya), plus satu helper baru untuk baca tabel `ai_skills`
(mirip `get_all_memories`, dengan cache TTL seperti prompt Langfuse).

---

## Opsi A — Eager prompt injection (tempel semua skill aktif ke system prompt)

Ambil semua skill `enabled = true`, gabungkan `content`-nya jadi satu blok
`## ACTIVE SKILLS`, lalu prepend ke `instructions` — identik dengan cara
`memory_block` bekerja sekarang.

```python
# modules/skills/methods.py  (baru)
async def get_enabled_skills() -> list[Skill]: ...          # SELECT ... WHERE enabled
def format_skills_for_prompt(skills) -> str: ...            # -> "## ACTIVE SKILLS\n..."

# modules/chat/api.py, di dalam _build_agent_with_memory()
skills_block = format_skills_for_prompt(await get_enabled_skills())
final_instructions = f"{skills_block}\n\n{memory_block}\n\n{fresh_instructions}"
```

**Kelebihan**
- Paling sederhana & cepat dikirim. ~30 baris, tidak ada tool/embedding baru.
- Deterministik: skill selalu aktif, tidak bergantung tebakan router. Bagus untuk
  aturan gaya/kebijakan yang **harus selalu** berlaku (mis. "selalu jawab formal").
- Reuse penuh pola `memory_block` yang sudah terbukti jalan.

**Kekurangan**
- **Boros token & tidak scalable.** Semua skill masuk tiap request walau tak
  relevan. 20 skill × beberapa ratus kata = ribuan token per pesan, dibayar terus.
- Skill panjang bisa menabrak/menutupi instruksi inti dan menaikkan risiko agent
  "lupa" fokus (context dilution).
- Tidak ada penargetan: skill "analisis keuangan" tetap ikut saat user cuma minta
  terjemahan.

**Cocok untuk:** jumlah skill sedikit (≲5) dan/atau skill yang memang bersifat
kebijakan global. Bisa jadi *langkah 1* sebelum pindah ke Opsi B.

---

## Opsi B — Progressive disclosure: indeks skill + tool `load_skill` (rekomendasi)

Ini pola **Agent Skills** ala Anthropic. Yang diinjeksi ke prompt hanya
*indeks ringan* — daftar `name + description` semua skill aktif. Isi lengkap
(`content`) baru dimuat saat agent memutuskan butuh, lewat sebuah tool.

```python
# Prompt hanya berisi katalog:
## AVAILABLE SKILLS (panggil load_skill(name) untuk memuat instruksi lengkap)
- financial-analysis: Analisis laporan keuangan, rasio, proyeksi arus kas
- sop-writer: Menyusun SOP standar perusahaan dengan format baku
- ...

# Tool baru di modules/chat/tools.py
@function_tool
async def load_skill(name: str) -> str:
    """Muat instruksi lengkap sebuah skill dari katalog di atas."""
    return (await get_skill_by_name(name)).content
```

Agent membaca deskripsi (murah), memilih yang relevan, memanggil `load_skill`,
lalu isi skill masuk ke context turn itu saja.

**Kelebihan**
- **Hemat token & scalable ke puluhan/ratusan skill.** Yang selalu dibayar hanya
  satu baris per skill (nama+deskripsi); `content` hanya saat dipakai.
- Penargetan ditentukan model dari deskripsi — lebih akurat daripada keyword.
- Cocok dengan arsitektur tool-calling yang sudah dominan di sini; event
  `tool-input-available`/`tool-output-available` sudah otomatis muncul di UI,
  jadi user pun melihat "skill X dimuat".
- `description` di schema akhirnya terpakai persis sesuai maksud aslinya.

**Kekurangan**
- Satu *round-trip* ekstra ke LLM saat skill dimuat → sedikit menambah latensi.
- Bergantung pada kualitas `description`; deskripsi buruk = skill tak pernah dipilih.
  Perlu sedikit prompt-guidance agar agent rajin mengecek katalog.
- Sedikit lebih banyak kode: helper DB + tool + baris katalog di prompt-builder.

**Cocok untuk:** target akhir yang sehat begitu skill bertambah banyak. Inilah
rekomendasi utama.

---

## Opsi C — Semantic routing: pilih 1 skill paling relevan via embedding

Reuse infra router yang sudah ada. Embed `description` tiap skill sekali (cache),
lalu untuk tiap pesan hitung cosine similarity dan inject **hanya** skill teratas
yang lewat threshold ke dalam prompt (mirip `_filter_relevant_memories`, tapi untuk
skill). Tidak butuh tool baru maupun round-trip ekstra.

```python
# Reuse pola detect_intent_semantic()
best = argmax cosine(embed(message), embed(skill.description))
if score >= THRESHOLD:
    inject skills_by_name[best].content
```

**Kelebihan**
- Token efisien seperti Opsi B (hanya skill terpilih yang masuk), **tanpa** latensi
  round-trip tool — pemilihan terjadi sebelum LLM dipanggil.
- Reuse langsung `generate_query_embedding` + pola cosine yang sudah ada di
  `agent_defs.py` dan `api.py`.

**Kekurangan**
- **Rapuh untuk multi-skill.** Hanya memilih 1 (atau top-k tetap); kalau satu
  request butuh 2 skill sekaligus, mudah meleset.
- Perlu kelola cache embedding + invalidasi saat skill diedit/ditambah admin
  (embedding harus di-refresh). Menambah state.
- Threshold perlu dituning; salah tuning → skill relevan terlewat atau skill salah
  terinjeksi diam-diam (tanpa jejak di UI, beda dengan tool di Opsi B).
- Keputusan tak transparan ke user (tidak ada event tool yang terlihat).

**Cocok untuk:** ingin efisiensi token tanpa biaya latensi tool, jumlah skill
menengah, dan mayoritas request cukup dilayani satu skill.

---

## Perbandingan singkat

| Kriteria | A · Eager inject | B · load_skill tool | C · Semantic routing |
|---|---|---|---|
| Biaya token/request | Tinggi (semua skill) | Rendah (katalog saja) | Rendah (1 skill) |
| Skalabilitas jumlah skill | Buruk | **Sangat baik** | Sedang |
| Akurasi pemilihan | — (semua aktif) | **Baik** (model+desc) | Sedang (cosine) |
| Multi-skill per request | Ya (semua) | **Ya** | Sulit |
| Latensi tambahan | Tidak ada | +1 round-trip | Tidak ada |
| Transparansi di UI | Tidak | **Ya** (event tool) | Tidak |
| Kompleksitas kode | Terendah | Sedang | Sedang (+cache) |
| Reuse infra existing | `memory_block` | tools + prompt | router embedding |

## Rekomendasi

- **Mulai dari Opsi A** kalau ingin cepat kelihatan hasilnya dan skill masih sedikit
  — bisa dikirim hari ini dengan menempel di `_build_agent_with_memory`.
- **Menuju Opsi B** sebagai desain target. Progressive disclosure paling sesuai
  dengan tabel yang sudah punya `description`, paling hemat token saat skill
  bertambah, dan paling transparan ke user lewat event tool yang sudah ada.
- **Opsi A + C** bisa dikombinasikan (skill global selalu di-inject, skill spesifik
  dipilih via embedding) bila ingin menghindari round-trip tool, dengan konsekuensi
  harus mengelola cache embedding.

## Catatan implementasi lintas-opsi

- **Akses data:** buat `modules/skills/methods.py` (mirip `modules/memory/methods.py`)
  yang `SELECT ... FROM ai_skills WHERE enabled = true` lewat `engine` yang sudah ada.
  Tidak perlu HTTP ke web app — DB-nya sama.
- **Cache TTL:** skill jarang berubah; bungkus pembacaan dengan cache ~60s seperti
  `get_prompt()` (Langfuse) agar tidak query DB tiap pesan.
- **`enabled` flag:** hormati kolom `enabled` — hanya skill aktif yang dimuat/di-index.
- **Titik integrasi:** semua opsi bermuara di `_build_agent_with_memory()`
  (`modules/chat/api.py`). Untuk Opsi B, tambahkan `load_skill` ke daftar tools
  `parent_agent` di `agent_defs.py`.
- **Invalidasi (khusus Opsi C):** saat admin membuat/mengedit/menghapus skill,
  embedding cache harus di-refresh (mis. TTL pendek atau flag dirty).
