// Hover-Based Urdu Dictionary Content Script
console.log('🚀 Hover-Based Urdu Dictionary loaded');

let isExtensionEnabled = true;
let currentTooltip = null;
let currentWord = '';
let lastMousePos = { x: 0, y: 0 };

// Urdu Unicode range
const URDU_REGEX = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/;

// Helper function to safely get numeric value
function safeNumber(value, fallback = 0) {
  return (typeof value === 'number' && !isNaN(value)) ? value : fallback;
}

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
  console.log('Setting up hover event listeners...');
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('keydown', handleKeyDown);
  console.log('Hover event listeners added');
}

function removeEventListeners() {
  console.log('Removing hover event listeners...');
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('keydown', handleKeyDown);
}

// Debounce function to limit lookups
let mouseTimeout;
function handleMouseMove(event) {
  if (!isExtensionEnabled) return;
  
  lastMousePos = { x: event.clientX, y: event.clientY };
  
  // Debounce to avoid excessive lookups
  clearTimeout(mouseTimeout);
  mouseTimeout = setTimeout(() => {
    processHover(event);
  }, 50);
}

function processHover(event) {
  // Don't process if hovering over our own tooltip
  if (event.target.closest('#urdu-hover-tooltip')) {
    return;
  }
  
  const element = document.elementFromPoint(event.clientX, event.clientY);
  if (!element) {
    hideTooltip();
    return;
  }
  
  // Get the word at cursor position
  const word = getWordAtPoint(element, event.clientX, event.clientY);
  
  if (!word) {
    hideTooltip();
    return;
  }
  
  // Check if word contains Urdu
  if (!URDU_REGEX.test(word)) {
    hideTooltip();
    return;
  }
  
  // Only lookup if it's a different word
  if (word !== currentWord) {
    currentWord = word;
    console.log('🔍 Hovering over Urdu word:', word);
    
    const position = {
      clientX: event.clientX,
      clientY: event.clientY + 20
    };
    
    showTooltip(position, word, 'Looking up...');
    lookupWord(word);
  }
}

function getWordAtPoint(element, x, y) {
  // Get all text nodes
  const textNode = getTextNodeAtPoint(element, x, y);
  if (!textNode) return null;
  
  const text = textNode.textContent;
  const range = document.caretRangeFromPoint(x, y);
  if (!range) return null;
  
  const offset = range.startOffset;
  
  // Extract word boundaries (Urdu words separated by spaces or punctuation)
  // Urdu word boundaries include spaces and common punctuation
  const before = text.slice(0, offset);
  const after = text.slice(offset);
  
  // Find word boundaries - look for spaces, punctuation, or start/end of string
  const wordBoundary = /[\s\u060C\u061B\u061F\u066A\u066B\u066C.,!?;:()\[\]{}]/;
  
  let start = before.length;
  let end = 0;
  
  // Find start of word (search backwards)
  for (let i = before.length - 1; i >= 0; i--) {
    if (wordBoundary.test(before[i])) {
      start = i + 1;
      break;
    }
    if (i === 0) {
      start = 0;
    }
  }
  
  // Find end of word (search forwards)
  for (let i = 0; i < after.length; i++) {
    if (wordBoundary.test(after[i])) {
      end = offset + i;
      break;
    }
    if (i === after.length - 1) {
      end = text.length;
    }
  }
  
  const word = text.slice(start, end).trim();
  return word.length > 0 ? word : null;
}

function getTextNodeAtPoint(element, x, y) {
  // Try to get text node at point using range
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y);
    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
      return range.startContainer;
    }
  }
  
  // Fallback: walk through text nodes
  function getTextNodes(node) {
    const textNodes = [];
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node);
    } else {
      for (const child of node.childNodes) {
        textNodes.push(...getTextNodes(child));
      }
    }
    return textNodes;
  }
  
  const textNodes = getTextNodes(element);
  return textNodes.length > 0 ? textNodes[0] : null;
}

function handleKeyDown(event) {
  // Copy current word with Ctrl+C or 'C'
  if ((event.key === 'c' || event.key === 'C') && currentWord && currentTooltip) {
    if (!event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      copyToClipboard(currentWord);
      showCopyFeedback();
    }
  }
  
  // Hide tooltip on Escape
  if (event.key === 'Escape') {
    hideTooltip();
  }
}

