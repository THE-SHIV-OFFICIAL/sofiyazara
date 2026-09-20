const { Blacklist } = require('../../models');
const { getGroup, updateGroup } = require('../../utils/groupSettings');
const { safeReply, escapeHtml, isUserAdmin, mention } = require('../../utils/helpers');
const { requireAdmin } = require('../../middleware/admin');

const addblacklist = requireAdmin(async (ctx) => {
  const args = (ctx.message.text || '').split(/\s+/).slice(1).map((s) => s.toLowerCase()).filter(Boolean);
  if (args.length === 0) return safeReply(ctx, '❌ Usage: <code>/addblacklist &lt;word&gt; [word ...]</code>');
  for (const w of args) {
    await Blacklist.findOneAndUpdate({ chatId: ctx.chat.id, trigger: w }, {}, { upsert: true });
  }
  await safeReply(ctx, `✅ Added <b>${args.length}</b> word(s) to blacklist.`);
});

const rmblacklist = requireAdmin(async (ctx) => {
  const args = (ctx.message.text || '').split(/\s+/).slice(1).map((s) => s.toLowerCase()).filter(Boolean);
  if (args.length === 0) return safeReply(ctx, '❌ Usage: <code>/rmblacklist &lt;word&gt;</code>');
  let removed = 0;
  for (const w of args) {
    const r = await Blacklist.deleteOne({ chatId: ctx.chat.id, trigger: w });
    removed += r.deletedCount || 0;
  }
  await safeReply(ctx, `🗑️ Removed <b>${removed}</b> word(s).`);
});

const blacklist = async (ctx) => {
  const list = await Blacklist.find({ chatId: ctx.chat.id }).lean();
  const g = await getGroup(ctx.chat.id);
  if (list.length === 0) return safeReply(ctx, `Blacklist is empty.\nMode: <b>${g.blacklistMode}</b>`);
  await safeReply(ctx, `🚫 <b>Blacklist</b> (mode: <b>${g.blacklistMode}</b>):\n${list.map((b) => `• <code>${escapeHtml(b.trigger)}</code>`).join('\n')}`);
};

const blacklistmode = requireAdmin(async (ctx) => {
  const arg = ((ctx.message.text || '').split(/\s+/)[1] || '').toLowerCase();
  if (!['delete', 'warn', 'mute', 'kick', 'ban'].includes(arg)) {
    const g = await getGroup(ctx.chat.id);
    return safeReply(ctx, `Mode: <b>${g.blacklistMode}</b>.\nUsage: <code>/blacklistmode delete|warn|mute|kick|ban</code>`);
  }
  await updateGroup(ctx.chat.id, { blacklistMode: arg });
  await safeReply(ctx, `✅ Blacklist mode set to <b>${arg}</b>.`);
});

async function blacklistMiddleware(ctx, next) {
  if (!ctx.message || !ctx.chat || ctx.chat.type === 'private') return next();
  if (await isUserAdmin(ctx, ctx.from.id)) return next();
  const text = (ctx.message.text || ctx.message.caption || '').toLowerCase();
  if (!text) return next();
  const list = await Blacklist.find({ chatId: ctx.chat.id }).lean();
  if (list.length === 0) return next();
  const hit = list.find((b) => text.includes(b.trigger));
  if (!hit) return next();
  const g = await getGroup(ctx.chat.id);
  try { await ctx.deleteMessage(); } catch {}
  try {
    if (g.blacklistMode === 'warn') {
      await ctx.reply(`⚠️ ${mention(ctx.from)} used a blacklisted word: <code>${escapeHtml(hit.trigger)}</code>`, { parse_mode: 'HTML' });
    } else if (g.blacklistMode === 'mute') {
      await ctx.restrictChatMember(ctx.from.id, { permissions: { can_send_messages: false } });
      await ctx.reply(`🔇 ${mention(ctx.from)} muted for blacklisted word.`, { parse_mode: 'HTML' });
    } else if (g.blacklistMode === 'kick') {
      await ctx.banChatMember(ctx.from.id);
      await ctx.unbanChatMember(ctx.from.id);
      await ctx.reply(`👢 ${mention(ctx.from)} kicked for blacklisted word.`, { parse_mode: 'HTML' });
    } else if (g.blacklistMode === 'ban') {
      await ctx.banChatMember(ctx.from.id);
      await ctx.reply(`🔨 ${mention(ctx.from)} banned for blacklisted word.`, { parse_mode: 'HTML' });
    }
  } catch {}
  return; // block further
}

module.exports = { addblacklist, rmblacklist, blacklist, blacklistmode, blacklistMiddleware };
