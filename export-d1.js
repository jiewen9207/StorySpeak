const db = require('./db');
const fs = require('fs');

console.log('Exporting data for D1...');

// 导出兑换码
const codes = db.prepare('SELECT * FROM redemption_codes').all();
let sql = '-- Redemption codes\n';
for (const code of codes) {
  sql += `INSERT OR IGNORE INTO redemption_codes (id, code, status, used_by, used_at, created_at) VALUES (${code.id}, '${code.code}', '${code.status}', ${code.used_by || 'NULL'}, ${code.used_at ? `'${code.used_at}'` : 'NULL'}, '${code.created_at}');\n`;
}

// 导出故事
const stories = db.prepare('SELECT * FROM stories').all();
sql += '\n-- Stories\n';
for (const story of stories) {
  const title = story.title.replace(/'/g, "''");
  const titleCn = (story.title_cn || '').replace(/'/g, "''");
  sql += `INSERT OR IGNORE INTO stories (id, title, title_cn, difficulty, category, cover_image, audio_file, created_at) VALUES (${story.id}, '${title}', '${titleCn}', '${story.difficulty}', '${story.category}', '${story.cover_image || ''}', '${story.audio_file || ''}', '${story.created_at}');\n`;
}

// 导出句子
const sentences = db.prepare('SELECT * FROM story_sentences').all();
sql += '\n-- Story sentences\n';
for (const sent of sentences) {
  const en = sent.english.replace(/'/g, "''");
  const cn = (sent.chinese || '').replace(/'/g, "''");
  sql += `INSERT OR IGNORE INTO story_sentences (id, story_id, sentence_index, english, chinese, audio_file) VALUES (${sent.id}, ${sent.story_id}, ${sent.sentence_index}, '${en}', '${cn}', '${sent.audio_file || ''}');\n`;
}

fs.writeFileSync('worker/seed-d1.sql', sql, 'utf-8');
console.log(`Exported ${codes.length} codes, ${stories.length} stories, ${sentences.length} sentences`);
console.log('Seed file written to worker/seed-d1.sql');