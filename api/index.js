const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'storyspeak-secret-key-2024';

// In-memory data store (data resets on cold start)
const users = new Map();
const stories = [
  { id: 1, title: 'The Lion and the Mouse', title_cn: '狮子与老鼠', difficulty: 'easy', category: 'fable', cover_image: '' },
  { id: 2, title: 'Cinderella', title_cn: '灰姑娘', difficulty: 'easy', category: 'fairytale', cover_image: '' },
  { id: 3, title: 'The Tortoise and the Hare', title_cn: '龟兔赛跑', difficulty: 'easy', category: 'fable', cover_image: '' }
];

const storySentences = {
  1: [
    { sentence_index: 1, english: 'Once upon a time, a lion was sleeping in the forest.', chinese: '从前，有一只狮子在森林里睡觉。' },
    { sentence_index: 2, english: 'A little mouse came out and started playing near the lion.', chinese: '一只小老鼠出来，在狮子旁边玩耍。' },
    { sentence_index: 3, english: 'The lion woke up and caught the mouse.', chinese: '狮子醒来，抓住了老鼠。' },
    { sentence_index: 4, english: 'Please let me go, and I will help you someday.', chinese: '请放我走，总有一天我会帮助你的。' },
    { sentence_index: 5, english: 'The lion laughed and let the mouse go.', chinese: '狮子笑着放走了老鼠。' }
  ],
  2: [
    { sentence_index: 1, english: 'Cinderella lived with her stepmother and stepsisters.', chinese: '灰姑娘和她的继母、继姐妹住在一起。' },
    { sentence_index: 2, english: 'They made her do all the housework.', chinese: '他们让她做所有的家务。' },
    { sentence_index: 3, english: 'One day, the king invited all the girls to a ball.', chinese: '一天，国王邀请所有女孩参加舞会。' }
  ],
  3: [
    { sentence_index: 1, english: 'The hare was proud of how fast he could run.', chinese: '兔子为它能跑多快而骄傲。' },
    { sentence_index: 2, english: 'He challenged the tortoise to a race.', chinese: '他向乌龟发起挑战，要比赛。' },
    { sentence_index: 3, english: 'The tortoise kept walking slowly but steadily.', chinese: '乌龟一直慢慢但稳定地走着。' }
  ]
};

module.exports = (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.url.split('?')[0];
  const path = url;
  const method = req.method;

  // Auth helper
  const getAuthUser = () => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      return { id: decoded.userId, ...(users.get(decoded.userId) || {}) };
    } catch { return null; }
  };

  // API Routes
  if (path === '/api/register' && method === 'POST') {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ error: '请填写完整信息' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少6位' });
    }
    if (Array.from(users.values()).find(u => u.username === username || u.email === email)) {
      return res.status(400).json({ error: '用户名或邮箱已被注册' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    const userId = Date.now().toString();
    users.set(userId, { id: userId, username, email, password: hashedPassword, is_admin: 0, is_active: 1 });
    return res.json({ success: true, userId: parseInt(userId) });
  }

  if (path === '/api/login' && method === 'POST') {
    const { login, password } = req.body || {};
    if (!login || !password) {
      return res.status(400).json({ error: '请输入登录信息' });
    }
    const user = Array.from(users.values()).find(u => u.username === login || u.email === login);
    if (!user) {
      return res.status(400).json({ error: '用户不存在' });
    }
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(400).json({ error: '密码错误' });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({
      success: true, token,
      user: { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin, is_active: user.is_active }
    });
  }

  if (path === '/api/stories' && method === 'GET') {
    const authUser = getAuthUser();
    if (!authUser) return res.status(401).json({ error: '未登录' });
    return res.json(stories);
  }

  if (path.match(/^\/api\/stories\/(\d+)$/) && method === 'GET') {
    const authUser = getAuthUser();
    if (!authUser) return res.status(401).json({ error: '未登录' });
    const storyId = parseInt(path.match(/^\/api\/stories\/(\d+)$/)[1]);
    const story = stories.find(s => s.id === storyId);
    if (!story) return res.status(404).json({ error: '故事不存在' });
    return res.json({ ...story, sentences: storySentences[storyId] || [] });
  }

  if (path === '/api/user/profile' && method === 'GET') {
    const authUser = getAuthUser();
    if (!authUser) return res.status(401).json({ error: '未登录' });
    return res.json({
      id: authUser.id,
      username: authUser.username,
      email: authUser.email,
      is_admin: authUser.is_admin || 0,
      is_active: authUser.is_active || 1,
      stats: { totalStories: 3, completedStories: 0, totalTime: 0, favorites: 0 }
    });
  }

  // Default response
  res.json({ message: 'StorySpeak API', status: 'running' });
};
