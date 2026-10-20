/**
 * Maps Lead Scraper - DOM Parser Module
 * Extracts business details from Google Maps DOM with robust fallback selectors.
 */

const MapsParser = {
  /**
   * Cleans phone string and generates direct WhatsApp URL if mobile.
   * @param {string} rawPhone
   * @returns {{ phone: string, whatsappUrl: string }}
   */
  normalizePhone(rawPhone) {
    if (!rawPhone || typeof rawPhone !== 'string') {
      return { phone: '', whatsappUrl: '' };
    }

    const cleanPhone = rawPhone.trim().replace(/[\r\n\t]/g, ' ');
    // Strip non-digit characters except leading '+'
    const digitsOnly = cleanPhone.replace(/[^\d+]/g, '');

    let whatsappUrl = '';
    // Check if likely Indonesian or international mobile number
    // Indo mobile numbers start with 08 or +628 or 628
    if (/^(?:\+628|628|08)\d{7,12}$/.test(digitsOnly)) {
      let waDigits = digitsOnly;
      if (waDigits.startsWith('08')) {
        waDigits = '628' + waDigits.slice(2);
      } else if (waDigits.startsWith('+62')) {
        waDigits = waDigits.slice(1);
      }
      whatsappUrl = `https://wa.me/${waDigits}`;
    } else if (/^\+\d{10,15}$/.test(digitsOnly)) {
      // General international mobile
      whatsappUrl = `https://wa.me/${digitsOnly.replace('+', '')}`;
    }

    return {
      phone: cleanPhone,
      whatsappUrl
    };
  },

  /**
   * Extracts Lat and Lng from Google Maps URL or place string.
   * @param {string} url
   * @returns {{ latitude: number | null, longitude: number | null }}
   */
  extractCoordinates(url) {
    if (!url) return { latitude: null, longitude: null };

    // Format 1: /@ -6.2297465,106.8584824,15z
    const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      return {
        latitude: parseFloat(atMatch[1]),
        longitude: parseFloat(atMatch[2])
      };
    }

    // Format 2: !3d-6.2297465!4d106.8584824
    const bangMatch = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (bangMatch) {
      return {
        latitude: parseFloat(bangMatch[1]),
        longitude: parseFloat(bangMatch[2])
      };
    }

    return { latitude: null, longitude: null };
  },

  /**
   * Safely gets trimmed inner text from first matched selector.
   * @param {HTMLElement|Document} root
   * @param {string[]} selectors
   * @returns {string}
   */
  getText(root, selectors) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (el && el.innerText && el.innerText.trim()) {
          return el.innerText.trim();
        }
      } catch (err) {
        // Skip invalid selector
      }
    }
    return '';
  },

  /**
   * Safely gets attribute value from first matched selector.
   * @param {HTMLElement|Document} root
   * @param {string[]} selectors
   * @param {string} attr
   * @returns {string}
   */
  getAttr(root, selectors, attr) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (el && el.getAttribute(attr)) {
          return el.getAttribute(attr).trim();
        }
      } catch (err) {
        // Skip invalid selector
      }
    }
    return '';
  },

  /**
   * Validates if a string is a genuine business title, not a generic Maps header.
   * @param {string} title
   * @returns {boolean}
   */
  isValidBusinessTitle(title) {
    if (!title || typeof title !== 'string') return false;
    const t = title.trim();
    if (!t) return false;
    const lower = t.toLowerCase();
    if (lower === 'hasil' || lower === 'results' || lower === 'search results' || lower === 'bisnis') return false;
    if (lower === 'google maps' || lower.endsWith('- google maps')) return false;
    return true;
  },

  /**
   * Checks if Google Maps detail pane for a specific business is open.
   * @returns {boolean}
   */
  isDetailPaneOpen() {
    if (typeof document === 'undefined') return false;
    const titleEl = document.querySelector('h1.DUwDvf, div.lMbq3e h1');
    if (!titleEl) return false;
    return this.isValidBusinessTitle(titleEl.innerText);
  },

  /**
   * Extracts full details from active detail pane in Google Maps.
   * @returns {Object|null} Extracted business lead details or null if pane not open
   */
  extractDetailPane() {
    if (typeof document === 'undefined') return null;

    // 1. Verify detail pane is truly open with a valid business title
    const titleEl = document.querySelector('h1.DUwDvf, div.lMbq3e h1');
    if (!titleEl) return null;

    const rawTitle = (titleEl.innerText || '').trim();
    if (!this.isValidBusinessTitle(rawTitle)) return null;

    const pane = titleEl.closest('div[role="main"]') || document.querySelector('div[role="main"]') || document;
    const title = rawTitle;

    // 2. Category
    const category = this.getText(pane, [
      'button.DkEaL',
      'div.fontBodyMedium span button.DkEaL',
      'button[jsaction*="category"]',
      'span.fontBodyMedium span'
    ]);

    // 3. Rating & Review Count
    let rating = null;
    let reviewCount = 0;

    const ratingText = this.getText(pane, [
      'div.F7nice span[aria-hidden="true"]',
      'span.ceNzKf',
      'div.fontDisplayLarge',
      'span.aMPvhf-fI6EEc-KVuj8d'
    ]);

    if (ratingText) {
      const parsedRating = parseFloat(ratingText.replace(',', '.'));
      if (!isNaN(parsedRating)) {
        rating = parsedRating;
      }
    }

    const reviewsText = this.getText(pane, [
      'div.F7nice span:last-child',
      'button[jsaction*="pane.reviewChart.moreReviews"] span',
      'span[aria-label*="ulasan"]',
      'span[aria-label*="reviews"]'
    ]);

    if (reviewsText) {
      const match = reviewsText.replace(/[^\d]/g, '');
      if (match) {
        reviewCount = parseInt(match, 10);
      }
    }

    // 4. Address
    const address = this.getText(pane, [
      'button[data-item-id="address"] div.fontBodyMedium',
      'button[data-tooltip*="address" i] div.fontBodyMedium',
      'button[data-tooltip*="alamat" i] div.fontBodyMedium',
      'button[data-item-id="address"]',
      '[data-item-id="address"]'
    ]);

    // 5. Phone
    let rawPhone = this.getText(pane, [
      'button[data-item-id^="phone:tel:"] div.fontBodyMedium',
      'button[data-tooltip*="phone" i] div.fontBodyMedium',
      'button[data-tooltip*="telepon" i] div.fontBodyMedium',
      'button[data-item-id^="phone:tel:"]',
      'button[data-item-id^="phone:"]',
      'a[href^="tel:"]'
    ]);

    if (!rawPhone) {
      const buttons = pane.querySelectorAll('button[data-tooltip], button[aria-label]');
      for (const btn of buttons) {
        const txt = (btn.innerText || '').trim();
        if (/^(?:\+?62|08|\(02\d\)|0\d{1,3})[-.\s]?\d{2,4}[-.\s]?\d{3,5}/.test(txt)) {
          rawPhone = txt;
          break;
        }
      }
    }
    const { phone, whatsappUrl } = this.normalizePhone(rawPhone);

    // 6. Website
    let website = this.getAttr(pane, [
      'a[data-item-id="authority"]',
      'a[data-tooltip*="website" i]',
      'a[data-tooltip*="situs" i]',
      'a[data-tooltip*="web" i]'
    ], 'href');

    // Clean Google redirect URL if present
    if (website && website.includes('google.com/url?q=')) {
      try {
        const parsed = new URL(website);
        website = parsed.searchParams.get('q') || website;
      } catch (e) {
        // keep original
      }
    }

    // 7. Opening Hours / Status
    const openingHours = this.getText(pane, [
      'div[data-item-id="oh"] div.fontBodyMedium',
      'div[data-item-id="oh"]',
      'div[aria-label*="Jam" i]',
      'div[aria-label*="Hours" i]'
    ]);

    // 8. Plus Code / Local Code
    const plusCode = this.getText(pane, [
      'button[data-item-id="oloc"] div.fontBodyMedium',
      'button[data-item-id="oloc"]'
    ]);

    // 9. URL & Coordinates
    const currentUrl = window.location.href;
    const { latitude, longitude } = this.extractCoordinates(currentUrl);

    return {
      title,
      category,
      phone,
      whatsappUrl,
      website,
      address,
      rating,
      reviewCount,
      openingHours,
      plusCode,
      latitude,
      longitude,
      mapsUrl: currentUrl,
      scrapedAt: new Date().toISOString()
    };
  },

  /**
   * Fast preview extraction directly from the search feed item card.
   * @param {HTMLElement} cardOrAnchor
   * @returns {Object|null}
   */
  extractFromCard(cardOrAnchor) {
    if (!cardOrAnchor) return null;

    const card = cardOrAnchor.closest ? (cardOrAnchor.closest('div.Nv2PK') || cardOrAnchor) : cardOrAnchor;
    const anchor = card.querySelector ? (card.querySelector('a.hfpxzc') || card.querySelector('a[href*="/maps/place/"]')) : null;

    let title = '';
    if (anchor && anchor.getAttribute('aria-label')) {
      title = anchor.getAttribute('aria-label').trim();
    }
    if (!this.isValidBusinessTitle(title) && card.querySelector) {
      const titleEl = card.querySelector('div.qBF1Pd, span.OSrXXb');
      if (titleEl) title = titleEl.innerText.trim();
    }

    if (!this.isValidBusinessTitle(title)) return null;

    const mapsUrl = anchor ? (anchor.getAttribute('href') || '') : '';
    const { latitude, longitude } = this.extractCoordinates(mapsUrl);

    let rating = null;
    let reviewCount = 0;
    let category = '';
    let address = '';
    let rawPhone = '';

    if (card.querySelector) {
      const ratingEl = card.querySelector('span.MW4etd');
      if (ratingEl) {
        const parsed = parseFloat(ratingEl.innerText.replace(',', '.'));
        if (!isNaN(parsed)) rating = parsed;
      }

      const reviewsEl = card.querySelector('span.UY7F9');
      if (reviewsEl) {
        const num = reviewsEl.innerText.replace(/[^\d]/g, '');
        if (num) reviewCount = parseInt(num, 10);
      }
    }

    if (card.querySelectorAll) {
      const textBlocks = Array.from(card.querySelectorAll('div.W4Efsd'));
      for (const block of textBlocks) {
        const text = block.innerText || '';
        // Check for phone number
        const phoneMatch = text.match(/(?:\+62|62|08)\d{1,4}[-.\s]?\d{3,5}[-.\s]?\d{3,5}/);
        if (phoneMatch && !rawPhone) {
          rawPhone = phoneMatch[0];
        }
        // Check for category
        const spans = Array.from(block.querySelectorAll('span'));
        if (spans.length > 0 && !category) {
          const firstSpan = spans[0].innerText.trim();
          if (firstSpan && !firstSpan.includes('★') && isNaN(parseFloat(firstSpan))) {
            category = firstSpan;
          }
        }
      }
    }

    const { phone, whatsappUrl } = this.normalizePhone(rawPhone);

    return {
      title,
      category,
      phone,
      whatsappUrl,
      website: '',
      address,
      rating,
      reviewCount,
      openingHours: '',
      plusCode: '',
      latitude,
      longitude,
      mapsUrl,
      scrapedAt: new Date().toISOString()
    };
  }
};

// Export for extension content script and testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapsParser;
} else if (typeof window !== 'undefined') {
  window.MapsParser = MapsParser;
}
