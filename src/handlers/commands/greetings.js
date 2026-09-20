const { getGroup, updateGroup } = require('../../utils/groupSettings');
const { safeReply, renderTemplate, mention, escapeHtml } = require('../../utils/helpers');
const { requireAdmin } = require('../../middleware/admin');

const lastWelcome = new Map();

const setwelcome = requireAdmin(async (ctx) => {
  const text = (ctx.message.text || '').split(/\s+/).slice(1).join(' ').trim()
    || ctx.message.reply_to_message?.text
    || ctx.message.reply_to_message?.caption;
  if (!text) return safeReply(ctx, '❌ Usage: <code>/setwelcome &lt;text&gt;</code>\nSupports {first} {last} {mention} {username} {chatname} {count}');
  await updateGroup(ctx.chat.id, { 'welcome.text': text, 'welcome.enabled': true });
  await safeReply(ctx, '✅ Welcome message set.');
});

const resetwelcome = requireAdmin(async (ctx) => {
  await updateGroup(ctx.chat.id, { 'welcome.text': 'Welcome, {mention}, to <b>{chatname}</b>!' });
  await safeReply(ctx, '✅ Welcome reset to default.');
});

const welcome = requireAdmin(async (ctx) => {
  const arg = ((ctx.message.text || '').split(/\s+/)[1] || '').toLowerCase();
  const g = await getGroup(ctx.chat.id);
  if (!arg) {
    return safeReply(ctx,
      `<b>Welcome settings</b>\nEnabled: <b>${g.welcome.enabled}</b>\nClean: <b>${g.welcome.clean}</b>\n\nText:\n<pre>${escapeHtml(g.welcome.text)}</pre>`);
  }
  if (['on', 'yes'].includes(arg)) { await updateGroup(ctx.chat.id, { 'welcome.enabled': true }); return safeReply(ctx, '✅ Welcomes enabled.'); }
  if (['off', 'no'].includes(arg)) { await updateGroup(ctx.chat.id, { 'welcome.enabled': false }); return safeReply(ctx, '🔕 Welcomes disabled.'); }
  return safeReply(ctx, '❌ Usage: <code>/welcome on|off</code>');
});

const cleanwelcome = requireAdmin(async (ctx) => {
  const arg = ((ctx.message.text || '').split(/\s+/)[1] || '').toLowerCase();
  if (!['on', 'off'].includes(arg)) return safeReply(ctx, '❌ Usage: <code>/cleanwelcome on|off</code>');
  await updateGroup(ctx.chat.id, { 'welcome.clean': arg === 'on' });
  await safeReply(ctx, `✅ Clean welcome ${arg}.`);
});

const setgoodbye = requireAdmin(async (ctx) => {
  const text = (ctx.message.text || '').split(/\s+/).slice(1).join(' ').trim()
    || ctx.message.reply_to_message?.text;
  if (!text) return safeReply(ctx, '❌ Usage: <code>/setgoodbye &lt;text&gt;</code>');
  await updateGroup(ctx.chat.id, { 'goodbye.text': text, 'goodbye.enabled': true });
  await safeReply(ctx, '✅ Goodbye message set.');
});

const resetgoodbye = requireAdmin(async (ctx) => {
  await updateGroup(ctx.chat.id, { 'goodbye.text': '{first} has left the group.' });
  await safeReply(ctx, '✅ Goodbye reset to default.');
});

const goodbye = requireAdmin(async (ctx) => {
  const arg = ((ctx.message.text || '').split(/\s+/)[1] || '').toLowerCase();
  const g = await getGroup(ctx.chat.id);
  if (!arg) {
    return safeReply(ctx, `<b>Goodbye settings</b>\nEnabled: <b>${g.goodbye.enabled}</b>\n\nText:\n<pre>${escapeHtml(g.goodbye.text)}</pre>`);
  }
  if (['on', 'yes'].includes(arg)) { await updateGroup(ctx.chat.id, { 'goodbye.enabled': true }); return safeReply(ctx, '✅ Goodbyes enabled.'); }
  if (['off', 'no'].includes(arg)) { await updateGroup(ctx.chat.id, { 'goodbye.enabled': false }); return safeReply(ctx, '🔕 Goodbyes disabled.'); }
  return safeReply(ctx, '❌ Usage: <code>/goodbye on|off</code>');
});

async function newMemberHandler(ctx, next) {
  if (!ctx.message?.new_chat_members) return next();
  const g = await getGroup(ctx.chat.id);
  if (!g.welcome.enabled) return next();
  for (const u of ctx.message.new_chat_members) {
    if (u.is_bot && u.id === ctx.botInfo.id) continue;
    try {
      const text = renderTemplate(g.welcome.text, ctx, u);
      const sent = await ctx.reply(text || `Welcome, ${mention(u)}!`, { parse_mode: 'HTML' });
      if (g.welcome.clean) {
        const prev = lastWelcome.get(ctx.chat.id);
        if (prev) { try { await ctx.deleteMessage(prev); } catch {} }
        lastWelcome.set(ctx.chat.id, sent.message_id);
      }
    } catch {}
  }
  return next();
}

async function leftMemberHandler(ctx, next) {
  if (!ctx.message?.left_chat_member) return next();
  const u = ctx.message.left_chat_member;
  if (u.id === ctx.botInfo.id) return next();
  const g = await getGroup(ctx.chat.id);
  if (!g.goodbye.enabled) return next();
  try {
    const text = renderTemplate(g.goodbye.text, ctx, u);
    await ctx.reply(text || `${u.first_name} has left.`, { parse_mode: 'HTML' });
  } catch {}
  return next();
}

async function cleanServiceMiddleware(ctx, next) {
  const m = ctx.message;
  if (!m || !ctx.chat || ctx.chat.type === 'private') return next();
  const isService = m.new_chat_members || m.left_chat_member || m.new_chat_title || m.new_chat_photo
    || m.delete_chat_photo || m.group_chat_created || m.pinned_message;
  if (!isService) return next();
  const g = await getGroup(ctx.chat.id);
  if (g.cleanService) { try { await ctx.deleteMessage(); } catch {} }
  return next();
}

const cleanservice = requireAdmin(async (ctx) => {
  const arg = ((ctx.message.text || '').split(/\s+/)[1] || '').toLowerCase();
  if (!['on', 'off'].includes(arg)) {
    const g = await getGroup(ctx.chat.id);
    return safeReply(ctx, `Clean service: <b>${g.cleanService ? 'on' : 'off'}</b>.\nUsage: <code>/cleanservice on|off</code>`);
  }
  await updateGroup(ctx.chat.id, { cleanService: arg === 'on' });
  await safeReply(ctx, `✅ Clean service ${arg}.`);
});

module.exports = {
  setwelcome, resetwelcome, welcome, cleanwelcome,
  setgoodbye, resetgoodbye, goodbye,
  newMemberHandler, leftMemberHandler,
  cleanservice, cleanServiceMiddleware,
};
