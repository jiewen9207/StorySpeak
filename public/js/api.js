const API_BASE = 'https://storyspeak-worker.ddeng5889.workers.dev';

function getToken() {
  return localStorage.getItem('storyspeak_token');
}

function setToken(token) {
  localStorage.setItem('storyspeak_token', token);
}

function clearToken() {
  localStorage.removeItem('storyspeak_token');
}

function getHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = getHeaders();
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 401) {
    clearToken();
    window.location.href = '/';
    return;
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || '请求失败');
  }

  return response.json();
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
