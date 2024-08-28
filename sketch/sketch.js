// API key:
// let api_key = 'idk'

function setup(){
    noCanvas();

    let bgpage = chrome.extension.getBackgroundPage();
    let word = bgpage.word.trim();
    let url = `some link for definition api;
    ${word}
    /definitions
    &include whatever
    &api_key=blahblah`

    url = url.replace(/\s+/g, '');
    loadJSON(url, gotData);

    function gotData(data) {
        createP(data[0].text).style('font-size', '48pt'); 
    }
    //createP(word); 
}