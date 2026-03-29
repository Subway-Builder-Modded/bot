require('dotenv').config();

const config = {
  token: (process.env.DISCORD_TOKEN || '').trim(),
  defaultGitHubOwner: (process.env.GITHUB_OWNER || '').trim(),
  defaultGitHubRepo: (process.env.GITHUB_REPO || '').trim(),
  githubToken: (process.env.GITHUB_TOKEN || '').trim(),
  discordClientId: (process.env.DISCORD_CLIENT_ID || '').trim(),
  discordGuildId: (process.env.DISCORD_GUILD_ID || '').trim(),
  port: process.env.PORT || 3000,
  githubWebhookSecret: (process.env.GITHUB_WEBHOOK_SECRET || '').trim(),
  githubWebhookPath: (process.env.GITHUB_WEBHOOK_PATH || '/github/webhook').trim() || '/github/webhook',
  discordGitHubEventsChannelId: (process.env.DISCORD_GITHUB_EVENTS_CHANNEL_ID || '').trim(),
  discordWebhookUrl: (process.env.DISCORD_WEBHOOK_URL || '').trim(),
  discordUsername: (process.env.DISCORD_USERNAME || '').trim(),
  discordAvatarUrl: (process.env.DISCORD_AVATAR_URL || '').trim(),
};

function validateRequiredConfig() {
  if (
    !config.token ||
    !config.defaultGitHubOwner ||
    !config.defaultGitHubRepo ||
    !config.discordClientId ||
    !config.discordGuildId
  ) {
    throw new Error('Missing required environment variables.');
  }
}

module.exports = {
  config,
  validateRequiredConfig,
};
