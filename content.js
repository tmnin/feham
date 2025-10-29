// Hover-Based Urdu Dictionary Content Script
console.log('🚀 Hover-Based Urdu Dictionary loaded');

let isExtensionEnabled = true;
let currentTooltip = null;
let currentWord = '';
let lastMousePos = { x: 0, y: 0 };
let currentHighlight = null;
let isProcessing = false;

// Urdu Unicode range
const URDU_REGEX = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/;

// Helper function to safely get numeric value
function safeNumber(value, fallback = 0) {
  return (typeof value === 'number' && !isNaN(value)) ? value : fallback;
}

// Initialize extension
chrome.storage.sync.get(['extensionEnabled'], (result) => {
  isExtensionEnabled = result.extensionEnabled !== false;
  console.log('Extension enabled:', isExtensionEnabled);
  if (isExtensionEnabled) {
    setupEventListeners();
  }
});

// Listen for extension toggle
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleExtension') {
    isExtensionEnabled = request.enabled;
    console.log('Extension toggled:', isExtensionEnabled);
    if (isExtensionEnabled) {
      setupEventListeners();
    } else {
      removeEventListeners();
      hideTooltip();
      removeHighlight();
    }
  }
});

function setupEventListeners() {
  console.log('Setting up hover event listeners...');
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('keydown', handleKeyDown, true);
  console.log('Hover event listeners added');
}

function removeEventListeners() {
  console.log('Removing hover event listeners...');
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('keydown', handleKeyDown, true);
}

// Debounce function to limit lookups
let mouseTimeout;
function handleMouseMove(event) {
  if (!isExtensionEnabled || isProcessing) return;
  
  lastMousePos = { x: event.clientX, y: event.clientY };
  
  // Debounce to avoid excessive lookups
  clearTimeout(mouseTimeout);
  mouseTimeout = setTimeout(() => {
    processHover(event);
  }, 100);
}

function processHover(event) {
  // Don't process if hovering over our own tooltip
  if (event.target && (
      event.target.id === 'urdu-hover-tooltip' || 
      event.target.closest('#urdu-hover-tooltip')
  )) {
    return;
  }
  
  const wordData = getWordAtPoint(event.clientX, event.clientY);
  
  if (!wordData || !wordData.word || !wordData.isOverText) {
    hideTooltip();
    removeHighlight();
    currentWord = '';
    return;
  }
  
  const word = wordData.word;
  
  // Check if word contains Urdu
  if (!URDU_REGEX.test(word)) {
    hideTooltip();
    removeHighlight();
    currentWord = '';
    return;
  }
  
  // Only lookup if it's a different word
  if (word !== currentWord) {
    currentWord = word;
    console.log('🔍 Hovering over Urdu word:', word);
    
    // Highlight the word
    highlightWord(wordData.range);
    
    const position = {
      clientX: event.clientX,
      clientY: event.clientY + 20
    };
    
    showTooltip(position, word, 'Looking up...');
    lookupWord(word);
  }
}

