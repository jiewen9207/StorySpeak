import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { JWT } from 'jose';
import bcrypt from 'bcryptjs';

const app = new Hono();
const JWT_SECRET = 'storyspeak-secret-key-2024';

app.use('*', cors());
app.use('*', async (c, next) => {
  c.env.db = c.env.DB;
  await next();
});

function authMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: '未登录' }, 401);
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = await JWT.verify(token, new TextEncoder().encode(JWT_SECRET));
    const user = await c.env.db.prepare('SELECT id, username, email, is_active, is_admin FROM users WHERE id = ?').get(decoded.userId);
    if (!user) {
      return c.json({ error: '账户不存在' }, 401);
    }
    c.env.user = user;
    await next();
  } catch (err) {
    return c.json({ error: '登录已过期' }, 401);
  }
});

function requireActiveUser(async (c, next) => {
  if (c.env.user.is_admin || c.env.user.is_active) {
    return next();
  }
  return c.json({ error: '账户未激活，请先使用兑换码激活账户' }, 403);
});

function adminMiddleware(async (c, next) => {
  if (!c.env.user || !c.env.user.is_admin) {
    return c.json({ error: '管理员权限Required' }, 403);
  }
  await next();
});

app.post('/api/register', async (c) => {
  const { username, email, password } = await c.req.json();
  if (!username || !email || !password) {
    return c.json({ error: '请填写完整信息' }, 400);
  }
  if (password.length < 6) {
    return c.json({ error: '密码至少6位' }, 400);
  }
  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const info = await c.env.db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)')
      .bind(username, email, hashedPassword).run();
    return c.json({ success: true, userId: info.lastRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return c.json({ error: '用户名或邮箱已被注册' }, 400);
    }
    return c.json({ error: '注册失败' }, 500);
  }
});

app.post('/api/login', async (c) => {
  const { login, password } = await c.req.json();
  if (!login || !password) {
    return c.json({ error: '请输入登录信息' }, 400);
  }
  const user = await c.env.db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(login, login);
  if (!user) {
    return c.json({ error: '用户不存在' }, 400);
  }
  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return c.json({ error: '密码错误' }, 400);
  }
  const token = await JWT.sign({ userId: user.id }, new TextEncoder().encode(JWT_SECRET), { expiresIn: '30d' });
  return c.json({
    success: true,
    token,
    user: { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin, is_active: user.is_active }
  });
});

