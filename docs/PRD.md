# Product Requirements Document (PRD): Google Maps Lead Scraper Extension

**Versi:** 1.0.0  
**Tanggal:** 2026-10-16  
**Status:** DRAFT (Menunggu Gerbang 1 Approval)  
**Dokumen Terkait:** `docs/RESEARCH.md` | `AGENTS.md`

---

## 1. Problem Statement

Pebisnis, sales, agen, dan freelancer membutuhkan data kontak pelaku usaha di wilayah atau radius tertentu (misalnya daftar bengkel motor di Tebet, restoran di Bandung, salon di Surabaya). Mengumpulkan data ini secara manual satu per satu dari Google Maps:
- Memakan waktu berjam-jam untuk menyalin nama, nomor telepon, alamat, dan website.
- Sering terjadi kesalahan ketik (*human error*).
- Tools scraping berbasis cloud server sering kali memungut biaya langganan bulanan mahal dan rentan terkena captcha atau blokir IP oleh Google.

Solusi: Ekstensi browser Google Chrome mandiri yang berjalan langsung di browser pengguna, mengotomasi pengumpulan kontak usaha dari hasil pencarian Maps, dan mengekspornya menjadi berkas CSV/Excel siap pakai dengan satu klik.

---

## 2. Target Goals & Non-Goals

### Goals (In-Scope):
1. **Otomasi Pencarian & Pengumpulan Data:**
   - Mendeteksi halaman pencarian Google Maps yang aktif secara otomatis.
   - Mengontrol proses auto-scroll feed hasil pencarian hingga jumlah data yang diinginkan tercapai (atau hingga habis).
2. **Ekstraksi Data Kontak & Profil Bisnis:**
   - **Nama Bisnis / Toko**
   - **Kategori Usaha** (misal: Bengkel Sepeda Motor, Kafe, Restoran Seafood)
   - **Nomor Telepon** (dibersihkan dari karakter aneh)
   - **Direct WhatsApp Link** (otomatis diformat `https://wa.me/62...` jika berupa nomor seluler/WA)
   - **Alamat Lengkap**
   - **Website / URL Profil**
   - **Rating Bintang & Jumlah Ulasan**
   - **Jam Operasional / Status Buka**
   - **Koordinat Peta (Latitude & Longitude)**
   - **URL Google Maps Tempat Tersebut**
3. **Kontrol Scraper Interaktif:**
   - Opsi batas jumlah data (misal: 10, 50, 100, atau Tanpa Batas).
   - Opsi pengaturan jeda/delay (Cepat, Normal, Aman) untuk mencegah throttling.
   - Tombol kontrol: **Mulai (Start)**, **Jeda (Pause)**, **Lanjut (Resume)**, dan **Selesai & Ekspor (Stop & Export)**.
   - Progress bar dan live table preview data yang berhasil ditarik secara *real-time*.
4. **Ekspor Data Berkualitas Tinggi:**
   - Unduh **CSV / Excel** dengan format UTF-8 BOM agar nomor telepon awalan `0` tidak hilang atau berubah format ilmiah.
   - Unduh **JSON** untuk kebutuhan integrasi database atau script lanjutan.
5. **Kemudahan Instalasi:**
   - Pure Manifest V3 (Vanilla JS, CSS modern, HTML) tanpa build step yang rumit, langsung bisa di-load via *Load Unpacked* di Chrome Developer Mode.

### Non-Goals (Out-of-Scope):
1. Mengambil data pribadi di luar listing bisnis (sesuai arahan: tidak mengambil data nama tetangga/data pribadi privat).
2. Scraping review komentar lengkap per orang (hanya rating dan total ulasan untuk efisiensi performa).
3. Melakukan blast WhatsApp otomatis (hanya menyediakan link `wa.me` siap klik).

---

## 3. User Stories & Kriteria Penerimaan (GIVEN/WHEN/THEN)

### Story 1: Menjalankan Scraping dari Hasil Pencarian Google Maps
Sebagai pengguna, saya ingin membuka Google Maps, mengetik kata kunci usaha, dan memulai scraping melalui ekstensi.
- **Kriteria Penerimaan 1.1:**
  - GIVEN: Pengguna berada di tab Google Maps (`google.com/maps/search/...`).
  - WHEN: Pengguna membuka popup ekstensi atau panel kontrol.
  - THEN: Ekstensi mendeteksi kata kunci aktif dan menampilkan status "Siap Mengambil Data".
- **Kriteria Penerimaan 1.2:**
  - GIVEN: Pengguna mengatur target data (misal: 25) dan menekan tombol "Mulai Scrape".
  - WHEN: Proses berjalan.
  - THEN: Ekstensi otomatis melakukan scroll pada panel hasil, mengklik detail item, mengekstrak data kontak, dan mengupdate counter progress secara *real-time* ("Mengambil 5 dari 25...").

### Story 2: Menangani Nomor Telepon & WhatsApp
Sebagai pengguna sales/marketing, saya ingin nomor telepon tidak rusak di Excel dan tersedia link WhatsApp langsung.
- **Kriteria Penerimaan 2.1:**
  - GIVEN: Bisnis memiliki nomor telepon `0812-3456-7890`.
  - WHEN: Ekstensi mengekstrak nomor tersebut.
  - THEN: Kolom Telepon menyimpan string rapi, dan kolom `WhatsApp URL` otomatis terisi `https://wa.me/6281234567890`.
- **Kriteria Penerimaan 2.2:**
  - GIVEN: Bisnis hanya memiliki nomor telepon kantor/kabel `(021) 123456`.
  - WHEN: Ekstensi mengekstrak nomor tersebut.
  - THEN: Kolom Telepon terisi nomor kabel, dan kolom `WhatsApp URL` dikosongkan (tidak dipaksa format WA).

### Story 3: Ekspor Data ke CSV/Excel
Sebagai pengguna, saya ingin mengunduh hasil scraping dalam file spreadsheet.
- **Kriteria Penerimaan 3.1:**
  - GIVEN: Proses scraping selesai atau dihentikan pengguna dengan data terkumpul > 0.
  - WHEN: Pengguna menekan tombol "Download CSV".
  - THEN: File CSV otomatis terunduh ke komputer dengan nama `gmaps_leads_[query]_[tanggal].csv` dengan encoding UTF-8 BOM yang langsung rapi saat dibuka di Microsoft Excel.

---

## 4. Batasan Teknis & Keamanan (Technical Constraints)

1. **Manifest V3 Compliant:**
   - Tanpa `eval()` atau unsafe inline scripts.
   - Komunikasi asynchronous antara Popup, Content Script, dan Background Service Worker via `chrome.runtime.sendMessage`.
2. **Selector Fallback Mechanism:**
   - Menggunakan minimal 2 lapis selektor CSS/XPath untuk setiap field data agar kebal jika Google sedikit mengubah class CSS.
3. **Memory Management:**
   - Data disimpan sementara di `chrome.storage.local` per sesi, sehingga jika tab tidak sengaja ter-refresh, data yang sudah ditarik tidak hilang.

---

## 5. Definition of Done (DoD)

1. Struktur folder ekstensi lengkap di `D:\Coding\maps-lead-scraper`.
2. Berkas `manifest.json` valid sesuai standar Chrome Extension Manifest V3.
3. Content script berhasil mengekstrak 10 data field bisnis dari Google Maps.
4. Fitur Start, Pause, Resume, Stop berjalan responsif.
5. Ekspor CSV (kompatibel Excel) dan JSON berfungsi 100%.
6. Berkas panduan instalasi `README.md` terpasang jelas.
