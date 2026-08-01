// StorySpeak Auth - LocalStorage Version
// 用户数据存储在浏览器本地，跨浏览器需要导出导入

// Token management
function getToken() {
  return localStorage.getItem('ss_token');
}

function setToken(email) {
  const token = btoa(email + ':' + Date.now());
  localStorage.setItem('ss_token', token);
  localStorage.setItem('ss_email', email);
  return token;
}

function clearToken() {
  localStorage.removeItem('ss_token');
  localStorage.removeItem('ss_email');
  localStorage.removeItem('ss_user');
}

function setUser(user) {
  localStorage.setItem('ss_user', JSON.stringify(user));
}

function getUser() {
  const data = localStorage.getItem('ss_user');
  return data ? JSON.parse(data) : null;
}

function getCurrentEmail() {
  return localStorage.getItem('ss_email');
}

// LocalStorage helpers for users
function getUsers() {
  const data = localStorage.getItem('ss_users');
  return data ? JSON.parse(data) : [];
}

function setUsers(users) {
  localStorage.setItem('ss_users', JSON.stringify(users));
}

// Show message
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

// Auth check
async function checkAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = './';
    return false;
  }
  return true;
}

// Logout
async function logout() {
  clearToken();
  window.location.href = './';
}

// API wrapper - 使用 localStorage 存储
async function api(endpoint, options = {}) {
  const method = options.method || 'GET';
  const body = options.body || {};
  const email = getCurrentEmail();
  
  // Login
  if (endpoint === '/api/login') {
    const loginEmail = body.login.toLowerCase();
    const users = getUsers();
    const user = users.find(u => u.email === loginEmail);
    
    if (!user) {
      throw new Error('用户不存在，请先注册');
    }
    
    if (user.password !== body.password) {
      throw new Error('密码错误');
    }
    
    const token = setToken(user.email);
    setUser(user);
    
    return { token, user };
  }
  
  // Register
  if (endpoint === '/api/register') {
    const regEmail = body.email.toLowerCase();
    const users = getUsers();
    
    if (users.find(u => u.email === regEmail)) {
      throw new Error('该邮箱已注册，请直接登录');
    }
    
    const newUser = {
      id: Date.now(),
      username: body.username,
      email: regEmail,
      password: body.password,
      is_active: true,
      is_admin: false,
      created_at: new Date().toISOString()
    };
    
    users.push(newUser);
    setUsers(users);
    
    return { success: true };
  }
  
  // User profile
  if (endpoint === '/api/user/profile') {
    if (!email) throw new Error('请先登录');
    
    const users = getUsers();
    const user = users.find(u => u.email === email);
    
    if (!user) throw new Error('用户不存在');
    
    const progress = JSON.parse(localStorage.getItem('ss_progress') || '[]');
    const favorites = JSON.parse(localStorage.getItem('ss_favorites') || '[]');
    
    user.stats = {
      totalStories: progress.filter(p => p.user_id === user.id).length,
      completedStories: progress.filter(p => p.user_id === user.id && p.is_completed).length,
      totalTime: 0,
      favorites: favorites.filter(f => f.user_id === user.id).length
    };
    
    setUser(user);
    return user;
  }
  
  // Redeem code
  if (endpoint === '/api/redeem') {
    if (!email) throw new Error('请先登录');
    
    const users = getUsers();
    const user = users.find(u => u.email === email);
    
    if (!user) throw new Error('用户不存在');
    
    return { success: true };
  }
  
  // Words
  if (endpoint === '/api/words') {
    if (!email) return [];
    const users = getUsers();
    const user = users.find(u => u.email === email);
    if (!user) return [];
    const words = JSON.parse(localStorage.getItem('ss_words') || '[]');
    return words.filter(w => w.user_id === user.id);
  }
  
  if (endpoint.match(/^\/api\/words\/.+/) && method === 'DELETE') {
    if (!email) throw new Error('请先登录');
    const word = decodeURIComponent(endpoint.split('/').pop());
    const users = getUsers();
    const user = users.find(u => u.email === email);
    const words = JSON.parse(localStorage.getItem('ss_words') || '[]');
    const filtered = words.filter(w => !(w.user_id === user.id && w.word === word));
    localStorage.setItem('ss_words', JSON.stringify(filtered));
    return { success: true };
  }
  
  // Favorites
  if (endpoint === '/api/favorites') {
    if (!email) return [];
    const users = getUsers();
    const user = users.find(u => u.email === email);
    if (!user) return [];
    const favorites = JSON.parse(localStorage.getItem('ss_favorites') || '[]');
    return favorites.filter(f => f.user_id === user.id).map(f => f.story_id);
  }
  
  if (endpoint.match(/^\/api\/favorites\/\d+$/) && method === 'POST') {
    if (!email) throw new Error('请先登录');
    const storyId = parseInt(endpoint.split('/').pop());
    const users = getUsers();
    const user = users.find(u => u.email === email);
    const favorites = JSON.parse(localStorage.getItem('ss_favorites') || '[]');
    if (!favorites.find(f => f.user_id === user.id && f.story_id === storyId)) {
      favorites.push({ user_id: user.id, story_id: storyId });
      localStorage.setItem('ss_favorites', JSON.stringify(favorites));
    }
    return { success: true };
  }
  
  if (endpoint.match(/^\/api\/favorites\/\d+$/) && method === 'DELETE') {
    if (!email) throw new Error('请先登录');
    const storyId = parseInt(endpoint.split('/').pop());
    const users = getUsers();
    const user = users.find(u => u.email === email);
    const favorites = JSON.parse(localStorage.getItem('ss_favorites') || '[]');
    const filtered = favorites.filter(f => !(f.user_id === user.id && f.story_id === storyId));
    localStorage.setItem('ss_favorites', JSON.stringify(filtered));
    return { success: true };
  }
  
  // Progress
  if (endpoint.match(/^\/api\/progress\/\d+$/) && method === 'POST') {
    if (!email) throw new Error('请先登录');
    const storyId = parseInt(endpoint.split('/').pop());
    const users = getUsers();
    const user = users.find(u => u.email === email);
    const progress = JSON.parse(localStorage.getItem('ss_progress') || '[]');
    
    const existingIdx = progress.findIndex(p => p.user_id === user.id && p.story_id === storyId);
    if (existingIdx >= 0) {
      progress[existingIdx] = { ...progress[existingIdx], ...body, last_study_at: new Date().toISOString() };
    } else {
      progress.push({ user_id: user.id, story_id: storyId, ...body, last_study_at: new Date().toISOString() });
    }
    localStorage.setItem('ss_progress', JSON.stringify(progress));
    return { success: true };
  }
  
  // Admin: stats
  if (endpoint === '/api/admin/stats') {
    if (body.admin_password !== 'admin123') throw new Error('管理员密码错误');
    
    const users = getUsers();
    const codes = JSON.parse(localStorage.getItem('ss_codes') || '[]');
    
    const today = new Date().toISOString().split('T')[0];
    
    return {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.is_active).length,
      totalCodes: codes.length,
      usedCodes: codes.filter(c => c.status === 'used').length,
      totalStories: 1005,
      todayUsers: users.filter(u => u.created_at.startsWith(today)).length,
      popularStories: []
    };
  }
  
  // Admin: generate codes
  if (endpoint === '/api/admin/generate-codes') {
    if (body.admin_password !== 'admin123') throw new Error('管理员密码错误');
    
    const count = body.count || 10;
    const codes = JSON.parse(localStorage.getItem('ss_codes') || '[]');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    const newCodes = [];
    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < 12; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      codes.push({ code, status: 'unused', created_at: new Date().toISOString() });
      newCodes.push(code);
    }
    
    localStorage.setItem('ss_codes', JSON.stringify(codes));
    
    return { codes: newCodes };
  }
  
  if (endpoint === '/api/admin/codes') {
    if (body.admin_password !== 'admin123') throw new Error('管理员密码错误');
    const codes = JSON.parse(localStorage.getItem('ss_codes') || '[]');
    return codes.slice(-100).reverse();
  }
  
  // Admin: users
  if (endpoint === '/api/admin/users') {
    if (body.admin_password !== 'admin123') throw new Error('管理员密码错误');
    const users = getUsers();
    return users.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  
  if (endpoint.match(/^\/api\/admin\/users\/\d+\/toggle-active$/) && method === 'POST') {
    if (body.admin_password !== 'admin123') throw new Error('管理员密码错误');
    const userId = parseInt(endpoint.split('/')[3]);
    const users = getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) throw new Error('用户不存在');
    user.is_active = !user.is_active;
    setUsers(users);
    return { is_active: user.is_active };
  }
  
  // Change password
  if (endpoint === '/api/change-password') {
    if (!email) throw new Error('请先登录');
    const users = getUsers();
    const user = users.find(u => u.email === email);
    if (!user) throw new Error('用户不存在');
    if (body.old_password !== user.password) throw new Error('原密码错误');
    if (body.new_password.length < 6) throw new Error('新密码至少6位');
    user.password = body.new_password;
    setUsers(users);
    setUser(user);
    return { success: true };
  }
  
  throw new Error('Unknown endpoint');
}

// Export
window.api = api;
window.showMessage = showMessage;
window.checkAuth = checkAuth;
window.logout = logout;
window.getToken = getToken;
window.setToken = setToken;
window.clearToken = clearToken;
window.getUser = getUser;
window.setUser = setUser;
