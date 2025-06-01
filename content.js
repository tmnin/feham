// Selection-Based Urdu Translator Content Script
console.log('🚀 Selection-Based Urdu Translator loaded');

let isExtensionEnabled = true;
let currentTooltip = null;
let selectedText = '';

// Urdu Unicode range regex
const URDU_REGEX = /[\u0600-\u06FF]+/g;

// Initialize extension
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.sync.get(['extensionEnabled'], (result) => {
    isExtensionEnabled = result.extensionEnabled !== false;
    console.log('Extension enabled:', isExtensionEnabled);
    if (isExtensionEnabled) {
      setupEventListeners();
    }
  });
} else {
  console.log('Chrome storage not available, using default settings');
  isExtensionEnabled = true;
  setupEventListeners();
}

// Listen for extension toggle
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleExtension') {
      isExtensionEnabled = request.enabled;
      if (isExtensionEnabled) {
        setupEventListeners();
      } else {
        removeEventListeners();
        hideTooltip();
      }
    }
  });
}

function setupEventListeners() {
  console.log('Setting up selection event listeners...');
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('keyup', handleTextSelection);
  document.addEventListener('selectionchange', handleSelectionChange);
  document.addEventListener('keydown', handleKeyDown);
  console.log('Selection event listeners added');
}

function removeEventListeners() {
  console.log('Removing selection event listeners...');
  document.removeEventListener('mouseup', handleTextSelection);
  document.removeEventListener('keyup', handleTextSelection);
  document.removeEventListener('selectionchange', handleSelectionChange);
  document.removeEventListener('keydown', handleKeyDown);
}

function handleTextSelection(event) {
  if (!isExtensionEnabled) return;
  
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    console.log('📝 Text selected:', text);
    
    if (!text) {
      hideTooltip();
      return;
    }
    
    // Check if selected text contains Urdu
    const hasUrdu = /[\u0600-\u06FF]/.test(text);
    console.log('🔍 Contains Urdu:', hasUrdu);
    
    if (hasUrdu && text.length > 0) {
      selectedText = text;
      console.log('✅ URDU SELECTION DETECTED:', selectedText);
      
      // Get selection position for tooltip placement
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      showTooltip({
        clientX: rect.left + (rect.width / 2),
        clientY: rect.bottom + 10
      }, 'Loading translation...');
      
      translateText(selectedText);
    } else {
      hideTooltip();
    }
  }, 10); // Small delay to ensure selection is complete
}

function handleSelectionChange() {
  if (!isExtensionEnabled) return;
  
  const selection = window.getSelection();
  if (selection.toString().trim() === '') {
    hideTooltip();
  }
}

function handleKeyDown(event) {
  // Copy selected Urdu text with Ctrl+C or just 'C'
  if ((event.key === 'c' || (event.ctrlKey && event.key === 'c')) && selectedText && currentTooltip) {
    if (!event.ctrlKey) { // Only intercept standalone 'C', let Ctrl+C work normally
      event.preventDefault();
      copyToClipboard(selectedText);
      showCopyFeedback();
    }
  }
  
  // Hide tooltip on Escape
  if (event.key === 'Escape') {
    hideTooltip();
    window.getSelection().removeAllRanges();
  }
}

