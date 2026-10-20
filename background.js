/**
 * Maps Lead Scraper - Background Service Worker (Manifest V3)
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Maps Lead Scraper] Extension installed successfully.');
});

// Listener for external helper messages if needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'PONG' });
  }
  return true;
});
