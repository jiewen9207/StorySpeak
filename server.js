const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'storyspeak-secret-key-2024';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/audio', express.static(path.join(__dirname, 'public', 'audio')));

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, username, email, is_active, is_admin FROM users WHERE id = ?').get(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: '账户不存在' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录已过期' });
  }
}

function requireActiveUser(req, res, next) {
  if (req.user.is_admin || req.user.is_active) {
    return next();
  }
  return res.status(403).json({ error: '账户未激活，请先使用兑换码激活账户' });
}

function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: '管理员权限Required' });
  }
  next();
}

app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: '请填写完整信息' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少6位' });
  }
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)')
      .run(username, email, hashedPassword);
    res.json({ success: true, userId: info.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: '用户名或邮箱已被注册' });
    }
    res.status(500).json({ error: '注册失败' });
  }
});

app.post('/api/login', (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ error: '请输入登录信息' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(login, login);
  if (!user) {
    return res.status(400).json({ error: '用户不存在' });
  }
  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return res.status(400).json({ error: '密码错误' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({
    success: true,
    token,
    user: { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin, is_active: user.is_active }
  });
});

// Reset password (no verification code)
app.post('/api/reset-password', (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ error: '请输入邮箱和新密码' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: '密码至少6位' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(400).json({ error: '该邮箱未注册' });
  }
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hashedPassword, email);
  res.json({ success: true, message: '密码重置成功，请使用新密码登录' });
});

app.post('/api/redeem', authMiddleware, (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: '请输入兑换码' });
  }
  const redeemCode = db.prepare('SELECT * FROM redemption_codes WHERE code = ?').get(code.trim());
  if (!redeemCode) {
    return res.status(400).json({ error: '兑换码不存在' });
  }
  if (redeemCode.status === 'used') {
    return res.status(400).json({ error: '兑换码已被使用' });
  }
  const updateCode = db.prepare('UPDATE redemption_codes SET status = ?, used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?');
  const updateUser = db.prepare('UPDATE users SET is_active = ? WHERE id = ?');
  const transaction = db.transaction(() => {
    updateCode.run('used', req.user.id, redeemCode.id);
    updateUser.run(1, req.user.id);
  });
  transaction();
  res.json({ success: true, message: '兑换码激活成功！' });
});

app.get('/api/user/profile', authMiddleware, (req, res) => {
  const progress = db.prepare(`
    SELECT COUNT(*) as total_stories,
           SUM(is_completed) as completed_stories
    FROM user_progress WHERE user_id = ?
  `).get(req.user.id);
  const totalTime = db.prepare('SELECT COALESCE(SUM(read_time), 0) as total_time FROM user_progress WHERE user_id = ?').get(req.user.id);
  const favorites = db.prepare('SELECT COUNT(*) as count FROM favorites WHERE user_id = ?').get(req.user.id);
  res.json({
    id: req.user.id,
    username: req.user.username,
    email: req.user.email,
    is_admin: req.user.is_admin,
    is_active: req.user.is_active,
    stats: {
      totalStories: progress.total_stories || 0,
      completedStories: progress.completed_stories || 0,
      totalTime: totalTime.total_time || 0,
      favorites: favorites.count || 0
    }
  });
});

app.get('/api/stories', authMiddleware, requireActiveUser, (req, res) => {
  const { difficulty, category } = req.query;
  let query = 'SELECT * FROM stories WHERE 1=1';
  const params = [];
  if (difficulty) {
    query += ' AND difficulty = ?';
    params.push(difficulty);
  }
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  query += ' ORDER BY id ASC';
  const stories = db.prepare(query).all(...params);
  const progressMap = {};
  const progressList = db.prepare('SELECT story_id, is_completed FROM user_progress WHERE user_id = ?').all(req.user.id);
  progressList.forEach(p => { progressMap[p.story_id] = p.is_completed; });
  const favoritesList = db.prepare('SELECT story_id FROM favorites WHERE user_id = ?').all(req.user.id);
  const favSet = new Set(favoritesList.map(f => f.story_id));
  const result = stories.map(s => ({
    ...s,
    is_completed: progressMap[s.id] || 0,
    is_favorite: favSet.has(s.id)
  }));
  res.json(result);
});

