require('dotenv').config();

const OWNER_ID = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID, 10) : 8418584090;

module.exports = {
  botToken:      process.env.BOT_TOKEN,
  botUsername:   process.env.BOT_USERNAME || 'Sofiya_bot',

  // Bot persona name used by the AI chatbot
  botName:       process.env.BOT_NAME || 'Sofiya',

  // Groq API keys (primary + backups, rotated automatically)
  groqApiKeys: [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
  ].filter(Boolean),

  // kept for backwards compatibility with older code paths
  get groqApiKey() { return this.groqApiKeys[0] || null; },
  get groqApiKey2() { return this.groqApiKeys[1] || null; },

  // Database & Users
  mongoUri:      process.env.MONGO_URI,
  ownerId:       OWNER_ID,
  sudoUsers:     process.env.SUDO_USERS
    ? process.env.SUDO_USERS.split(',').map((id) => parseInt(id.trim(), 10)).filter(Boolean)
    : [],

  // Logs & Server
  loggerGroupId: process.env.LOGGER_GROUP_ID ? parseInt(process.env.LOGGER_GROUP_ID, 10) : null,
  logLevel:      process.env.LOG_LEVEL || 'info',
  port:          process.env.PORT || 3000,
  pingImageUrl:  process.env.PING_IMAGE_URL || 'https://image.zaw-myo.workers.dev/image/e1b645af-123d-4e09-ba2a-07246847f308',

  // Telegram custom emoji IDs are optional. Pack links alone cannot be
  // rendered as message emoji by the Bot API, so aliases are configured via
  // PREMIUM_EMOJI_IDS (alias=id,alias=id).
  premiumEmojiIds: process.env.PREMIUM_EMOJI_IDS || '',
  aiGamesEnabled: process.env.AI_GAMES_ENABLED !== 'false',
};