app.post('/api/redeem', authMiddleware, async (c) => {
  const { code } = await c.req.json();
  if (!code) {
    return c.json({ error: '请输入兑换码' }, 400);
  }
  const redeemCode = await c.env.db.prepare('SELECT * FROM redemption_codes WHERE code = ?').get(code.trim());
  if (!redeemCode) {
    return c.json({ error: '兑换码不存在' }, 400);
  }
  if (redeemCode.status === 'used') {
    return c.json({ error: '兑换码已被使用' }, 400);
  }
  try {
    await c.env.db.batch([
      c.env.db.prepare('UPDATE redemption_codes SET status = ?, used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind('used', c.env.user.id, redeemCode.id),
      c.env.db.prepare('UPDATE users SET is_active = ? WHERE id = ?').bind(1, c.env.user.id)
    ]);
    return c.json({ success: true, message: '兑换码激活成功！' });
  } catch (err) {
    return c.json({ error: '激活失败' }, 500);
  }
});

app.get('/api/user/profile', authMiddleware, async (c) => {
  const progress = await c.env.db.prepare(`
    SELECT COUNT(*) as total_stories,
           SUM(is_completed) as completed_stories
    FROM user_progress WHERE user_id = ?
  `).get(c.env.user.id);
  const totalTime = await c.env.db.prepare('SELECT COALESCE(SUM(read_time), 0) as total_time FROM user_progress WHERE user_id = ?').get(c.env.user.id);
  const favorites = await c.env.db.prepare('SELECT COUNT(*) as count FROM favorites WHERE user_id = ?').get(c.env.user.id);
  return c.json({
    id: c.env.user.id,
    username: c.env.user.username,
    email: c.env.user.email,
    is_admin: c.env.user.is_admin,
    is_active: c.env.user.is_active,
    stats: {
      totalStories: progress.total_stories || 0,
      completedStories: progress.completed_stories || 0,
      totalTime: totalTime.total_time || 0,
      favorites: favorites.count || 0
    }
  });
});

app.get('/api/stories', authMiddleware, requireActiveUser, async (c) => {
  const { difficulty, category } = c.req.query();
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
  const stories = await c.env.db.prepare(query).all(...params);
  
  const progressMap = {};
  const progressList = await c.env.db.prepare('SELECT story_id, is_completed FROM user_progress WHERE user_id = ?').all(c.env.user.id);
  progressList.forEach(p => { progressMap[p.story_id] = p.is_completed; });
  
  const favoritesList = await c.env.db.prepare('SELECT story_id FROM favorites WHERE user_id = ?').all(c.env.user.id);
  const favSet = new Set(favoritesList.map(f => f.story_id));
  
  const result = stories.map(s => ({
    ...s,
    is_completed: progressMap[s.id] || 0,
    is_favorite: favSet.has(s.id)
  }));
  return c.json(result);
});

app.get('/api/stories/:id', authMiddleware, requireActiveUser, async (c) => {
  const storyId = c.req.param('id');
  const story = await c.env.db.prepare('SELECT * FROM stories WHERE id = ?').get(storyId);
  if (!story) {
    return c.json({ error: '故事不存在' }, 404);
  }
  const sentences = await c.env.db.prepare('SELECT * FROM story_sentences WHERE story_id = ? ORDER BY sentence_index ASC').all(storyId);
  const progress = await c.env.db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND story_id = ?').get(c.env.user.id, storyId);
  const isFavorite = await c.env.db.prepare('SELECT * FROM favorites WHERE user_id = ? AND story_id = ?').get(c.env.user.id, storyId);
  return c.json({
    ...story,
    sentences,
    progress: progress || { last_sentence_index: 0, is_completed: 0, read_time: 0 },
    is_favorite: !!isFavorite
  });
});

app.post('/api/stories/:id/progress', authMiddleware, requireActiveUser, async (c) => {
  const { last_sentence_index, is_completed, read_time } = await c.req.json();
  const storyId = c.req.param('id');
  const existing = await c.env.db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND story_id = ?').get(c.env.user.id, storyId);
  if (existing) {
    await c.env.db.prepare(`UPDATE user_progress SET 
      last_sentence_index = COALESCE(?, last_sentence_index),
      is_completed = COALESCE(?, is_completed),
      read_time = read_time + ?,
      updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND story_id = ?
    `).bind(last_sentence_index, is_completed, read_time || 0, c.env.user.id, storyId).run();
  } else {
    await c.env.db.prepare(`INSERT INTO user_progress (user_id, story_id, last_sentence_index, is_completed, read_time)
      VALUES (?, ?, ?, ?, ?)
    `).bind(c.env.user.id, storyId, last_sentence_index || 0, is_completed || 0, read_time || 0).run();
  }
  return c.json({ success: true });
});

app.post('/api/stories/:id/favorite', authMiddleware, requireActiveUser, async (c) => {
  const storyId = c.req.param('id');
  const existing = await c.env.db.prepare('SELECT * FROM favorites WHERE user_id = ? AND story_id = ?').get(c.env.user.id, storyId);
  if (existing) {
    await c.env.db.prepare('DELETE FROM favorites WHERE id = ?').bind(existing.id).run();
    return c.json({ is_favorite: false });
  } else {
    await c.env.db.prepare('INSERT INTO favorites (user_id, story_id) VALUES (?, ?)').bind(c.env.user.id, storyId).run();
    return c.json({ is_favorite: true });
  }
});

app.get('/api/favorites', authMiddleware, requireActiveUser, async (c) => {
  const favorites = await c.env.db.prepare(`
    SELECT s.* FROM stories s
    JOIN favorites f ON s.id = f.story_id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(c.env.user.id);
  return c.json(favorites);
});

app.post('/api/words', authMiddleware, requireActiveUser, async (c) => {
  const { word } = await c.req.json();
  if (!word) {
    return c.json({ error: '请输入单词' }, 400);
  }
  try {
    await c.env.db.prepare('INSERT INTO user_words (user_id, word) VALUES (?, ?)').bind(c.env.user.id, word.trim()).run();
    return c.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return c.json({ error: '单词已在生词本中' }, 400);
    }
    return c.json({ error: '添加失败' }, 500);
  }
});

app.delete('/api/words/:word', authMiddleware, requireActiveUser, async (c) => {
  const word = decodeURIComponent(c.req.param('word'));
  await c.env.db.prepare('DELETE FROM user_words WHERE user_id = ? AND word = ?').bind(c.env.user.id, word).run();
  return c.json({ success: true });
});

app.get('/api/words', authMiddleware, requireActiveUser, async (c) => {
  const words = await c.env.db.prepare('SELECT * FROM user_words WHERE user_id = ? ORDER BY created_at DESC').all(c.env.user.id);
  return c.json(words);
});

app.get('/api/admin/stories', authMiddleware, adminMiddleware, async (c) => {
  const stories = await c.env.db.prepare('SELECT * FROM stories ORDER BY id DESC').all();
  const result = [];
  for (const s of stories) {
    const sentenceCount = (await c.env.db.prepare('SELECT COUNT(*) as count FROM story_sentences WHERE story_id = ?').get(s.id)).count;
    result.push({ ...s, sentence_count: sentenceCount });
  }
  return c.json(result);
});

app.post('/api/admin/stories', authMiddleware, adminMiddleware, async (c) => {
  const { title, title_cn, difficulty, category, cover_image, audio_file } = await c.req.json();
  if (!title) {
    return c.json({ error: '请输入故事标题' }, 400);
  }
  const info = await c.env.db.prepare(`INSERT INTO stories (title, title_cn, difficulty, category, cover_image, audio_file)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(title, title_cn || '', difficulty || 'easy', category || 'general', cover_image || '', audio_file || '').run();
  return c.json({ success: true, id: info.lastRowid });
});

app.put('/api/admin/stories/:id', authMiddleware, adminMiddleware, async (c) => {
  const { title, title_cn, difficulty, category, cover_image, audio_file } = await c.req.json();
  const storyId = c.req.param('id');
  await c.env.db.prepare(`UPDATE stories SET 
    title = COALESCE(?, title),
    title_cn = COALESCE(?, title_cn),
    difficulty = COALESCE(?, difficulty),
    category = COALESCE(?, category),
    cover_image = COALESCE(?, cover_image),
    audio_file = COALESCE(?, audio_file)
    WHERE id = ?
  `).bind(title, title_cn, difficulty, category, cover_image, audio_file, storyId).run();
  return c.json({ success: true });
});

app.delete('/api/admin/stories/:id', authMiddleware, adminMiddleware, async (c) => {
  const storyId = c.req.param('id');
  await c.env.db.prepare('DELETE FROM stories WHERE id = ?').bind(storyId).run();
  return c.json({ success: true });
});

app.get('/api/admin/stories/:id/sentences', authMiddleware, adminMiddleware, async (c) => {
  const storyId = c.req.param('id');
  const sentences = await c.env.db.prepare('SELECT * FROM story_sentences WHERE story_id = ? ORDER BY sentence_index ASC').all(storyId);
  return c.json(sentences);
});

app.post('/api/admin/stories/:id/sentences', authMiddleware, adminMiddleware, async (c) => {
  const { sentences } = await c.req.json();
  if (!Array.isArray(sentences)) {
    return c.json({ error: '数据格式错误' }, 400);
  }
  const storyId = c.req.param('id');
  const batch = [c.env.db.prepare('DELETE FROM story_sentences WHERE story_id = ?').bind(storyId)];
  for (const s of sentences) {
    batch.push(c.env.db.prepare(`INSERT INTO story_sentences (story_id, sentence_index, english, chinese, audio_file)
      VALUES (?, ?, ?, ?, ?)
    `).bind(storyId, s.sentence_index, s.english, s.chinese || '', s.audio_file || ''));
  }
  await c.env.db.batch(batch);
  return c.json({ success: true });
});

app.post('/api/admin/generate-codes', authMiddleware, adminMiddleware, async (c) => {
  const { count = 10 } = await c.req.json();
  const codes = [];
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const batch = [];
  for (let i = 0; i < count; i++) {
    let code = '';
    for (let j = 0; j < 12; j++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    codes.push(code);
    batch.push(c.env.db.prepare('INSERT INTO redemption_codes (code) VALUES (?)').bind(code));
  }
  await c.env.db.batch(batch);
  return c.json({ success: true, codes });
});

app.get('/api/admin/codes', authMiddleware, adminMiddleware, async (c) => {
  const { status } = c.req.query();
  let query = `SELECT rc.*, u.username as used_by_name 
    FROM redemption_codes rc 
    LEFT JOIN users u ON rc.used_by = u.id`;
  const params = [];
  if (status) {
    query += ' WHERE rc.status = ?';
    params.push(status);
  }
  query += ' ORDER BY rc.id DESC LIMIT 100';
  const codes = await c.env.db.prepare(query).all(...params);
  return c.json(codes);
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (c) => {
  const users = await c.env.db.prepare(`
    SELECT u.id, u.username, u.email, u.is_active, u.is_admin, u.created_at,
    (SELECT COUNT(*) FROM user_progress WHERE user_id = u.id) as story_count,
    (SELECT COALESCE(SUM(read_time), 0) FROM user_progress WHERE user_id = u.id) as total_time
    FROM users u
    WHERE u.is_admin = 0
    ORDER BY u.created_at DESC
  `).all();
  return c.json(users);
});

app.post('/api/admin/users/:id/toggle-active', authMiddleware, adminMiddleware, async (c) => {
  const userId = c.req.param('id');
  const user = await c.env.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    return c.json({ error: '用户不存在' }, 404);
  }
  await c.env.db.prepare('UPDATE users SET is_active = ? WHERE id = ?').bind(user.is_active ? 0 : 1, userId).run();
  return c.json({ success: true, is_active: !user.is_active });
});

app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (c) => {
  const totalUsers = (await c.env.db.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 0').get()).count;
  const activeUsers = (await c.env.db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1 AND is_admin = 0').get()).count;
  const totalCodes = (await c.env.db.prepare('SELECT COUNT(*) as count FROM redemption_codes').get()).count;
  const usedCodes = (await c.env.db.prepare("SELECT COUNT(*) as count FROM redemption_codes WHERE status = 'used'").get()).count;
  const totalStories = (await c.env.db.prepare('SELECT COUNT(*) as count FROM stories').get()).count;
  const popularStories = await c.env.db.prepare(`
    SELECT s.id, s.title, COUNT(up.id) as progress_count
    FROM stories s
    LEFT JOIN user_progress up ON s.id = up.story_id
    GROUP BY s.id
    ORDER BY progress_count DESC
    LIMIT 5
  `).all();
  return c.json({
    totalUsers,
    activeUsers,
    totalCodes,
    usedCodes,
    totalStories,
    todayUsers: 0,
    popularStories
  });
});

export default app;