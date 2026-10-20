const assert = require('assert');
const MapsParser = require('../lib/parser.js');
const LeadExporter = require('../lib/exporter.js');

console.log('🧪 Menjalankan pengujian logika Maps Lead Scraper...\n');

// 1. Test Phone & WhatsApp Normalization
{
  console.log('1. Menguji normalisasi telepon & direct WhatsApp link:');
  
  // Kasus HP Indonesia dengan awalan 08
  const p1 = MapsParser.normalizePhone('0812-3456-7890');
  assert.strictEqual(p1.phone, '0812-3456-7890');
  assert.strictEqual(p1.whatsappUrl, 'https://wa.me/6281234567890');
  console.log('   ✓ Format 0812... sukses -> wa.me/62812...');

  // Kasus HP Indonesia dengan awalan +62
  const p2 = MapsParser.normalizePhone('+62 813-9988-7766');
  assert.strictEqual(p2.whatsappUrl, 'https://wa.me/6281399887766');
  console.log('   ✓ Format +62 813... sukses -> wa.me/62813...');

  // Kasus Telepon Kabel / Kantor (bukan HP/WA)
  const p3 = MapsParser.normalizePhone('(021) 8370-1234');
  assert.strictEqual(p3.whatsappUrl, '', 'Nomor kantor/kabel tidak boleh dijadikan link WA');
  console.log('   ✓ Telepon kantor (021)... tidak dijadikan WA (benar)');
}

// 2. Test Coordinate Extraction
{
  console.log('\n2. Menguji ekstraksi koordinat Lat/Lng dari URL Maps:');

  const url1 = 'https://www.google.com/maps/place/Kopi+Kenangan/@-6.2297465,106.8584824,17z/data=...';
  const coords1 = MapsParser.extractCoordinates(url1);
  assert.strictEqual(coords1.latitude, -6.2297465);
  assert.strictEqual(coords1.longitude, 106.8584824);
  console.log('   ✓ Ekstraksi URL pola /@lat,lng sukses');

  const url2 = 'https://www.google.com/maps/search/?api=1&query=bengkel&query_place_id=...&data=!3d-6.9174639!4d107.6191228';
  const coords2 = MapsParser.extractCoordinates(url2);
  assert.strictEqual(coords2.latitude, -6.9174639);
  assert.strictEqual(coords2.longitude, 107.6191228);
  console.log('   ✓ Ekstraksi URL pola !3d!4d sukses');
}

// 3. Test CSV Exporter (UTF-8 BOM & Phone Protection)
{
  console.log('\n3. Menguji generator CSV dengan UTF-8 BOM dan proteksi nomor Excel:');

  const dummyLeads = [
    {
      title: 'Bengkel Motor "Maju Jaya"',
      category: 'Bengkel Sepeda Motor',
      phone: '081234567890',
      whatsappUrl: 'https://wa.me/6281234567890',
      address: 'Jl. Tebet Raya No. 45, Jakarta Selatan',
      website: 'https://majujaya.com',
      rating: 4.8,
      reviewCount: 230,
      openingHours: 'Buka ⋅ Tutup pukul 18.00',
      plusCode: 'RRQ5+X7 Jakarta',
      latitude: -6.229,
      longitude: 106.858,
      mapsUrl: 'https://maps.google.com/?cid=123',
      scrapedAt: '2026-10-16T10:00:00.000Z'
    }
  ];

  const csv = LeadExporter.toCsv(dummyLeads);

  // Pastikan ada UTF-8 BOM di awal string
  assert(csv.startsWith('\uFEFF'), 'CSV harus dimulai dengan UTF-8 BOM');
  console.log('   ✓ BOM UTF-8 (\\uFEFF) tersemat di awal file');

  // Pastikan nomor telepon diproteksi tab (\t) agar angka 0 tidak hilang di Excel
  assert(csv.includes('"\t081234567890"'), 'Nomor telepon harus diapit tab untuk proteksi angka 0 Excel');
  console.log('   ✓ Proteksi leading zero nomor telepon Excel teruji');

  // Pastikan quotes dalam judul ter-escape dengan benar (""Maju Jaya"")
  assert(csv.includes('Bengkel Motor ""Maju Jaya""'), 'Tanda kutip ganda harus di-escape');
  console.log('   ✓ Escape karakter CSV RFC 4180 teruji');
}

// 4. Test JSON Exporter
{
  console.log('\n4. Menguji generator JSON:');
  const dummyLeads = [{ title: 'Test Cafe', rating: 4.5 }];
  const jsonStr = LeadExporter.toJson(dummyLeads);
  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed[0].title, 'Test Cafe');
  console.log('   ✓ JSON output valid dan parsing sukses');
}

// 5. Test Title Validation & False Positive Rejection
{
  console.log('\n5. Menguji validasi nama bisnis (anti "Hasil" / header generik):');
  assert.strictEqual(MapsParser.isValidBusinessTitle('Hasil'), false);
  assert.strictEqual(MapsParser.isValidBusinessTitle('Results'), false);
  assert.strictEqual(MapsParser.isValidBusinessTitle('Search Results'), false);
  assert.strictEqual(MapsParser.isValidBusinessTitle('Google Maps'), false);
  assert.strictEqual(MapsParser.isValidBusinessTitle(''), false);
  assert.strictEqual(MapsParser.isValidBusinessTitle('Kopi Nako Temanggung'), true);
  assert.strictEqual(MapsParser.isValidBusinessTitle('Bengkel Motor Maju'), true);
  console.log('   ✓ Header generik Maps ("Hasil", "Results") ditolak secara ketat');
}

console.log('\n🎉 SEMUA PENGUJIAN LOGIKA LOLOS 100% TANPA ERROR!\n');
