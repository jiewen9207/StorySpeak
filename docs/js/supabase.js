// Simple Supabase client for GitHub Pages - no Auth dependency
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://ylpeaimlmlruwookbcxk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlscGVhaW1sbWxydXdvb2tiY3hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3ODU4MjYsImV4cCI6MjA2NTM2MTgyNn0.W7Xq9Vq3T_qFv5zGZi6JqV8aZzYdJQvJc-0m9R2qPjI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Simple token management - just store in localStorage
function getToken() {
  return localStorage.getItem('ss_token');
}

function setToken(email) {
  // Create a simple token from email + timestamp
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

// API wrapper - all operations go through Supabase directly
async function api(endpoint, options = {}) {
  const method = options.method || 'GET';
  const body = options.body;
  const email = getCurrentEmail();
  
  // Login - find or check user in database
  if (endpoint === '/api/login') {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', body.login.toLowerCase())
      .limit(1);
    
    if (error) throw new Error('数据库错误');
    
    const user = users && users.length > 0 ? users[0] : null;
    
    if (!user) {
      throw new Error('用户不存在，请先注册');
    }
    
    // Simple password check (in production, use proper hashing)
    if (user.password !== body.password) {
      throw new Error('密码错误');
    }
    
    const token = setToken(user.email);
    setUser(user);
    
    return {
      token,
      user
    };
  }
  
  // Register - create new user
  if (endpoint === '/api/register') {
    // Check if email exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', body.email.toLowerCase())
      .single();
    
    if (existing) {
      throw new Error('该邮箱已注册，请直接登录');
    }
    
    // Create new user
    const { data, error } = await supabase
      .from('users')
      .insert({
        username: body.username,
        email: body.email.toLowerCase(),
        password: body.password,
        is_active: false,
        is_admin: false,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw new Error('注册失败');
    
    return { success: true };
  }
  
  // User profile
  if (endpoint === '/api/user/profile') {
    if (!email) throw new Error('请先登录');
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error) throw new Error('获取用户信息失败');
    
    // Get stats
    const { count: totalStories } = await supabase
      .from('user_progress')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    
    const { count: completed } = await supabase
      .from('user_progress')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_completed', true);
    
    const { count: favorites } = await supabase
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
    
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (!user) throw new Error('用户不存在');
    
    const { data: code } = await supabase
      .from('redemption_codes')
      .select('*')
      .eq('code', body.code.trim().toUpperCase())
      .single();
    
    if (!code) throw new Error('兑换码无效');
    if (code.status === 'used') throw new Error('兑换码已被使用');
    
    await supabase
      .from('users')
      .update({ is_active: true })
      .eq('id', user.id);
    
    await supabase
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
    
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (!user) return [];
    
    const { data: words } = await supabase
      .from('saved_words')
      .select('id, word')
      .eq('user_id', user.id);
    
    return words || [];
  }
  
  if (endpoint.match(/^\/api\/words\/.+/) && method === 'DELETE') {
    if (!email) throw new Error('请先登录');
    
    const word = decodeURIComponent(endpoint.split('/').pop());
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    await supabase
      .from('saved_words')
      .delete()
      .eq('user_id', user.id)
      .eq('word', word);
    
    return { success: true };
  }
  
  // Favorites - get IDs
  if (endpoint === '/api/favorites') {
    if (!email) return [];
    
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (!user) return [];
    
    const { data: favs } = await supabase
      .from('favorites')
      .select('story_id')
      .eq('user_id', user.id);
    
    return favs?.map(f => f.story_id) || [];
  }
  
  if (endpoint.match(/^\/api\/favorites\/\d+$/) && method === 'POST') {
    if (!email) throw new Error('请先登录');
    
    const storyId = parseInt(endpoint.split('/').pop());
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    await supabase
      .from('favorites')
      .upsert({
        user_id: user.id,
        story_id: storyId
      }, { onConflict: 'user_id,story_id' });
    
    return { success: true };
  }
  
  if (endpoint.match(/^\/api\/favorites\/\d+$/) && method === 'DELETE') {
    if (!email) throw new Error('请先登录');
    
    const storyId = parseInt(endpoint.split('/').pop());
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    await supabase
      .from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('story_id', storyId);
    
    return { success: true };
  }
  
  // Progress
  if (endpoint.match(/^\/api\/progress\/\d+$/) && method === 'POST') {
    if (!email) throw new Error('请先登录');
    
    const storyId = parseInt(endpoint.split('/').pop());
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    const { data: existing } = await supabase
      .from('user_progress')
      .select('id')
      .eq('user_id', user.id)
      .eq('story_id', storyId)
      .single();
    
    if (existing) {
      await supabase
        .from('user_progress')
        .update({
          ...body,
          last_study_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('user_progress')
        .insert({
          user_id: user.id,
          story_id: storyId,
          ...body,
          last_study_at: new Date().toISOString()
        });
    }
    
    return { success: true };
  }
  
  // Admin: stats
  if (endpoint === '/api/admin/stats') {
    if (!email) throw new Error('请先登录');
    
    const { data: profile } = await supabase
      .from('users')
      .select('is_admin')
      .eq('email', email)
      .single();
    
    if (!profile?.is_admin) throw new Error('需要管理员权限');
    
    const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: activeUsers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_active', true);
    const { count: totalCodes } = await supabase.from('redemption_codes').select('*', { count: 'exact', head: true });
    const { count: usedCodes } = await supabase.from('redemption_codes').select('*', { count: 'exact', head: true }).eq('status', 'used');
    const { count: totalStories } = await supabase.from('stories').select('*', { count: 'exact', head: true });
    
    const today = new Date().toISOString().split('T')[0];
    const { count: todayUsers } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', today);
    
    const { data: popularStories } = await supabase.from('stories').select('id, title').limit(5);
    
    return {
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
      totalCodes: totalCodes || 0,
      usedCodes: usedCodes || 0,
      totalStories: totalStories || 0,
      todayUsers: todayUsers || 0,
      popularStories: popularStories || []
    };
  }
  
  // Admin: generate codes
  if (endpoint === '/api/admin/generate-codes') {
    if (!email) throw new Error('请先登录');
    
    const { data: profile } = await supabase
      .from('users')
      .select('is_admin')
      .eq('email', email)
      .single();
    
    if (!profile?.is_admin) throw new Error('需要管理员权限');
    
    const count = body.count || 10;
    const codes = [];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < 12; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      codes.push(code);
    }
    
    const inserts = codes.map(code => ({ code, status: 'unused' }));
    await supabase.from('redemption_codes').insert(inserts);
    
    return { codes };
  }
  
  if (endpoint.match(/^\/api\/admin\/codes/)) {
    if (!email) throw new Error('请先登录');
    
    let query = supabase.from('redemption_codes').select('*').order('created_at', { ascending: false }).limit(100);
    if (endpoint.includes('status=used')) query = query.eq('status', 'used');
    if (endpoint.includes('status=unused')) query = query.eq('status', 'unused');
    
    const { data: codes } = await query;
    return codes || [];
  }
  
  // Admin: users
  if (endpoint === '/api/admin/users') {
    if (!email) throw new Error('请先登录');
    
    const { data: profile } = await supabase
      .from('users')
      .select('is_admin')
      .eq('email', email)
      .single();
    
    if (!profile?.is_admin) throw new Error('需要管理员权限');
    
    const { data: users } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    return users || [];
  }
  
  if (endpoint.match(/^\/api\/admin\/users\/\d+\/toggle-active$/) && method === 'POST') {
    const userId = parseInt(endpoint.split('/')[3]);
    
    const { data: user } = await supabase.from('users').select('is_active').eq('id', userId).single();
    if (!user) throw new Error('用户不存在');
    
    await supabase.from('users').update({ is_active: !user.is_active }).eq('id', userId);
    
    return { is_active: !user.is_active };
  }
  
  throw new Error('Unknown endpoint');
}

// Export
window.supabase = supabase;
window.api = api;
window.showMessage = showMessage;
window.checkAuth = checkAuth;
window.logout = logout;
window.getToken = getToken;
window.setToken = setToken;
window.clearToken = clearToken;
window.getUser = getUser;
window.setUser = setUser;
