const fs = require('fs');
let html = fs.readFileSync('./public/story.html', 'utf8');

// Find and replace the playSentence function
const oldPattern = /async function playSentence\(index\) \{[\s\S]*?saveProgress\(\);\s*\}/;
const newFunc = `async function playSentence(index) {
      console.log('playSentence called:', index);
      const sentence = storyData.sentences[index];
      if (!sentence) { console.log('No sentence found'); return; }
      const text = sentence.english;
      console.log('Playing:', text);
      console.log('speechSynthesis available:', 'speechSynthesis' in window);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        utterance.onstart = () => { console.log('Speech started'); showMessage('播放: ' + text.substring(0,20), 'success'); };
        utterance.onerror = (e) => { console.error('Speech error:', e); showMessage('播放失败', 'error'); };
        window.speechSynthesis.speak(utterance);
      } else {
        console.log('speechSynthesis NOT available');
        showMessage('浏览器不支持语音', 'error');
      }
      saveProgress();
    }`;

html = html.replace(oldPattern, newFunc);
fs.writeFileSync('./public/story.html', html);
console.log('Updated story.html with debug logging');
