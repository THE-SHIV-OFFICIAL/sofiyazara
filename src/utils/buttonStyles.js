'use strict';

/**
 * Telegram inline keyboards do not expose Discord-style button colours.
 * Keep the requested semantic API, but map it to Telegram-safe labels/custom
 * emoji rather than sending an unsupported "style" field to Bot API.
 */

const ButtonStyle = Object.freeze({
  PRIMARY: 'primary',
  SUCCESS: 'success',
  DANGER: 'danger',
});

function getStyleMap() {
  const styles = [ButtonStyle.PRIMARY, ButtonStyle.SUCCESS, ButtonStyle.DANGER];
  for (let i = styles.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [styles[i], styles[j]] = [styles[j], styles[i]];
  }
  return { 1: styles[0], 2: styles[1], 3: styles[2] };
}

function styledLabel(label, style) {
  // InlineKeyboardButton has no parse_mode or custom-emoji entity field.
  // Keep the semantic style visible with text prefixes instead of sending
  // invalid <tg-emoji> HTML that Telegram would display literally.
  const prefix = style === ButtonStyle.SUCCESS ? '[OK]'
    : style === ButtonStyle.DANGER ? '[!]' : '[+]';
  return `${prefix} ${String(label)}`;
}

module.exports = { ButtonStyle, getStyleMap, styledLabel };