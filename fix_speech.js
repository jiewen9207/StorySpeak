const fs = require('fs');
let html = fs.readFileSync('./public/story.html', 'utf8');

// Add speech synthesis activation at the beginning of init function
const oldInit = 'async function init() {\n      if (!checkAuth()) return;';
const newInit = `async function init() {\n      // Activate speech synthesis on page load\n      if (window.speechSynthesis) {\n        window.speechSynthesis.getVoices();\n      }\n      if (!checkAuth()) return;`;

html = html.replace(oldInit, newInit);
fs.writeFileSync('./public/story.html', html);
console.log('Added speech activation');
