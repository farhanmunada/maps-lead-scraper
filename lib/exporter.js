/**
 * Maps Lead Scraper - Exporter Module
 * Handles CSV (with UTF-8 BOM and Excel phone protection) and JSON file generation.
 */

const LeadExporter = {
  /**
   * Escapes a single CSV cell value according to RFC 4180.
   * @param {any} val
   * @param {boolean} isPhone
   * @returns {string}
   */
  escapeCsvValue(val, isPhone = false) {
    if (val === null || val === undefined) {
      return '""';
    }

    let str = String(val).trim();

    // Prevent Excel from stripping leading zeros or corrupting '+' signs in phone numbers
    if (isPhone && str.length > 0) {
      // Prepend tab (\t) inside quotes to force Excel to treat as text
      str = '\t' + str;
    }

    // Escape double quotes by doubling them
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  },

  /**
   * Converts an array of lead objects into CSV format with UTF-8 BOM.
   * @param {Array<Object>} leads
   * @returns {string} CSV content with \uFEFF BOM
   */
  toCsv(leads) {
    if (!Array.isArray(leads) || leads.length === 0) {
      return '';
    }

    const headers = [
      'Nama Usaha',
      'Kategori',
      'Nomor Telepon',
      'WhatsApp Link',
      'Alamat Lengkap',
      'Website',
      'Rating',
      'Total Ulasan',
      'Jam Buka',
      'Plus Code',
      'Latitude',
      'Longitude',
      'Google Maps URL',
      'Waktu Scrape'
    ];

    const rows = leads.map(item => {
      return [
        this.escapeCsvValue(item.title),
        this.escapeCsvValue(item.category),
        this.escapeCsvValue(item.phone, true),
        this.escapeCsvValue(item.whatsappUrl),
        this.escapeCsvValue(item.address),
        this.escapeCsvValue(item.website),
        this.escapeCsvValue(item.rating),
        this.escapeCsvValue(item.reviewCount),
        this.escapeCsvValue(item.openingHours),
        this.escapeCsvValue(item.plusCode),
        this.escapeCsvValue(item.latitude),
        this.escapeCsvValue(item.longitude),
        this.escapeCsvValue(item.mapsUrl),
        this.escapeCsvValue(item.scrapedAt)
      ].join(',');
    });

    // \uFEFF is the UTF-8 Byte Order Mark (BOM) needed by Excel to display UTF-8 characters cleanly
    return '\uFEFF' + [headers.map(h => this.escapeCsvValue(h)).join(','), ...rows].join('\r\n');
  },

  /**
   * Converts leads array into pretty JSON string.
   * @param {Array<Object>} leads
   * @returns {string}
   */
  toJson(leads) {
    return JSON.stringify(leads || [], null, 2);
  },

  /**
   * Triggers a browser download of the given content.
   * @param {string} content
   * @param {string} filename
   * @param {string} mimeType
   */
  download(content, filename, mimeType = 'text/csv;charset=utf-8') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  },

  /**
   * Helper to download leads as CSV.
   * @param {Array<Object>} leads
   * @param {string} [prefix='gmaps_leads']
   */
  downloadCsv(leads, prefix = 'gmaps_leads') {
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${prefix}_${dateStr}.csv`;
    const csvContent = this.toCsv(leads);
    this.download(csvContent, filename, 'text/csv;charset=utf-8');
  },

  /**
   * Helper to download leads as JSON.
   * @param {Array<Object>} leads
   * @param {string} [prefix='gmaps_leads']
   */
  downloadJson(leads, prefix = 'gmaps_leads') {
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${prefix}_${dateStr}.json`;
    const jsonContent = this.toJson(leads);
    this.download(jsonContent, filename, 'application/json;charset=utf-8');
  }
};

// Export for extension content script and testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LeadExporter;
} else if (typeof window !== 'undefined') {
  window.LeadExporter = LeadExporter;
}