function showTooltip(position, word, definition) {
  // Remove existing tooltip
  hideTooltip();
  
  // Validate position
  if (!position || typeof position !== 'object') {
    position = { clientX: lastMousePos.x, clientY: lastMousePos.y };
  }
  
  position.clientX = Math.max(0, Math.min(safeNumber(position.clientX), window.innerWidth));
  position.clientY = Math.max(0, Math.min(safeNumber(position.clientY), window.innerHeight));
  
  // Create tooltip element
  currentTooltip = document.createElement('div');
  currentTooltip.id = 'urdu-hover-tooltip';
  
  const topPos = Math.round(safeNumber(position.clientY));
  const leftPos = Math.round(safeNumber(position.clientX));
  
  currentTooltip.style.cssText = `
    position: fixed !important;
    top: ${topPos}px !important;
    left: ${leftPos}px !important;
    transform: translateX(-50%) !important;
    z-index: 2147483647 !important;
    background: #1a1a1a !important;
    color: white !important;
    border: 2px solid #fbbf24 !important;
    border-radius: 12px !important;
    padding: 16px !important;
    font-family: Arial, sans-serif !important;
    font-size: 14px !important;
    min-width: 200px !important;
    max-width: 350px !important;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
    pointer-events: none !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    animation: fadeIn 0.15s ease-out !important;
  `;
  
  currentTooltip.innerHTML = `
    <div style="color: #fbbf24; font-weight: bold; margin-bottom: 8px; font-size: 18px; direction: rtl; text-align: right;">${word}</div>
    <div style="color: #e5e7eb; margin-bottom: 8px; line-height: 1.5;" id="definition-text">${definition}</div>
    <div style="color: #9ca3af; font-size: 11px; border-top: 1px solid #374151; padding-top: 6px; text-align: center;">
      Press 'C' to copy
    </div>
  `;
  
  // Add animation styles
  if (!document.getElementById('urdu-dictionary-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'urdu-dictionary-styles';
    styleSheet.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(styleSheet);
  }
  
  document.body.appendChild(currentTooltip);
  
  // Adjust position if off-screen
  setTimeout(() => {
    try {
      if (currentTooltip && document.body.contains(currentTooltip)) {
        const rect = currentTooltip.getBoundingClientRect();
        
        if (rect.left < 10) {
          currentTooltip.style.left = '10px';
          currentTooltip.style.transform = 'none';
        } else if (rect.right > window.innerWidth - 10) {
          currentTooltip.style.left = (window.innerWidth - rect.width - 10) + 'px';
          currentTooltip.style.transform = 'none';
        }
        
        if (rect.bottom > window.innerHeight - 10) {
          const newTop = Math.max(10, topPos - rect.height - 30);
          currentTooltip.style.top = newTop + 'px';
        }
      }
    } catch (error) {
      console.error('Error adjusting tooltip position:', error);
    }
  }, 20);
}

function hideTooltip() {
  if (currentTooltip) {
    try {
      currentTooltip.remove();
    } catch (error) {
      console.error('Error removing tooltip:', error);
    }
    currentTooltip = null;
    currentWord = '';
  }
}

function lookupWord(word) {
  console.log('📖 Looking up word:', word);
  
  // This is where you'll integrate your dictionary API
  // For now, using a placeholder that shows it's working
  
  // Option 1: Local dictionary file
  // fetch(chrome.runtime.getURL('dictionary.json'))
  //   .then(response => response.json())
  //   .then(dictionary => {
  //     const definition = dictionary[word] || 'Definition not found';
  //     updateTooltipDefinition(definition);
  //   });
  
  // Option 2: External API (placeholder - replace with real API)
  // Example structure for when you find an Urdu dictionary API
  setTimeout(() => {
    updateTooltipDefinition('Dictionary integration needed - see comments in code');
  }, 100);
  
  // Temporary: Still using Google Translate as fallback
  // Remove this once you have a proper dictionary
  translateWord(word);
}

function translateWord(word) {
  if (!navigator.onLine) {
    updateTooltipDefinition('You are currently offline');
    return;
  }
  
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ur&tl=en&dt=t&q=${encodeURIComponent(word)}`;
  
  fetch(url)
    .then(response => response.json())
    .then(data => {
      let translation = '';
      if (data[0] && Array.isArray(data[0])) {
        translation = data[0].map(item => item[0]).join('');
      }
      updateTooltipDefinition(translation || 'Translation not available');
    })
    .catch(error => {
      console.error('Translation error:', error);
      updateTooltipDefinition('Lookup failed');
    });
}

function updateTooltipDefinition(definition) {
  if (currentTooltip) {
    const definitionElement = currentTooltip.querySelector('#definition-text');
    if (definitionElement) {
      definitionElement.textContent = definition;
    }
  }
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      console.log('📋 Copied to clipboard:', text);
    }).catch(err => {
      console.error('Failed to copy:', err);
      fallbackCopyToClipboard(text);
    });
  } else {
    fallbackCopyToClipboard(text);
  }
}

function fallbackCopyToClipboard(text) {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  } catch (err) {
    console.error('Fallback copy failed:', err);
  }
}

function showCopyFeedback() {
  if (currentTooltip) {
    const footer = currentTooltip.querySelector('div:last-child');
    if (footer) {
      const originalText = footer.innerHTML;
      footer.innerHTML = '<span style="color: #4ade80;">✓ Copied!</span>';
      setTimeout(() => {
        if (footer) {
          footer.innerHTML = originalText;
        }
      }, 1500);
    }
  }
}

console.log('📖 Hover-based Urdu dictionary ready!');