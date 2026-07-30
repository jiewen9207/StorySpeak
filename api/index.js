module.exports = (req, res) => {
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');

  const JWT_SECRET = 'storyspeak-secret-key-2024';

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const path = req.url.split('?')[0];

  // In-memory data
  const users = {};
  
  const stories = [
    { id: 1, title: 'The Lion and the Mouse', title_cn: '狮子与老鼠', difficulty: 'easy', category: 'fable' },
    { id: 2, title: 'Cinderella', title_cn: '灰姑娘', difficulty: 'easy', category: 'fairytale' }
  ];

  // Auth helper
  const getAuthUser = () => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      return { id: decoded.userId, ...users[decoded.userId] };
    } catch { return null; }
  };

  // Register
  if (path === '/api/register' && req.method === 'POST') {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ error: '请填写完整信息' });
    }
    if (Object.values(users).find(u => u.username === username || u.email === email)) {
      return res.status(400).json({ error: '用户名或邮箱已被注册' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    const userId = Date.now().toString();
    users[userId] = { id: userId, username, email, password: hashedPassword, is_admin: 0, is_active: 1 };
    return res.json({ success: true, userId: parseInt(userId) });
  }

  // Login
  if (path === '/api/login' && req.method === 'POST') {
    const { login, password } = req.body || {};
    if (!login || !password) {
      return res.status(400).json({ error: '请输入登录信息' });
    }
    const user = Object.values(users).find(u => u.username === login || u.email === login);
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

  // Get stories
  if (path === '/api/stories' && req.method === 'GET') {
    const authUser = getAuthUser();
    if (!authUser) return res.status(401).json({ error: '未登录' });
    return res.json(stories);
  }

  // Default
  res.json({ message: 'StorySpeak API' });
};
