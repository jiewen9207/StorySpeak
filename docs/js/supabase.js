// Supabase client for browser - GitHub Pages deployment
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://ylpeaimlmlruwookbcxk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlscGVhaW1sbWxydXdvb2tiY3hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3ODU4MjYsImV4cCI6MjA2NTM2MTgyNn0.W7Xq9Vq3T_qFv5zGZi6JqV8aZzYdJQvJc-0m9R2qPjI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Token management
function getToken() {
  return localStorage.getItem('sb_token');
}

function setToken(token) {
  localStorage.setItem('sb_token', token);
}

function clearToken() {
  localStorage.removeItem('sb_token');
  localStorage.removeItem('sb_refresh_token');
  localStorage.removeItem('sb_user');
}

function setUser(user) {
  localStorage.setItem('sb_user', JSON.stringify(user));
}

function getUser() {
  const data = localStorage.getItem('sb_user');
  return data ? JSON.parse(data) : null;
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
  
  const { data: { user }, error } = await supabase.auth.setSession({
    access_token: token,
    refresh_token: localStorage.getItem('sb_refresh_token') || ''
  });
  
  if (error || !user) {
    clearToken();
    window.location.href = './';
    return false;
  }
  
  return true;
}

// Logout
async function logout() {
  await supabase.auth.signOut();
  clearToken();
  window.location.href = './';
}

// Get session
async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// API wrapper
async function api(endpoint, options = {}) {
  const method = options.method || 'GET';
  const body = options.body;
  const session = await getSession();
  
  // Login
  if (endpoint === '/api/login') {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.login,
      password: body.password
    });
    
    if (error) throw new Error(error.message);
    
    setToken(data.session.access_token);
    localStorage.setItem('sb_refresh_token', data.session.refresh_token);
    
    // Get profile
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('email', data.user.email)
      .single();
    
    setUser(profile || { email: data.user.email });
    
    return {
      token: data.session.access_token,
      user: profile || { email: data.user.email }
    };
  }
  
  // Register
  if (endpoint === '/api/register') {
    // Check existing
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', body.email)
      .single();
    
    if (existing) throw new Error('该邮箱已注册');
    
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password
    });
    
    if (error) throw new Error(error.message);
    
    // Create profile
    await supabase
      .from('users')
      .insert({
        username: body.username,
        email: body.email,
        is_active: false,
        is_admin: false
      });
    
    return { success: true };
  }
  
  // User profile
  if (endpoint === '/api/user/profile') {
    if (!session) throw new Error('请先登录');
    
    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', session.user.email)
      .single();
    
    if (error) throw new Error(error.message);
    
    // Get stats
    const { count: totalStories } = await supabase
      .from('user_progress')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id);
    
    const { count: completed } = await supabase
      .from('user_progress')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('is_completed', true);
    
    const { count: favorites } = await supabase
      .from('favorites')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id);
    
    profile.stats = {
      totalStories: totalStories || 0,
      completedStories: completed || 0,
      totalTime: 0,
      favorites: favorites || 0
    };
    
    return profile;
  }
  
  // Redeem code
  if (endpoint === '/api/redeem') {
    if (!session) throw new Error('请先登录');
    
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    
    if (!profile) throw new Error('用户不存在');
    
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
      .eq('id', profile.id);
    
    await supabase
      .from('redemption_codes')
      .update({
        status: 'used',
        used_by: profile.id,
        used_at: new Date().toISOString()
      })
      .eq('id', code.id);
    
    return { success: true };
  }
  
  // Words
  if (endpoint === '/api/words') {
    if (!session) return [];
    
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    
    if (!profile) return [];
    
    const { data: words } = await supabase
      .from('saved_words')
      .select('id, word')
      .eq('user_id', profile.id);
    
    return words || [];
  }
  
  if (endpoint.match(/^\/api\/words\/.+/) && method === 'DELETE') {
    if (!session) throw new Error('请先登录');
    
    const word = decodeURIComponent(endpoint.split('/').pop());
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    
    await supabase
      .from('saved_words')
      .delete()
      .eq('user_id', profile.id)
      .eq('word', word);
    
    return { success: true };
  }
  
  // Favorites
  if (endpoint === '/api/favorites') {
    if (!session) return [];
    
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    
    if (!profile) return [];
    
    const { data: favs } = await supabase
      .from('favorites')
      .select('story_id')
      .eq('user_id', profile.id);
    
    return favs?.map(f => f.story_id) || [];
  }
  
  if (endpoint.match(/^\/api\/favorites\/\d+$/) && method === 'POST') {
    if (!session) throw new Error('请先登录');
    
    const storyId = parseInt(endpoint.split('/').pop());
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    
    await supabase
      .from('favorites')
      .upsert({
        user_id: profile.id,
        story_id: storyId
      }, { onConflict: 'user_id,story_id' });
    
    return { success: true };
  }
  
  if (endpoint.match(/^\/api\/favorites\/\d+$/) && method === 'DELETE') {
    if (!session) throw new Error('请先登录');
    
    const storyId = parseInt(endpoint.split('/').pop());
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    
    await supabase
      .from('favorites')
      .delete()
      .eq('user_id', profile.id)
      .eq('story_id', storyId);
    
    return { success: true };
  }
  
  // Progress
  if (endpoint.match(/^\/api\/progress\/\d+$/) && method === 'POST') {
    if (!session) throw new Error('请先登录');
    
    const storyId = parseInt(endpoint.split('/').pop());
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    
    const { data: existing } = await supabase
      .from('user_progress')
      .select('id')
      .eq('user_id', profile.id)
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
          user_id: profile.id,
          story_id: storyId,
          ...body,
          last_study_at: new Date().toISOString()
        });
    }
    
    return { success: true };
  }
  
  // Admin: stats
  if (endpoint === '/api/admin/stats') {
    if (!session) throw new Error('请先登录');
    
    const { data: profile } = await supabase
      .from('users')
      .select('is_admin')
      .eq('email', session.user.email)
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
  
  // Admin: codes
  if (endpoint === '/api/admin/generate-codes') {
    if (!session) throw new Error('请先登录');
    
    const { data: profile } = await supabase
      .from('users')
      .select('is_admin')
      .eq('email', session.user.email)
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
    if (!session) throw new Error('请先登录');
    
    let query = supabase.from('redemption_codes').select('*').order('created_at', { ascending: false }).limit(100);
    if (endpoint.includes('status=used')) query = query.eq('status', 'used');
    if (endpoint.includes('status=unused')) query = query.eq('status', 'unused');
    
    const { data: codes } = await query;
    return codes || [];
  }
  
  // Admin: users
  if (endpoint === '/api/admin/users') {
    if (!session) throw new Error('请先登录');
    
    const { data: profile } = await supabase
      .from('users')
      .select('is_admin')
      .eq('email', session.user.email)
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
  
  // Admin: stories
  if (endpoint === '/api/admin/stories') {
    if (!session) throw new Error('请先登录');
    
    const { data: profile } = await supabase
      .from('users')
      .select('is_admin')
      .eq('email', session.user.email)
      .single();
    
    if (!profile?.is_admin) throw new Error('需要管理员权限');
    
    if (method === 'POST') {
      const { data, error } = await supabase
        .from('stories')
        .insert({
          title: body.title,
          title_cn: body.title_cn,
          difficulty: body.difficulty,
          category: body.category,
          cover_image: body.cover_image
        })
        .select()
        .single();
      
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    
    const { data: stories } = await supabase
      .from('stories')
      .select('*')
      .order('created_at', { ascending: false });
    
    return stories || [];
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
