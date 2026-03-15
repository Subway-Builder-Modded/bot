require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

if (!TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  console.error('Missing required environment variables.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// Prevent spam loops by remembering recent matches per channel/message combo
const recentReplies = new Set();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Matches:
// #123
// (#123)
// "working on #123"
// avoids matching part of a longer word
const ISSUE_REGEX = /(^|[^A-Za-z0-9])#(\d+)\b/g;

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;
    if (!message.content) return;

    const matches = [...message.content.matchAll(ISSUE_REGEX)];
    if (matches.length === 0) return;

    // one reply per message
    const issueNumber = matches[0][2];
    const dedupeKey = `${message.channel.id}:${message.id}:${issueNumber}`;

    if (recentReplies.has(dedupeKey)) return;
    recentReplies.add(dedupeKey);

    // expire dedupe entry after 5 minutes
    setTimeout(() => recentReplies.delete(dedupeKey), 5 * 60 * 1000);

    const url = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issueNumber}`;

    await message.reply({
      content: url,
      allowedMentions: { repliedUser: false },
    });
  } catch (err) {
    console.error('Error handling messageCreate:', err);
  }
});

client.login(TOKEN);
