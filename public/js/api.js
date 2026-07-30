// Local storage based authentication with Supabase backend
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
  
  // Fetch from server
  const response = await fetch(endpoint, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined
  });
  
  const data = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }
  
  return data;
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