function getWordAtPoint(x, y) {
  let range = null;
  
  // Try different methods to get text at point
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.setEnd(position.offsetNode, position.offset);
    }
  }
  
  if (!range || !range.startContainer) {
    return null;
  }
  
  // Handle different node types
  let textNode = range.startContainer;
  let clickOffset = range.startOffset;
  
  // If we're in an element node, we need to find the actual text node
  if (textNode.nodeType === Node.ELEMENT_NODE) {
    // Get the element under cursor
    const element = document.elementFromPoint(x, y);
    if (!element) return null;
    
    // Find all text nodes in this element
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Only accept text nodes with actual content
          if (node.textContent.trim().length > 0) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      },
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }
    
    if (textNodes.length === 0) return null;
    
    // Find which text node the cursor is actually over
    let foundNode = null;
    let foundOffset = 0;
    
    for (const node of textNodes) {
      const nodeRange = document.createRange();
      nodeRange.selectNodeContents(node);
      const rects = nodeRange.getClientRects();
      
      // Check if cursor is within any of this node's rectangles
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (x >= rect.left && x <= rect.right &&
            y >= rect.top && y <= rect.bottom) {
          foundNode = node;
          
          // Calculate offset within this text node
          const text = node.textContent;
          const nodeRect = rect;
          
          // For RTL text (Urdu), calculate from right to left
          if (nodeRect.width > 0 && text.length > 0) {
            const relativeX = x - nodeRect.left;
            const charWidth = nodeRect.width / text.length;
            foundOffset = Math.floor(relativeX / charWidth);
            foundOffset = Math.max(0, Math.min(foundOffset, text.length));
          }
          
          break;
        }
      }
      
      if (foundNode) break;
    }
    
    if (!foundNode) {
      return null;
    }
    
    textNode = foundNode;
    clickOffset = foundOffset;
  }
  
  // Now we should have a text node
  if (textNode.nodeType !== Node.TEXT_NODE) {
    return null;
  }
  
  const text = textNode.textContent;
  
  // Check if we're actually over text (not whitespace)
  if (!text || text.trim().length === 0) {
    return null;
  }
  
  // Check if the exact character at cursor position is whitespace
  if (clickOffset < text.length) {
    const charAtCursor = text.charAt(clickOffset);
    const charBefore = clickOffset > 0 ? text.charAt(clickOffset - 1) : '';
    
    // If both the character at cursor and before are whitespace, we're in empty space
    if (/\s/.test(charAtCursor) && /\s/.test(charBefore)) {
      return null;
    }
  }
  
  // Word boundary regex - includes spaces, punctuation, and Urdu punctuation
  const wordBoundary = /[\s\u060C\u061B\u061F\u066A\u066B\u066C.,!?;:()\[\]{}"""''`\n\r\t]/;
  
  // Find start of word (search backwards from click position)
  let start = clickOffset;
  while (start > 0 && !wordBoundary.test(text.charAt(start - 1))) {
    start--;
  }
  
  // Find end of word (search forwards from click position)
  let end = clickOffset;
  while (end < text.length && !wordBoundary.test(text.charAt(end))) {
    end++;
  }
  
  // Handle edge case: if we're exactly on a boundary, try the word before
  if (start === end && clickOffset > 0 && !wordBoundary.test(text.charAt(clickOffset - 1))) {
    end = clickOffset;
    start = clickOffset - 1;
    while (start > 0 && !wordBoundary.test(text.charAt(start - 1))) {
      start--;
    }
  }
  
  const word = text.slice(start, end).trim();
  
  if (word.length === 0) {
    return null;
  }
  
  // Verify we're actually over the word by checking bounding boxes
  let isOverText = false;
  try {
    const wordRange = document.createRange();
    wordRange.setStart(textNode, start);
    wordRange.setEnd(textNode, end);
    
    const rects = wordRange.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      if (x >= rect.left - 5 && x <= rect.right + 5 &&
          y >= rect.top - 5 && y <= rect.bottom + 5) {
        isOverText = true;
        break;
      }
    }
    
    if (!isOverText) {
      return null;
    }
    
    return {
      word: word,
      range: wordRange,
      isOverText: true
    };
  } catch (error) {
    console.error('Error creating word range:', error);
    return null;
  }
}

function highlightWord(range) {
  // Remove previous highlight
  removeHighlight();
  
  if (!range) return;
  
  try {
    // Clone the range to avoid modifying the original
    const highlightRange = range.cloneRange();
    
    // Create highlight span
    const highlight = document.createElement('span');
    highlight.id = 'urdu-word-highlight';
    highlight.style.cssText = `
      background-color: rgba(251, 191, 36, 0.35) !important;
      border-bottom: 2px solid rgba(251, 191, 36, 0.8) !important;
      border-radius: 3px !important;
      padding: 2px 0 !important;
      box-decoration-break: clone !important;
      -webkit-box-decoration-break: clone !important;
      transition: background-color 0.15s ease !important;
    `;
    
    // Wrap the word with highlight
    highlightRange.surroundContents(highlight);
    currentHighlight = highlight;
  } catch (error) {
    // Fallback: use Selection API for visual feedback if surroundContents fails
    console.log('Using fallback highlight method');
    try {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range.cloneRange());
      currentHighlight = { isSelection: true };
    } catch (selError) {
      console.error('Both highlight methods failed:', error, selError);
    }
  }
}

function removeHighlight() {
  if (!currentHighlight) return;
  
  try {
    if (currentHighlight.isSelection) {
      // Clear selection
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
    } else if (currentHighlight.parentNode) {
      // Unwrap the highlight span and preserve the text
      const parent = currentHighlight.parentNode;
      const textContent = currentHighlight.textContent;
      const textNode = document.createTextNode(textContent);
      parent.replaceChild(textNode, currentHighlight);
      
      // Normalize to merge text nodes
      parent.normalize();
    }
  } catch (error) {
    console.error('Error removing highlight:', error);
  }
  
  currentHighlight = null;
}

function handleKeyDown(event) {
  // Copy current word with 'C' key (not Ctrl+C)
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
    removeHighlight();
    currentWord = '';
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
    background: linear-gradient(135deg, #1f2937 0%, #111827 100%) !important;
    color: white !important;
    border: 2px solid #fbbf24 !important;
    border-radius: 12px !important;
    padding: 16px !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important;
    font-size: 14px !important;
    min-width: 200px !important;
    max-width: 350px !important;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(251, 191, 36, 0.1) inset !important;
    pointer-events: none !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    animation: tooltipFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
    backdrop-filter: blur(10px) !important;
  `;
  
  currentTooltip.innerHTML = `
    <div style="color: #fbbf24; font-weight: 600; margin-bottom: 8px; font-size: 18px; direction: rtl; text-align: right; letter-spacing: 0.3px;">${word}</div>
    <div style="color: #e5e7eb; margin-bottom: 8px; line-height: 1.6; font-size: 13px;" id="definition-text">${definition}</div>
    <div style="color: #9ca3af; font-size: 10px; border-top: 1px solid rgba(55, 65, 81, 0.6); padding-top: 6px; text-align: center; font-weight: 500;">
      Press 'C' to copy • ESC to close
    </div>
  `;
  
  // Add animation styles
  if (!document.getElementById('urdu-dictionary-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'urdu-dictionary-styles';
    styleSheet.textContent = `
      @keyframes tooltipFadeIn {
        from { 
          opacity: 0; 
          transform: translateX(-50%) translateY(-8px) scale(0.96); 
        }
        to { 
          opacity: 1; 
          transform: translateX(-50%) translateY(0) scale(1); 
        }
      }
    `;
    document.head.appendChild(styleSheet);
  }
  
  document.body.appendChild(currentTooltip);
  
  // Adjust position if off-screen
  requestAnimationFrame(() => {
    try {
      if (currentTooltip && document.body.contains(currentTooltip)) {
        const rect = currentTooltip.getBoundingClientRect();
        
        // Adjust horizontal position
        if (rect.left < 10) {
          currentTooltip.style.left = (rect.width / 2 + 10) + 'px';
          currentTooltip.style.transform = 'none';
        } else if (rect.right > window.innerWidth - 10) {
          currentTooltip.style.left = (window.innerWidth - rect.width / 2 - 10) + 'px';
          currentTooltip.style.transform = 'none';
        }
        
        // Adjust vertical position (show above if too close to bottom)
        if (rect.bottom > window.innerHeight - 10) {
          const newTop = Math.max(10, topPos - rect.height - 40);
          currentTooltip.style.top = newTop + 'px';
        }
      }
    } catch (error) {
      console.error('Error adjusting tooltip position:', error);
    }
  });
}

function hideTooltip() {
  if (currentTooltip) {
    try {
      currentTooltip.remove();
    } catch (error) {
      console.error('Error removing tooltip:', error);
    }
    currentTooltip = null;
  }
}

function lookupWord(word) {
  console.log('📖 Looking up word:', word);
  isProcessing = true;
  
  // Directly call translation
  translateWord(word);
}

function translateWord(word) {
  if (!navigator.onLine) {
    updateTooltipDefinition('⚠️ You are currently offline');
    isProcessing = false;
    return;
  }
  
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ur&tl=en&dt=t&q=${encodeURIComponent(word)}`;
  
  fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      let translation = '';
      if (data && data[0] && Array.isArray(data[0])) {
        translation = data[0]
          .filter(item => item && item[0])
          .map(item => item[0])
          .join('');
      }
      
      if (translation && translation.trim()) {
        updateTooltipDefinition(translation.trim());
      } else {
        updateTooltipDefinition('Translation not available');
      }
      isProcessing = false;
    })
    .catch(error => {
      console.error('Translation error:', error);
      updateTooltipDefinition('❌ Translation failed');
      isProcessing = false;
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
    navigator.clipboard.writeText(text)
      .then(() => {
        console.log('📋 Copied to clipboard:', text);
        showCopyFeedback();
      })
      .catch(err => {
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
    textArea.style.cssText = 'position: fixed; left: -999999px; top: -999999px;';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    if (successful) {
      showCopyFeedback();
    }
  } catch (err) {
    console.error('Fallback copy failed:', err);
  }
}

function showCopyFeedback() {
  if (currentTooltip) {
    const footer = currentTooltip.querySelector('div:last-child');
    if (footer) {
      const originalText = footer.innerHTML;
      footer.innerHTML = '<span style="color: #10b981; font-weight: 600;">✓ Copied!</span>';
      setTimeout(() => {
        if (footer && currentTooltip) {
          footer.innerHTML = originalText;
        }
      }, 1500);
    }
  }
}

console.log('📖 Hover-based Urdu dictionary ready!');