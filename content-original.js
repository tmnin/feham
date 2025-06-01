// Urdu Translator Content Script
let isExtensionEnabled = true;
let currentTooltip = null;
let hoveredWord = '';

// Urdu Unicode range regex
const URDU_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g;

// Initialize extension
chrome.storage.sync.get(['extensionEnabled'], (result) => {
  isExtensionEnabled = result.extensionEnabled !== false;
  if (isExtensionEnabled) {
    setupEventListeners();
  }
});

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
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);
  document.addEventListener('keydown', handleKeyDown);
}

function removeEventListeners() {
  document.removeEventListener('mouseover', handleMouseOver);
  document.removeEventListener('mouseout', handleMouseOut);
  document.removeEventListener('keydown', handleKeyDown);
}

function handleMouseOver(event) {
  if (!isExtensionEnabled) return;
  
  const element = event.target;
  const text = element.textContent || element.innerText;
  
  if (!text) return;
  
  // Find Urdu words in the text
  const urduMatches = text.match(URDU_REGEX);
  if (!urduMatches) return;
  
  // Get the word under cursor (simplified approach)
  const word = getWordAtPosition(element, event);
  if (word && URDU_REGEX.test(word)) {
    hoveredWord = word.trim();
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
  // For more precise word selection, you'd need more complex text analysis
  const text = element.textContent || element.innerText;
  const words = text.split(/\s+/);
  
  // Return the first Urdu word found (simplified)
  for (let word of words) {
    if (URDU_REGEX.test(word)) {
      return word;
    }
  }
  return null;
}

function showTooltip(event, text) {
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
  
  // Position tooltip
  const rect = event.target.getBoundingClientRect();
  currentTooltip.style.left = (rect.left + window.scrollX) + 'px';
  currentTooltip.style.top = (rect.bottom + window.scrollY + 5) + 'px';
  
  // Adjust if tooltip goes off screen
  const tooltipRect = currentTooltip.getBoundingClientRect();
  if (tooltipRect.right > window.innerWidth) {
    currentTooltip.style.left = (window.innerWidth - tooltipRect.width - 10) + 'px';
  }
  if (tooltipRect.bottom > window.innerHeight) {
    currentTooltip.style.top = (rect.top + window.scrollY - tooltipRect.height - 5) + 'px';
  }
}

function hideTooltip() {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }
}

function translateWord(word) {
  if (!navigator.onLine) {
    showTooltip(event, 'You are currently offline');
    return;
  }
  
  // Using Google Translate's free API endpoint
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ur&tl=en&dt=t&q=${encodeURIComponent(word)}`;
  
  fetch(url)
    .then(response => response.json())
    .then(data => {
      try {
        const translation = data[0][0][0];
        if (currentTooltip) {
          const translationElement = currentTooltip.querySelector('.english-translation');
          if (translationElement) {
            translationElement.textContent = translation;
          }
        }
      } catch (error) {
        console.error('Translation parsing error:', error);
        if (currentTooltip) {
          const translationElement = currentTooltip.querySelector('.english-translation');
          if (translationElement) {
            translationElement.textContent = 'Translation unavailable';
          }
        }
      }
    })
    .catch(error => {
      console.error('Translation error:', error);
      if (currentTooltip) {
        const translationElement = currentTooltip.querySelector('.english-translation');
        if (translationElement) {
          translationElement.textContent = 'Translation failed';
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