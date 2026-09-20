'use strict';

/**
 * Groq AI client (plain fetch — no SDK needed).
 *
 * Features:
 *  - Multi-key rotation (GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3)
 *  - Per-key cooldown on 429 / 401 so a dead key is skipped automatically
 *  - Hard wall-clock timeout so Telegraf updates never hang
 *  - One automatic retry on rate-limit / 5xx with the next key
 */

const config = require('../config/index');
const logger = require('../utils/logger');

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// Models available on Groq
const CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-120b';
const FAST_MODEL = process.env.GROQ_FAST_MODEL || 'openai/gpt-oss-20b';

const DEFAULT_TIMEOUT = 12_000;
const KEY_COOLDOWN_MS = 60_000;

const keyState = new Map(); // key -> blockedUntil (epoch ms)

function allKeys() {
  return (config.groqApiKeys || []).filter(Boolean);
}

function usableKeys() {
  const now = Date.now();
  const keys = allKeys();
  const free = keys.filter((k) => (keyState.get(k) || 0) <= now);
  return free.length ? free : keys; // if all cooling down, still try
}

function blockKey(key, ms = KEY_COOLDOWN_MS) {
  keyState.set(key, Date.now() + ms);
}

function isConfigured() {
  return allKeys().length > 0;
}

async function rawCall(key, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = (await res.text()).slice(0, 300);
      const err = new Error(`Groq ${res.status}: ${errText}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    return (data.choices?.[0]?.message?.content || '').trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask Groq for a completion. Returns the text, or null when every attempt fails.
 */
async function chat(messages, options = {}) {
  if (!isConfigured()) {
    logger.warn('Groq: no API key configured (set GROQ_API_KEY).');
    return null;
  }

  const body = {
    model: options.model || CHAT_MODEL,
    messages,
    temperature: options.temperature ?? 0.75,
    max_tokens: options.maxTokens ?? 400,
    top_p: options.topP ?? 0.95,
  };
  if (options.reasoningEffort) body.reasoning_effort = options.reasoningEffort;

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT;
  const keys = usableKeys();

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const text = await rawCall(key, body, timeoutMs);
      if (text) return text;
      logger.warn('Groq returned an empty reply.');
    } catch (e) {
      const status = e.status;
      if (status === 429) blockKey(key, 30_000);
      else if (status === 401 || status === 403) blockKey(key, 10 * 60_000);
      logger.warn(`Groq call failed (${status || 'network'}): ${String(e.message).slice(0, 160)}`);
    }
  }
  return null;
}

module.exports = { chat, isConfigured, CHAT_MODEL, FAST_MODEL };
