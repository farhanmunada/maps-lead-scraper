# Maps Lead Scraper (Chrome Extension)

Ekstensi Google Chrome (Manifest V3) untuk mengekstrak data kontak bisnis, nomor telepon, direct link WhatsApp, website, alamat, dan koordinat langsung dari Google Maps ke format **CSV / Excel** dan **JSON**.

---

## ✨ Fitur Utama

- **Otomatis & Real-Time:** Otomatis scroll feed pencarian Google Maps dan ekstrak detail tiap toko/usaha.
- **Ekstrak Data Kontak Lengkap:**
  - Nama Usaha & Kategori
  - Nomor Telepon Resmi
  - **Direct WhatsApp Link (`https://wa.me/...`)** otomatis untuk nomor ponsel/seluler
  - Alamat Fisik Lengkap
  - Website Resmi / Profil Medsos
  - Rating & Jumlah Ulasan
  - Jam Operasional Buka/Tutup
  - Titik Koordinat (Latitude & Longitude)
  - Google Maps URL
- **Dual Interface:**
  1. **Floating Widget di Google Maps:** Widget elegan langsung di layar Google Maps dengan kontrol Start, Jeda, Lanjut, dan Stop.
  2. **Popup Toolbar Chrome:** Akses cepat dari bilah ikon ekstensi.
- **Ekspor Aman untuk Excel:** Menggunakan encoding UTF-8 BOM (`\uFEFF`) dan proteksi nomor telepon sehingga angka `0` di awal (`0812...`) atau tanda `+` **tidak akan hilang atau terpotong** saat dibuka di Microsoft Excel.

---

## 🚀 Panduan Pemasangan di Google Chrome / Brave / Edge

1. Buka browser **Google Chrome**.
2. Masuk ke halaman ekstensi dengan mengetikkan di address bar:
   ```text
   chrome://extensions/
   ```
3. Di pojok kanan atas, aktifkan toggle **"Developer mode"** (Mode Pengembang).
4. Klik tombol **"Load unpacked"** (Muat yang belum dibongkar) di pojok kiri atas.
5. Arahkan dan pilih folder projek ini:
   ```text
   D:\Coding\maps-lead-scraper
   ```
6. Ekstensi **"Maps Lead Scraper - Business Extractor"** akan langsung terpasang dan aktif di bilah ekstensi Chrome Anda!

---

## 📖 Cara Penggunaan

1. Buka [Google Maps](https://www.google.com/maps).
2. Ketik kata kunci bisnis dan area yang ingin Anda cari (Contoh: `"bengkel motor bandung"`, `"cafe tebet jakarta"`, `"salon surabaya"`).
3. Setelah hasil pencarian Maps muncul di sisi kiri:
   - Anda akan melihat tombol hijau **"Lead Scraper"** di pojok kanan bawah layar Google Maps.
   - Klik tombol tersebut untuk membuka panel kontrol.
   - Atau klik ikon ekstensi di toolbar browser Anda.
4. Tentukan **Target Jumlah Kontak** (misal: 20, 50, atau 100) dan **Kecepatan Jeda** (Normal / Aman).
5. Klik **"▶ Mulai"**.
6. Ekstensi akan otomatis menggulir daftar dan mengambil data kontak satu per satu secara langsung.
7. Setelah selesai (atau jika Anda klik tombol **⏹ Stop**), klik **"📊 Download CSV"** untuk membuka data di Microsoft Excel atau **"{ } JSON"** untuk integrasi database.

---

## 📁 Struktur Direktori

```text
D:/Coding/maps-lead-scraper/
├── manifest.json              # Konfigurasi Manifest V3 Chrome Extension
├── background.js              # Service Worker latar belakang
├── content/
│   ├── content.js             # Automasi scrolling & extraction DOM Maps
│   └── content.css            # Desain floating widget kontrol di Maps
├── popup/
│   ├── popup.html             # Tampilan modal toolbar
│   ├── popup.css              # Styling gelap elegan
│   └── popup.js               # Komunikasi popup ke content script
├── lib/
│   ├── parser.js              # Parser selektor data kontak Google Maps
│   └── exporter.js            # Generator file CSV (Excel-safe) & JSON
├── icons/                     # Berkas icon resolusi 16, 48, 128
├── tests/
│   └── test-scraper-logic.js  # Unit test mandiri logika scraper
└── docs/
    ├── RESEARCH.md            # Riset teknis selektor DOM & bypass limit
    ├── PRD.md                 # Dokumen spesifikasi kebutuhan produk
    └── ARCHITECTURE.md        # Desain arsitektur Manifest V3
```

---

## 🧪 Menjalankan Tes Logika

Untuk memverifikasi parser nomor telepon, WhatsApp normalizer, dan format CSV:
```bash
node tests/test-scraper-logic.js
```
