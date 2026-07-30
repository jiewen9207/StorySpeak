const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'storyspeak-secret-key-2024';

// In-memory data store for demo (in production, use a real database)
const users = new Map();
const redemptionCodes = new Map([
  ['DEMO2024', { status: 'available', usedBy: null }]
]);

// Demo stories data
const stories = [
  { id: 1, title: 'The Lion and the Mouse', title_cn: '狮子与老鼠', difficulty: 'easy', category: 'fable' },
  { id: 2, title: 'Cinderella', title_cn: '灰姑娘', difficulty: 'easy', category: 'fairytale' },
  { id: 3, title: 'The Tortoise and the Hare', title_cn: '龟兔赛跑', difficulty: 'easy', category: 'fable' }
];

const storySentences = {
  1: [
    { sentence_index: 1, english: 'Once upon a time, a lion was sleeping in the forest.', chinese: '从前，有一只狮子在森林里睡觉。' },
    { sentence_index: 2, english: 'A little mouse came out and started playing near the lion.', chinese: '一只小老鼠出来，在狮子旁边玩耍。' },
    { sentence_index: 3, english: 'The lion woke up and caught the mouse.', chinese: '狮子醒来，抓住了老鼠。' },
    { sentence_index: 4, english: 'Please let me go, and I will help you someday.', chinese: '请放我走，总有一天我会帮助你的。' },
    { sentence_index: 5, english: 'The lion laughed and let the mouse go.', chinese: '狮子笑着放走了老鼠。' },
    { sentence_index: 6, english: 'Later, the lion was caught in a hunter\'s net.', chinese: '后来，狮子被猎人的网困住了。' },
    { sentence_index: 7, english: 'The mouse gnawed through the ropes and saved the lion.', chinese: '老鼠咬断了绳子，救了狮子。' },
    { sentence_index: 8, english: 'True friends can be found in the smallest places.', chinese: '真正的朋友可以在最小的地方找到。' }
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

  const { url, method, body } = req;
  const path = url.split('?')[0];

  // Auth helper
  const getAuthUser = () => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    try {
      return jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    } catch { return null; }
  };

  // Routes
  if (path === '/api/register' && method === 'POST') {
    const { username, email, password } = body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ error: '请填写完整信息' });
    }
    if (users.has(username)) {
      return res.status(400).json({ error: '用户名已被注册' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    const userId = Date.now();
    users.set(username, { id: userId, username, email, password: hashedPassword, is_admin: 0, is_active: 1 });
    return res.json({ success: true, userId });
  }

  if (path === '/api/login' && method === 'POST') {
    const { login, password } = body || {};
    if (!login || !password) {
      return res.status(400).json({ error: '请输入登录信息' });
    }
    const user = users.get(login);
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

  if (path.startsWith('/api/stories') && method === 'GET') {
    const authUser = getAuthUser();
    if (!authUser) return res.status(401).json({ error: '未登录' });
    const storyId = parseInt(path.split('/')[3]);
    if (storyId) {
      const story = stories.find(s => s.id === storyId);
      if (!story) return res.status(404).json({ error: '故事不存在' });
      return res.json({ ...story, sentences: storySentences[storyId] || [] });
    }
    return res.json(stories);
  }

  // Default response
  res.json({ message: 'StorySpeak API', status: 'running' });
};
