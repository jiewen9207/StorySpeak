-- StorySpeak Database Setup for Supabase
-- Run this in Supabase SQL Editor to create all required tables

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Redemption codes table
CREATE TABLE IF NOT EXISTS redemption_codes (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'unused', -- unused, used
  used_by BIGINT REFERENCES users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User progress table
CREATE TABLE IF NOT EXISTS user_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  story_id INTEGER NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  time_spent INTEGER DEFAULT 0,
  last_study_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, story_id)
);

-- Favorites table
CREATE TABLE IF NOT EXISTS favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  story_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, story_id)
);

-- Saved words table
CREATE TABLE IF NOT EXISTS saved_words (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (optional - for security)
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE redemption_codes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE saved_words ENABLE ROW LEVEL SECURITY;

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_codes_code ON redemption_codes(code);
CREATE INDEX IF NOT EXISTS idx_progress_user ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_words_user ON saved_words(user_id);

-- Insert sample redemption codes if table is empty
INSERT INTO redemption_codes (code, status)
SELECT 'STORY' || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', (random() * 36)::int + 1, 1) ||
       upper(md5(random()::text)), 'unused'
FROM generate_series(1, 20)
ON CONFLICT (code) DO NOTHING;
