const fs = require('fs');
let html = fs.readFileSync('./public/story.html', 'utf8');

// Replace playSentence to log available voices and try a different approach
const oldPattern = /async function playSentence\(index\) \{[\s\S]*?saveProgress\(\);\s*\}/;
const newFunc = `async function playSentence(index) {
      console.log('playSentence called:', index);
      const sentence = storyData.sentences[index];
      if (!sentence) { console.log('No sentence found'); return; }
      const text = sentence.english;
      console.log('Playing:', text);
      
      // Get available voices
      const voices = window.speechSynthesis.getVoices();
      console.log('Available voices:', voices.length);
      voices.slice(0, 5).forEach((v, i) => console.log('Voice ' + i + ':', v.name, v.lang));
      
      // Try to find English voice
      const enVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
      console.log('Using voice:', enVoice ? enVoice.name : 'none');
      
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        if (enVoice) utterance.voice = enVoice;
        
        utterance.onstart = () => { console.log('Speech started'); showMessage('播放: ' + text.substring(0,20), 'success'); };
        utterance.onerror = (e) => { console.error('Speech error:', e.error); showMessage('播放失败: ' + e.error, 'error'); };
        utterance.onend = () => { console.log('Speech ended'); };
        
        window.speechSynthesis.speak(utterance);
        console.log('speak() called');
      } else {
        console.log('speechSynthesis NOT available');
        showMessage('浏览器不支持语音', 'error');
      }
      saveProgress();
    }`;

html = html.replace(oldPattern, newFunc);
fs.writeFileSync('./public/story.html', html);
console.log('Updated with voice selection');
