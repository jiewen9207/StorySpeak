const bcrypt = require('bcryptjs');
const db = require('./db');

const SAMPLE_STORIES = [
  {
    title: 'A Day at the Beach',
    title_cn: '海滩的一天',
    difficulty: 'easy',
    category: 'travel',
    cover_image: '',
    audio_file: '',
    sentences: [
      { english: 'It was a beautiful sunny morning.', chinese: '那是一个阳光明媚的早晨。' },
      { english: 'I decided to go to the beach with my friends.', chinese: '我决定和朋友一起去海滩。' },
      { english: 'The sea was calm and the water was crystal clear.', chinese: '海面平静，海水清澈见底。' },
      { english: 'We played volleyball and built sandcastles.', chinese: '我们打排球，堆沙堡。' },
      { english: 'At noon, we had a delicious picnic lunch.', chinese: '中午，我们吃了一顿美味的野餐午餐。' },
      { english: 'After lunch, we went for a long walk along the shore.', chinese: '午饭后，我们沿着海岸走了很长一段路。' },
      { english: 'The sunset was absolutely breathtaking.', chinese: '日落真是美得令人惊叹。' },
      { english: 'It was a perfect day that I will never forget.', chinese: '那是我永远不会忘记的完美一天。' }
    ]
  },
  {
    title: 'Meeting a New Friend',
    title_cn: '结识新朋友',
    difficulty: 'easy',
    category: 'social',
    cover_image: '',
    audio_file: '',
    sentences: [
      { english: 'I was sitting in a coffee shop, reading a book.', chinese: '我坐在咖啡店里，看书。' },
      { english: 'A girl came over and asked if the seat was taken.', chinese: '一个女孩走过来问这个座位是否有人。' },
      { english: 'I smiled and told her she could sit down.', chinese: '我微笑着告诉她可以坐下。' },
      { english: 'We started talking about our favorite books.', chinese: '我们开始谈论我们最喜欢的书。' },
      { english: 'Her name was Emily, and she was a writer.', chinese: '她的名字叫Emily，她是一名作家。' },
      { english: 'We exchanged phone numbers and promised to meet again.', chinese: '我们交换了电话号码，并承诺会再见面。' },
      { english: 'Now she is one of my best friends.', chinese: '现在她是我最好的朋友之一。' },
      { english: 'Sometimes the best friendships start from simple moments.', chinese: '有时候最好的友谊始于简单的瞬间。' }
    ]
  },
  {
    title: 'Job Interview Experience',
    title_cn: '面试经历',
    difficulty: 'medium',
    category: 'business',
    cover_image: '',
    audio_file: '',
    sentences: [
      { english: 'I had an important job interview last Monday.', chinese: '上周一我有一个重要的工作面试。' },
      { english: 'I arrived ten minutes early to the company.', chinese: '我提前十分钟到达公司。' },
      { english: 'The receptionist was very friendly and professional.', chinese: '前台接待非常友好和专业。' },
      { english: 'I was taken to a conference room where three interviewers waited.', chinese: '我被带到一间会议室，三位面试官在等着。' },
      { english: 'They asked me about my previous work experience.', chinese: '他们问我之前的工作经历。' },
      { english: 'I gave clear and confident answers to all their questions.', chinese: '我对他们所有的问题都给出了清晰而自信的回答。' },
      { english: 'At the end of the interview, they showed me around the office.', chinese: '面试结束时，他们带我参观了办公室。' },
      { english: 'I felt positive about the interview and hopeful about getting the job.', chinese: '我对面试感到很积极，对获得这份工作充满希望。' },
      { english: 'Three days later, I received an offer letter by email.', chinese: '三天后，我通过电子邮件收到了录用通知。' }
    ]
  },
  {
    title: 'Learning a New Language',
    title_cn: '学习一门新语言',
    difficulty: 'medium',
    category: 'academic',
    cover_image: '',
    audio_file: '',
    sentences: [
      { english: 'Learning a new language has always been a dream of mine.', chinese: '学习一门新语言一直是我的梦想。' },
      { english: 'I decided to start learning Japanese six months ago.', chinese: '六个月前我决定开始学日语。' },
      { english: 'At first, it was very challenging to memorize the characters.', chinese: '起初，记忆汉字非常具有挑战性。' },
      { english: 'I spent at least one hour every day practicing.', chinese: '我每天至少花一个小时练习。' },
      { english: 'I used language apps and watched Japanese movies with subtitles.', chinese: '我使用语言应用程序，看带字幕的日本电影。' },
      { english: 'Slowly but surely, I began to understand more and more.', chinese: '缓慢但肯定地，我开始理解得越来越多。' },
      { english: 'Last month, I traveled to Tokyo and was able to communicate in Japanese.', chinese: '上个月，我去东京旅行，能够用日语交流了。' },
      { english: 'The locals were surprised and delighted by my efforts.', chinese: '当地人对我的努力感到惊讶和高兴。' },
      { english: 'Learning a language opens doors to new cultures and friendships.', chinese: '学习一门语言打开了通往新文化和友谊的大门。' }
    ]
  },
  {
    title: 'A Memorable Trip to Paris',
    title_cn: '难忘的巴黎之旅',
    difficulty: 'hard',
    category: 'travel',
    cover_image: '',
    audio_file: '',
    sentences: [
      { english: 'Last summer, I embarked on a two-week adventure to Paris.', chinese: '去年夏天，我开始了为期两周的巴黎冒险。' },
      { english: 'The moment I stepped out of the train station, I fell in love with the city.', chinese: '当我走出火车站的那一刻，我就爱上了这座城市。' },
      { english: 'Paris, the City of Light, was even more magnificent than I had imagined.', chinese: '巴黎，这座光之城，比我想象的还要壮丽。' },
      { english: 'I visited the iconic Eiffel Tower on my first evening.', chinese: '我在第一天晚上参观了标志性的埃菲尔铁塔。' },
      { english: 'The panoramic view from the top was absolutely stunning.', chinese: '从顶部看到的全景令人惊叹。' },
      { english: 'I spent hours exploring the world-famous Louvre Museum.', chinese: '我花了几个小时探索世界著名的卢浮宫博物馆。' },
      { english: 'Standing in front of the Mona Lisa, I felt a deep sense of awe.', chinese: '站在《蒙娜丽莎》面前，我感到深深的敬畏。' },
      { english: 'I wandered through the charming streets of Montmartre and enjoyed fresh croissants.', chinese: '我漫步在蒙马特迷人的街道上，享用新鲜的羊角面包。' },
      { english: 'Each morning, I would sit at a café and watch the world go by.', chinese: '每天早上，我会坐在咖啡馆里，看着世界从我身边流过。' },
      { english: 'On my last day, I took a scenic cruise along the Seine River.', chinese: '在最后一天，我沿着塞纳河进行了一次风景优美的巡航。' },
      { english: 'Paris has a way of capturing your heart and never letting go.', chinese: '巴黎有一种抓住你的心并永不放手的方式。' },
      { english: 'I left with countless memories and a promise to return soon.', chinese: '我带着无数的回忆和很快回来的承诺离开了。' }
    ]
  }
];