app.get('/api/stories/:id', authMiddleware, requireActiveUser, (req, res) => {
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.id);
  if (!story) {
    return res.status(404).json({ error: '故事不存在' });
  }
  const sentences = db.prepare('SELECT * FROM story_sentences WHERE story_id = ? ORDER BY sentence_index ASC').all(req.params.id);
  const progress = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND story_id = ?').get(req.user.id, req.params.id);
  const isFavorite = db.prepare('SELECT * FROM favorites WHERE user_id = ? AND story_id = ?').get(req.user.id, req.params.id);
  res.json({
    ...story,
    sentences,
    progress: progress || { last_sentence_index: 0, is_completed: 0, read_time: 0 },
    is_favorite: !!isFavorite
  });
});

app.post('/api/stories/:id/progress', authMiddleware, requireActiveUser, (req, res) => {
  const { last_sentence_index, is_completed, read_time } = req.body;
  const storyId = req.params.id;
  const existing = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND story_id = ?').get(req.user.id, storyId);
  if (existing) {
    db.prepare(`UPDATE user_progress SET 
      last_sentence_index = COALESCE(?, last_sentence_index),
      is_completed = COALESCE(?, is_completed),
      read_time = read_time + ?,
      updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND story_id = ?
    `).run(last_sentence_index, is_completed, read_time || 0, req.user.id, storyId);
  } else {
    db.prepare(`INSERT INTO user_progress (user_id, story_id, last_sentence_index, is_completed, read_time)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, storyId, last_sentence_index || 0, is_completed || 0, read_time || 0);
  }
  res.json({ success: true });
});

app.post('/api/stories/:id/favorite', authMiddleware, requireActiveUser, (req, res) => {
  const existing = db.prepare('SELECT * FROM favorites WHERE user_id = ? AND story_id = ?').get(req.user.id, req.params.id);
  if (existing) {
    db.prepare('DELETE FROM favorites WHERE id = ?').run(existing.id);
    res.json({ is_favorite: false });
  } else {
    db.prepare('INSERT INTO favorites (user_id, story_id) VALUES (?, ?)').run(req.user.id, req.params.id);
    res.json({ is_favorite: true });
  }
});

app.get('/api/favorites', authMiddleware, requireActiveUser, (req, res) => {
  const favorites = db.prepare(`
    SELECT s.* FROM stories s
    JOIN favorites f ON s.id = f.story_id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(req.user.id);
  res.json(favorites);
});

app.post('/api/words', authMiddleware, requireActiveUser, (req, res) => {
  const { word } = req.body;
  if (!word) {
    return res.status(400).json({ error: '请输入单词' });
  }
  try {
    db.prepare('INSERT INTO user_words (user_id, word) VALUES (?, ?)').run(req.user.id, word.trim());
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: '单词已在生词本中' });
    }
    res.status(500).json({ error: '添加失败' });
  }
});

app.delete('/api/words/:word', authMiddleware, requireActiveUser, (req, res) => {
  db.prepare('DELETE FROM user_words WHERE user_id = ? AND word = ?').run(req.user.id, req.params.word);
  res.json({ success: true });
});

