// Simple test version of Urdu Translator
console.log('🚀 URDU TRANSLATOR TEST VERSION LOADED');

// Test if we can detect mouseover at all
document.addEventListener('mouseover', function(event) {
  console.log('👆 Mouse over detected on:', event.target.tagName);
  
  const text = event.target.textContent || event.target.innerText || '';
  console.log('📝 Text content:', text.substring(0, 50));
  
  // Simple Urdu detection - check for any Arabic/Urdu characters
  const hasUrdu = /[\u0600-\u06FF]/.test(text);
  console.log('🔍 Contains Urdu:', hasUrdu);
  
  if (hasUrdu) {
    console.log('✅ URDU TEXT DETECTED!');
    showSimpleTooltip(event, 'Urdu text found!');
  }
});

function showSimpleTooltip(event, message) {
  // Remove any existing tooltip
  const existing = document.getElementById('urdu-test-tooltip');
  if (existing) {
    existing.remove();
  }
  
  // Create simple tooltip
  const tooltip = document.createElement('div');
  tooltip.id = 'urdu-test-tooltip';
  tooltip.style.cssText = `
    position: fixed;
    top: ${event.clientY + 10}px;
    left: ${event.clientX + 10}px;
    background: red;
    color: white;
    padding: 5px 10px;
    border-radius: 4px;
    z-index: 99999;
    font-size: 12px;
  `;
  tooltip.textContent = message;
  
  document.body.appendChild(tooltip);
  
  // Remove after 2 seconds
  setTimeout(() => {
    tooltip.remove();
  }, 2000);
}

console.log('🎯 Test event listener added - try hovering over Urdu text!');