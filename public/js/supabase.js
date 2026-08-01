// Supabase client configuration for GitHub Pages deployment
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Supabase project credentials
const SUPABASE_URL = 'https://ylpeaimlmlruwookbcxk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlscGVhaW1sbWxydXdvb2tiY3hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3ODU4MjYsImV4cCI6MjA2NTM2MTgyNn0.W7Xq9Vq3T_qFv5zGZi6JqV8aZzYdJQvJc-0m9R2qPjI';

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Storage helpers
function getToken() {
  return localStorage.getItem('sb_token');
}

function setToken(token) {
  localStorage.setItem('sb_token', token);
}

function clearToken() {
  localStorage.removeItem('sb_token');
  localStorage.removeItem('sb_user');
}

function getCurrentUser() {
  const userData = localStorage.getItem('sb_user');
  return userData ? JSON.parse(userData) : null;
}

// Load stories data
let storiesData = null;

async function loadStoriesData() {
  if (!storiesData) {
    try {
      const response = await fetch('./js/data.json');
      storiesData = await response.json();
    } catch (e) {
      storiesData = { stories: [] };
    }
  }
  return storiesData;
}

// Message display
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
  
  // Restore Supabase session
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

// Get current session
async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// API wrapper using Supabase
async function api(endpoint, options = {}) {
  const method = options.method || 'GET';
  const body = options.body;
  
  // For Supabase direct calls, use these functions instead
  // This is kept for backward compatibility but should use Supabase directly
  const session = await getSession();
  
  // Map old API endpoints to Supabase operations
  if (endpoint === '/api/login') {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.login,
      password: body.password
    });
    
    if (error) throw new Error(error.message);
    
    setToken(data.session.access_token);
    localStorage.setItem('sb_refresh_token', data.session.refresh_token);
    
    // Get user profile from custom table
    const { data: profile } = await supabase
      .from('users')
      .select('*, is_admin')
      .eq('email', data.user.email)
      .single();
    
    if (profile) {
      localStorage.setItem('sb_user', JSON.stringify(profile));
    }
    
    return {
      token: data.session.access_token,
      user: profile || { email: data.user.email }
    };
  }
  
  if (endpoint === '/api/register') {
    // Check if email already exists in users table
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', body.email)
      .single();
    
    if (existing) {
      throw new Error('该邮箱已注册，请直接登录');
    }
    
    // Sign up with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: {
          username: body.username
        }
      }
    });
    
    if (error) throw new Error(error.message);
    
    // Create user profile in custom table
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        username: body.username,
        email: body.email,
        is_active: false,
        is_admin: false
      });
    
    if (profileError) {
      console.error('Profile creation error:', profileError);
    }
    
    return { success: true };
  }
  
  if (endpoint === '/api/user/profile') {
    const session = await getSession();
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
    
    const { count: completedStories } = await supabase
      .from('user_progress')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('is_completed', true);
    
    const { data: progressData } = await supabase
      .from('user_progress')
      .select('total_time')
      .eq('user_id', profile.id);
    
    const totalTime = progressData?.reduce((sum, p) => sum + (p.total_time || 0), 0) || 0;
    
    const { count: favorites } = await supabase
      .from('favorites')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id);
    
    profile.stats = {
      totalStories: totalStories || 0,
      completedStories: completedStories || 0,
      totalTime,
      favorites: favorites || 0
    };
    
    return profile;
  }
  
  if (endpoint === '/api/activate') {
    const session = await getSession();
    if (!session) throw new Error('请先登录');
    
    const code = body.code;
    
    // Check redemption code
    const { data: redemption, error: codeError } = await supabase
      .from('redemption_codes')
      .select('*')
      .eq('code', code)
      .single();
    
    if (codeError || !redemption) {
      throw new Error('兑换码无效');
    }
    
    if (redemption.status === 'used') {
      throw new Error('兑换码已被使用');
    }
    
    // Get user profile
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    
    if (!profile) throw new Error('用户不存在');
    
    // Activate user
    await supabase
      .from('users')
      .update({ is_active: true })
      .eq('id', profile.id);
    
    // Mark code as used
    await supabase
      .from('redemption_codes')
      .update({
        status: 'used',
        used_by: profile.id,
        used_at: new Date().toISOString()
      })
      .eq('id', redemption.id);
    
    return { success: true, message: '账户激活成功！' };
  }
  
  if (endpoint === '/api/words') {
    const session = await getSession();
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
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    
    return words || [];
  }
  
  if (endpoint.startsWith('/api/words/') && method === 'DELETE') {
    const session = await getSession();
    if (!session) throw new Error('请先登录');
    
    const word = decodeURIComponent(endpoint.split('/').pop());
    
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    
    if (!profile) throw new Error('用户不存在');
    
    await supabase
      .from('saved_words')
      .delete()
      .eq('user_id', profile.id)
      .eq('word', word);
    
    return { success: true };
  }
  
  if (endpoint === '/api/stories') {
    const { data: stories } = await supabase
      .from('stories')
      .select(`
        *,
        sentences:sentences(count)
      `)
      .order('created_at', { ascending: false });
    
    return stories?.map(s => ({
      ...s,
      sentence_count: s.sentences?.[0]?.count || 0
    })) || [];
  }
  
  if (endpoint.match(/^\/api\/stories\/\d+$/)) {
    const storyId = endpoint.split('/').pop();
    
    const { data: story } = await supabase
      .from('stories')
      .select(`
        *,
        sentences:sentences(*)
      `)
      .eq('id', storyId)
      .single();
    
    if (!story) throw new Error('故事不存在');
    
    return story;
  }
  
  if (endpoint === '/api/admin/stats') {
    const session = await getSession();
    if (!session) throw new Error('请先登录');
    
    const { data: profile } = await supabase
      .from('users')
      .select('is_admin')
      .eq('email', session.user.email)
      .single();
    
    if (!profile?.is_admin) throw new Error('需要管理员权限');
    
    // Get stats
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
    
    const { count: activeUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    
    const { count: totalCodes } = await supabase
      .from('redemption_codes')
      .select('*', { count: 'exact', head: true });
    
    const { count: usedCodes } = await supabase
      .from('redemption_codes')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'used');
    
    const { count: totalStories } = await supabase
      .from('stories')
      .select('*', { count: 'exact', head: true });
    
    // Today users
    const today = new Date().toISOString().split('T')[0];
    const { count: todayUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today);
    
    // Popular stories
    const { data: popularStories } = await supabase
      .from('user_progress')
      .select(`
        story:stories(title),
        story_id,
        progress_count
      `)
      .not('progress_count', 'is', null)
      .order('progress_count', { ascending: false })
      .limit(5);
    
    return {
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
      totalCodes: totalCodes || 0,
      usedCodes: usedCodes || 0,
      totalStories: totalStories || 0,
      todayUsers: todayUsers || 0,
      popularStories: popularStories?.map(p => ({
        title: p.story?.title,
        progress_count: p.progress_count
      })) || []
    };
  }
  
  if (endpoint === '/api/admin/stories') {
    if (method === 'POST') {
      const session = await getSession();
      if (!session) throw new Error('请先登录');
      
      const { data: profile } = await supabase
        .from('users')
        .select('is_admin')
        .eq('email', session.user.email)
        .single();
      
      if (!profile?.is_admin) throw new Error('需要管理员权限');
      
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
    
    // GET - list stories
    const { data: stories } = await supabase
      .from('stories')
      .select(`
        *,
        sentences:sentences(count)
      `)
      .order('created_at', { ascending: false });
    
    return stories?.map(s => ({
      ...s,
      sentence_count: s.sentences?.[0]?.count || 0
    })) || [];
  }
  
  if (endpoint.match(/^\/api\/admin\/stories\/\d+$/) && method === 'PUT') {
    const storyId = endpoint.split('/').pop();
    
    const { error } = await supabase
      .from('stories')
      .update({
        title: body.title,
        title_cn: body.title_cn,
        difficulty: body.difficulty,
        category: body.category,
        cover_image: body.cover_image
      })
      .eq('id', storyId);
    
    if (error) throw new Error(error.message);
    return { success: true };
  }
  
  if (endpoint.match(/^\/api\/admin\/stories\/\d+\/sentences$/) && method === 'POST') {
    const storyId = endpoint.split('/')[3];
    
    // Delete existing sentences
    await supabase
      .from('sentences')
      .delete()
      .eq('story_id', storyId);
    
    // Insert new sentences
    const sentences = body.sentences.map((s, i) => ({
      story_id: parseInt(storyId),
      sentence_index: i,
      english: s.english,
      chinese: s.chinese,
      audio_file: s.audio_file || null
    }));
    
    const { error } = await supabase
      .from('sentences')
      .insert(sentences);
    
    if (error) throw new Error(error.message);
    return { success: true };
  }
  
  if (endpoint.match(/^\/api\/admin\/stories\/\d+$/) && method === 'DELETE') {
    const storyId = endpoint.split('/').pop();
    
    await supabase
      .from('sentences')
      .delete()
      .eq('story_id', storyId);
    
    const { error } = await supabase
      .from('stories')
      .delete()
      .eq('id', storyId);
    
    if (error) throw new Error(error.message);
    return { success: true };
  }
  
  if (endpoint === '/api/admin/generate-codes') {
    const session = await getSession();
    if (!session) throw new Error('请先登录');
    
    const { data: profile } = await supabase
      .from('users')
      .select('is_admin')
      .eq('email', session.user.email)
      .single();
    
    if (!profile?.is_admin) throw new Error('需要管理员权限');
    
    const count = body.count || 10;
    const codes = [];
    
    for (let i = 0; i < count; i++) {
      const code = 'SS' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
      codes.push(code);
    }
    
    const inserts = codes.map(code => ({
      code,
      status: 'unused'
    }));
    
    const { error } = await supabase
      .from('redemption_codes')
      .insert(inserts);
    
    if (error) throw new Error(error.message);
    
    return { codes };
  }
  
  if (endpoint.startsWith('/api/admin/codes')) {
    const session = await getSession();
    if (!session) throw new Error('请先登录');
    
    let query = supabase
      .from('redemption_codes')
      .select(`
        *,
        user:users(username)
      `)
      .order('created_at', { ascending: false });
    
    if (endpoint.includes('status=used')) {
      query = query.eq('status', 'used');
    } else if (endpoint.includes('status=unused')) {
      query = query.eq('status', 'unused');
    }
    
    const { data: codes, error } = await query;
    
    if (error) throw new Error(error.message);
    
    return codes?.map(c => ({
      ...c,
      used_by_name: c.user?.username
    })) || [];
  }
  
  if (endpoint === '/api/admin/users') {
    const session = await getSession();
    if (!session) throw new Error('请先登录');
    
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw new Error(error.message);
    
    // Get stats for each user
    const usersWithStats = await Promise.all(users?.map(async (u) => {
      const { count: story_count } = await supabase
        .from('user_progress')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', u.id);
      
      const { data: progress } = await supabase
        .from('user_progress')
        .select('total_time')
        .eq('user_id', u.id);
      
      const total_time = progress?.reduce((sum, p) => sum + (p.total_time || 0), 0) || 0;
      
      return {
        ...u,
        story_count: story_count || 0,
        total_time
      };
    }) || []);
    
    return usersWithStats;
  }
  
  if (endpoint.match(/^\/api\/admin\/users\/\d+\/toggle-active$/) && method === 'POST') {
    const userId = endpoint.split('/')[3];
    
    const { data: user } = await supabase
      .from('users')
      .select('is_active')
      .eq('id', userId)
      .single();
    
    const { error } = await supabase
      .from('users')
      .update({ is_active: !user?.is_active })
      .eq('id', userId);
    
    if (error) throw new Error(error.message);
    
    return { is_active: !user?.is_active };
  }
  
  if (endpoint === '/api/progress') {
    const session = await getSession();
    if (!session) return [];
    
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    
    if (!profile) return [];
    
    const { data: progress } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', profile.id);
    
    return progress || [];
  }
  
  if (endpoint.match(/^\/api\/progress\/\d+$/) && method === 'POST') {
    const storyId = endpoint.split('/').pop();
    
    const session = await getSession();
    if (!session) throw new Error('请先登录');
    
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    
    if (!profile) throw new Error('用户不存在');
    
    // Check if progress exists
    const { data: existing } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', profile.id)
      .eq('story_id', storyId)
      .single();
    
    if (existing) {
      // Update
      await supabase
        .from('user_progress')
        .update({
          ...body,
          last_study_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      // Insert
      await supabase
        .from('user_progress')
        .insert({
          user_id: profile.id,
          story_id: parseInt(storyId),
          ...body,
          last_study_at: new Date().toISOString()
        });
    }
    
    return { success: true };
  }
  
  if (endpoint.match(/^\/api\/favorites$/)) {
    const session = await getSession();
    if (!session) return [];
    
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    
    if (!profile) return [];
    
    if (method === 'GET') {
      const { data: favorites } = await supabase
        .from('favorites')
        .select('story_id, stories(*)')
        .eq('user_id', profile.id);
      
      return favorites?.map(f => f.stories) || [];
    }
    
    if (method === 'POST') {
      await supabase
        .from('favorites')
        .upsert({
          user_id: profile.id,
          story_id: body.story_id
        }, {
          onConflict: 'user_id,story_id'
        });
      
      return { success: true };
    }
  }
  
  if (endpoint.match(/^\/api\/favorites\/\d+$/) && method === 'DELETE') {
    const storyId = endpoint.split('/').pop();
    
    const session = await getSession();
    if (!session) throw new Error('请先登录');
    
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    
    if (!profile) throw new Error('用户不存在');
    
    await supabase
      .from('favorites')
      .delete()
      .eq('user_id', profile.id)
      .eq('story_id', storyId);
    
    return { success: true };
  }
  
  if (endpoint.match(/^\/api\/words\/\w+$/) && method === 'POST') {
    const word = body.word;
    
    const session = await getSession();
    if (!session) throw new Error('请先登录');
    
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('email', session.user.email)
      .single();
    
    if (!profile) throw new Error('用户不存在');
    
    await supabase
      .from('saved_words')
      .insert({
        user_id: profile.id,
        word
      });
    
    return { success: true };
  }
  
  // Default: call actual API endpoint
  const response = await fetch(endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  
  const data = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }
  
  return data;
}

// Export for use
window.supabase = supabase;
window.api = api;
window.showMessage = showMessage;
window.checkAuth = checkAuth;
window.logout = logout;
window.getToken = getToken;
window.setToken = setToken;
window.clearToken = clearToken;
window.getCurrentUser = getCurrentUser;
window.loadStoriesData = loadStoriesData;
