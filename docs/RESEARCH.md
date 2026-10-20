# RESEARCH: Google Maps Business Lead Extractor (Chrome Extension)

**Tanggal:** 2026-10-16  
**Status:** ✅ Verified  
**Agent/Author:** Hermes Agent (worker-gemini)

---

## 1. Konteks Riset

- **Objektif:**
  Mengekstrak data bisnis publik pada Google Maps (nama usaha, kategori, telepon/WhatsApp, website, alamat lengkap, rating, koordinat) berbasis radius/kata kunci pencarian langsung melalui Google Chrome Extension.
- **Kepatuhan & Etika:**
  - Data yang diekstrak adalah direktori bisnis komersial publik (Public Commercial Listings).
  - Ekstensi berjalan di browser pengguna (Client-side DOM automation), sehingga memanfaatkan sesi browser aktif tanpa risiko pemblokiran IP proxy/cloud server.
  - Rate limiting & delay antar-klik diterapkan agar tidak membebani browser atau memicu throttling.

---

## 2. Analisis Struktur DOM Google Maps (Desktop Web)

### A. Kontainer Feed & Infinite Scroll
- **URL Pola:** `https://www.google.com/maps/search/<query>/...`
- **Kontainer Hasil:** `div[role="feed"]` atau `div[aria-label*="Hasil untuk"]` / `div[aria-label*="Results for"]`.
- **Elemen Kartu Bisnis:**
  - Setiap toko/usaha memiliki anchor utama: `a.hfpxzc`
  - Atribut pada `a.hfpxzc`:
    - `aria-label`: Nama usaha (misal: "Kopi Kenangan Tebet")
    - `href`: Link detail Google Maps (mengandung koordinat Lat/Lng dan Place ID).
- **Indikator Akhir Daftar:** Teks `"Anda telah mencapai bagian akhir daftar"` atau `"You've reached the end of the list"`.

### B. Ekstraksi Data Panel Detail
Ketika elemen `a.hfpxzc` diklik, Google Maps memuat panel detail samping kanan/kiri:
1. **Nama Usaha:** `h1.DUwDvf`
2. **Kategori Usaha:** `button.DkEaL` atau `div.fontBodyMedium span button`
3. **Rating & Ulasan:**
   - Rating angka: `span.ceNzKf` atau `div.F7nice span[aria-hidden="true"]`
   - Jumlah ulasan: `div.F7nice span[aria-label*="ulasan"]` atau `span[aria-label*="reviews"]`
4. **Alamat Lengkap:**
   - Selektor atribut data: `button[data-item-id="address"]` atau `[data-tooltip="Salin alamat"]` / `[data-tooltip="Copy address"]`
5. **Nomor Telepon:**
   - Selektor atribut data: `button[data-item-id^="phone:tel:"]` atau `[data-tooltip="Salin nomor telepon"]` / `[data-tooltip="Copy phone number"]`
   - Pembersihan: Mengambil teks murni (misal: `+62 812-3456-7890` atau `(021) 83701234`).
   - Normalisasi WhatsApp: Mengubah nomor awalan `08xx` atau `+628xx` menjadi link langsung `https://wa.me/628xx`.
6. **Website / Link Eksternal:**
   - Selektor atribut data: `a[data-item-id="authority"]` atau `[data-tooltip="Buka situs web"]` / `[data-tooltip="Open website"]`
7. **Koordinat (Latitude & Longitude):**
   - URL Google Maps mengandung pola regex: `/@(-?\d+\.\d+),(-?\d+\.\d+),` atau `!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)`.
8. **Jam Buka / Status Operasional:**
   - Elemen `div[data-item-id="oh"]` (misal: "Buka ⋅ Tutup pukul 22.00").

---

## 3. Spesifikasi Arsitektur Chrome Extension (Manifest V3)

1. **Manifest File (`manifest.json`):**
   - `manifest_version: 3`
   - `permissions`: `["activeTab", "scripting", "storage", "downloads"]`
   - `host_permissions`: `["*://*.google.com/maps/*"]`
   - `action`: Popup UI modern (`popup.html`, `popup.js`, `popup.css`).
   - `content_scripts`: Injeksi ke tab Google Maps untuk automasi DOM dan panel kontrol mengambang (*floating widget*).
2. **Mekanisme Ekstraksi (Two-Phase Scraping Pipeline):**
   - **Fase 1 (Fast Feed Scan):** Scroll kontainer `div[role="feed"]` secara otomatis dengan jeda aman (800ms - 1500ms) untuk mengumpulkan daftar item hingga batas target tercapai.
   - **Fase 2 (Deep Detail Inspection):** Mengunjungi/mengklik setiap item secara berurutan, mengekstrak data kontak lengkap (telepon, alamat, website, jam buka), lalu kembali ke item berikutnya.
   - **Fase 3 (Data Sanitization & Export):**
     - Ekspor format **CSV** dengan UTF-8 BOM (`\uFEFF`) dan escape tab (`\t`) agar nomor telepon berawalan angka `0` tidak terpotong oleh Microsoft Excel.
     - Ekspor format **JSON** untuk kebutuhan integrasi database / CRM.
     - Pembuatan otomatis kolom **WhatsApp Link** (`https://wa.me/...`) untuk memudahkan follow-up prospek.

---

## 4. Keunggulan & Mitigasi Risiko

| Risiko | Solusi & Mitigasi |
|---|---|
| Selektor DOM Maps berubah | Gunakan *multiple fallback selectors* (atribut `data-item-id`, `aria-label`, icon SVG, class CSS). |
| Browser hang saat scrape ratusan data | Gunakan asynchronous pacing, simpan state berkala di `chrome.storage.local`. |
| Nomor telepon hilang angka nol di Excel | Tambahkan prefix text formula `="081..."` atau UTF-8 BOM pada generator CSV. |
| Pengguna ingin berhenti di tengah jalan | Sediakan tombol **Pause**, **Resume**, dan **Stop & Download Current Data**. |