app.get('/api/words', authMiddleware, requireActiveUser, (req, res) => {
  const words = db.prepare('SELECT * FROM user_words WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(words);
});

app.get('/api/admin/stories', authMiddleware, adminMiddleware, (req, res) => {
  const stories = db.prepare('SELECT * FROM stories ORDER BY id DESC').all();
  const result = stories.map(s => {
    const sentenceCount = db.prepare('SELECT COUNT(*) as count FROM story_sentences WHERE story_id = ?').get(s.id).count;
    return { ...s, sentence_count: sentenceCount };
  });
  res.json(result);
});

app.post('/api/admin/stories', authMiddleware, adminMiddleware, (req, res) => {
  const { title, title_cn, difficulty, category, cover_image, audio_file } = req.body;
  if (!title) {
    return res.status(400).json({ error: '请输入故事标题' });
  }
  const info = db.prepare(`INSERT INTO stories (title, title_cn, difficulty, category, cover_image, audio_file)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, title_cn || '', difficulty || 'easy', category || 'general', cover_image || '', audio_file || '');
  res.json({ success: true, id: info.lastInsertRowid });
});

app.put('/api/admin/stories/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { title, title_cn, difficulty, category, cover_image, audio_file } = req.body;
  db.prepare(`UPDATE stories SET 
    title = COALESCE(?, title),
    title_cn = COALESCE(?, title_cn),
    difficulty = COALESCE(?, difficulty),
    category = COALESCE(?, category),
    cover_image = COALESCE(?, cover_image),
    audio_file = COALESCE(?, audio_file)
    WHERE id = ?
  `).run(title, title_cn, difficulty, category, cover_image, audio_file, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/stories/:id', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM stories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/stories/:id/sentences', authMiddleware, adminMiddleware, (req, res) => {
  const sentences = db.prepare('SELECT * FROM story_sentences WHERE story_id = ? ORDER BY sentence_index ASC').all(req.params.id);
  res.json(sentences);
});

app.post('/api/admin/stories/:id/sentences', authMiddleware, adminMiddleware, (req, res) => {
  const sentences = req.body.sentences;
  if (!Array.isArray(sentences)) {
    return res.status(400).json({ error: '数据格式错误' });
  }
  const storyId = req.params.id;
  const insertSentence = db.prepare(`INSERT INTO story_sentences (story_id, sentence_index, english, chinese, audio_file)
    VALUES (?, ?, ?, ?, ?)
  `);
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM story_sentences WHERE story_id = ?').run(storyId);
    sentences.forEach(s => {
      insertSentence.run(storyId, s.sentence_index, s.english, s.chinese || '', s.audio_file || '');
    });
  });
  transaction();
  res.json({ success: true });
});

app.post('/api/admin/generate-codes', authMiddleware, adminMiddleware, (req, res) => {
  const { count = 10 } = req.body;
  const codes = [];
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const insertCode = db.prepare('INSERT INTO redemption_codes (code) VALUES (?)');
  const transaction = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < 12; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      codes.push(code);
      insertCode.run(code);
    }
  });
  transaction();
  res.json({ success: true, codes });
});

app.get('/api/admin/codes', authMiddleware, adminMiddleware, (req, res) => {
  const { status } = req.query;
  let query = `SELECT rc.*, u.username as used_by_name 
    FROM redemption_codes rc 
    LEFT JOIN users u ON rc.used_by = u.id`;
  const params = [];
  if (status) {
    query += ' WHERE rc.status = ?';
    params.push(status);
  }
  query += ' ORDER BY rc.id DESC LIMIT 100';
  const codes = db.prepare(query).all(...params);
  res.json(codes);
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.is_active, u.is_admin, u.created_at,
    (SELECT COUNT(*) FROM user_progress WHERE user_id = u.id) as story_count,
    (SELECT COALESCE(SUM(read_time), 0) FROM user_progress WHERE user_id = u.id) as total_time
    FROM users u
    WHERE u.is_admin = 0
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

app.post('/api/admin/users/:id/toggle-active', authMiddleware, adminMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(user.is_active ? 0 : 1, req.params.id);
  res.json({ success: true, is_active: !user.is_active });
});

app.get('/api/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 0').get().count;
  const activeUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1 AND is_admin = 0').get().count;
  const totalCodes = db.prepare('SELECT COUNT(*) as count FROM redemption_codes').get().count;
  const usedCodes = db.prepare("SELECT COUNT(*) as count FROM redemption_codes WHERE status = 'used'").get().count;
  const totalStories = db.prepare('SELECT COUNT(*) as count FROM stories').get().count;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE created_at >= ?').get(todayStart.toISOString()).count;
  const popularStories = db.prepare(`
    SELECT s.id, s.title, COUNT(up.id) as progress_count
    FROM stories s
    LEFT JOIN user_progress up ON s.id = up.story_id
    GROUP BY s.id
    ORDER BY progress_count DESC
    LIMIT 5
  `).all();
  res.json({
    totalUsers,
    activeUsers,
    totalCodes,
    usedCodes,
    totalStories,
    todayUsers,
    popularStories
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`StorySpeak English server running at http://localhost:${PORT}`);
});