function showTooltip(position, text) {
  console.log('🎯 Creating selection tooltip');
  
  // Remove existing tooltip
  hideTooltip();
  
  // Create tooltip element
  currentTooltip = document.createElement('div');
  currentTooltip.id = 'urdu-selection-tooltip';
  
  // Apply inline styles for maximum visibility
  currentTooltip.style.cssText = `
    position: fixed !important;
    top: ${position.clientY}px !important;
    left: ${position.clientX}px !important;
    transform: translateX(-50%) !important;
    z-index: 2147483647 !important;
    background: #1a1a1a !important;
    color: white !important;
    border: 2px solid #fbbf24 !important;
    border-radius: 12px !important;
    padding: 16px !important;
    font-family: Arial, sans-serif !important;
    font-size: 14px !important;
    min-width: 250px !important;
    max-width: 400px !important;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
    pointer-events: auto !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    animation: slideInUp 0.2s ease-out !important;
  `;
  
  currentTooltip.innerHTML = `
    <div style="color: #fbbf24; font-weight: bold; margin-bottom: 10px; font-size: 16px; direction: rtl; text-align: right;">${selectedText}</div>
    <div style="color: #e5e7eb; margin-bottom: 10px; line-height: 1.4;" id="translation-text">${text}</div>
    <div style="color: #9ca3af; font-size: 12px; border-top: 1px solid #374151; padding-top: 8px; text-align: center;">
      Press 'C' to copy • ESC to close
    </div>
  `;
  
  // Add animation keyframes
  if (!document.getElementById('urdu-translator-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'urdu-translator-styles';
    styleSheet.textContent = `
      @keyframes slideInUp {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
    `;
    document.head.appendChild(styleSheet);
  }
  
  // Add to body
  document.body.appendChild(currentTooltip);
  console.log('✅ Selection tooltip added to DOM');
  
  // Adjust position if off-screen
  setTimeout(() => {
    const rect = currentTooltip.getBoundingClientRect();
    console.log('📏 Tooltip position:', rect);
    
    // Adjust horizontal position
    if (rect.left < 10) {
      currentTooltip.style.left = '10px';
      currentTooltip.style.transform = 'none';
    } else if (rect.right > window.innerWidth - 10) {
      currentTooltip.style.left = (window.innerWidth - rect.width - 10) + 'px';
      currentTooltip.style.transform = 'none';
    }
    
    // Adjust vertical position
    if (rect.bottom > window.innerHeight - 10) {
      currentTooltip.style.top = (position.clientY - rect.height - 20) + 'px';
    }
  }, 50);
}

function hideTooltip() {
  if (currentTooltip) {
    console.log('🗑️ Removing selection tooltip');
    currentTooltip.remove();
    currentTooltip = null;
    selectedText = '';
  }
}

function translateText(text) {
  console.log('🌐 Translating selected text:', text);
  
  if (!navigator.onLine) {
    updateTooltipTranslation('You are currently offline');
    return;
  }
  
  // Clean the text for translation (remove extra spaces, keep only Urdu parts if mixed)
  const cleanText = text.trim();
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ur&tl=en&dt=t&q=${encodeURIComponent(cleanText)}`;
  
  fetch(url)
    .then(response => {
      console.log('📡 Translation response status:', response.status);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('📝 Translation data:', data);
      try {
        let translation = '';
        if (data[0] && Array.isArray(data[0])) {
          // Combine all translation parts
          translation = data[0].map(item => item[0]).join('');
        }
        console.log('✅ Translation result:', translation);
        updateTooltipTranslation(translation || 'Translation not available');
      } catch (error) {
        console.error('❌ Translation parsing error:', error);
        updateTooltipTranslation('Translation parsing failed');
      }
    })
    .catch(error => {
      console.error('❌ Translation error:', error);
      updateTooltipTranslation('Translation failed - please try again');
    });
}

function updateTooltipTranslation(translation) {
  if (currentTooltip) {
    const translationElement = currentTooltip.querySelector('#translation-text');
    if (translationElement) {
      translationElement.textContent = translation;
      console.log('🔄 Tooltip updated with:', translation);
    }
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    console.log('📋 Copied to clipboard:', text);
  }).catch(err => {
    console.error('Failed to copy:', err);
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  });
}

function showCopyFeedback() {
  if (currentTooltip) {
    const footer = currentTooltip.querySelector('div:last-child');
    if (footer) {
      const originalText = footer.innerHTML;
      footer.innerHTML = '<span style="color: #4ade80;">✓ Copied to clipboard!</span>';
      setTimeout(() => {
        footer.innerHTML = originalText;
      }, 2000);
    }
  }
}

console.log('🎯 Selection-based translator ready! Select any Urdu text to translate.');