function seed() {
  console.log('Starting database seeding...');

  const adminPassword = bcrypt.hashSync('admin123', 10);
  try {
    db.prepare(`INSERT INTO users (username, email, password, is_active, is_admin) 
      VALUES (?, ?, ?, 1, 1)`).run('admin', 'admin@storyspeak.com', adminPassword);
    console.log('Admin user created: admin / admin123');
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      console.log('Admin user already exists, skipping.');
    } else {
      throw e;
    }
  }

  const insertStory = db.prepare(`INSERT INTO stories (title, title_cn, difficulty, category, cover_image, audio_file) 
    VALUES (?, ?, ?, ?, ?, ?)`);
  const insertSentence = db.prepare(`INSERT INTO story_sentences (story_id, sentence_index, english, chinese, audio_file) 
    VALUES (?, ?, ?, ?, ?)`);

  const transaction = db.transaction(() => {
    for (const story of SAMPLE_STORIES) {
      const info = insertStory.run(
        story.title,
        story.title_cn,
        story.difficulty,
        story.category,
        story.cover_image,
        story.audio_file
      );
      for (let i = 0; i < story.sentences.length; i++) {
        insertSentence.run(
          info.lastInsertRowid,
          i,
          story.sentences[i].english,
          story.sentences[i].chinese,
          ''
        );
      }
      console.log(`Created story: "${story.title}" with ${story.sentences.length} sentences`);
    }
  });

  transaction();

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const insertCode = db.prepare('INSERT INTO redemption_codes (code) VALUES (?)');
  const codeTransaction = db.transaction(() => {
    for (let i = 0; i < 50; i++) {
      let code = '';
      for (let j = 0; j < 12; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      insertCode.run(code);
    }
  });
  codeTransaction();
  console.log('Generated 50 redemption codes');

  console.log('Seed completed successfully!');
  console.log('');
  console.log('Admin login:');
  console.log('  Username: admin');
  console.log('  Password: admin123');
  console.log('');
  console.log('User flow:');
  console.log('  1. Register an account');
  console.log('  2. Login with your credentials');
  console.log('  3. Use a redemption code (generated in admin panel) to activate');
  console.log('  4. Start learning!');
}

seed();
