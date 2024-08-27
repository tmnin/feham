console.log('background running');

chrome.runtime.onMessage.addListener(receiver);

let word = "so true";

function receiver(request, sender, sendResponse) {
    console.log(request);
    word = request.text;
}