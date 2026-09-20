const { mention, safeReply, escapeHtml } = require('../../utils/helpers');

// Reaction GIFs are pulled from several free sources at random, so the same
// command never feels repetitive and is not tied to one anime library.
const PROVIDERS = [
  {
    name: 'nekos.best',
    supports: ['hug', 'pat', 'slap', 'kiss', 'poke', 'bite', 'cuddle', 'tickle', 'wave', 'kill', 'happy', 'dance', 'smile', 'wink', 'highfive', 'handhold', 'laugh', 'cry'],
    url: (a) => `https://nekos.best/api/v2/${a}?amount=1`,
    pick: (d) => d?.results?.[0]?.url || null,
  },
  {
    name: 'waifu.pics',
    supports: ['hug', 'pat', 'slap', 'kiss', 'poke', 'bite', 'cuddle', 'wave', 'kill', 'happy', 'dance', 'smile', 'wink', 'highfive', 'handhold', 'cry', 'bonk', 'glomp'],
    url: (a) => `https://api.waifu.pics/sfw/${a}`,
    pick: (d) => d?.url || null,
  },
  {
    name: 'otakugifs',
    supports: ['hug', 'pat', 'slap', 'kiss', 'poke', 'bite', 'cuddle', 'tickle', 'wave', 'kill', 'happy', 'dance', 'smile', 'wink', 'highfive', 'handhold', 'cry', 'laugh', 'love'],
    url: (a) => `https://api.otakugifs.xyz/gif?reaction=${a}&format=gif`,
    pick: (d) => d?.url || null,
  },
];

