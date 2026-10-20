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

  // 2. Poll status from Content Script
  async function syncStatus() {
    if (!activeTab || !activeTab.id) return;

    try {
      chrome.tabs.sendMessage(activeTab.id, { type: 'GET_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res) {
          // Content script might not be injected yet
          labelActiveQuery.innerText = 'Buka pencarian di Maps...';
          return;
        }

        // Update UI
        const status = res.status || 'IDLE';
        badgeStatus.className = `badge-status ${status.toLowerCase()}`;
        badgeStatus.innerText = status;

        labelActiveQuery.innerText = res.activeQuery || 'Google Maps';

        const count = res.leadsCount || 0;
        const target = res.targetCount || parseInt(inputLimit.value, 10) || 20;
        statsCounter.innerText = `${count} / ${target}`;

        if (target > 0) {
          const pct = Math.min(100, Math.round((count / target) * 100));
          progressFill.style.width = `${pct}%`;
        }

        // Toggle action buttons
        if (status === 'SCANNING' || status === 'SCRAPING') {
          btnStart.style.display = 'none';
          btnPause.style.display = 'inline-flex';
          btnResume.style.display = 'none';
          btnStop.style.display = 'inline-flex';
          statusText.innerText = `Sedang mengambil data (${count}/${target})...`;
        } else if (status === 'PAUSED') {
          btnStart.style.display = 'none';
          btnPause.style.display = 'none';
          btnResume.style.display = 'inline-flex';
          btnStop.style.display = 'inline-flex';
          statusText.innerText = 'Proses dijeda sementara.';
        } else if (status === 'FINISHED') {
          btnStart.style.display = 'inline-flex';
          btnPause.style.display = 'none';
          btnResume.style.display = 'none';
          btnStop.style.display = 'none';
          statusText.innerText = `Selesai! ${count} kontak berhasil ditarik.`;
        } else {
          // IDLE / STOPPED
          btnStart.style.display = 'inline-flex';
          btnPause.style.display = 'none';
          btnResume.style.display = 'none';
          btnStop.style.display = 'none';
          if (status === 'STOPPED') {
            statusText.innerText = `Dihentikan. ${count} kontak tersimpan.`;
          } else {
            statusText.innerText = 'Siap memulai ekstraksi...';
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
  syncStatus();
  pollTimer = setInterval(syncStatus, 1000);

  // 3. Attach Actions
  btnStart.addEventListener('click', () => {
    const limit = parseInt(inputLimit.value, 10) || 20;
    const delayMs = parseInt(selectSpeed.value, 10) || 1200;
    chrome.tabs.sendMessage(activeTab.id, {
      type: 'START_SCRAPE',
      limit,
      delayMs
    }, () => syncStatus());
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
