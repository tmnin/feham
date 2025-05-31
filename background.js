// Background script for Urdu Translator
chrome.runtime.onInstalled.addListener(() => {
  // Set default state
  chrome.storage.sync.set({ extensionEnabled: true });
});

// Handle extension icon click (optional)
chrome.action.onClicked.addListener((tab) => {
  // This will open the popup, but you could add additional logic here
  console.log('Extension icon clicked');
});