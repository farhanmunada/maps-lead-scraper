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
   * Helper to click an element with full synthetic event sequence.
   * @param {HTMLElement} el
   */
  function simulateClick(el) {
    if (!el) return;
    try {
      el.focus();
      const pointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
      const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      const pointerUp = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
      const mouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });

      el.dispatchEvent(pointerDown);
      el.dispatchEvent(mouseDown);
      el.click();
      el.dispatchEvent(pointerUp);
      el.dispatchEvent(mouseUp);
    } catch (e) {
      el.click();
    }
  }

  /**
   * Helper to click back button in Google Maps place detail pane.
   */
  async function returnToFeed() {
    const backBtn = document.querySelector(
      'button[aria-label*="Kembali" i], button[aria-label*="Back" i], button[data-tooltip*="Kembali" i], button[data-tooltip*="Back" i], button[jsaction*="pane.rating.back"], button[jsaction*="pane.place.back"], button.hArJGc'
    );
    if (backBtn) {
      simulateClick(backBtn);
      await sleep(500);
    } else {
      window.history.back();
      await sleep(600);
    }
  }

  /**
   * Main Scraping Engine
   * Iterates through Google Maps search feed one-by-one in real-time,
   * extracting card info and detail pane with automatic fallbacks.
   */
  async function startScraping(target = 20, delayMs = 1200) {
    if (State.status === 'SCANNING' || State.status === 'SCRAPING') return;

    State.targetCount = target;
    State.delayMs = delayMs;
    State.isPaused = false;
    State.isStopped = false;
    State.leads = [];
    State.currentIndex = 0;
    State.activeQuery = getSearchQuery();

    updateStatus('SCANNING', 'Mencari daftar bisnis di Google Maps...');

    // Wait up to 8 seconds for search feed or single place to render
    let anchors = [];
    for (let wait = 0; wait < 16; wait++) {
      anchors = Array.from(document.querySelectorAll('a.hfpxzc, div.Nv2PK a[href*="/maps/place/"]'));
      if (anchors.length > 0 || window.location.href.includes('/maps/place/')) break;
      await sleep(500);
    }

    // 1. Single place view fallback
    if (anchors.length === 0 && window.location.href.includes('/maps/place/')) {
      updateStatus('SCRAPING', 'Mengekstrak tempat tunggal...');
      await sleep(delayMs);
      const singleLead = window.MapsParser ? window.MapsParser.extractDetailPane() : null;
      if (singleLead && singleLead.title) {
        State.leads.push(singleLead);
        updateStatus('FINISHED', 'Selesai! 1 kontak tempat berhasil diambil.');
      } else {
        updateStatus('ERROR', 'Gagal membaca detail tempat tunggal.');
      }
      return;
    }

    if (anchors.length === 0) {
      updateStatus('ERROR', 'Daftar pencarian belum terbuka. Cari lokasi/usaha di Maps atau ketik di popup lalu coba lagi.');
      return;
    }

    const feed = findFeedElement();
    const processedHrefs = new Set();
    let consecutiveEmptyScrolls = 0;

    updateStatus('SCRAPING', `Mulai ekstraksi kontak (0/${target})...`);

    while (!State.isStopped && (target <= 0 || State.leads.length < target)) {
      if (State.isPaused) {
        updateStatus('PAUSED', 'Proses dijeda sementara.');
        await sleep(500);
        continue;
      }

      // Find all business cards currently in DOM
      const cardNodes = Array.from(document.querySelectorAll('div.Nv2PK'));
      let processedInThisBatch = 0;

      for (const card of cardNodes) {
        if (State.isStopped) break;
        while (State.isPaused && !State.isStopped) {
          updateStatus('PAUSED', 'Proses dijeda sementara.');
          await sleep(500);
        }
        if (State.isStopped) break;
        if (target > 0 && State.leads.length >= target) break;

        const anchor = card.querySelector('a.hfpxzc') || card.querySelector('a[href*="/maps/place/"]');
        const href = anchor ? anchor.getAttribute('href') : '';

        // Extract fallback card data first
        const cardLead = window.MapsParser ? window.MapsParser.extractFromCard(card) : null;
        const candidateTitle = (cardLead && cardLead.title) ? cardLead.title : (anchor ? anchor.getAttribute('aria-label') : '');

        if (!candidateTitle || candidateTitle === 'Hasil' || candidateTitle === 'Results') {
          continue;
        }

        // Deduplicate using href or title
        const dedupeKey = href || candidateTitle;
        if (processedHrefs.has(dedupeKey)) {
          continue;
        }
        processedHrefs.add(dedupeKey);
        processedInThisBatch++;

        const currentLeadNum = State.leads.length + 1;
        State.currentIndex = currentLeadNum;
        updateStatus('SCRAPING', `[${currentLeadNum}/${target}] Mengekstrak: ${candidateTitle}`);

        // Scroll card into view
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(250);

        // Click card to open detail pane
        const clickTarget = anchor || card.querySelector('div.qBF1Pd') || card;
        simulateClick(clickTarget);

        // Wait up to max 2.5s for detail pane to open
        let detailOpened = false;
        const maxPolls = Math.max(5, Math.min(12, Math.round(State.delayMs / 180)));
        for (let p = 0; p < maxPolls; p++) {
          if (window.MapsParser && window.MapsParser.isDetailPaneOpen()) {
            detailOpened = true;
            break;
          }
          await sleep(200);
        }

        let extractedLead = null;
        if (detailOpened && window.MapsParser) {
          extractedLead = window.MapsParser.extractDetailPane();
        }

        // If detail pane opened successfully
        if (extractedLead && extractedLead.title && extractedLead.title !== 'Hasil') {
          // Merge missing card info if detail pane had empty fields
          if (cardLead) {
            if (!extractedLead.phone && cardLead.phone) {
              extractedLead.phone = cardLead.phone;
              extractedLead.whatsappUrl = cardLead.whatsappUrl;
            }
            if (!extractedLead.category && cardLead.category) {
              extractedLead.category = cardLead.category;
            }
            if (!extractedLead.latitude && cardLead.latitude) {
              extractedLead.latitude = cardLead.latitude;
              extractedLead.longitude = cardLead.longitude;
            }
            if (!extractedLead.rating && cardLead.rating) {
              extractedLead.rating = cardLead.rating;
            }
          }
          State.leads.push(extractedLead);

          // Close detail pane and return to feed
          await returnToFeed();
        } else if (cardLead && cardLead.title && cardLead.title !== 'Hasil') {
          // Fallback to card data if detail pane didn't open or timed out
          State.leads.push(cardLead);
        }

        await sleep(200);
      }

      // If we haven't reached the target, scroll down the feed to load more cards
      if (target <= 0 || State.leads.length < target) {
        if (feed) {
          const prevScroll = feed.scrollTop;
          feed.scrollTop += 700;
          await sleep(800);
          if (feed.scrollTop === prevScroll && processedInThisBatch === 0) {
            consecutiveEmptyScrolls++;
            if (consecutiveEmptyScrolls >= 3) {
              break; // End of list reached
            }
          } else {
            consecutiveEmptyScrolls = 0;
          }
        } else {
          window.scrollBy(0, 700);
          await sleep(800);
        }

        // Check if end of list banner is visible
        const pageText = document.body.innerText || '';
        if (
          pageText.includes("You've reached the end of the list") ||
          pageText.includes('Anda telah mencapai bagian akhir daftar')
        ) {
          break;
        }
      }
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
