// StorySpeak Auth - Supabase Cloud Version
// 用户数据存储在云端，手机和电脑可以共用同一个账号

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://ylpeaimlmlruwookbcxk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlscGVhaW1sbWxydXdvb2tiY3hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzODEyMzEsImV4cCI6MjEwMDk1NzIzMX0.S1LkdkgFuhLaFJSNkurSRO-LP9EvNonXUbh8gqDooLk';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Token management
function getToken() {
  return localStorage.getItem('ss_token');
}

function setToken(session) {
  localStorage.setItem('ss_token', session.access_token);
  return session.access_token;
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

async function checkAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = './';
    return false;
  }
  
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    clearToken();
    window.location.href = './';
    return false;
  }
  
  return true;
}

async function logout() {
  await supabase.auth.signOut();
  clearToken();
  window.location.href = './';
}

// Helper: ensure user profile exists
async function ensureUserProfile(userId, email) {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (!existing) {
    const username = email.split('@')[0];
    await supabase.from('users').insert({
      id: userId,
      username: username,
      is_active: false,
      is_admin: false
    });
    return { username, is_active: false, is_admin: false };
  }
  
  return existing;
}

async function api(endpoint, options = {}) {
  const method = options.method || 'GET';
  const body = options.body || {};
  
  // Login
  if (endpoint === '/api/login') {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.login.toLowerCase(),
      password: body.password
    });
    
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('邮箱或密码错误');
      }
      throw new Error(error.message);
    }
    
    const profile = await ensureUserProfile(data.user.id, data.user.email);
    
    const user = {
      id: data.user.id,
      email: data.user.email,
      username: profile?.username || data.user.email.split('@')[0],
      is_active: profile?.is_active ?? false,
      is_admin: profile?.is_admin ?? false
    };
    
    setToken(data.session);
    setUser(user);
    
    return { token: data.session.access_token, user };
  }
  
  // Register
  if (endpoint === '/api/register') {
    const { data, error } = await supabase.auth.signUp({
      email: body.email.toLowerCase(),
      password: body.password
    });
    
    if (error) {
      if (error.message.includes('already registered')) {
        throw new Error('该邮箱已注册，请直接登录');
      }
      throw new Error('注册失败: ' + error.message);
    }
    
    // Profile will be created during first login
    return { success: true };
  }
  
  // User profile
  if (endpoint === '/api/user/profile') {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) throw new Error('请先登录');
    
    const profile = await ensureUserProfile(authUser.id, authUser.email);
    
    const user = {
      id: authUser.id,
      email: authUser.email,
      username: profile?.username || authUser.email.split('@')[0],
      is_active: profile?.is_active ?? false,
      is_admin: profile?.is_admin ?? false
    };
    
    // Get stats
    const { count: totalStories } = await supabase
      .from('user_progress')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', authUser.id);
    
    const { count: completed } = await supabase
      .from('user_progress')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', authUser.id)
      .eq('is_completed', true);
    
    const { count: favorites } = await supabase
      .from('favorites')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', authUser.id);
    
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
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error('请先登录');
    
    await supabase
      .from('users')
      .update({ is_active: true })
      .eq('id', authUser.id);
    
    const user = getUser();
    if (user) {
      user.is_active = true;
      setUser(user);
    }
    
    return { success: true };
  }
  
  // Words
  if (endpoint === '/api/words') {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return [];
    const { data: words } = await supabase.from('saved_words').select('id, word').eq('user_id', authUser.id);
    return words || [];
  }
  
  if (endpoint.match(/^\/api\/words\/.+/) && method === 'DELETE') {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error('请先登录');
    const word = decodeURIComponent(endpoint.split('/').pop());
    await supabase.from('saved_words').delete().eq('user_id', authUser.id).eq('word', word);
    return { success: true };
  }
  
  // Favorites
  if (endpoint === '/api/favorites') {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return [];
    const { data: favs } = await supabase.from('favorites').select('story_id').eq('user_id', authUser.id);
    return favs?.map(f => f.story_id) || [];
  }
  
  if (endpoint.match(/^\/api\/favorites\/\d+$/) && method === 'POST') {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error('请先登录');
    const storyId = parseInt(endpoint.split('/').pop());
    await supabase.from('favorites').upsert({ user_id: authUser.id, story_id: storyId }, { onConflict: 'user_id,story_id' });
    return { success: true };
  }
  
  if (endpoint.match(/^\/api\/favorites\/\d+$/) && method === 'DELETE') {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error('请先登录');
    const storyId = parseInt(endpoint.split('/').pop());
    await supabase.from('favorites').delete().eq('user_id', authUser.id).eq('story_id', storyId);
    return { success: true };
  }
  
  // Progress
  if (endpoint.match(/^\/api\/progress\/\d+$/) && method === 'POST') {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error('请先登录');
    const storyId = parseInt(endpoint.split('/').pop());
    const { data: existing } = await supabase.from('user_progress').select('id').eq('user_id', authUser.id).eq('story_id', storyId).single();
    if (existing) {
      await supabase.from('user_progress').update({ ...body, last_study_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('user_progress').insert({ user_id: authUser.id, story_id: storyId, ...body, last_study_at: new Date().toISOString() });
    }
    return { success: true };
  }
  
  // Admin: stats
  if (endpoint === '/api/admin/stats') {
    if (body.admin_password !== 'admin123') throw new Error('管理员密码错误');
    
    const { data: profiles } = await supabase.from('users').select('*');
    
    const { count: totalCodes } = await supabase.from('redemption_codes').select('*', { count: 'exact', head: true });
    const { count: usedCodes } = await supabase.from('redemption_codes').select('*', { count: 'exact', head: true }).eq('status', 'used');
    
    const today = new Date().toISOString().split('T')[0];
    const todayUsers = (profiles || []).filter(u => u.created_at && u.created_at.startsWith(today)).length;
    
    return {
      totalUsers: (profiles || []).length,
      activeUsers: (profiles || []).filter(u => u.is_active).length,
      totalCodes: totalCodes || 0,
      usedCodes: usedCodes || 0,
      totalStories: 1005,
      todayUsers: todayUsers,
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
      codes.push({ code, status: 'unused', created_at: new Date().toISOString() });
    }
    
    await supabase.from('redemption_codes').insert(codes);
    
    return { codes: codes.map(c => c.code) };
  }
  
  if (endpoint === '/api/admin/codes') {
    if (body.admin_password !== 'admin123') throw new Error('管理员密码错误');
    const { data: codes } = await supabase.from('redemption_codes').select('*').order('created_at', { ascending: false }).limit(100);
    return codes || [];
  }
  
  // Admin: users
  if (endpoint === '/api/admin/users') {
    if (body.admin_password !== 'admin123') throw new Error('管理员密码错误');
    
    const { data: profiles } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    
    return profiles || [];
  }
  
  // Admin: toggle user
  if (endpoint.match(/^\/api\/admin\/users\/.+\/toggle-active$/) && method === 'POST') {
    if (body.admin_password !== 'admin123') throw new Error('管理员密码错误');
    const targetUserId = endpoint.split('/')[3];
    const { data: profile } = await supabase.from('users').select('is_active').eq('id', targetUserId).single();
    await supabase.from('users').update({ is_active: !profile?.is_active }).eq('id', targetUserId);
    return { is_active: !profile?.is_active };
  }
  
  // Change password
  if (endpoint === '/api/change-password') {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error('请先登录');
    if (body.new_password.length < 6) throw new Error('新密码至少6位');
    
    const { error } = await supabase.auth.updateUser({ password: body.new_password });
    if (error) throw new Error('修改密码失败: ' + error.message);
    
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
window.supabase = supabase;
