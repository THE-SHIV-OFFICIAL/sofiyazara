'use strict';

const fiveLetterWords = require('../../utils/dictionary');
const { Wallet } = require('../../models');
const { safeReply, mention } = require('../../utils/helpers');
const logger = require('../../utils/logger');
const config = require('../../config/index');
const { generateTrivia } = require('../../services/aiGameService');
const { logEvent } = require('../../services/loggingService');

const sessions = new Map();       // chatId -> { word, tries }
const triviaSessions = new Map(); // chatId -> { answer, expires }
const numberSessions = new Map();  // chatId -> { number, tries, max }

async function reward(userId, amount) {
  try {
    let w = await Wallet.findOne({ userId });
    if (!w) w = new Wallet({ userId });
    w.coins = (w.coins || 0) + amount;
    await w.save();
    return w.coins;
  } catch (e) {
    logger.warn(`wallet reward failed: ${e.message}`);
    return null;
  }
}

function wordList() {
  // dictionary may be a Set or an Array — support both
  return Array.isArray(fiveLetterWords) ? fiveLetterWords : [...fiveLetterWords];
}

function inDictionary(word) {
  if (fiveLetterWords instanceof Set) return fiveLetterWords.has(word);
  return wordList().includes(word);
}

function pickWord() {
  const arr = wordList();
  return arr[Math.floor(Math.random() * arr.length)];
}

function feedback(guess, target) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) out.push('🟩');
    else if (target.includes(guess[i])) out.push('🟨');
    else out.push('⬛');
  }
  return out.join('');
}

// ── Word guess ────────────────────────────────────────────────────────────────

const wordguess = async (ctx) => {
  if (sessions.has(ctx.chat.id)) {
    return safeReply(ctx, '🎮 Ek game already chal raha hai! Guess bhejo: <code>/gamew apple</code>');
  }
  sessions.set(ctx.chat.id, { word: pickWord(), tries: 0 });
  await safeReply(ctx,
    `🎮 <b>Word Guess</b> started!\n` +
    `Maine ek 5-letter word socha hai.\n\n` +
    `Guess karo: <code>/gamew crane</code>\n` +
    `🟩 sahi letter + jagah · 🟨 sahi letter · ⬛ nahi hai\n` +
    `Tries: <b>6</b>`);
};

const gamew = async (ctx) => {
  const guessWord = (ctx.message?.text || '').trim().split(/\s+/)[1]?.toLowerCase() || '';
  if (!/^[a-z]{5}$/.test(guessWord)) {
    return safeReply(ctx, '❌ Aise likho: <code>/gamew apple</code> (sirf 5 letters)');
  }

  const sess = sessions.get(ctx.chat.id);
  if (!sess) return safeReply(ctx, '❌ Pehle /wordguess se game start karo.');
  if (!inDictionary(guessWord)) return safeReply(ctx, '❌ Ye word dictionary me nahi hai.');

  sess.tries += 1;
  const fb = feedback(guessWord, sess.word);

  if (guessWord === sess.word) {
    sessions.delete(ctx.chat.id);
    const coins = Math.max(50, 200 - sess.tries * 25);
    const total = await reward(ctx.from.id, coins);
    return safeReply(ctx,
      `${fb}\n🎉 ${mention(ctx.from)} ne <b>${sess.tries}</b> tries me jeet liya! +<b>${coins}</b> coins` +
      (total !== null ? ` (total <b>${total}</b>)` : ''));
  }

  if (sess.tries >= 6) {
    sessions.delete(ctx.chat.id);
    return safeReply(ctx, `${fb}\n💀 Tries khatam! Word tha <b>${sess.word}</b>.`);
  }

  await safeReply(ctx, `${fb}\nTries: <b>${sess.tries}/6</b>`);
};

// ── Number guess (/guess) ─────────────────────────────────────────────────────

