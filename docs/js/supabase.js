// Supabase client for GitHub Pages - Cloud Database Version
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://ylpeaimlmlruwookbcxk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlscGVhaW1sbWxydXdvb2tiY3hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3ODU4MjYsImV4cCI6MjA2NTM2MTgyNn0.W7Xq9Vq3T_qFv5zGZi6JqV8aZzYdJQvJc-0m9R2qPjI';
const SUPABASE_SERVICE_KEY = 'sb_secret_4uLoN1Y-clm-KPgc-_KIgA_HTD0AtIU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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
  const body = options.body || {};
  const email = getCurrentEmail();
  
  // Login
  if (endpoint === '/api/login') {
    const loginEmail = body.login.toLowerCase();
    
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', loginEmail)
      .limit(1);
    
    if (error) throw new Error('数据库错误: ' + error.message);
    
    const user = users && users.length > 0 ? users[0] : null;
    
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
    
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', regEmail)
      .single();
    
    if (existing) {
      throw new Error('该邮箱已注册，请直接登录');
    }
    
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert({
        username: body.username,
        email: regEmail,
        password: body.password,
        is_active: false,
        is_admin: false,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw new Error('注册失败: ' + error.message);
    
    return { success: true };
  }
  
  // User profile
  if (endpoint === '/api/user/profile') {
    if (!email) throw new Error('请先登录');
    
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error) throw new Error('获取用户信息失败');
    
    // Get stats
    const { count: totalStories } = await supabaseAdmin
      .from('user_progress')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    
    const { count: completed } = await supabaseAdmin
      .from('user_progress')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_completed', true);
    
    const { count: favorites } = await supabaseAdmin
      .from('favorites')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    
    user.stats = {
      totalStories: totalStories || 0,
      completedStories: completed || 0,
      totalTime: 0,
      favorites: favorites || 0
    };
    
    setUser(user);
    return user;
  }
  
  // Redeem code
  if (endpoint === '/api/redeem') {
    if (!email) throw new Error('请先登录');
    
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (!user) throw new Error('用户不存在');
    
    const { data: code } = await supabaseAdmin
      .from('redemption_codes')
      .select('*')
      .eq('code', body.code.trim().toUpperCase())
      .single();
    
    if (!code) throw new Error('兑换码无效');
    if (code.status === 'used') throw new Error('兑换码已被使用');
    
    await supabaseAdmin
      .from('users')
      .update({ is_active: true })
      .eq('id', user.id);
    
    await supabaseAdmin
      .from('redemption_codes')
      .update({
        status: 'used',
        used_by: user.id,
        used_at: new Date().toISOString()
      })
      .eq('id', code.id);
    
    return { success: true };
  }
  
  // Words
  if (endpoint === '/api/words') {
    if (!email) return [];
    const { data: user } = await supabaseAdmin.from('users').select('id').eq('email', email).single();
    if (!user) return [];
    const { data: words } = await supabaseAdmin.from('saved_words').select('id, word').eq('user_id', user.id);
    return words || [];
  }
  
  if (endpoint.match(/^\/api\/words\/.+/) && method === 'DELETE') {
    if (!email) throw new Error('请先登录');
    const word = decodeURIComponent(endpoint.split('/').pop());
    const { data: user } = await supabaseAdmin.from('users').select('id').eq('email', email).single();
    await supabaseAdmin.from('saved_words').delete().eq('user_id', user.id).eq('word', word);
    return { success: true };
  }
  
  // Favorites
  if (endpoint === '/api/favorites') {
    if (!email) return [];
    const { data: user } = await supabaseAdmin.from('users').select('id').eq('email', email).single();
    if (!user) return [];
    const { data: favs } = await supabaseAdmin.from('favorites').select('story_id').eq('user_id', user.id);
    return favs?.map(f => f.story_id) || [];
  }
  
  if (endpoint.match(/^\/api\/favorites\/\d+$/) && method === 'POST') {
    if (!email) throw new Error('请先登录');
    const storyId = parseInt(endpoint.split('/').pop());
    const { data: user } = await supabaseAdmin.from('users').select('id').eq('email', email).single();
    await supabaseAdmin.from('favorites').upsert({ user_id: user.id, story_id: storyId }, { onConflict: 'user_id,story_id' });
    return { success: true };
  }
  
  if (endpoint.match(/^\/api\/favorites\/\d+$/) && method === 'DELETE') {
    if (!email) throw new Error('请先登录');
    const storyId = parseInt(endpoint.split('/').pop());
    const { data: user } = await supabaseAdmin.from('users').select('id').eq('email', email).single();
    await supabaseAdmin.from('favorites').delete().eq('user_id', user.id).eq('story_id', storyId);
    return { success: true };
  }
  
  // Progress
  if (endpoint.match(/^\/api\/progress\/\d+$/) && method === 'POST') {
    if (!email) throw new Error('请先登录');
    const storyId = parseInt(endpoint.split('/').pop());
    const { data: user } = await supabaseAdmin.from('users').select('id').eq('email', email).single();
    const { data: existing } = await supabaseAdmin.from('user_progress').select('id').eq('user_id', user.id).eq('story_id', storyId).single();
    if (existing) {
      await supabaseAdmin.from('user_progress').update({ ...body, last_study_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('user_progress').insert({ user_id: user.id, story_id: storyId, ...body, last_study_at: new Date().toISOString() });
    }
    return { success: true };
  }
  
  // Admin: stats
  if (endpoint === '/api/admin/stats') {
    if (body.admin_password !== 'admin123') throw new Error('管理员密码错误');
    
    const { count: totalUsers } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true });
    const { count: activeUsers } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('is_active', true);
    const { count: totalCodes } = await supabaseAdmin.from('redemption_codes').select('*', { count: 'exact', head: true });
    const { count: usedCodes } = await supabaseAdmin.from('redemption_codes').select('*', { count: 'exact', head: true }).eq('status', 'used');
    
    const today = new Date().toISOString().split('T')[0];
    const { count: todayUsers } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).gte('created_at', today);
    
    return {
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
      totalCodes: totalCodes || 0,
      usedCodes: usedCodes || 0,
      totalStories: 1005,
      todayUsers: todayUsers || 0,
      popularStories: []
    };
  }
  
  // Admin: generate codes
  if (endpoint === '/api/admin/generate-codes') {
    if (body.admin_password !== 'admin123') throw new Error('管理员密码错误');
    
    const count = body.count || 10;
    const codes = [];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < 12; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      codes.push({ code, status: 'unused' });
    }
    
    await supabaseAdmin.from('redemption_codes').insert(codes);
    
    return { codes: codes.map(c => c.code) };
  }
  
  if (endpoint === '/api/admin/codes') {
    if (body.admin_password !== 'admin123') throw new Error('管理员密码错误');
    const { data: codes } = await supabaseAdmin.from('redemption_codes').select('*').order('created_at', { ascending: false }).limit(100);
    return codes || [];
  }
  
  // Admin: users
  if (endpoint === '/api/admin/users') {
    if (body.admin_password !== 'admin123') throw new Error('管理员密码错误');
    const { data: users } = await supabaseAdmin.from('users').select('*').order('created_at', { ascending: false });
    return users || [];
  }
  
  if (endpoint.match(/^\/api\/admin\/users\/\d+\/toggle-active$/) && method === 'POST') {
    if (body.admin_password !== 'admin123') throw new Error('管理员密码错误');
    const userId = parseInt(endpoint.split('/')[3]);
    const { data: user } = await supabaseAdmin.from('users').select('is_active').eq('id', userId).single();
    if (!user) throw new Error('用户不存在');
    await supabaseAdmin.from('users').update({ is_active: !user.is_active }).eq('id', userId);
    return { is_active: !user.is_active };
  }
  
  // Change password
  if (endpoint === '/api/change-password') {
    if (!email) throw new Error('请先登录');
    const { data: user } = await supabaseAdmin.from('users').select('id, password').eq('email', email).single();
    if (!user) throw new Error('用户不存在');
    if (body.old_password !== user.password) throw new Error('原密码错误');
    if (body.new_password.length < 6) throw new Error('新密码至少6位');
    await supabaseAdmin.from('users').update({ password: body.new_password }).eq('id', user.id);
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
