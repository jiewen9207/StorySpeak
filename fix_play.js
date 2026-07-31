const fs = require('fs');
let html = fs.readFileSync('./public/story.html', 'utf8');

// Replace playSentence with a simpler version that doesn't use cancel()
const oldPattern = /async function playSentence\(index\) \{[\s\S]*?saveProgress\(\);\s*\}/;
const newFunc = `async function playSentence(index) {
      const sentence = storyData.sentences[index];
      if (!sentence) return;
      const text = sentence.english;
      
      // Stop any current speech
      window.speechSynthesis.cancel();
      
      // Small delay to ensure cancel completes
      await new Promise(r => setTimeout(r, 100));
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      
      // Try to find Microsoft English voice first, then Google, then any English
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.name.includes('Microsoft') && v.lang.includes('en')) ||
                           voices.find(v => v.name.includes('Google') && v.lang.includes('en')) ||
                           voices.find(v => v.lang.includes('en'));
      if (preferredVoice) utterance.voice = preferredVoice;
      
      utterance.onstart = () => showMessage('🔊 播放: ' + text.substring(0, 25) + '...', 'success');
      utterance.onend = () => console.log('Speech completed');
      utterance.onerror = (e) => {
        console.error('Speech error:', e.error);
        showMessage('播放失败，请检查浏览器设置', 'error');
      };
      
      window.speechSynthesis.speak(utterance);
      currentSentenceIndex = index;
      saveProgress();
    }`;

html = html.replace(oldPattern, newFunc);
fs.writeFileSync('./public/story.html', html);
console.log('Updated playSentence');
