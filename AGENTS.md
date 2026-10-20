# AGENTS.md

> Aturan universal agen coding.
> Knowledge base lintas-projek: `C:\Users\vola\agentVault`

---

## 1. Aturan Inti

1. **Keamanan deny-first** — jangan baca/tulis/cetak/commit file rahasia (`.env`, `.env.*`, `*.pem`, `id_rsa`, token cloud).
2. **Jangan curangi tes** — perbaiki kode bisnis, bukan asersi tes. Jangan hapus/lemahkan tes agar hijau.
3. **Jangan halusinasi dependensi** — urutan: stdlib/web standard → paket terpasang → fungsi mandiri → minta izin manusia sebelum menambah paket.
4. **Batas 3 kali** — gagal 3x berturut di target sama: stop, rollback via git, lapor hipotesis + error ke manusia.
5. **Jangan klaim selesai palsu** — verifikasi fungsi ekstensi, syntax check, manifest validasi sebelum lapor selesai.
6. **Tulis ke file, bukan chat** — riset, PRD, arsitektur ditulis ke `docs/`. Chat hanya status ringkas (maks 5 baris).
7. **Jangan mengarang fakta** — setiap klaim faktual harus punya sumber (file dibaca / output perintah / docs resmi). Belum yakin → nyatakan "belum diverifikasi".
8. **Agnostik platform** — ekstensi Chrome Manifest V3 (Vanilla JS, HTML, CSS modern).

---

## 2. Alur Kerja

1. **Intake** — baca `AGENTS.md` + seluruh `docs/`.
2. **Riset** — DOM Google Maps, selektor data bisnis, mekanisme scroll feed, Manifest V3 → `docs/RESEARCH.md`.
3. **Spec** — PRD spesifikasi ekstensi → `docs/PRD.md` (Bahasa Indonesia).
4. **[GERBANG 1]** — berhenti, tunggu approval manusia.
5. **Arsitektur** — arsitektur Manifest V3 & pesan runtime → `docs/ARCHITECTURE.md`.
6. **[GERBANG 2]** — berhenti sebelum penulisan kode implementasi.
7. **Implementasi** — kode bersih, modular, tangguh terhadap perubahan DOM Google Maps.
8. **Verifikasi** — validasi Manifest V3, syntax test seluruh file JS.
9. **Review** — self-review regresi, format ekspor CSV/Excel aman.
10. **Commit** — commit atomik konvensional (`feat(...)`, `fix(...)`).

---

## 3. Gerbang Manusia (STOP & WAIT)

- **Gerbang 1 — PRD:** setelah `docs/PRD.md` selesai, berhenti. Tunggu persetujuan sebelum lanjut.
- **Gerbang 2 — Arsitektur & Izin Kode:** sebelum mulai menulis file kode implementasi ekstensi, minta konfirmasi eksplisit dari pengguna sesuai mandat ("jika sudah mau masuk penulisan code harap konfirmasi").

---

## 4. Bahasa

- Dokumen di `docs/` → **Bahasa Indonesia** (istilah teknis tetap Inggris).
- Kode & komentar → **Bahasa Inggris**.