const guess = async (ctx) => {
  const arg = (ctx.message?.text || '').trim().split(/\s+/)[1];
  const sess = numberSessions.get(ctx.chat.id);

  if (!arg) {
    if (sess) {
      return safeReply(ctx, `🔢 Game chal raha hai — 1 se ${sess.max} ke beech number guess karo: <code>/guess 42</code>`);
    }
    const max = 100;
    numberSessions.set(ctx.chat.id, { number: 1 + Math.floor(Math.random() * max), tries: 0, max });
    return safeReply(ctx,
      `🔢 <b>Number Guess</b> start!\nMaine 1 se ${max} ke beech ek number socha hai.\n` +
      `Guess karo: <code>/guess 42</code> — 7 tries milengi 🎯`);
  }

  if (!sess) return safeReply(ctx, '❌ Pehle <code>/guess</code> likho game start karne ke liye.');

  const n = parseInt(arg, 10);
  if (!Number.isFinite(n) || n < 1 || n > sess.max) {
    return safeReply(ctx, `❌ 1 se ${sess.max} ke beech ka number bhejo.`);
  }

  sess.tries += 1;

  if (n === sess.number) {
    numberSessions.delete(ctx.chat.id);
    const coins = Math.max(30, 150 - sess.tries * 15);
    const total = await reward(ctx.from.id, coins);
    return safeReply(ctx,
      `🎯 Bilkul sahi! ${mention(ctx.from)} ne <b>${sess.tries}</b> tries me guess kiya. +<b>${coins}</b> coins` +
      (total !== null ? ` (total <b>${total}</b>)` : ''));
  }

  if (sess.tries >= 7) {
    numberSessions.delete(ctx.chat.id);
    return safeReply(ctx, `💀 Tries khatam! Number tha <b>${sess.number}</b>.`);
  }

  const hint = n < sess.number ? '⬆️ Bada number try karo' : '⬇️ Chhota number try karo';
  await safeReply(ctx, `${hint} · Tries: <b>${sess.tries}/7</b>`);
};

// ── Trivia ────────────────────────────────────────────────────────────────────

const QUESTIONS = [
  { q: 'Capital of Japan?', a: 'tokyo' },
  { q: 'How many continents are there?', a: '7' },
  { q: 'Who wrote Naruto?', a: 'kishimoto' },
  { q: 'Largest planet in our solar system?', a: 'jupiter' },
  { q: 'Square root of 144?', a: '12' },
  { q: 'Which studio made Spirited Away?', a: 'ghibli' },
  { q: 'HTTP status code for "Not Found"?', a: '404' },
  { q: 'Currency of the UK?', a: 'pound' },
  { q: 'Chemical symbol for gold?', a: 'au' },
  { q: 'National animal of India?', a: 'tiger' },
  { q: 'How many players in a cricket team?', a: '11' },
  { q: 'Fastest land animal?', a: 'cheetah' },
];

const trivia = async (ctx) => {
  const fallback = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  const item = config.aiGamesEnabled ? (await generateTrivia() || fallback) : fallback;
  triviaSessions.set(ctx.chat.id, { answer: item.a, expires: Date.now() + 30_000 });
  logEvent('game', {
    chat: ctx.chat,
    actor: ctx.from,
    extra: `AI trivia started: ${item.q}`,
  }).catch(() => {});
  await safeReply(ctx,
    `<b>Trivia</b>\n${item.q}` +
    (item.hint ? `\n<i>Hint: ${item.hint}</i>` : '') +
    `\n\n<i>30 second me answer bhejo!</i>`);
};

async function triviaMiddleware(ctx, next) {
  try {
    const chatId = ctx.chat?.id;
    const sess = chatId !== undefined ? triviaSessions.get(chatId) : null;
    if (!sess) return next();

    if (Date.now() > sess.expires) {
      triviaSessions.delete(chatId);
      return next();
    }

    const text = (ctx.message?.text || '').toLowerCase().trim();
    if (!text || text.startsWith('/') || !ctx.from) return next();

    if (text.includes(sess.answer)) {
      triviaSessions.delete(chatId);
      const total = await reward(ctx.from.id, 25);
      await ctx.reply(
        `✅ ${mention(ctx.from)} ne sahi answer diya! +25 coins` + (total !== null ? ` (total ${total})` : ''),
        { parse_mode: 'HTML' }
      );
    }
  } catch (e) {
    logger.warn(`trivia middleware error: ${e.message}`);
  }
  return next();
}

module.exports = { wordguess, gamew, guess, trivia, triviaMiddleware };
