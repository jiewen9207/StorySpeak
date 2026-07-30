const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

// Demo data for fallback
const demoUsers = {};
const demoCodes = {
  'DEMO2024': { status: 'unused' },
  'TEST1234': { status: 'unused' }
};

// Auth helper
const getAuthUser = async (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  
  if (token.startsWith('demo_')) {
    const userId = parseInt(token.replace('demo_', ''));
    return { id: userId, ...demoUsers[userId] };
  }
  
  if (token.startsWith('supabase_') && supabase) {
    const userId = token.replace('supabase_', '');
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', parseInt(userId))
      .single();
    return data || null;
  }
  
  return null;
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const path = req.url.split('?')[0];
  const method = req.method;
  const authHeader = req.headers.authorization;
  const authUser = await getAuthUser(authHeader);

  // Register
  if (path === '/api/register' && method === 'POST') {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ error: '请填写完整信息' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少6位' });
    }
    
    if (supabase) {
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .or(`username.eq.${username},email.eq.${email}`)
        .single();
      if (existing) {
        return res.status(400).json({ error: '用户名或邮箱已被注册' });
      }
      
      const { data, error } = await supabase
        .from('users')
        .insert({ username, email, password, is_admin: 0, is_active: 0 })
        .select()
        .single();
      
      if (error) return res.status(500).json({ error: '注册失败' });
      return res.json({ success: true, userId: data.id });
    } else {
      // Demo mode
      const userId = Date.now();
      demoUsers[userId] = { username, email, password, is_admin: 0, is_active: 1 };
      return res.json({ success: true, userId });
    }
  }

  // Login
  if (path === '/api/login' && method === 'POST') {
    const { login, password } = req.body || {};
    if (!login || !password) {
      return res.status(400).json({ error: '请输入登录信息' });
    }
    
    if (supabase) {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .or(`username.eq.${login},email.eq.${login}`)
        .single();
      
      if (error || !user) {
        return res.status(400).json({ error: '用户不存在' });
      }
      
      if (user.password !== password) {
        return res.status(400).json({ error: '密码错误' });
      }
      
      const token = `supabase_${user.id}`;
      return res.json({
        success: true, token,
        user: { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin, is_active: user.is_active }
      });
    } else {
      const user = Object.values(demoUsers).find(u => u.username === login || u.email === login);
      if (!user) return res.status(400).json({ error: '用户不存在' });
      if (user.password !== password) return res.status(400).json({ error: '密码错误' });
      const token = `demo_${user.id}`;
      return res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin, is_active: user.is_active } });
    }
  }

  // Redeem code
  if (path === '/api/redeem' && method === 'POST' && authUser) {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: '请输入兑换码' });
    
    if (supabase) {
      const { data: redeemCode } = await supabase
        .from('redemption_codes')
        .select('*')
        .eq('code', code)
        .single();
      
      if (!redeemCode) return res.status(400).json({ error: '兑换码不存在' });
      if (redeemCode.status === 'used') return res.status(400).json({ error: '兑换码已被使用' });
      
      await supabase
        .from('redemption_codes')
        .update({ status: 'used', used_by: authUser.id })
        .eq('code', code);
      
      await supabase
        .from('users')
        .update({ is_active: true })
        .eq('id', authUser.id);
      
      return res.json({ success: true, message: '兑换码激活成功！' });
    } else {
      if (!demoCodes[code] || demoCodes[code].status === 'used') {
        return res.status(400).json({ error: '兑换码无效或已被使用' });
      }
      demoCodes[code].status = 'used';
      authUser.is_active = true;
      return res.json({ success: true, message: '兑换码激活成功！' });
    }
  }

  // Get stories
  if (path === '/api/stories' && method === 'GET' && authUser) {
    if (!authUser.is_active && !authUser.is_admin) {
      return res.status(403).json({ error: '账户未激活，请先使用兑换码激活账户' });
    }
    
    if (supabase) {
      const { data: stories } = await supabase
        .from('stories')
        .select('*')
        .order('id', { ascending: true });
      return res.json(stories || []);
    }
    return res.json([]);
  }

  // Get story detail
  if (path.match(/^\/api\/stories\/\d+$/) && method === 'GET' && authUser) {
    if (!authUser.is_active && !authUser.is_admin) {
      return res.status(403).json({ error: '账户未激活' });
    }
    
    const storyId = parseInt(path.match(/^\/api\/stories\/(\d+)$/)[1]);
    
    if (supabase) {
      const { data: story } = await supabase
        .from('stories')
        .select('*')
        .eq('id', storyId)
        .single();
      
      if (!story) return res.status(404).json({ error: '故事不存在' });
      
      const { data: sentences } = await supabase
        .from('story_sentences')
        .select('*')
        .eq('story_id', storyId)
        .order('sentence_index', { ascending: true });
      
      return res.json({ ...story, sentences: sentences || [] });
    }
    return res.json({ id: storyId, error: '请连接数据库' });
  }

  // Get profile
  if (path === '/api/user/profile' && method === 'GET' && authUser) {
    if (supabase) {
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
      if (user) {
        const { count } = await supabase
          .from('stories')
          .select('*', { count: 'exact', head: true });
        return res.json({ ...user, stats: { totalStories: count, completedStories: 0, totalTime: 0, favorites: 0 } });
      }
    }
    return res.json(authUser);
  }

  // Admin: Generate codes
  if (path === '/api/admin/generate-codes' && method === 'POST' && authUser?.is_admin) {
    const { count = 10 } = req.body || {};
    const codes = [];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    for (let i = 0; i < count; i++) {
      let code = '';
      for (let j = 0; j < 12; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      codes.push(code);
    }
    
    if (supabase) {
      const insertData = codes.map(code => ({ code, status: 'unused' }));
      await supabase.from('redemption_codes').insert(insertData);
    }
    
    return res.json({ success: true, codes });
  }

  // Admin: Get stats
  if (path === '/api/admin/stats' && method === 'GET' && authUser?.is_admin) {
    if (supabase) {
      const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
      const { count: activeUsers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_active', true);
      const { count: totalCodes } = await supabase.from('redemption_codes').select('*', { count: 'exact', head: true });
      const { count: usedCodes } = await supabase.from('redemption_codes').select('*', { count: 'exact', head: true }).eq('status', 'used');
      const { count: totalStories } = await supabase.from('stories').select('*', { count: 'exact', head: true });
      
      // Today users
      const today = new Date().toISOString().split('T')[0];
      const { count: todayUsers } = await supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', today);
      
      // Popular stories (simplified)
      const { data: popularStories } = await supabase.from('stories').select('id, title').limit(5);
      
      return res.json({ totalUsers: totalUsers || 0, activeUsers: activeUsers || 0, totalCodes: totalCodes || 0, usedCodes: usedCodes || 0, totalStories: totalStories || 0, todayUsers: todayUsers || 0, popularStories: popularStories || [] });
    }
    return res.json({ totalUsers: 0, activeUsers: 0, totalCodes: 0, usedCodes: 0, totalStories: 0, todayUsers: 0, popularStories: [] });
  }

  // Admin: Get codes
  if (path.match(/^\/api\/admin\/codes/) && method === 'GET' && authUser?.is_admin) {
    if (supabase) {
      const status = req.query.status;
      let query = supabase.from('redemption_codes').select('*, users(username)').order('created_at', { ascending: false }).limit(100);
      if (status) query = query.eq('status', status);
      const { data: codes } = await query;
      
      const result = (codes || []).map(c => ({
        ...c,
        used_by_name: c.users?.username || null
      }));
      
      return res.json(result);
    }
    return res.json([]);
  }

  // Admin: Get users
  if (path === '/api/admin/users' && method === 'GET' && authUser?.is_admin) {
    if (supabase) {
      const { data: users } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      return res.json(users || []);
    }
    return res.json([]);
  }

  // Admin: Toggle user active
  if (path.match(/^\/api\/admin\/users\/\d+\/toggle-active$/) && method === 'POST' && authUser?.is_admin) {
    const userId = parseInt(path.match(/^\/api\/admin\/users\/(\d+)\/toggle-active$/)[1]);
    if (supabase) {
      const { data: user } = await supabase.from('users').select('is_active').eq('id', userId).single();
      if (!user) return res.status(404).json({ error: '用户不存在' });
      
      const newStatus = !user.is_active;
      await supabase.from('users').update({ is_active: newStatus }).eq('id', userId);
      
      return res.json({ success: true, is_active: newStatus });
    }
    return res.status(500).json({ error: '数据库未连接' });
  }

  res.json({ message: 'StorySpeak API' });
};
