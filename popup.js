// Popup script for Urdu Translator
const toggleSwitch = document.getElementById('toggleSwitch');

// Load current state
chrome.storage.sync.get(['extensionEnabled'], (result) => {
  const isEnabled = result.extensionEnabled !== false;
  updateToggleState(isEnabled);
});

// Handle toggle click
toggleSwitch.addEventListener('click', () => {
  const isCurrentlyActive = toggleSwitch.classList.contains('active');
  const newState = !isCurrentlyActive;
  
  updateToggleState(newState);
  
  // Save state
  chrome.storage.sync.set({ extensionEnabled: newState });
  
  // Send message to content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'toggleExtension',
      enabled: newState
    });
  });
});

function updateToggleState(isEnabled) {
  if (isEnabled) {
    toggleSwitch.classList.add('active');
  } else {
    toggleSwitch.classList.remove('active');
  }
}