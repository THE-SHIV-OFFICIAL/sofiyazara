const { Lock } = require('../../models');
const { safeReply, escapeHtml } = require('../../utils/helpers');
const { requireAdmin } = require('../../middleware/admin');

const LOCK_TYPES = [
  'sticker', 'photo', 'video', 'animation', 'audio', 'voice', 'document',
  'url', 'forward', 'mention', 'hashtag', 'email', 'phone', 'cashtag',
  'bot', 'invitelink', 'rtl', 'emoji', 'poll', 'contact', 'location', 'game',
  'all', 'media', 'messages',
];

const lock = requireAdmin(async (ctx) => {
  const args = (ctx.message.text || '').split(/\s+/).slice(1).map((s) => s.toLowerCase()).filter(Boolean);
  if (args.length === 0) return safeReply(ctx, '❌ Usage: <code>/lock &lt;type&gt; [type ...]</code>\n/locktypes for the list.');
  const added = [];
  for (const t of args) {
    if (!LOCK_TYPES.includes(t)) continue;
    await Lock.findOneAndUpdate({ chatId: ctx.chat.id, type: t }, {}, { upsert: true });
    added.push(t);
  }
  if (added.length === 0) return safeReply(ctx, '❌ Unknown lock type. /locktypes for the list.');
  await safeReply(ctx, `🔒 Locked: <b>${added.join(', ')}</b>`);
});

const unlock = requireAdmin(async (ctx) => {
  const args = (ctx.message.text || '').split(/\s+/).slice(1).map((s) => s.toLowerCase()).filter(Boolean);
  if (args.length === 0) return safeReply(ctx, '❌ Usage: <code>/unlock &lt;type&gt;</code>');
  const removed = [];
  for (const t of args) {
    const r = await Lock.deleteOne({ chatId: ctx.chat.id, type: t });
    if (r.deletedCount) removed.push(t);
  }
  if (removed.length === 0) return safeReply(ctx, '❌ None of those were locked.');
  await safeReply(ctx, `🔓 Unlocked: <b>${removed.join(', ')}</b>`);
});

const locks = async (ctx) => {
  const list = await Lock.find({ chatId: ctx.chat.id }).lean();
  if (list.length === 0) return safeReply(ctx, 'No locks here.');
  await safeReply(ctx, `🔒 <b>Active locks:</b>\n${list.map((l) => `• ${escapeHtml(l.type)}`).join('\n')}`);
};

const locktypes = async (ctx) => {
  await safeReply(ctx, `<b>Available lock types:</b>\n${LOCK_TYPES.map((t) => `• <code>${t}</code>`).join('\n')}`);
};

function detectLockType(msg) {
  if (!msg) return null;
  if (msg.sticker) return 'sticker';
  if (msg.photo) return 'photo';
  if (msg.video) return 'video';
  if (msg.animation) return 'animation';
  if (msg.audio) return 'audio';
  if (msg.voice) return 'voice';
  if (msg.document) return 'document';
  if (msg.poll) return 'poll';
  if (msg.contact) return 'contact';
  if (msg.location) return 'location';
  if (msg.game) return 'game';
  if (msg.forward_origin || msg.forward_from || msg.forward_from_chat) return 'forward';
  return null;
}

function entityToLockType(e, text) {
  switch (e.type) {
    case 'url':
    case 'text_link': return 'url';
    case 'mention': case 'text_mention': return 'mention';
    case 'hashtag': return 'hashtag';
    case 'cashtag': return 'cashtag';
    case 'email': return 'email';
    case 'phone_number': return 'phone';
    default: return null;
  }
}

async function lockMiddleware(ctx, next) {
  if (!ctx.message || !ctx.chat || ctx.chat.type === 'private') return next();
  if (ctx.isAdmin) return next();
  const list = await Lock.find({ chatId: ctx.chat.id }).lean();
  if (list.length === 0) return next();
  const types = new Set(list.map((l) => l.type));

  if (types.has('all') || types.has('messages')) {
    try { await ctx.deleteMessage(); } catch {}
    return;
  }

  const lockType = detectLockType(ctx.message);
  if (lockType && (types.has(lockType) || (types.has('media') && ['photo', 'video', 'animation', 'audio', 'voice', 'document', 'sticker'].includes(lockType)))) {
    try { await ctx.deleteMessage(); } catch {}
    return;
  }

  const text = ctx.message.text || ctx.message.caption || '';
  if (text && ctx.message.entities) {
    for (const e of ctx.message.entities) {
      const t = entityToLockType(e, text);
      if (t && types.has(t)) {
        try { await ctx.deleteMessage(); } catch {}
        return;
      }
      if (e.type === 'url' || e.type === 'text_link') {
        const url = e.type === 'text_link' ? e.url : text.substr(e.offset, e.length);
        if (types.has('invitelink') && /(t\.me\/joinchat|t\.me\/\+|telegram\.me\/)/i.test(url)) {
          try { await ctx.deleteMessage(); } catch {}
          return;
        }
      }
    }
  }

  if (types.has('rtl') && /[\u0590-\u08FF]/.test(text)) {
    try { await ctx.deleteMessage(); } catch {}
    return;
  }
  if (types.has('emoji') && /\p{Extended_Pictographic}/u.test(text)) {
    try { await ctx.deleteMessage(); } catch {}
    return;
  }
  if (types.has('bot') && ctx.message.new_chat_members?.some((u) => u.is_bot)) {
    for (const u of ctx.message.new_chat_members) {
      if (u.is_bot && u.id !== ctx.botInfo.id) {
        try { await ctx.banChatMember(u.id); } catch {}
      }
    }
    return;
  }

  return next();
}

module.exports = { lock, unlock, locks, locktypes, lockMiddleware };
