// Local storage based authentication for demo
const API_BASE = '';

function getToken() {
  return localStorage.getItem('storyspeak_token');
}

function setToken(token) {
  localStorage.setItem('storyspeak_token', token);
}

function clearToken() {
  localStorage.removeItem('storyspeak_token');
  localStorage.removeItem('storyspeak_user');
}

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// Demo API using localStorage
async function api(endpoint, options = {}) {
  const method = options.method || 'GET';
  const body = options.body;
  
  // Register
  if (endpoint === '/api/register' && method === 'POST') {
    const { username, email, password } = body;
    if (!username || !email || !password) {
      throw new Error('请填写完整信息');
    }
    if (password.length < 6) {
      throw new Error('密码至少6位');
    }
    
    // Check if user exists
    const users = JSON.parse(localStorage.getItem('storyspeak_users') || '[]');
    if (users.find(u => u.username === username || u.email === email)) {
      throw new Error('用户名或邮箱已被注册');
    }
    
    // Create user
    const userId = Date.now();
    const user = { id: userId, username, email, password, is_admin: 0, is_active: 1 };
    users.push(user);
    localStorage.setItem('storyspeak_users', JSON.stringify(users));
    
    // Auto login
    const token = 'demo_' + userId;
    setToken(token);
    localStorage.setItem('storyspeak_user', JSON.stringify(user));
    
    return { success: true, userId };
  }
  
  // Login
  if (endpoint === '/api/login' && method === 'POST') {
    const { login, password } = body;
    if (!login || !password) {
      throw new Error('请输入登录信息');
    }
    
    const users = JSON.parse(localStorage.getItem('storyspeak_users') || '[]');
    const user = users.find(u => u.username === login || u.email === login);
    
    if (!user) {
      throw new Error('用户不存在');
    }
    if (user.password !== password) {
      throw new Error('密码错误');
    }
    
    const token = 'demo_' + user.id;
    setToken(token);
    const { password: _, ...safeUser } = user;
    localStorage.setItem('storyspeak_user', JSON.stringify(safeUser));
    
    return { success: true, token, user: safeUser };
  }
  
  // Get profile
  if (endpoint === '/api/user/profile' && method === 'GET') {
    const userStr = localStorage.getItem('storyspeak_user');
    if (!userStr) {
      throw new Error('未登录');
    }
    return JSON.parse(userStr);
  }
  
  // Get stories
  if (endpoint === '/api/stories' && method === 'GET') {
    const userStr = localStorage.getItem('storyspeak_user');
    if (!userStr) {
      throw new Error('未登录');
    }
    
    // Demo stories
    return [
      { id: 1, title: 'The Lion and the Mouse', title_cn: '狮子与老鼠', difficulty: 'easy', category: 'fable' },
      { id: 2, title: 'Cinderella', title_cn: '灰姑娘', difficulty: 'easy', category: 'fairytale' },
      { id: 3, title: 'The Tortoise and the Hare', title_cn: '龟兔赛跑', difficulty: 'easy', category: 'fable' }
    ];
  }
  
  // Get story detail
  if (endpoint.match(/^\/api\/stories\/\d+$/) && method === 'GET') {
    const storyId = parseInt(endpoint.split('/')[3]);
    const sentences = {
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
        { sentence_index: 3, english: 'Slow and steady wins the race.', chinese: '慢而稳定才能赢得比赛。' }
      ]
    };
    
    return {
      id: storyId,
      title: storyId === 1 ? 'The Lion and the Mouse' : storyId === 2 ? 'Cinderella' : 'The Tortoise and the Hare',
      title_cn: storyId === 1 ? '狮子与老鼠' : storyId === 2 ? '灰姑娘' : '龟兔赛跑',
      difficulty: 'easy',
      category: 'fable',
      sentences: sentences[storyId] || []
    };
  }
  
  return { message: 'API' };
}

function showMessage(message, type = 'success') {
  const existing = document.querySelector('.message');
  if (existing) existing.remove();
  
  const div = document.createElement('div');
  div.className = `message message-${type}`;
  div.textContent = message;
  
  const container = document.querySelector('.auth-card') || document.querySelector('.container') || document.body;
  container.insertBefore(div, container.firstChild);
  
  setTimeout(() => div.remove(), 3000);
}

function checkAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = '/';
    return false;
  }
  return true;
}

function logout() {
  clearToken();
  window.location.href = '/';
}
