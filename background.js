console.log('background running');

chrome.runtime.onMessage.addListener(receiver);

window.word = "so true";

function receiver(request, sender, sendResponse) {
    console.log(request);
    word = request.text;
}