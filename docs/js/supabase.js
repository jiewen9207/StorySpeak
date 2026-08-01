// Fully local auth - no server needed!
const API_BASE = '';

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
  localStorage.removeItem('ss_users');
  localStorage.removeItem('ss_codes');
  localStorage.removeItem('ss_progress');
  localStorage.removeItem('ss_favorites');
  localStorage.removeItem('ss_words');
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

// User management - all in localStorage
function getUsers() {
  const data = localStorage.getItem('ss_users');
  return data ? JSON.parse(data) : [];
}

function saveUsers(users) {
  localStorage.setItem('ss_users', JSON.stringify(users));
}

function getUserByEmail(email) {
  const users = getUsers();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

function createUser(userData) {
  const users = getUsers();
  if (users.find(u => u.email.toLowerCase() === userData.email.toLowerCase())) {
    throw new Error('该邮箱已注册');
  }
  const user = {
    id: Date.now(),
    username: userData.username,
    email: userData.email.toLowerCase(),
    password: userData.password,
    is_active: false,
    is_admin: userData.email.toLowerCase() === 'admin@storyspeak.com',
    created_at: new Date().toISOString()
  };
  users.push(user);
  saveUsers(users);
  return user;
}

// Redemption codes
function getCodes() {
  const data = localStorage.getItem('ss_codes');
  return data ? JSON.parse(data) : [];
}

function saveCodes(codes) {
  localStorage.setItem('ss_codes', JSON.stringify(codes));
}

// Progress
function getProgress(userId) {
  const data = localStorage.getItem('ss_progress');
  return data ? JSON.parse(data) : [];
}

function saveProgress(progress) {
  localStorage.setItem('ss_progress', JSON.stringify(progress));
}

// Favorites
function getFavorites(userId) {
  const data = localStorage.getItem('ss_favorites');
  return data ? JSON.parse(data) : [];
}

function saveFavorites(favorites) {
  localStorage.setItem('ss_favorites', JSON.stringify(favorites));
}

// Words
function getWords(userId) {
  const data = localStorage.getItem('ss_words');
  return data ? JSON.parse(data) : [];
}

function saveWords(words) {
  localStorage.setItem('ss_words', JSON.stringify(words));
}

// Initialize with default admin and some codes
function initDefaults() {
  // Add admin if not exists
  if (!getUserByEmail('admin@storyspeak.com')) {
    const users = getUsers();
    users.push({
      id: 1,
      username: 'admin',
      email: 'admin@storyspeak.com',
      password: 'admin123',
      is_active: true,
      is_admin: true,
      created_at: '2024-01-01T00:00:00Z'
    });
    saveUsers(users);
  }
  
  // Add some codes if none exist
  if (getCodes().length === 0) {
    const codes = [];
    for (let i = 0; i < 100; i++) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let j = 0; j < 12; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      codes.push({ code, status: 'unused', created_at: new Date().toISOString() });
    }
    saveCodes(codes);
  }
}

// Initialize on load
initDefaults();

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

