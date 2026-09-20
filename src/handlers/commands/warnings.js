const { Warning } = require('../../models');
const { getGroup, updateGroup } = require('../../utils/groupSettings');
const { extractTarget, mention, safeReply, isUserAdmin, parseDuration, formatDuration } = require('../../utils/helpers');
const { requireAdmin } = require('../../middleware/admin');
const { logEvent } = require('../../services/loggingService');

async function applyWarnAction(ctx, user, group) {
  const mode = group.warnMode;
  try {
    if (mode === 'mute') {
      await ctx.restrictChatMember(user.id, { permissions: { can_send_messages: false } });
      return '🔇 muted';
    }
    if (mode === 'kick') {
      await ctx.banChatMember(user.id);
      await ctx.unbanChatMember(user.id);
      return '👢 kicked';
    }
    await ctx.banChatMember(user.id);
    return '🔨 banned';
  } catch (e) {
    return `(action failed: ${e.description || e.message})`;
  }
}

async function warnInternal(ctx, silent = false, deleteOriginal = false) {
  const { user, reason } = await extractTarget(ctx);
  if (!user) return safeReply(ctx, '❌ Reply or pass a user.');
  if (await isUserAdmin(ctx, user.id)) return safeReply(ctx, '❌ Cannot warn an admin.');

  const group = await getGroup(ctx.chat.id);
  let warn = await Warning.findOne({ chatId: ctx.chat.id, userId: user.id });
  if (!warn) warn = new Warning({ chatId: ctx.chat.id, userId: user.id, reasons: [] });
  warn.reasons.push({ reason: reason || '', by: ctx.from.id });
  await warn.save();

  const count = warn.reasons.length;
  const limit = group.warnLimit;

  if (deleteOriginal && ctx.message.reply_to_message) {
    try { await ctx.deleteMessage(ctx.message.reply_to_message.message_id); } catch {}
  }
  if (silent) {
    try { await ctx.deleteMessage(); } catch {}
  }

  if (count >= limit) {
    const action = await applyWarnAction(ctx, user, group);
    warn.reasons = [];
    await warn.save();
    if (!silent) {
      await safeReply(ctx, `⚠️ ${mention(user)} reached <b>${limit}</b> warnings → ${action}.`);
    }
    logEvent('warn', { chat: ctx.chat, actor: ctx.from, target: user, reason, extra: `limit reached → ${action}` }).catch(() => {});
  } else {
    if (!silent) {
      await safeReply(ctx, `⚠️ ${mention(user)} warned (<b>${count}/${limit}</b>).${reason ? `\n<b>Reason:</b> ${reason}` : ''}`);
    }
    logEvent('warn', { chat: ctx.chat, actor: ctx.from, target: user, reason, extra: `${count}/${limit}` }).catch(() => {});
  }
}

const warn = requireAdmin((ctx) => warnInternal(ctx, false, false));
const swarn = requireAdmin((ctx) => warnInternal(ctx, true, false));
const dwarn = requireAdmin((ctx) => warnInternal(ctx, false, true));

const warns = async (ctx) => {
  const { user } = await extractTarget(ctx);
  const target = user || ctx.from;
  const w = await Warning.findOne({ chatId: ctx.chat.id, userId: target.id });
  const group = await getGroup(ctx.chat.id);
  if (!w || w.reasons.length === 0) {
    return safeReply(ctx, `${mention(target)} has no warnings (limit: <b>${group.warnLimit}</b>).`);
  }
  const lines = w.reasons.map((r, i) => ` ${i + 1}. ${r.reason || '<i>no reason</i>'}`).join('\n');
  await safeReply(ctx, `⚠️ <b>Warnings for ${mention(target)}</b> (${w.reasons.length}/${group.warnLimit}):\n${lines}`);
};

const resetwarns = requireAdmin(async (ctx) => {
  const { user } = await extractTarget(ctx);
  if (!user) return safeReply(ctx, '❌ Reply or pass a user.');
  await Warning.findOneAndUpdate({ chatId: ctx.chat.id, userId: user.id }, { reasons: [] }, { upsert: true });
  await safeReply(ctx, `✅ Warnings reset for ${mention(user)}.`);
});

const rmwarn = requireAdmin(async (ctx) => {
  const { user } = await extractTarget(ctx);
  if (!user) return safeReply(ctx, '❌ Reply or pass a user.');
  const w = await Warning.findOne({ chatId: ctx.chat.id, userId: user.id });
  if (!w || w.reasons.length === 0) return safeReply(ctx, 'No warnings to remove.');
  w.reasons.pop();
  await w.save();
  await safeReply(ctx, `✅ Removed last warning. ${mention(user)} now has <b>${w.reasons.length}</b>.`);
});

const setwarnlimit = requireAdmin(async (ctx) => {
  const n = parseInt((ctx.message.text || '').split(/\s+/)[1], 10);
  if (!n || n < 1 || n > 100) return safeReply(ctx, '❌ Usage: <code>/setwarnlimit &lt;1-100&gt;</code>');
  await updateGroup(ctx.chat.id, { warnLimit: n });
  await safeReply(ctx, `✅ Warn limit set to <b>${n}</b>.`);
});

const warnmode = requireAdmin(async (ctx) => {
  const arg = ((ctx.message.text || '').split(/\s+/)[1] || '').toLowerCase();
  if (!['mute', 'kick', 'ban'].includes(arg)) {
    const g = await getGroup(ctx.chat.id);
    return safeReply(ctx, `Current warn mode: <b>${g.warnMode}</b>.\nUsage: <code>/warnmode mute|kick|ban</code>`);
  }
  await updateGroup(ctx.chat.id, { warnMode: arg });
  await safeReply(ctx, `✅ Warn mode set to <b>${arg}</b>.`);
});

module.exports = { warn, swarn, dwarn, warns, resetwarns, rmwarn, setwarnlimit, warnmode };
