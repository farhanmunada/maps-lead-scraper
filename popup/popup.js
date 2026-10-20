/**
 * Maps Lead Scraper - Popup Script
 * Communicates with content script on active Google Maps tab.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const badgeStatus = document.getElementById('badge-status');
  const noticeNotMaps = document.getElementById('notice-not-maps');
  const sectionControls = document.getElementById('section-controls');
  const btnOpenMaps = document.getElementById('btn-open-maps');
  const labelActiveQuery = document.getElementById('label-active-query');
  const inputQuery = document.getElementById('popup-input-query');
  const btnSearch = document.getElementById('popup-btn-search');

  const inputLimit = document.getElementById('popup-input-limit');
  const selectSpeed = document.getElementById('popup-select-speed');

  const statsCounter = document.getElementById('popup-stats-counter');
  const progressFill = document.getElementById('popup-progress-fill');
  const statusText = document.getElementById('popup-status-text');

  const btnStart = document.getElementById('popup-btn-start');
  const btnPause = document.getElementById('popup-btn-pause');
  const btnResume = document.getElementById('popup-btn-resume');
  const btnStop = document.getElementById('popup-btn-stop');

  const btnCsv = document.getElementById('popup-btn-csv');
  const btnJson = document.getElementById('popup-btn-json');

  let activeTab = null;
  let pollTimer = null;

  // 1. Get active tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs && tabs[0] ? tabs[0] : null;
  } catch (err) {
    console.warn('[Popup] Could not query tabs:', err);
  }

  const isMapsTab = activeTab && activeTab.url && activeTab.url.includes('google.com/maps');

  if (!isMapsTab) {
    noticeNotMaps.style.display = 'flex';
    sectionControls.style.display = 'none';
    badgeStatus.className = 'badge-status idle';
    badgeStatus.innerText = 'OFFLINE';

    btnOpenMaps.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://www.google.com/maps' });
    });
    return;
  }

  // Active Maps tab detected
  noticeNotMaps.style.display = 'none';
  sectionControls.style.display = 'flex';

  // Helper to ensure content script is injected on active tab
  async function ensureContentScript() {
    if (!activeTab || !activeTab.id) return false;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['lib/parser.js', 'lib/exporter.js', 'content/content.js']
      });
      return true;
    } catch (e) {
      console.warn('[Popup] Injection check:', e);
      return false;
    }
  }

  // Helper to navigate tab to a search query on Google Maps
  function navigateAndSearch(query) {
    return new Promise((resolve) => {
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      chrome.tabs.update(activeTab.id, { url: searchUrl }, () => {
        const listener = (tabId, info) => {
          if (tabId === activeTab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            // Give Maps 2 seconds to hydrate search DOM
            setTimeout(resolve, 2000);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    });
  }

  // 2. Poll status from Content Script
  async function syncStatus() {
    if (!activeTab || !activeTab.id) return;

    try {
      chrome.tabs.sendMessage(activeTab.id, { type: 'GET_STATUS' }, async (res) => {
        if (chrome.runtime.lastError || !res) {
          // Attempt auto-inject if content script not responding
          await ensureContentScript();
          labelActiveQuery.innerText = 'Buka & cari lokasi di Maps...';
          return;
        }

        // Update UI
        const status = res.status || 'IDLE';
        badgeStatus.className = `badge-status ${status.toLowerCase()}`;
        badgeStatus.innerText = status;

        const q = res.activeQuery || 'Google Maps';
        labelActiveQuery.innerText = q;
        if (inputQuery && !inputQuery.value && document.activeElement !== inputQuery && q !== 'maps_leads' && q !== 'Google Maps') {
          inputQuery.value = q;
        }

        const count = res.leadsCount || 0;
        const target = res.targetCount || parseInt(inputLimit.value, 10) || 20;
        statsCounter.innerText = `${count} / ${target}`;

        if (target > 0) {
          const pct = Math.min(100, Math.round((count / target) * 100));
          progressFill.style.width = `${pct}%`;
        }

        // Toggle action buttons & status message
        if (status === 'SCANNING' || status === 'SCRAPING') {
          btnStart.style.display = 'none';
          btnPause.style.display = 'inline-flex';
          btnResume.style.display = 'none';
          btnStop.style.display = 'inline-flex';
          statusText.style.color = '';
          statusText.innerText = res.statusMessage || `Sedang mengambil data (${count}/${target})...`;
        } else if (status === 'PAUSED') {
          btnStart.style.display = 'none';
          btnPause.style.display = 'none';
          btnResume.style.display = 'inline-flex';
          btnStop.style.display = 'inline-flex';
          statusText.style.color = '';
          statusText.innerText = res.statusMessage || 'Proses dijeda sementara.';
        } else if (status === 'FINISHED') {
          btnStart.style.display = 'inline-flex';
          btnPause.style.display = 'none';
          btnResume.style.display = 'none';
          btnStop.style.display = 'none';
          statusText.style.color = '#10b981';
          statusText.innerText = res.statusMessage || `Selesai! ${count} kontak berhasil ditarik.`;
        } else if (status === 'ERROR') {
          btnStart.style.display = 'inline-flex';
          btnPause.style.display = 'none';
          btnResume.style.display = 'none';
          btnStop.style.display = 'none';
          statusText.style.color = '#ef4444';
          statusText.innerText = res.errorMessage || res.statusMessage || 'Terjadi kesalahan.';
        } else {
          // IDLE / STOPPED
          btnStart.style.display = 'inline-flex';
          btnPause.style.display = 'none';
          btnResume.style.display = 'none';
          btnStop.style.display = 'none';
          statusText.style.color = '';
          if (status === 'STOPPED') {
            statusText.innerText = res.statusMessage || `Dihentikan. ${count} kontak tersimpan.`;
          } else {
            statusText.innerText = res.statusMessage || 'Siap memulai ekstraksi...';
          }
        }

        const hasLeads = count > 0;
        btnCsv.disabled = !hasLeads;
        btnJson.disabled = !hasLeads;
      });
    } catch (e) {
      console.warn('[Popup] Sync error:', e);
    }
  }

  // Initial sync & interval
  await ensureContentScript();
  syncStatus();
  pollTimer = setInterval(syncStatus, 1000);

  // 3. Attach Actions
  if (btnSearch) {
    btnSearch.addEventListener('click', async () => {
      const q = inputQuery ? inputQuery.value.trim() : '';
      if (!q) {
        statusText.style.color = '#ef4444';
        statusText.innerText = 'Ketik kata kunci pencarian terlebih dahulu.';
        return;
      }
      statusText.style.color = '';
      statusText.innerText = `Membuka pencarian "${q}" di Google Maps...`;
      await navigateAndSearch(q);
      await ensureContentScript();
      syncStatus();
    });
  }

  btnStart.addEventListener('click', async () => {
    const limit = parseInt(inputLimit.value, 10) || 20;
    const delayMs = parseInt(selectSpeed.value, 10) || 1200;
    const q = inputQuery ? inputQuery.value.trim() : '';

    // Verify if tab is on search results
    let currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    let curTab = currentTabs && currentTabs[0] ? currentTabs[0] : activeTab;
    const isSearchPage = curTab && curTab.url && (curTab.url.includes('/maps/search/') || curTab.url.includes('/maps/place/'));

    if (!isSearchPage) {
      if (q) {
        badgeStatus.className = 'badge-status scanning';
        badgeStatus.innerText = 'SEARCHING';
        statusText.style.color = '';
        statusText.innerText = `Membuka pencarian "${q}" di Google Maps...`;
        await navigateAndSearch(q);
      } else {
        badgeStatus.className = 'badge-status idle';
        badgeStatus.innerText = 'IDLE';
        statusText.style.color = '#f59e0b';
        statusText.innerText = 'Belum ada pencarian. Ketik kata kunci bisnis di atas (misal: cafe tebet) lalu klik Mulai.';
        return;
      }
    }

    badgeStatus.className = 'badge-status scanning';
    badgeStatus.innerText = 'STARTING';
    statusText.style.color = '';
    statusText.innerText = 'Menghubungkan ke tab Google Maps...';

    await ensureContentScript();

    chrome.tabs.sendMessage(activeTab.id, {
      type: 'START_SCRAPE',
      limit,
      delayMs
    }, (res) => {
      if (chrome.runtime.lastError) {
        badgeStatus.className = 'badge-status error';
        badgeStatus.innerText = 'ERROR';
        statusText.style.color = '#ef4444';
        statusText.innerText = 'Gagal menghubungi tab Maps. Refresh tab Google Maps sekali, lalu coba lagi.';
        return;
      }
      syncStatus();
    });
  });

  btnPause.addEventListener('click', () => {
    chrome.tabs.sendMessage(activeTab.id, { type: 'PAUSE_SCRAPE' }, () => syncStatus());
  });

  btnResume.addEventListener('click', () => {
    chrome.tabs.sendMessage(activeTab.id, { type: 'RESUME_SCRAPE' }, () => syncStatus());
  });

  btnStop.addEventListener('click', () => {
    chrome.tabs.sendMessage(activeTab.id, { type: 'STOP_SCRAPE' }, () => syncStatus());
  });

  btnCsv.addEventListener('click', () => {
    chrome.tabs.sendMessage(activeTab.id, { type: 'EXPORT_CSV' });
  });

  btnJson.addEventListener('click', () => {
    chrome.tabs.sendMessage(activeTab.id, { type: 'EXPORT_JSON' });
  });
});
