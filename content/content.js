/**
 * Maps Lead Scraper - Content Script
 * Automates scrolling and extraction on Google Maps web interface.
 */

(function () {
  // Prevent duplicate injection
  if (window.__MLS_LOADED__) return;
  window.__MLS_LOADED__ = true;

  const State = {
    status: 'IDLE', // IDLE, SCANNING, SCRAPING, PAUSED, FINISHED, STOPPED, ERROR
    statusMessage: '',
    errorMessage: '',
    leads: [],
    targetCount: 20,
    delayMs: 1200,
    currentIndex: 0,
    isPaused: false,
    isStopped: false,
    activeQuery: ''
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function updateStatus(status, message = '') {
    State.status = status;
    State.statusMessage = message;
    if (status === 'ERROR') {
      State.errorMessage = message;
    } else if (status === 'SCRAPING' || status === 'SCANNING') {
      State.errorMessage = '';
    }
  }

  /**
   * Finds the scrollable container for Google Maps search results.
   * @returns {HTMLElement|null}
   */
  function findFeedElement() {
    // 1. Standard role="feed"
    const roleFeed = document.querySelector('div[role="feed"]');
    if (roleFeed) return roleFeed;

    // 2. Locate any place card/link and trace upwards to its scrollable parent
    const sampleItem = document.querySelector('a.hfpxzc, div.Nv2PK, a[href*="/maps/place/"]');
    if (sampleItem) {
      let curr = sampleItem.parentElement;
      while (curr && curr !== document.body) {
        const style = window.getComputedStyle(curr);
        const overflowY = style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && curr.scrollHeight > curr.clientHeight) {
          return curr;
        }
        curr = curr.parentElement;
      }
      if (sampleItem.parentElement) return sampleItem.parentElement;
    }

    // 3. Fallbacks
    return (
      document.querySelector('div[aria-label*="Results" i]') ||
      document.querySelector('div[aria-label*="Hasil" i]') ||
      document.querySelector('div.m6QErb[aria-label]') ||
      document.querySelector('div.m6QErb') ||
      document.querySelector('div[role="main"]')
    );
  }

  /**
   * Detects active search query.
   * @returns {string}
   */
  function getSearchQuery() {
    const input = document.querySelector('input#searchboxinput');
    if (input && input.value) return input.value.trim();
    const title = document.title;
    if (title && title.includes('Google Maps')) {
      const q = title.replace('- Google Maps', '').trim();
      if (q && q !== 'Google Maps') return q;
    }
    return 'maps_leads';
  }

  /**
   * Phase 1: Scroll and collect items from search results.
   * @param {number} target
   */
  async function scrollAndCollectItems(target) {
    updateStatus('SCANNING', 'Mencari daftar hasil bisnis di Google Maps...');

    // Wait up to 8 seconds for search results or place details to appear
    let anchors = [];
    for (let wait = 0; wait < 16; wait++) {
      anchors = Array.from(document.querySelectorAll('a.hfpxzc, div.Nv2PK a[href*="/maps/place/"]'));
      if (anchors.length > 0 || window.location.href.includes('/maps/place/')) break;
      await sleep(500);
    }

    // Check single place page if no results list
    if (anchors.length === 0) {
      if (window.location.href.includes('/maps/place/')) {
        return [{
          anchor: null,
          title: document.title.replace('- Google Maps', '').trim() || 'Bisnis',
          href: window.location.href
        }];
      }
      throw new Error('Daftar pencarian belum terbuka. Ketik kata kunci bisnis di kolom pencarian lalu coba lagi.');
    }

    const feed = findFeedElement();
    const seenUrls = new Set();
    const items = [];

    const collectVisible = () => {
      const currentAnchors = document.querySelectorAll('a.hfpxzc, div.Nv2PK a[href*="/maps/place/"]');
      for (const a of currentAnchors) {
        const href = a.getAttribute('href');
        if (href && !seenUrls.has(href)) {
          seenUrls.add(href);
          items.push({
            anchor: a,
            title: a.getAttribute('aria-label') || 'Bisnis',
            href: href
          });
        }
      }
    };

    collectVisible();
    updateStatus('SCANNING', `Ditemukan ${items.length} bisnis...`);

    let noChangeCount = 0;
    let lastCount = items.length;

    while (!State.isStopped && (target <= 0 || items.length < target)) {
      if (State.isPaused) {
        await sleep(500);
        continue;
      }

      // Scroll feed if available
      if (feed) {
        feed.scrollTop = feed.scrollHeight;
      } else {
        window.scrollBy(0, 800);
      }

      await sleep(1000);
      collectVisible();
      updateStatus('SCANNING', `Mengumpulkan daftar: ${items.length} / ${target}`);

      // Check if end of list reached
      const isEnd =
        (feed && (feed.innerText.includes('end of the list') || feed.innerText.includes('akhir daftar'))) ||
        document.body.innerText.includes('You\'ve reached the end of the list') ||
        document.body.innerText.includes('Anda telah mencapai bagian akhir daftar');

      if (isEnd) break;

      if (items.length === lastCount) {
        noChangeCount++;
        if (noChangeCount >= 3) break;
      } else {
        noChangeCount = 0;
      }
      lastCount = items.length;
    }

    return target > 0 ? items.slice(0, target) : items;
  }

  /**
   * Phase 2: Visits each business and extracts detail fields.
   * @param {Array<Object>} items
   */
  async function scrapeDetails(items) {
    State.leads = [];
    State.currentIndex = 0;
    updateStatus('SCRAPING', `Mulai ekstraksi kontak (0/${items.length})...`);

    for (let i = 0; i < items.length; i++) {
      if (State.isStopped) break;

      while (State.isPaused && !State.isStopped) {
        updateStatus('PAUSED', 'Proses dijeda sementara.');
        await sleep(500);
      }
      if (State.isStopped) break;

      const item = items[i];
      State.currentIndex = i + 1;
      updateStatus('SCRAPING', `[${i + 1}/${items.length}] Mengekstrak: ${item.title}`);

      try {
        // Trigger click on item
        if (item.anchor && item.anchor.isConnected) {
          item.anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
          item.anchor.click();
          item.anchor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          item.anchor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        } else if (item.href) {
          const fresh = document.querySelector(`a[href="${CSS.escape(item.href)}"]`);
          if (fresh) {
            fresh.scrollIntoView({ behavior: 'smooth', block: 'center' });
            fresh.click();
            fresh.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            fresh.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          }
        }

        // Wait for detail pane to update
        await sleep(State.delayMs);

        // Parse detail pane
        let lead = window.MapsParser ? window.MapsParser.extractDetailPane() : null;

        if (lead) {
          if (!lead.title || lead.title === 'Google Maps') lead.title = item.title;
          if (!lead.mapsUrl) lead.mapsUrl = item.href || window.location.href;

          // Prevent duplicates
          const exists = State.leads.some(
            (l) => (l.mapsUrl && l.mapsUrl === lead.mapsUrl) || (l.title === lead.title && l.phone && l.phone === lead.phone)
          );
          if (!exists) {
            State.leads.push(lead);
          }
        } else if (item.anchor && window.MapsParser) {
          // Card fallback
          const cardLead = window.MapsParser.extractFromCard(item.anchor);
          if (cardLead) State.leads.push(cardLead);
        }
      } catch (err) {
        console.warn('[Maps Scraper] Gagal ekstrak:', item.title, err);
      }

      await sleep(300);
    }

    if (!State.isStopped) {
      updateStatus('FINISHED', `Selesai! Berhasil mengambil ${State.leads.length} kontak.`);
    } else {
      updateStatus('STOPPED', `Dihentikan. ${State.leads.length} kontak terkumpul.`);
    }

    // Persist to local storage
    try {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ lastLeads: State.leads, lastQuery: State.activeQuery });
      }
    } catch (e) {}
  }

  /**
   * Start scrape trigger.
   */
  async function startScraping(target = 20, delayMs = 1200) {
    if (State.status === 'SCANNING' || State.status === 'SCRAPING') return;

    State.targetCount = target;
    State.delayMs = delayMs;
    State.isPaused = false;
    State.isStopped = false;
    State.activeQuery = getSearchQuery();

    try {
      const items = await scrollAndCollectItems(target);
      if (items.length === 0) {
        updateStatus('ERROR', 'Tidak ada data bisnis ditemukan. Silakan lakukan pencarian di Maps terlebih dahulu.');
        return;
      }
      await scrapeDetails(items);
    } catch (err) {
      console.error('[Maps Scraper] Error:', err);
      updateStatus('ERROR', err.message || 'Terjadi kesalahan');
    }
  }

  function pauseScraping() {
    State.isPaused = true;
    updateStatus('PAUSED', 'Proses dijeda.');
  }

  function resumeScraping() {
    State.isPaused = false;
    updateStatus('SCRAPING', 'Melanjutkan ekstraksi...');
  }

  function stopScraping() {
    State.isStopped = true;
    State.isPaused = false;
    updateStatus('STOPPED', `Dihentikan. ${State.leads.length} data tersimpan.`);
  }

  // --- RUNTIME MESSAGE LISTENER (TOOLBAR POPUP CONTROLLER) ---
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'GET_STATUS':
        sendResponse({
          status: State.status,
          statusMessage: State.statusMessage,
          errorMessage: State.errorMessage,
          leadsCount: State.leads.length,
          targetCount: State.targetCount,
          currentIndex: State.currentIndex,
          activeQuery: State.activeQuery || getSearchQuery()
        });
        break;

      case 'START_SCRAPE':
        startScraping(message.limit || 20, message.delayMs || 1200);
        sendResponse({ success: true });
        break;

      case 'PAUSE_SCRAPE':
        pauseScraping();
        sendResponse({ success: true });
        break;

      case 'RESUME_SCRAPE':
        resumeScraping();
        sendResponse({ success: true });
        break;

      case 'STOP_SCRAPE':
        stopScraping();
        sendResponse({ success: true, count: State.leads.length });
        break;

      case 'GET_LEADS':
        sendResponse({ leads: State.leads, query: State.activeQuery });
        break;

      case 'EXPORT_CSV':
        if (window.LeadExporter && State.leads.length > 0) {
          const qSlug = (State.activeQuery || 'gmaps').replace(/[^a-zA-Z0-9]/g, '_');
          window.LeadExporter.downloadCsv(State.leads, `leads_${qSlug}`);
        }
        sendResponse({ success: true });
        break;

      case 'EXPORT_JSON':
        if (window.LeadExporter && State.leads.length > 0) {
          const qSlug = (State.activeQuery || 'gmaps').replace(/[^a-zA-Z0-9]/g, '_');
          window.LeadExporter.downloadJson(State.leads, `leads_${qSlug}`);
        }
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
    return true;
  });

  console.log('[Maps Lead Scraper] Engine running (Popup-only UI mode).');
})();