// API wrapper
async function api(endpoint, options = {}) {
  const method = options.method || 'GET';
  const body = options.body;
  const email = getCurrentEmail();
  
  // Login
  if (endpoint === '/api/login') {
    const user = getUserByEmail(body.login);
    
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
    const user = createUser({
      username: body.username,
      email: body.email,
      password: body.password
    });
    
    return { success: true };
  }
  
  // User profile
  if (endpoint === '/api/user/profile') {
    if (!email) throw new Error('请先登录');
    
    const user = getUserByEmail(email);
    if (!user) throw new Error('用户不存在');
    
    // Get stats
    const progress = getProgress(user.id);
    const favorites = getFavorites(user.id);
    
    user.stats = {
      totalStories: progress.length,
      completedStories: progress.filter(p => p.is_completed).length,
      totalTime: progress.reduce((sum, p) => sum + (p.total_time || 0), 0),
      favorites: favorites.length
    };
    
    setUser(user);
    return user;
  }
  
  // Redeem code
  if (endpoint === '/api/redeem') {
    if (!email) throw new Error('请先登录');
    
    const user = getUserByEmail(email);
    if (!user) throw new Error('用户不存在');
    
    const codes = getCodes();
    const code = codes.find(c => c.code === body.code.trim().toUpperCase());
    
    if (!code) throw new Error('兑换码无效');
    if (code.status === 'used') throw new Error('兑换码已被使用');
    
    // Activate user
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === user.id);
    if (userIndex >= 0) {
      users[userIndex].is_active = true;
      saveUsers(users);
    }
    
    // Mark code as used
    const codeIndex = codes.findIndex(c => c.code === code.code);
    if (codeIndex >= 0) {
      codes[codeIndex].status = 'used';
      codes[codeIndex].used_by = user.id;
      codes[codeIndex].used_at = new Date().toISOString();
      saveCodes(codes);
    }
    
    return { success: true };
  }
  
  // Words
  if (endpoint === '/api/words') {
    if (!email) return [];
    const user = getUserByEmail(email);
    if (!user) return [];
    return getWords(user.id);
  }
  
  if (endpoint.match(/^\/api\/words\/.+/) && method === 'DELETE') {
    if (!email) throw new Error('请先登录');
    const word = decodeURIComponent(endpoint.split('/').pop());
    const user = getUserByEmail(email);
    if (!user) throw new Error('用户不存在');
    
    const words = getWords(user.id);
    const filtered = words.filter(w => w.word !== word);
    saveWords(filtered);
    
    return { success: true };
  }
  
  // Favorites
  if (endpoint === '/api/favorites') {
    if (!email) return [];
    const user = getUserByEmail(email);
    if (!user) return [];
    return getFavorites(user.id).map(f => f.story_id);
  }
  
  if (endpoint.match(/^\/api\/favorites\/\d+$/) && method === 'POST') {
    if (!email) throw new Error('请先登录');
    const storyId = parseInt(endpoint.split('/').pop());
    const user = getUserByEmail(email);
    if (!user) throw new Error('用户不存在');
    
    const favorites = getFavorites(user.id);
    if (!favorites.find(f => f.story_id === storyId)) {
      favorites.push({ story_id: storyId });
      saveFavorites(favorites);
    }
    
    return { success: true };
  }
  
  if (endpoint.match(/^\/api\/favorites\/\d+$/) && method === 'DELETE') {
    if (!email) throw new Error('请先登录');
    const storyId = parseInt(endpoint.split('/').pop());
    const user = getUserByEmail(email);
    if (!user) throw new Error('用户不存在');
    
    const favorites = getFavorites(user.id).filter(f => f.story_id !== storyId);
    saveFavorites(favorites);
    
    return { success: true };
  }
  
  // Progress
  if (endpoint.match(/^\/api\/progress\/\d+$/) && method === 'POST') {
    if (!email) throw new Error('请先登录');
    const storyId = parseInt(endpoint.split('/').pop());
    const user = getUserByEmail(email);
    if (!user) throw new Error('用户不存在');
    
    const progress = getProgress(user.id);
    const existing = progress.findIndex(p => p.story_id === storyId);
    
    if (existing >= 0) {
      progress[existing] = { ...progress[existing], ...body, last_study_at: new Date().toISOString() };
    } else {
      progress.push({ user_id: user.id, story_id: storyId, ...body, last_study_at: new Date().toISOString() });
    }
    
    saveProgress(progress);
    return { success: true };
  }
  
  // Admin: stats
  if (endpoint === '/api/admin/stats') {
    if (!email) throw new Error('请先登录');
    
    const user = getUserByEmail(email);
    if (!user?.is_admin) throw new Error('需要管理员权限');
    
    const users = getUsers();
    const codes = getCodes();
    
    return {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.is_active).length,
      totalCodes: codes.length,
      usedCodes: codes.filter(c => c.status === 'used').length,
      totalStories: 1005,
      todayUsers: users.filter(u => new Date(u.created_at).toDateString() === new Date().toDateString()).length,
      popularStories: []
    };
  }
  
  // Admin: generate codes
  if (endpoint === '/api/admin/generate-codes') {
    if (!email) throw new Error('请先登录');
    
    const user = getUserByEmail(email);
    if (!user?.is_admin) throw new Error('需要管理员权限');
    
    const count = body.count || 10;
    const codes = getCodes();
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const newCodes = [];
    
    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < 12; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      newCodes.push({ code, status: 'unused', created_at: new Date().toISOString() });
    }
    
    codes.push(...newCodes);
    saveCodes(codes);
    
    return { codes: newCodes.map(c => c.code) };
  }
  
  if (endpoint.match(/^\/api\/admin\/codes/)) {
    if (!email) throw new Error('请先登录');
    
    const user = getUserByEmail(email);
    if (!user?.is_admin) throw new Error('需要管理员权限');
    
    const codes = getCodes();
    return codes.slice(-100).reverse();
  }
  
  // Change password
  if (endpoint === '/api/change-password') {
    if (!email) throw new Error('请先登录');
    
    const user = getUserByEmail(email);
    if (!user) throw new Error('用户不存在');
    
    if (body.old_password !== user.password) {
      throw new Error('原密码错误');
    }
    
    if (body.new_password.length < 6) {
      throw new Error('新密码至少6位');
    }
    
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === user.id);
    if (userIndex >= 0) {
      users[userIndex].password = body.new_password;
      saveUsers(users);
    }
    
    return { success: true };
  }
  
  // Admin: users
  if (endpoint === '/api/admin/users') {
    if (!email) throw new Error('请先登录');
    
    const user = getUserByEmail(email);
    if (!user?.is_admin) throw new Error('需要管理员权限');
    
    return getUsers();
  }
  
  if (endpoint.match(/^\/api\/admin\/users\/\d+\/toggle-active$/) && method === 'POST') {
    const userId = parseInt(endpoint.split('/')[3]);
    const users = getUsers();
    const targetUser = users.find(u => u.id === userId);
    
    if (!targetUser) throw new Error('用户不存在');
    
    targetUser.is_active = !targetUser.is_active;
    saveUsers(users);
    
    return { is_active: targetUser.is_active };
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
