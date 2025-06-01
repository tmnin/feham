// Urdu Translator Content Script
console.log('Urdu Translator content script loaded');

let isExtensionEnabled = true;
let currentTooltip = null;
let hoveredWord = '';

// Urdu Unicode range regex - simplified and more inclusive
const URDU_REGEX = /[\u0600-\u06FF]+/g;

// Initialize extension
console.log('Initializing Urdu Translator...');

// Check if chrome.storage is available
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.sync.get(['extensionEnabled'], (result) => {
    console.log('Storage result:', result);
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

function setupEventListeners() {
  console.log('Setting up event listeners...');
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);
  document.addEventListener('keydown', handleKeyDown);
  console.log('Event listeners added');
}

function removeEventListeners() {
  console.log('Removing event listeners...');
  document.removeEventListener('mouseover', handleMouseOver);
  document.removeEventListener('mouseout', handleMouseOut);
  document.removeEventListener('keydown', handleKeyDown);
}

function handleMouseOver(event) {
  console.log('Mouse over detected, extension enabled:', isExtensionEnabled);
  if (!isExtensionEnabled) return;
  
  const element = event.target;
  const text = element.textContent || element.innerText;
  
  console.log('Element text:', text);
  
  if (!text) return;
  
  // Find Urdu words in the text
  const urduMatches = text.match(URDU_REGEX);
  console.log('Urdu matches found:', urduMatches);
  
  // Also test with a simple check
  const hasUrdu = /[\u0600-\u06FF]/.test(text);
  console.log('Simple Urdu check:', hasUrdu);
  
  if (!urduMatches && !hasUrdu) return;
  
  // Get the word under cursor (simplified approach)
  const word = getWordAtPosition(element, event);
  console.log('Word at position:', word);
  
  if (word) {
    hoveredWord = word.trim();
    console.log('Hovering over Urdu word:', hoveredWord);
    showTooltip(event, 'Loading...');
    translateWord(hoveredWord);
  } else if (hasUrdu) {
    // Fallback: if we detect Urdu but can't extract a specific word
    hoveredWord = text.trim().substring(0, 20);
    console.log('Using fallback word:', hoveredWord);
    showTooltip(event, 'Loading...');
    translateWord(hoveredWord);
  }
}

function handleMouseOut(event) {
  // Hide tooltip when mouse leaves the element
  setTimeout(() => {
    if (currentTooltip && !currentTooltip.matches(':hover')) {
      hideTooltip();
    }
  }, 100);
}

function handleKeyDown(event) {
  if (event.key === 'c' && hoveredWord && currentTooltip) {
    copyToClipboard(hoveredWord);
    showCopyFeedback();
  }
}

function getWordAtPosition(element, event) {
  // Simplified word extraction - gets the full text content
  const text = element.textContent || element.innerText;
  console.log('Getting word from text:', text);
  
  // Split by spaces and find Urdu words
  const words = text.split(/\s+/);
  console.log('Split words:', words);
  
  // Return the first Urdu word found (simplified)
  for (let word of words) {
    if (URDU_REGEX.test(word)) {
      console.log('Found Urdu word:', word);
      return word;
    }
  }
  
  // If no individual word found, check if entire text contains Urdu
  if (URDU_REGEX.test(text)) {
    console.log('Entire text contains Urdu, using first match');
    const matches = text.match(URDU_REGEX);
    return matches ? matches[0] : null;
  }
  
  return null;
}

function showTooltip(event, text) {
  console.log('Showing tooltip with text:', text);
  hideTooltip(); // Remove any existing tooltip
  
  currentTooltip = document.createElement('div');
  currentTooltip.className = 'urdu-translator-tooltip';
  currentTooltip.innerHTML = `
    <div class="tooltip-content">
      <div class="urdu-word">${hoveredWord}</div>
      <div class="english-translation">${text}</div>
      <div class="tooltip-footer">Press 'C' to copy Urdu word</div>
    </div>
  `;
  
  document.body.appendChild(currentTooltip);
  console.log('Tooltip added to DOM');
  
  // Position tooltip using fixed positioning
  currentTooltip.style.position = 'fixed';
  currentTooltip.style.left = (event.clientX + 10) + 'px';
  currentTooltip.style.top = (event.clientY + 10) + 'px';
  currentTooltip.style.zIndex = '999999';
  
  console.log('Tooltip positioned at:', event.clientX + 10, event.clientY + 10);
  
  // Adjust if tooltip goes off screen
  setTimeout(() => {
    const tooltipRect = currentTooltip.getBoundingClientRect();
    console.log('Tooltip dimensions:', tooltipRect);
    
    if (tooltipRect.right > window.innerWidth) {
      currentTooltip.style.left = (window.innerWidth - tooltipRect.width - 10) + 'px';
      console.log('Adjusted tooltip left position');
    }
    if (tooltipRect.bottom > window.innerHeight) {
      currentTooltip.style.top = (event.clientY - tooltipRect.height - 10) + 'px';
      console.log('Adjusted tooltip top position');
    }
  }, 10);
}

function hideTooltip() {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }
}

function translateWord(word) {
  console.log('Translating word:', word);
  console.log('Online status:', navigator.onLine);
  
  if (!navigator.onLine) {
    if (currentTooltip) {
      const translationElement = currentTooltip.querySelector('.english-translation');
      if (translationElement) {
        translationElement.textContent = 'You are currently offline';
      }
    }
    return;
  }
  
  // Try the direct API first
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ur&tl=en&dt=t&q=${encodeURIComponent(word)}`;
  console.log('Translation URL:', url);
  
  fetch(url)
    .then(response => {
      console.log('Translation response status:', response.status);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Translation data:', data);
      try {
        const translation = data[0][0][0];
        console.log('Extracted translation:', translation);
        if (currentTooltip) {
          const translationElement = currentTooltip.querySelector('.english-translation');
          if (translationElement) {
            translationElement.textContent = translation;
          }
        }
      } catch (error) {
        console.error('Translation parsing error:', error);
        fallbackTranslation(word);
      }
    })
    .catch(error => {
      console.error('Translation error:', error);
      fallbackTranslation(word);
    });
}

function fallbackTranslation(word) {
  console.log('Using fallback translation for:', word);
  // Send to background script for translation
  chrome.runtime.sendMessage({
    action: 'translate',
    word: word,
    from: 'ur',
    to: 'en'
  }, (response) => {
    if (response && response.translation && currentTooltip) {
      const translationElement = currentTooltip.querySelector('.english-translation');
      if (translationElement) {
        translationElement.textContent = response.translation;
      }
    } else if (currentTooltip) {
      const translationElement = currentTooltip.querySelector('.english-translation');
      if (translationElement) {
        translationElement.textContent = 'Translation failed - try a different word';
      }
    }
  });
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    console.log('Copied to clipboard:', text);
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
}

function showCopyFeedback() {
  if (currentTooltip) {
    const footer = currentTooltip.querySelector('.tooltip-footer');
    if (footer) {
      const originalText = footer.textContent;
      footer.textContent = 'Copied!';
      footer.style.color = '#4ade80';
      setTimeout(() => {
        footer.textContent = originalText;
        footer.style.color = '';
      }, 1000);
    }
  }
}