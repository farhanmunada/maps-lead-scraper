/**
 * Maps Lead Scraper - Content Script
 * Automates scrolling and extraction on Google Maps web interface.
 */

(function () {
  // Prevent duplicate injection
  if (window.__MLS_LOADED__) return;
  window.__MLS_LOADED__ = true;

  const State = {
    status: 'IDLE', // IDLE, SCANNING, SCRAPING, PAUSED, FINISHED, STOPPED
    leads: [],
    targetCount: 20,
    delayMs: 1200,
    currentIndex: 0,
    collectedItems: [],
    isPaused: false,
    isStopped: false,
    activeQuery: ''
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Finds the Google Maps search results feed element.
   * @returns {HTMLElement|null}
   */
  function getFeedElement() {
    return (
      document.querySelector('div[role="feed"]') ||
      document.querySelector('div[aria-label*="Results for"]') ||
      document.querySelector('div[aria-label*="Hasil untuk"]') ||
      document.querySelector('div.m6QErb.DxyBCb.kA9KIf.dS8AEf')
    );
  }

  /**
   * Detects active search query from input or title.
   * @returns {string}
   */
  function getSearchQuery() {
    const input = document.querySelector('input#searchboxinput');
    if (input && input.value) return input.value.trim();
    const title = document.title;
    if (title && title.includes('Google Maps')) {
      return title.replace('- Google Maps', '').trim();
    }
    return 'maps_leads';
  }

  /**
   * Phase 1: Scrolls the feed until target count is reached or feed ends.
   * @param {number} target
   */
  async function scrollAndCollectItems(target) {
    updateStatus('SCANNING', 'Mengumpulkan daftar bisnis...');

    const feed = getFeedElement();
    if (!feed) {
      throw new Error('Daftar pencarian Google Maps tidak ditemukan. Pastikan Anda sudah mencari lokasi di Maps.');
    }

    const seenUrls = new Set();
    const items = [];
    let noChangeCount = 0;
    let lastHeight = 0;

    while (!State.isStopped) {
      if (State.isPaused) {
        await sleep(500);
        continue;
      }

      // Collect all anchor elements matching place items
      const anchors = feed.querySelectorAll('a.hfpxzc, a[href*="/maps/place/"]');
      for (const a of anchors) {
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

      updateWidgetStats(items.length, target, `Ditemukan ${items.length} lokasi...`);

      // Check if target reached (0 means unlimited)
      if (target > 0 && items.length >= target) {
        break;
      }

      // Scroll to bottom of feed
      feed.scrollTop = feed.scrollHeight;
      await sleep(1000);

      // Check if reached bottom of list
      const endOfList =
        feed.innerText.includes('You\'ve reached the end of the list') ||
        feed.innerText.includes('Anda telah mencapai bagian akhir daftar');

      if (endOfList) {
        break;
      }

      if (feed.scrollHeight === lastHeight) {
        noChangeCount++;
        if (noChangeCount >= 3) break; // Reached end of scroll
      } else {
        noChangeCount = 0;
      }
      lastHeight = feed.scrollHeight;
    }

    return target > 0 ? items.slice(0, target) : items;
  }

  /**
   * Phase 2: Visits each item and extracts full contact details.
   * @param {Array<Object>} items
   */
  async function scrapeDetails(items) {
    updateStatus('SCRAPING', `Mengekstrak kontak (0/${items.length})...`);
    State.leads = [];
    State.currentIndex = 0;

    for (let i = 0; i < items.length; i++) {
      if (State.isStopped) break;

      while (State.isPaused && !State.isStopped) {
        updateStatus('PAUSED', 'Proses dijeda...');
        await sleep(500);
      }
      if (State.isStopped) break;

      const item = items[i];
      State.currentIndex = i + 1;
      updateWidgetStats(
        State.currentIndex,
        items.length,
        `[${i + 1}/${items.length}] ${item.title}`
      );

      try {
        // Scroll item into view and click
        if (item.anchor && item.anchor.isConnected) {
          item.anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
          item.anchor.click();
        } else {
          // Re-find anchor if re-rendered
          const freshAnchor = document.querySelector(`a[href="${CSS.escape(item.href)}"]`);
          if (freshAnchor) {
            freshAnchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
            freshAnchor.click();
          }
        }

        // Wait for detail pane to load
        await sleep(State.delayMs);

        // Parse detail pane using MapsParser
        const lead = window.MapsParser
          ? window.MapsParser.extractDetailPane()
          : null;

        if (lead && (lead.title || item.title)) {
          // Fallback title or url if detail pane title is empty
          if (!lead.title) lead.title = item.title;
          if (!lead.mapsUrl) lead.mapsUrl = item.href;

          // Avoid duplicate leads
          const exists = State.leads.some(
            (l) => (l.title === lead.title && l.phone === lead.phone) || (l.mapsUrl && l.mapsUrl === lead.mapsUrl)
          );
          if (!exists) {
            State.leads.push(lead);
          }
        }
      } catch (err) {
        console.warn('[Maps Scraper] Error scraping item:', item.title, err);
      }

      // Safe pacing between requests
      await sleep(400);
    }

    if (!State.isStopped) {
      updateStatus('FINISHED', `Selesai! ${State.leads.length} kontak berhasil diambil.`);
    } else {
      updateStatus('STOPPED', `Dihentikan. ${State.leads.length} kontak terkumpul.`);
    }

    // Save to local storage for persistence
    try {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ lastLeads: State.leads, lastQuery: State.activeQuery });
      }
    } catch (e) {}
  }

  /**
   * Main Start Controller.
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
        updateStatus('IDLE', 'Tidak ada data ditemukan. Lakukan pencarian terlebih dahulu di Maps.');
        return;
      }
      await scrapeDetails(items);
    } catch (err) {
      console.error('[Maps Scraper] Error:', err);
      updateStatus('IDLE', err.message || 'Terjadi kesalahan');
    }
  }

  function pauseScraping() {
    State.isPaused = true;
    updateStatus('PAUSED', 'Proses dijeda...');
  }

  function resumeScraping() {
    State.isPaused = false;
    updateStatus('SCRAPING', 'Melanjutkan proses...');
  }

  function stopScraping() {
    State.isStopped = true;
    State.isPaused = false;
    updateStatus('STOPPED', `Dihentikan. ${State.leads.length} data tersimpan.`);
  }

  // --- FLOATING WIDGET UI INJECTION ---

  function createFloatingWidget() {
    if (document.getElementById('mls-floating-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'mls-floating-widget';
    widget.innerHTML = `
      <!-- Mini Toggle Button -->
      <div id="mls-min-btn" class="mls-toggle-btn" title="Buka Maps Lead Scraper">
        <svg class="mls-toggle-icon" viewBox="0 0 24 24">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/>
        </svg>
        <span>Lead Scraper</span>
      </div>

      <!-- Expanded Panel -->
      <div id="mls-panel" class="mls-panel" style="display: none;">
        <div class="mls-panel-header">
          <div class="mls-panel-title">
            <svg style="width:16px;height:16px;fill:#10b981;" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/>
            </svg>
            <span>Lead Scraper</span>
          </div>
          <span id="mls-badge-status" class="mls-badge-status idle">IDLE</span>
          <button id="mls-btn-close" class="mls-close-btn" title="Kecilkan">✕</button>
        </div>

        <div class="mls-panel-body">
          <div class="mls-form-row">
            <label class="mls-label" for="mls-input-limit">Batas Target:</label>
            <input type="number" id="mls-input-limit" class="mls-input-number" value="20" min="1" max="500" />
          </div>

          <div class="mls-form-row">
            <label class="mls-label" for="mls-select-speed">Kecepatan Jeda:</label>
            <select id="mls-select-speed" class="mls-select">
              <option value="600">Cepat (0.6s)</option>
              <option value="1200" selected>Normal (1.2s)</option>
              <option value="2000">Aman (2.0s)</option>
            </select>
          </div>

          <!-- Stats Container -->
          <div class="mls-stats-container">
            <div class="mls-stats-row">
              <span class="mls-label">Total Terkumpul:</span>
              <span id="mls-stats-count" class="mls-stats-val">0 / 20</span>
            </div>
            <div class="mls-progress-bg">
              <div id="mls-progress-fill" class="mls-progress-fill"></div>
            </div>
            <div id="mls-current-item" class="mls-current-item">Siap mengekstrak data pencarian...</div>
          </div>

          <!-- Action Buttons -->
          <div class="mls-btn-group">
            <button id="mls-btn-start" class="mls-btn mls-btn-primary">▶ Mulai</button>
            <button id="mls-btn-pause" class="mls-btn mls-btn-secondary" style="display:none;">⏸ Jeda</button>
            <button id="mls-btn-resume" class="mls-btn mls-btn-primary" style="display:none;">▶ Lanjut</button>
            <button id="mls-btn-stop" class="mls-btn mls-btn-danger" style="display:none;">⏹ Berhenti</button>
          </div>

          <!-- Export Buttons -->
          <div class="mls-export-group">
            <button id="mls-btn-export-csv" class="mls-btn-export" disabled>
              📊 Download CSV
            </button>
            <button id="mls-btn-export-json" class="mls-btn-export" disabled>
              { } JSON
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(widget);
    attachWidgetEvents();
  }

  function attachWidgetEvents() {
    const minBtn = document.getElementById('mls-min-btn');
    const panel = document.getElementById('mls-panel');
    const closeBtn = document.getElementById('mls-btn-close');

    const startBtn = document.getElementById('mls-btn-start');
    const pauseBtn = document.getElementById('mls-btn-pause');
    const resumeBtn = document.getElementById('mls-btn-resume');
    const stopBtn = document.getElementById('mls-btn-stop');

    const exportCsvBtn = document.getElementById('mls-btn-export-csv');
    const exportJsonBtn = document.getElementById('mls-btn-export-json');

    const inputLimit = document.getElementById('mls-input-limit');
    const selectSpeed = document.getElementById('mls-select-speed');

    minBtn.addEventListener('click', () => {
      minBtn.style.display = 'none';
      panel.style.display = 'flex';
    });

    closeBtn.addEventListener('click', () => {
      panel.style.display = 'none';
      minBtn.style.display = 'flex';
    });

    startBtn.addEventListener('click', () => {
      const limit = parseInt(inputLimit.value, 10) || 20;
      const speed = parseInt(selectSpeed.value, 10) || 1200;
      startScraping(limit, speed);
    });

    pauseBtn.addEventListener('click', () => {
      pauseScraping();
    });

    resumeBtn.addEventListener('click', () => {
      resumeScraping();
    });

    stopBtn.addEventListener('click', () => {
      stopScraping();
    });

    exportCsvBtn.addEventListener('click', () => {
      if (window.LeadExporter && State.leads.length > 0) {
        const querySlug = (State.activeQuery || 'gmaps').replace(/[^a-zA-Z0-9]/g, '_');
        window.LeadExporter.downloadCsv(State.leads, `leads_${querySlug}`);
      }
    });

    exportJsonBtn.addEventListener('click', () => {
      if (window.LeadExporter && State.leads.length > 0) {
        const querySlug = (State.activeQuery || 'gmaps').replace(/[^a-zA-Z0-9]/g, '_');
        window.LeadExporter.downloadJson(State.leads, `leads_${querySlug}`);
      }
    });
  }

  function updateStatus(status, message) {
    State.status = status;

    const badge = document.getElementById('mls-badge-status');
    const currentItem = document.getElementById('mls-current-item');
    const startBtn = document.getElementById('mls-btn-start');
    const pauseBtn = document.getElementById('mls-btn-pause');
    const resumeBtn = document.getElementById('mls-btn-resume');
    const stopBtn = document.getElementById('mls-btn-stop');
    const exportCsvBtn = document.getElementById('mls-btn-export-csv');
    const exportJsonBtn = document.getElementById('mls-btn-export-json');

    if (badge) {
      badge.className = `mls-badge-status ${status.toLowerCase()}`;
      badge.innerText = status;
    }

    if (currentItem && message) {
      currentItem.innerText = message;
    }

    if (startBtn && pauseBtn && resumeBtn && stopBtn) {
      if (status === 'SCANNING' || status === 'SCRAPING') {
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-flex';
        resumeBtn.style.display = 'none';
        stopBtn.style.display = 'inline-flex';
      } else if (status === 'PAUSED') {
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'inline-flex';
        stopBtn.style.display = 'inline-flex';
      } else {
        // IDLE, FINISHED, STOPPED
        startBtn.style.display = 'inline-flex';
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'none';
        stopBtn.style.display = 'none';
      }
    }

    const hasData = State.leads.length > 0;
    if (exportCsvBtn) exportCsvBtn.disabled = !hasData;
    if (exportJsonBtn) exportJsonBtn.disabled = !hasData;
  }

  function updateWidgetStats(current, total, detail) {
    const statsCount = document.getElementById('mls-stats-count');
    const progressFill = document.getElementById('mls-progress-fill');
    const currentItem = document.getElementById('mls-current-item');

    if (statsCount) {
      statsCount.innerText = `${current} / ${total}`;
    }

    if (progressFill && total > 0) {
      const pct = Math.min(100, Math.round((current / total) * 100));
      progressFill.style.width = `${pct}%`;
    }

    if (currentItem && detail) {
      currentItem.innerText = detail;
    }
  }

  // --- RUNTIME MESSAGE DISPATCHER (for Toolbar Popup) ---

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'GET_STATUS':
        sendResponse({
          status: State.status,
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

  // Inject UI once DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createFloatingWidget);
  } else {
    createFloatingWidget();
  }

  console.log('[Maps Lead Scraper] Extension content engine loaded.');
})();
