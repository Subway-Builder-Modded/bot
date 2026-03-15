require('dotenv').config();
const http = require('http');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const PORT = process.env.PORT || 3000;

if (!TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  console.error('Missing required environment variables.');
  process.exit(1);
}

http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  })
  .listen(PORT, () => {
    console.log(`Health server listening on ${PORT}`);
  });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const recentReplies = new Set();

// Matches #123 but NOT #100.5 or #1.2.3
const ISSUE_REGEX = /(^|[^\w])#(\d+)(?![\d.])/g;

// Matches commit hashes 7 to 40 hex chars
// Avoid matching inside larger words
const COMMIT_REGEX = /(^|[^a-fA-F0-9])([a-fA-F0-9]{7,40})(?![a-fA-F0-9])/g;

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

function githubHeaders() {
  const headers = {
    'User-Agent': 'discord-gh-link-bot',
    Accept: 'application/vnd.github+json',
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }

  return headers;
}

async function fetchGitHubIssue(number) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${number}`;
  const response = await fetch(url, { headers: githubHeaders() });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub issue API error: ${response.status}`);
  }

  return response.json();
}

async function fetchGitHubCommit(hash) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/${hash}`;
  const response = await fetch(url, { headers: githubHeaders() });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub commit API error: ${response.status}`);
  }

  return response.json();
}

function truncate(text, maxLength) {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 3)}...`;
}

function buildIssueEmbed(issue) {
  const isPR = !!issue.pull_request;

  let color = 0x5865f2;
  if (isPR) color = 0x8250df; // purple
  else if (issue.state === 'open') color = 0x238636; // green
  else color = 0xda3633; // red

  const typeLabel = isPR ? 'Pull Request' : 'Issue';
  const statusLabel =
    issue.state === 'open' ? 'Open' : issue.state === 'closed' ? 'Closed' : issue.state;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`#${issue.number} — ${truncate(issue.title, 180)}`)
    .setURL(issue.html_url)
    .addFields(
      { name: 'Type', value: typeLabel, inline: true },
      { name: 'Status', value: statusLabel, inline: true },
      {
        name: 'Author',
        value: issue.user?.login ? `\`${issue.user.login}\`` : 'Unknown',
        inline: true,
      }
    )
    .setFooter({
      text: `${GITHUB_OWNER}/${GITHUB_REPO}`,
      iconURL: 'https://github.githubassets.com/favicons/favicon.png',
    })
    .setTimestamp(new Date(issue.updated_at));

  if (issue.user?.avatar_url) {
    embed.setThumbnail(issue.user.avatar_url);
  }

  return embed;
}

function buildCommitEmbed(commitData) {
  const sha = commitData.sha;
  const shortSha = sha.slice(0, 7);
  const commit = commitData.commit || {};
  const authorName =
    commitData.author?.login ||
    commit.author?.name ||
    commit.committer?.name ||
    'Unknown';

  const message = commit.message || 'No commit message';
  const firstLine = message.split('\n')[0];

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b) // amber
    .setTitle(`${shortSha} — ${truncate(firstLine, 180)}`)
    .setURL(commitData.html_url)
    .addFields(
      { name: 'Type', value: 'Commit', inline: true },
      { name: 'Author', value: `\`${authorName}\``, inline: true },
      { name: 'SHA', value: `\`${shortSha}\``, inline: true }
    )
    .setFooter({
      text: `${GITHUB_OWNER}/${GITHUB_REPO}`,
      iconURL: 'https://github.githubassets.com/favicons/favicon.png',
    });

  const commitDate = commit.author?.date || commit.committer?.date;
  if (commitDate) {
    embed.setTimestamp(new Date(commitDate));
  }

  if (commitData.author?.avatar_url) {
    embed.setThumbnail(commitData.author.avatar_url);
  }

  return embed;
}

function getFirstIssueNumber(content) {
  const matches = [...content.matchAll(ISSUE_REGEX)];
  if (matches.length === 0) return null;
  return matches[0][2];
}

function getFirstCommitHash(content) {
  const matches = [...content.matchAll(COMMIT_REGEX)];
  if (matches.length === 0) return null;

  for (const match of matches) {
    const hash = match[2];

    // Skip all-numeric strings just in case
    if (/^\d+$/.test(hash)) continue;

    return hash;
  }

  return null;
}

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild) return;
    if (!message.author || message.author.bot) return;
    if (!message.content) return;

    const issueNumber = getFirstIssueNumber(message.content);
    const commitHash = getFirstCommitHash(message.content);

    if (!issueNumber && !commitHash) return;

    const dedupeKey = `${message.channel.id}:${message.id}:${issueNumber || ''}:${commitHash || ''}`;
    if (recentReplies.has(dedupeKey)) return;

    recentReplies.add(dedupeKey);
    setTimeout(() => recentReplies.delete(dedupeKey), 5 * 60 * 1000);

    const embeds = [];

    if (issueNumber) {
      const issue = await fetchGitHubIssue(issueNumber);
      if (issue) {
        embeds.push(buildIssueEmbed(issue));
      }
    }

    if (commitHash) {
      const commit = await fetchGitHubCommit(commitHash);
      if (commit) {
        embeds.push(buildCommitEmbed(commit));
      }
    }

    if (embeds.length === 0) return;

    await message.reply({
      embeds,
      allowedMentions: { repliedUser: false },
    });
  } catch (err) {
    console.error('Error handling messageCreate:', err);
  }
});

client.login(TOKEN);