const ACTION_MESSAGES = {
  hug:  { self: '{actor} hugged themselves 🤗', other: '{actor} hugged {target} 🤗', emoji: '🤗' },
  pat:  { self: '{actor} patted themselves 🥺', other: '{actor} patted {target} 🥹', emoji: '🥺' },
  slap: { self: '{actor} slapped themselves 😵', other: '{actor} slapped {target}! 😠', emoji: '😠' },
  kiss: { self: '{actor} kissed the air 😘', other: '{actor} kissed {target} 😘💋', emoji: '💋' },
  poke: { self: '{actor} poked themselves 😶', other: '{actor} poked {target} 👉', emoji: '👉' },
  bite: { self: '{actor} bit themselves 😅', other: '{actor} bit {target}! 😈', emoji: '😈' },
  cuddle: { self: '{actor} cuddled a pillow 🛌', other: '{actor} cuddled {target} 💕', emoji: '💕' },
  tickle: { self: '{actor} tickled themselves 😂', other: '{actor} tickled {target}! 🤣', emoji: '🤣' },
  wave: { self: '{actor} waved at nobody 👋', other: '{actor} waved at {target} 👋', emoji: '👋' },
  love: { self: '{actor} is feeling the love 💖', other: '{actor} sent love to {target} 💖', emoji: '💖' },
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchFrom(provider, action) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(provider.url(action), { signal: controller.signal });
    if (!res.ok) return null;
    return provider.pick(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Random provider order every time — different look on every command.
async function fetchGif(action) {
  const candidates = shuffle(PROVIDERS.filter((p) => p.supports.includes(action)));
  for (const p of candidates) {
    const url = await fetchFrom(p, action);
    if (url) return url;
  }
  return null;
}

function makeAction(action) {
  return async (ctx) => {
    const actor = ctx.from;
    const target = ctx.message.reply_to_message?.from;
    const tpl = ACTION_MESSAGES[action] || { self: `{actor} used /${action}`, other: `{actor} → {target}`, emoji: '✨' };
    const text = target
      ? tpl.other.replace('{actor}', mention(actor)).replace('{target}', mention(target))
      : tpl.self.replace('{actor}', mention(actor));

    const gifUrl = await fetchGif(action);
    try {
      if (gifUrl) {
        await ctx.replyWithAnimation(gifUrl, { caption: text, parse_mode: 'HTML' });
      } else {
        await safeReply(ctx, text);
      }
    } catch {
      await safeReply(ctx, text);
    }
  };
}

// 8ball answers
const BALL_ANSWERS = [
  '🟢 It is certain.', '🟢 It is decidedly so.', '🟢 Without a doubt.',
  '🟢 Yes, definitely.', '🟢 You may rely on it.', '🟢 As I see it, yes.',
  '🟢 Most likely.', '🟢 Outlook good.', '🟢 Yes.', '🟢 Signs point to yes.',
  '🟡 Reply hazy, try again.', '🟡 Ask again later.', '🟡 Better not tell you now.',
  '🟡 Cannot predict now.', '🟡 Concentrate and ask again.',
  '🔴 Don\'t count on it.', '🔴 My reply is no.', '🔴 My sources say no.',
  '🔴 Outlook not so good.', '🔴 Very doubtful.',
];

const eightball = async (ctx) => {
  const q = (ctx.message.text || '').split(/\s+/).slice(1).join(' ').trim();
  if (!q) return safeReply(ctx, '❓ Ask a question! e.g. <code>/8ball Will I be rich?</code>');
  const ans = BALL_ANSWERS[Math.floor(Math.random() * BALL_ANSWERS.length)];
  await safeReply(ctx, `🎱 <b>Question:</b> ${escapeHtml(q)}\n<b>Answer:</b> ${ans}`);
};

// Ship meter
const ship = async (ctx) => {
  const parts = (ctx.message.text || '').trim().split(/\s+/);
  const t = ctx.message.reply_to_message?.from;
  let u1 = ctx.from;
  let u2 = t;
  // /ship @user @user2 (from mentions or reply)
  if (!u2) return safeReply(ctx, '❌ Reply to a user: <code>/ship</code> (reply to someone)');

  const hash = (Math.abs((u1.id * 31 + u2.id * 7) % 100));
  const score = hash;
  const bar = '█'.repeat(Math.floor(score / 10)) + '░'.repeat(10 - Math.floor(score / 10));
  const label =
    score >= 90 ? '💘 Soulmates!' :
    score >= 70 ? '💕 Great match!' :
    score >= 50 ? '💓 Pretty good!' :
    score >= 30 ? '💛 Just friends?' :
    score >= 10 ? '💔 Meh...' :
    '😬 Run away!';
  await safeReply(ctx,
    `💕 <b>Ship Meter</b>\n` +
    `${mention(u1)} ❤️ ${mention(u2)}\n\n` +
    `[${bar}] <b>${score}%</b>\n` +
    `${label}`);
};

// Truth or Dare
const TRUTHS = [
  'What is the most embarrassing thing you\'ve ever done?',
  'Who was your first crush?',
  'What\'s the biggest lie you\'ve ever told?',
  'Have you ever cheated on a test?',
  'What is your biggest fear?',
  'What is the most childish thing you still do?',
  'What\'s the most annoying habit you have?',
  'Have you ever ghosted someone? Why?',
  'What\'s your most embarrassing text to the wrong person?',
  'What\'s one secret you\'ve never told anyone?',
  'What was your worst date ever?',
  'If you could change one thing about yourself, what would it be?',
  'What\'s the meanest thing you\'ve ever said to someone?',
];
const DARES = [
  'Send a voice message saying "I love you" to the last person you texted.',
  'Change your profile picture to something silly for the next hour.',
  'Compliment every person in this chat with a genuine compliment.',
  'Post the 5th photo in your gallery right now.',
  'Write a love poem about the last person who messaged you.',
  'Set your status to "I smell like cheese" for 30 minutes.',
  'Tell a joke that everyone will find cringy.',
  'Do 10 push-ups and send a selfie as proof.',
  'Send a voice message while pretending to be an anime character.',
  'Text "I lost a bet" to the first contact in your phone.',
  'Confess something you\'ve never told the group.',
];

const truth = async (ctx) => {
  const q = TRUTHS[Math.floor(Math.random() * TRUTHS.length)];
  await safeReply(ctx, `🤔 <b>Truth</b> for ${mention(ctx.from)}:\n\n"${q}"`);
};

const dare = async (ctx) => {
  const d = DARES[Math.floor(Math.random() * DARES.length)];
  await safeReply(ctx, `😈 <b>Dare</b> for ${mention(ctx.from)}:\n\n${d}`);
};

const truthordare = async (ctx) => {
  const pick = Math.random() < 0.5 ? 'truth' : 'dare';
  if (pick === 'truth') return truth(ctx);
  return dare(ctx);
};

// Sticker steal
const steal = async (ctx) => {
  const msg = ctx.message.reply_to_message;
  if (!msg?.sticker) return safeReply(ctx, '❌ Reply to a <b>sticker</b> to steal it.');
  const s = msg.sticker;
  try {
    const link = await ctx.telegram.getFileLink(s.file_id);
    await ctx.reply(
      `🖼 <b>Sticker stolen!</b>\n` +
      `Set: <code>${s.set_name || 'unknown'}</code>\n` +
      `Emoji: ${s.emoji || '?'}\n` +
      `<a href="${link.href}">Download file</a>`,
      { parse_mode: 'HTML' });
    await ctx.replyWithSticker(s.file_id);
  } catch (e) {
    await safeReply(ctx, `❌ Could not steal sticker: ${e.description || e.message}`);
  }
};

module.exports = {
  hug: makeAction('hug'),
  pat: makeAction('pat'),
  slap: makeAction('slap'),
  kiss: makeAction('kiss'),
  poke: makeAction('poke'),
  bite: makeAction('bite'),
  cuddle: makeAction('cuddle'),
  tickle: makeAction('tickle'),
  wave: makeAction('wave'),
  love: makeAction('love'),
  eightball,
  ship,
  truth,
  dare,
  truthordare,
  steal,
};
