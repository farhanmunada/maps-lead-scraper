# ARCHITECTURE: Google Maps Lead Scraper (Chrome Extension)

**Versi:** 1.0.0  
**Tanggal:** 2026-10-16  
**Status:** DRAFT (Menunggu Gerbang 2 Approval)  
**Dokumen Terkait:** `docs/PRD.md` | `docs/RESEARCH.md` | `AGENTS.md`

---

## 1. Arsitektur Komponen (Manifest V3)

```text
┌─────────────────────────────────────────────────────────────┐
│                    Google Chrome Browser                    │
│                                                             │
│  ┌────────────────────────┐      ┌───────────────────────┐  │
│  │     Extension Popup    │      │  Active Maps Web Tab  │  │
│  │   (popup.html / .js)   │◄────►│ (content.js / .css)   │  │
│  └───────────┬────────────┘      │                       │  │
│              │                   │ [Feed Scroller Engine]│  │
│              │                   │ [Detail DOM Parser]   │  │
│              │                   │ [Floating Quick Bar]  │  │
│              ▼                   └───────────┬───────────┘  │
│  ┌────────────────────────┐                  │              │
│  │  chrome.storage.local  │◄─────────────────┘              │
│  │ (Session State & Leads)│                                 │
│  └───────────┬────────────┘                                 │
│              ▼                                              │
│  ┌────────────────────────┐                                 │
│  │      Export Engine     │                                 │
│  │  (CSV UTF-8 BOM, JSON) │                                 │
│  └────────────────────────┘                                 │
└─────────────────────────────────────────────────────────────┘
```

### Penjelasan Komponen:
1. **Manifest File (`manifest.json`):**
   - Mendefinisikan permissions (`storage`, `activeTab`, `downloads`, `scripting`) dan host permission `*://*.google.com/maps/*`.
2. **Content Script Engine (`content/content.js` & `content/parser.js`):**
   - Berjalan langsung di dalam DOM Google Maps.
   - Melakukan automasi scrolling `div[role="feed"]` dengan observasi tinggi kontainer.
   - Mengunjungi tiap listing dan memanggil `parser.js` untuk mengekstrak data kontak dengan *selector fallback hierarchy*.
   - Menyuntikkan *Floating Control Bar* di pojok layar Maps agar pengguna bisa memantau dan mengontrol scraper langsung tanpa harus terus membuka icon extension popup.
3. **Popup Interface (`popup/popup.html`, `popup/popup.js`, `popup/popup.css`):**
   - UI modern bergaya dashboard mini: input batas kuota (10, 50, 100, atau Unlimited), kecepatan delay (Aman, Cepat), status deteksi tab aktif, dan tombol ekspor.
4. **Data Exporter (`lib/exporter.js`):**
   - Mengubah array objek data bisnis menjadi format CSV dengan encoding `\uFEFF` (UTF-8 with BOM) dan escape string standar RFC 4180 sehingga nomor telepon awalan `0` atau `+62` aman dan tidak dipotong Excel.
   - Menghasilkan tautan chat instan WhatsApp (`https://wa.me/...`) untuk nomor telepon seluler.

---

## 2. Struktur Direktori Proyek

```text
D:/Coding/maps-lead-scraper/
├── AGENTS.md                   # Universal agent constitution & vault pointers
├── .gitignore                  # Git exclusions
├── README.md                   # Panduan instalasi "Load Unpacked" di Chrome
├── manifest.json               # Chrome Extension Manifest V3
├── docs/
│   ├── RESEARCH.md             # Temuan riset DOM Google Maps & selector
│   ├── PRD.md                  # Spesifikasi fungsional dan kriteria penerimaan
│   └── ARCHITECTURE.md         # Dokumen arsitektur sistem (file ini)
├── icons/                      # Icon ekstensi
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── popup/                      # Popup UI ekstensi di toolbar Chrome
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/                    # Content script yang diinjeksi ke tab Google Maps
│   ├── content.js              # State machine (Scroll -> Click -> Scrape -> Next)
│   └── content.css             # Desain floating control badge
└── lib/                        # Modul utility bersama
    ├── parser.js               # Multi-fallback extractor data kontak
    └── exporter.js             # Generator CSV UTF-8 BOM & JSON
```

---

## 3. Data Flow & State Machine Scraper

```text
[IDLE] ──(Klik 'Mulai Scrape')──► [PHASE 1: FEED SCROLLING]
                                         │
                                   Scroll feed down
                                   hingga target tercapai
                                         │
                                         ▼
                                  [PHASE 2: DETAIL EXTRACTION]
                                         │
                                   Iterasi tiap link usaha:
                                   1. Klik kartu
                                   2. Delay 500-800ms
                                   3. Parse nama, telepon, WA, web, alamat, dll.
                                   4. Simpan ke local state
                                   5. Emit progress update ke UI
                                         │
                                         ▼
                                  [PHASE 3: COMPLETED]
                                         │
                                   Beri notifikasi & tombol
                                   "Download CSV / JSON"
```

---

## 4. Skema Data Output (Leads Record)

```typescript
interface BusinessLead {
  id: string;               // Unique place ID / hash
  title: string;            // Nama Usaha / Toko
  category: string;         // Kategori (e.g. "Bengkel Sepeda Motor")
  phone: string;            // Nomor Telepon murni (e.g. "+62 812-3456-7890")
  whatsappUrl: string;      // Direct link wa.me jika nomor HP valid
  website: string;          // Situs web atau URL medsos resmi
  address: string;          // Alamat fisik lengkap
  rating: number | null;    // Bintang rating (1.0 - 5.0)
  reviewCount: number;      // Total ulasan pengguna
  openingHours: string;     // Status jam operasional saat ini
  latitude: number | null;  // Titik koordinat Lat
  longitude: number | null; // Titik koordinat Lng
  mapsUrl: string;          // Direct URL Google Maps tempat tersebut
  scrapedAt: string;        // Timestamp ISO 8601 pengambilan data
}
```

---

## 5. Rencana Pengujian & Verifikasi

1. **Manifest Validation:** Memastikan tidak ada schema error pada `manifest.json`.
2. **Syntax Integrity:** Memvalidasi seluruh file JS tanpa error sintaksis.
3. **Format Integrity:** Memvalidasi generator CSV dengan sample data nomor telepon awalan `0` untuk menjamin tidak terpotong saat dibuka di Excel.
