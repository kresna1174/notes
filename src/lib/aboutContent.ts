export const ABOUT_MARKDOWN = `# 📝 Homebrew Notes

**Homebrew Notes** adalah aplikasi catatan modern, interaktif, kolaboratif, dan aman yang dikembangkan menggunakan **React, TypeScript, SQLite, Drizzle ORM, TailwindCSS, dan TanStack Router**. Aplikasi ini mengedepankan antarmuka premium, integrasi diagram alir dinamis, penguncian enkripsi berkas mandiri, serta manajemen persetujuan akses pengguna.

---

## 🚀 Fitur Unggulan

### 1. Editor Teks Kaya WYSIWYG
*   **Slash Command (\`/\`)**: Akses cepat menyisipkan pemformatan judul, daftar list, blok kode, diagram, atau file dengan mudah.
*   **Active Line Highlighting**: Sorotan baris aktif secara visual untuk memfokuskan proses mengetik.
*   **Bubble Format Menu**: Menu melayang kontekstual untuk tebal, miring, garis bawah, warna teks, dan tautan.
*   **Auto-Title Generator**: Pengisian judul dokumen otomatis berdasarkan kalimat pertama tulisan saat menekan tombol simpan (\`Ctrl + S\`).

### 2. Diagram Alir ReactFlow
*   Sisipkan dan hubungkan node diagram persegi panjang, lingkaran, atau belah ketupat langsung di dalam tulisan Anda.

### 3. Kolaborasi & Ruang Kerja Tim
*   Workspace terpisah antara **Saya (Pribadi)** dan **Tim (Kolaboratif)** lengkap dengan validasi ganda untuk mencegah duplikasi catatan saat proses salin antar workspace.

### 4. Publikasi & Tautan Publik
*   Publikasikan catatan secara instan ke tautan publik dengan tag **Public** biru berikon Globe di sidebar Anda.
*   Dilengkapi opsi perlindungan sandi (PIN) tautan publik dan pembatalan (*revoke*) tautan kapan saja.

### 5. Keamanan Tingkat Tinggi
*   Kunci catatan sensitif Anda dengan PIN 6-digit terenkripsi (hashing).

---

## 📅 Riwayat Perubahan (Changelog)

### v1.2.0 (Terbaru - Juni 2026)
*   ✨ **Sistem Pendaftaran Antrean Admin (Approval-based Registration)**:
    *   Form pendaftaran mandiri (Register) ditambahkan di halaman masuk.
    *   Status default akun baru diatur sebagai **Pending Approval** (antrean).
    *   Panel admin khusus di dashboard manajemen user untuk melakukan **Setujui** atau **Tolak** registrasi.
*   ✨ **Tag Public Sidebar**:
    *   Indikator visual dinamis berupa badge **Public** di sebelah judul catatan jika tautan dipublikasikan ke publik.
*   🔧 **Migrasi ULID ke UUID**:
    *   Seluruh sistem pembuatan ID (user, team, note, session, attachment, dsb.) dipindah ke standard UUID (\`crypto.randomUUID()\`).
    *   Package \`ulid\` dihapus sepenuhnya dari ketergantungan proyek.
*   📦 **Deployment Ready**:
    *   Pembuatan server produksi Express/HTTP di \`server.ts\` untuk dukungan deploy instan ke Railway.app dengan persistent volume.

### v1.1.0 (Mei 2026)
*   ✨ **Diagram Alir Terintegrasi**: Integrasi komponen ReactFlow untuk menyisipkan diagram visual ke editor.
*   ✨ **Workspace Saya & Tim**: Ruang kerja terpisah untuk catatan pribadi vs catatan kolaboratif tim.
*   ✨ **Pengunci PIN Catatan**: Melindungi isi catatan individual dari akses tanpa izin.

### v1.0.0 (Maret 2026)
*   ✨ **Rilis Perdana**: Editor teks TipTap WYSIWYG, menu gelembung teks, slash command, pengunggahan berkas lampiran, dan pencarian catatan teks penuh (FTS).
`
