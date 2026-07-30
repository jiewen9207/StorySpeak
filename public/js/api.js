// Local storage based authentication with full story database
const API_BASE = '';

// Load stories data
let storiesData = null;

async function loadStoriesData() {
  if (!storiesData) {
    try {
      const response = await fetch('/js/data.json');
      storiesData = await response.json();
    } catch (e) {
      storiesData = { stories: [] };
    }
  }
  return storiesData;
}

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
    
    const users = JSON.parse(localStorage.getItem('storyspeak_users') || '[]');
    if (users.find(u => u.username === username || u.email === email)) {
      throw new Error('用户名或邮箱已被注册');
    }
    
    const userId = Date.now();
    const user = { id: userId, username, email, password, is_admin: 0, is_active: 1 };
    users.push(user);
    localStorage.setItem('storyspeak_users', JSON.stringify(users));
    
    const token = 'demo_' + userId;
    setToken(token);
    const { password: _, ...safeUser } = user;
    localStorage.setItem('storyspeak_user', JSON.stringify(safeUser));
    
    return { success: true, userId: userId };
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
    const user = JSON.parse(userStr);
    const data = await loadStoriesData();
    return {
      ...user,
      stats: {
        totalStories: data.stories.length,
        completedStories: 0,
        totalTime: 0,
        favorites: 0
      }
    };
  }
  
  // Get stories list
  if (endpoint === '/api/stories' && method === 'GET') {
    const userStr = localStorage.getItem('storyspeak_user');
    if (!userStr) {
      throw new Error('未登录');
    }
    const data = await loadStoriesData();
    return data.stories;
  }
  
  // Get story detail
  if (endpoint.match(/^\/api\/stories\/\d+$/) && method === 'GET') {
    const userStr = localStorage.getItem('storyspeak_user');
    if (!userStr) {
      throw new Error('未登录');
    }
    const storyId = parseInt(endpoint.split('/')[3]);
    const data = await loadStoriesData();
    const story = data.stories.find(s => s.id === storyId);
    if (!story) {
      throw new Error('故事不存在');
    }
    return story;
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
