require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ChannelType,
  SlashCommandBuilder,
  PermissionsBitField,
  REST,
  Routes,
} = require('discord.js');

const TOKEN = (process.env.DISCORD_TOKEN || '').trim();
const DEFAULT_GITHUB_OWNER = (process.env.GITHUB_OWNER || '').trim();
const DEFAULT_GITHUB_REPO = (process.env.GITHUB_REPO || '').trim();
const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim();
const DISCORD_CLIENT_ID = (process.env.DISCORD_CLIENT_ID || '').trim();
const DISCORD_GUILD_ID = (process.env.DISCORD_GUILD_ID || '').trim();
const PORT = process.env.PORT || 3000;
const GITHUB_WEBHOOK_SECRET = (process.env.GITHUB_WEBHOOK_SECRET || '').trim();
const GITHUB_WEBHOOK_PATH = (process.env.GITHUB_WEBHOOK_PATH || '/github/webhook').trim() || '/github/webhook';
const DISCORD_GITHUB_EVENTS_CHANNEL_ID = (process.env.DISCORD_GITHUB_EVENTS_CHANNEL_ID || '').trim();
const DISCORD_WEBHOOK_URL = (process.env.DISCORD_WEBHOOK_URL || '').trim();
const DISCORD_USERNAME = (process.env.DISCORD_USERNAME || '').trim();
const DISCORD_AVATAR_URL = (process.env.DISCORD_AVATAR_URL || '').trim();

if (
  !TOKEN ||
  !DEFAULT_GITHUB_OWNER ||
  !DEFAULT_GITHUB_REPO ||
  !DISCORD_CLIENT_ID ||
  !DISCORD_GUILD_ID
) {
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

const recentReplies = new Set();
const SUSCAT_IMAGE_URL = 'https://subwaybuildermodded.com/images/art/suscat.jpg';

const EXACT_TEXT_RESPONSES = new Map([
  ['update?', 'update.'],
  ['update.', 'update.'],
  ['update', 'update.'],
  ['undapte?', 'undapte.'],
  ['undapte.', 'undapte.'],
  ['undapte', 'undapte.'],
]);
const EXACT_IMAGE_RESPONSES = new Map([
  ['.env', SUSCAT_IMAGE_URL],
  ['suscat', SUSCAT_IMAGE_URL],
]);

const orgRepoCache = {
  fetchedAt: 0,
  repos: [],
};

const PROJECTS = {
  railyard: {
    owner: 'Subway-Builder-Modded',
    repo: 'railyard',
    forumName: 'railyard-pr-discussions',
  },
  registry: {
    owner: 'Subway-Builder-Modded',
    repo: 'The-Railyard',
    forumName: 'registry-pr-discussions',
  },
  website: {
    owner: 'Subway-Builder-Modded',
    repo: 'website',
    forumName: 'website-pr-discussions',
  },
  bot: {
    owner: 'Subway-Builder-Modded',
    repo: 'bot',
    forumName: 'bot-pr-discussions',
  },
};

const RAILYARD_RELEASE_FORUM = 'railyard-changelog-qe';

function normalizeWebhookPath(pathname) {
  const trimmed = String(pathname || '').trim();
  if (!trimmed) return '/github/webhook';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function writePlainResponse(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function verifyGitHubSignature(body, signatureHeader, secret) {
  if (!secret) return false;
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const digest = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  const expected = `sha256=${digest}`;
  return timingSafeEqualString(expected, signatureHeader);
}

function truncateWebhookText(value, max) {
  if (!value) return '';
  const text = String(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function buildGitHubWebhookDescription(event, payload) {
  if (event === 'issues') {
    return `Issue **${payload.action || 'updated'}**${payload.issue?.number ? ` • #${payload.issue.number}` : ''}`;
  }

  if (event === 'issue_comment') {
    const body = payload.comment?.body ? `\n\n${truncateWebhookText(payload.comment.body, 300)}` : '';
    return `Issue comment **${payload.action || 'created'}**${body}`;
  }

  if (event === 'pull_request') {
    return `Pull request **${payload.action || 'updated'}**${payload.pull_request?.number ? ` • #${payload.pull_request.number}` : ''}`;
  }

  if (event === 'pull_request_review') {
    return `Pull request review **${payload.action || 'submitted'}**`;
  }

  if (event === 'pull_request_review_comment') {
    const body = payload.comment?.body ? `\n\n${truncateWebhookText(payload.comment.body, 300)}` : '';
    return `Review comment **${payload.action || 'created'}**${body}`;
  }

  if (event === 'pull_request_review_thread') {
    return `Review thread **${payload.action || 'updated'}**`;
  }

  if (event === 'release') {
    return `Release **${payload.action || 'published'}**`;
  }

  if (event === 'deployment' || event === 'deployment_status') {
    return `Deployment event **${payload.action || 'updated'}**`;
  }

  if (event === 'milestone') {
    return `Milestone **${payload.action || 'updated'}**`;
  }

  if (event === 'repository_ruleset') {
    return `Repository ruleset **${payload.action || 'updated'}**`;
  }

  if (event === 'page_build') {
    return 'GitHub Pages build event';
  }

  if (event === 'repository') {
    return `Repository **${payload.action || 'updated'}**`;
  }

  if (event === 'visibility_change') {
    return 'Repository visibility changed';
  }

  if (event === 'issue_dependencies') {
    return 'Issue dependency updated';
  }

  if (event === 'organization') {
    return `Organization event **${payload.action || 'updated'}**`;
  }

  return 'GitHub event received';
}

function buildGitHubWebhookExtraFields(event, payload) {
  const fields = [];

  if (payload.issue?.number) {
    fields.push({ name: 'Issue #', value: String(payload.issue.number), inline: true });
  }

  if (payload.pull_request?.number) {
    fields.push({ name: 'PR #', value: String(payload.pull_request.number), inline: true });
  }

  if (payload.release?.tag_name) {
    fields.push({ name: 'Tag', value: payload.release.tag_name, inline: true });
  }

  if (event === 'deployment' || event === 'deployment_status') {
    if (payload.deployment?.environment) {
      fields.push({ name: 'Environment', value: payload.deployment.environment, inline: true });
    }
    if (payload.deployment_status?.state) {
      fields.push({ name: 'State', value: payload.deployment_status.state, inline: true });
    }
  }

  if (event === 'page_build') {
    if (payload.build?.status) {
      fields.push({ name: 'Build Status', value: payload.build.status, inline: true });
    }
    if (payload.build?.commit) {
      fields.push({ name: 'Commit', value: `\`${String(payload.build.commit).slice(0, 7)}\``, inline: true });
    }
  }

  if (event === 'repository_ruleset' && payload.repository_ruleset?.name) {
    fields.push({ name: 'Ruleset', value: payload.repository_ruleset.name, inline: false });
  }

  if (event === 'milestone' && payload.milestone?.description) {
    fields.push({
      name: 'Milestone Notes',
      value: truncateWebhookText(payload.milestone.description, 500),
      inline: false,
    });
  }

  if (payload.comment?.html_url) {
    fields.push({ name: 'Link', value: `[Open on GitHub](${payload.comment.html_url})`, inline: false });
  } else if (payload.review?.html_url) {
    fields.push({ name: 'Link', value: `[Open on GitHub](${payload.review.html_url})`, inline: false });
  } else if (payload.pull_request?.html_url) {
    fields.push({ name: 'Link', value: `[Open on GitHub](${payload.pull_request.html_url})`, inline: false });
  } else if (payload.issue?.html_url) {
    fields.push({ name: 'Link', value: `[Open on GitHub](${payload.issue.html_url})`, inline: false });
  } else if (payload.release?.html_url) {
    fields.push({ name: 'Link', value: `[Open on GitHub](${payload.release.html_url})`, inline: false });
  } else if (payload.repository?.html_url) {
    fields.push({ name: 'Link', value: `[Open on GitHub](${payload.repository.html_url})`, inline: false });
  }

  return fields;
}

function getGitHubWebhookColor(event, action) {
  if (action === 'opened' || action === 'created' || action === 'published' || action === 'submitted') {
    return 5763719;
  }
  if (action === 'closed' || action === 'deleted' || action === 'dismissed' || action === 'removed') {
    return 15548997;
  }
  if (action === 'reopened' || action === 'restored') {
    return 3447003;
  }

  switch (event) {
    case 'pull_request':
    case 'pull_request_review':
    case 'pull_request_review_comment':
    case 'pull_request_review_thread':
      return 10181046;
    case 'issues':
    case 'issue_comment':
    case 'issue_dependencies':
      return 15844367;
    case 'release':
      return 15105570;
    case 'deployment':
    case 'deployment_status':
    case 'page_build':
      return 3066993;
    case 'repository_ruleset':
    case 'repository':
    case 'visibility_change':
    case 'organization':
      return 9807270;
    default:
      return 7506394;
  }
}

function buildGitHubWebhookEmbed(event, payload) {
  const repo = payload.repository?.full_name || 'Unknown repo';
  const repoUrl = payload.repository?.html_url || null;
  const org = payload.organization?.login || null;
  const actor = payload.sender?.login || 'unknown';
  const actorUrl = payload.sender?.html_url || null;
  const actorAvatar = payload.sender?.avatar_url || null;
  const action = payload.action || 'triggered';

  const title =
    payload.issue?.title ||
    payload.pull_request?.title ||
    payload.release?.name ||
    payload.release?.tag_name ||
    payload.milestone?.title ||
    payload.repository?.name ||
    `${event} event`;

  const url =
    payload.comment?.html_url ||
    payload.review?.html_url ||
    payload.pull_request?.html_url ||
    payload.issue?.html_url ||
    payload.release?.html_url ||
    payload.repository?.html_url ||
    repoUrl;

  const description = buildGitHubWebhookDescription(event, payload);
  const color = getGitHubWebhookColor(event, action);

  const fields = [
    { name: 'Event', value: event, inline: true },
    { name: 'Action', value: action, inline: true },
    { name: 'Actor', value: actorUrl ? `[${actor}](${actorUrl})` : actor, inline: true },
    { name: 'Repository', value: repoUrl ? `[${repo}](${repoUrl})` : repo, inline: true },
  ];

  if (org) {
    fields.push({ name: 'Organization', value: org, inline: true });
  }

  fields.push(...buildGitHubWebhookExtraFields(event, payload));

  return {
    title: truncateWebhookText(title, 256),
    url: url || undefined,
    description: truncateWebhookText(description, 4096),
    color,
    author: {
      name: actor,
      url: actorUrl || undefined,
      icon_url: actorAvatar || undefined,
    },
    fields: fields.slice(0, 25).map((field) => ({
      name: truncateWebhookText(field.name, 256),
      value: truncateWebhookText(field.value || '—', 1024),
      inline: !!field.inline,
    })),
    footer: {
      text: `${repo} • GitHub webhook`,
    },
    timestamp: new Date().toISOString(),
  };
}

function buildGitHubWebhookPayload(event, payload) {
  return {
    username: DISCORD_USERNAME || 'GitHub Org Bot',
    avatar_url: DISCORD_AVATAR_URL || undefined,
    embeds: [buildGitHubWebhookEmbed(event, payload)],
  };
}

async function sendGitHubWebhookViaDiscordWebhook(event, payload) {
  if (!DISCORD_WEBHOOK_URL) {
    throw new Error('Missing DISCORD_WEBHOOK_URL.');
  }

  const discordBody = buildGitHubWebhookPayload(event, payload);
  const response = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discordBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord webhook API error: ${response.status} ${text}`);
  }
}

async function sendGitHubWebhookToDiscord(event, payload) {
  const destinationId = DISCORD_GITHUB_EVENTS_CHANNEL_ID;
  if (!destinationId) {
    throw new Error('Missing DISCORD_GITHUB_EVENTS_CHANNEL_ID.');
  }

  const channel = await client.channels.fetch(destinationId);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Destination ${destinationId} is not a text-based channel/thread.`);
  }

  const embed = buildGitHubWebhookEmbed(event, payload);
  await channel.send({ embeds: [embed] });
}

async function deliverGitHubWebhook(event, payload) {
  if (DISCORD_GITHUB_EVENTS_CHANNEL_ID) {
    try {
      await sendGitHubWebhookToDiscord(event, payload);
      return 'bot-channel';
    } catch (error) {
      if (!DISCORD_WEBHOOK_URL) {
        throw error;
      }
      console.warn('[webhook] bot-channel delivery failed, falling back to Discord webhook', {
        error: error.message,
      });
      await sendGitHubWebhookViaDiscordWebhook(event, payload);
      return 'discord-webhook-fallback';
    }
  }

  await sendGitHubWebhookViaDiscordWebhook(event, payload);
  return 'discord-webhook';
}

async function handleGitHubWebhookRequest(req, res) {
  const deliveryHeader = req.headers['x-github-delivery'];
  const eventHeader = req.headers['x-github-event'];
  const deliveryId = Array.isArray(deliveryHeader) ? deliveryHeader[0] : deliveryHeader || 'unknown';
  const eventName = Array.isArray(eventHeader) ? eventHeader[0] : eventHeader || 'unknown';

  if (req.method !== 'POST') {
    console.warn('[webhook] rejected non-POST request', { deliveryId, event: eventName, method: req.method });
    writePlainResponse(res, 405, 'Only POST allowed');
    return;
  }

  const rawBody = await readRequestBody(req);
  const signatureHeader = req.headers['x-hub-signature-256'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader || '';
  const event = Array.isArray(eventHeader) ? eventHeader[0] : eventHeader || 'unknown';
  const valid = verifyGitHubSignature(rawBody, signature, GITHUB_WEBHOOK_SECRET);

  if (!valid) {
    console.warn('[webhook] bad signature', { deliveryId, event });
    writePlainResponse(res, 401, 'Bad signature');
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn('[webhook] invalid json', { deliveryId, event });
    writePlainResponse(res, 400, 'Invalid JSON');
    return;
  }

  if (event === 'ping') {
    console.log('[webhook] ping acknowledged', { deliveryId });
    writePlainResponse(res, 200, 'pong');
    return;
  }

  if (!client.isReady()) {
    console.warn('[webhook] bot not ready', { deliveryId, event });
    writePlainResponse(res, 503, 'Bot not ready');
    return;
  }

  try {
    const mode = await deliverGitHubWebhook(event, payload);
    console.log('[webhook] delivered to discord', { deliveryId, event, mode });
    writePlainResponse(res, 200, 'ok');
  } catch (error) {
    console.error('[webhook] discord delivery failed', { deliveryId, event, error: error.message });
    writePlainResponse(res, 500, `Discord error: ${error.message}`);
  }
}

function isGitHubWebhookRequest(req, requestPathname, webhookPath) {
  const signatureHeader = req.headers['x-hub-signature-256'];
  const eventHeader = req.headers['x-github-event'];
  const hasGitHubHeaders = !!signatureHeader || !!eventHeader;
  if (hasGitHubHeaders) return true;
  return req.method === 'POST' && requestPathname === webhookPath;
}

function startHttpServer() {
  const webhookPath = normalizeWebhookPath(GITHUB_WEBHOOK_PATH);

  http
    .createServer(async (req, res) => {
      try {
        const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

        if (isGitHubWebhookRequest(req, requestUrl.pathname, webhookPath)) {
          await handleGitHubWebhookRequest(req, res);
          return;
        }

        writePlainResponse(res, 200, 'ok');
      } catch (error) {
        console.error('HTTP server request error:', error);
        if (!res.headersSent) {
          writePlainResponse(res, 500, 'internal error');
        }
      }
    })
    .listen(PORT, () => {
      console.log(`Health + webhook server listening on ${PORT} (webhook path: ${webhookPath})`);
      console.log('Webhook config:', {
        webhookPath,
        hasWebhookSecret: !!GITHUB_WEBHOOK_SECRET,
        discordGithubEventsChannelId: DISCORD_GITHUB_EVENTS_CHANNEL_ID || null,
        hasDiscordWebhookUrl: !!DISCORD_WEBHOOK_URL,
      });
    })
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`Health server port ${PORT} already in use — skipping.`);
      } else {
        console.error('Health server error:', err);
      }
    });
}



client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log('GitHub config:', {
    owner: DEFAULT_GITHUB_OWNER,
    repo: DEFAULT_GITHUB_REPO,
    hasGitHubToken: !!GITHUB_TOKEN,
    githubTokenLength: GITHUB_TOKEN.length,
  });

  try {
    await registerSlashCommands();
    console.log('Slash commands registered.');
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }
});

async function registerSlashCommands() {
  const prCommand = new SlashCommandBuilder()
    .setName('pr')
    .setDescription('Create an issue/PR discussion forum post')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('project')
        .setDescription('Project to create the post for')
        .setRequired(true)
        .addChoices(
          ...Object.keys(PROJECTS).map((key) => ({ name: key, value: key }))
        )
    )
    .addIntegerOption((option) =>
      option
        .setName('issue')
        .setDescription('Issue or PR number')
        .setMinValue(1)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('Message for the forum post (optional)')
        .setRequired(false)
    );

  const releaseCommand = new SlashCommandBuilder()
    .setName('release')
    .setDescription('Create release changelog + QE forum posts')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('version')
        .setDescription('Release version')
        .setRequired(true)
    );

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
    { body: [prCommand.toJSON(), releaseCommand.toJSON()] }
  );
}

function githubHeaders() {
  const headers = {
    'User-Agent': 'discord-gh-link-bot',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }

  return headers;
}

function truncate(text, maxLength) {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 3)}...`;
}

function stripCodeBlocks(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');
}

function isValidRepoName(value) {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

function isValidCommitHash(value) {
  return /^[a-fA-F0-9]{7,40}$/.test(value);
}

function normalizeOwnerRepo(owner, repo) {
  if (!owner || !repo) return null;
  if (!isValidRepoName(owner) || !isValidRepoName(repo)) return null;
  return { owner, repo };
}

function normalizeIssueNumber(value) {
  const match = String(value || '').trim().match(/^#?(\d+)$/);
  return match ? match[1] : null;
}

function dedupeIssueRefs(issueRefs) {
  const seen = new Set();
  const result = [];

  for (const ref of issueRefs) {
    const key = `${ref.owner}/${ref.repo}#${ref.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }

  return result;
}

const REPO_ALIASES = {
  registry: 'The-Railyard',
};

function resolveRepoAlias(repo) {
  if (!repo) return repo;
  return REPO_ALIASES[repo.toLowerCase()] || repo;
}

function expandIssueNumberChain(numberChain) {
  return String(numberChain || '').match(/\d+/g) || [];
}

function pushIssueRef(refs, owner, repo, number) {
  if (!number) return;

  if (!owner && !repo) {
    refs.push({
      owner: DEFAULT_GITHUB_OWNER,
      repo: DEFAULT_GITHUB_REPO,
      number,
    });
    return;
  }

  if (!owner && repo) {
    const resolvedRepo = resolveRepoAlias(repo);
    if (!isValidRepoName(resolvedRepo)) return;
    refs.push({
      owner: DEFAULT_GITHUB_OWNER,
      repo: resolvedRepo,
      number,
    });
    return;
  }

  if (owner && repo) {
    const resolvedRepo = resolveRepoAlias(repo);
    const normalized = normalizeOwnerRepo(owner, resolvedRepo);
    if (!normalized) return;

    refs.push({
      owner: normalized.owner,
      repo: normalized.repo,
      number,
    });
  }
}

function extractIssueRefs(content) {
  const refs = [];
  // Track absolute positions of '#' chars already claimed by a higher-priority pattern
  // so bare '#123' can't double-fire when it was already part of 'repo/#123'.
  const consumedHashPos = new Set();

  const patterns = [
    /(^|[^\w/-])(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)\/(?<chain>#\d+(?:\/#\d+)+)(?![\d.])/g,
    /(^|[^\w/-])(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)(?<chain>#\d+(?:\/#\d+)+)(?![\d.])/g,
    /(^|[^\w/-])(?<repo>[A-Za-z0-9_.-]+)\/(?<chain>#\d+(?:\/#\d+)+)(?![\d.])/g,
    /(^|[^\w/-])(?<repo>[A-Za-z0-9_.-]+)(?<chain>#\d+(?:\/#\d+)+)(?![\d.])/g,
    /(^|[^\w])(?<chain>#\d+(?:\/#\d+)+)(?![\d.])/g,
    /(^|[^\w/-])(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)\/#(?<number>\d+)(?![\d.])/g,
    /(^|[^\w/-])(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)#(?<number>\d+)(?![\d.])/g,
    /(^|[^\w/-])(?<repo>[A-Za-z0-9_.-]+)\/#(?<number>\d+)(?![\d.])/g,
    /(^|[^\w/-])(?<repo>[A-Za-z0-9_.-]+)#(?<number>\d+)(?![\d.])/g,
    /(^|[^\w])#(?<number>\d+)(?![\d.])/g,
  ];

  for (const regex of patterns) {
    for (const match of content.matchAll(regex)) {
      const owner = match.groups?.owner || null;
      const repo = match.groups?.repo || null;
      const chain = match.groups?.chain || null;
      const number = match.groups?.number || null;

      if (chain) {
        // Find each '#' in the chain and claim its absolute position.
        const chainStartInContent = match.index + match[0].indexOf(chain);
        let scanOffset = 0;
        for (const num of expandIssueNumberChain(chain)) {
          const localHash = chain.indexOf('#', scanOffset);
          if (localHash === -1) break;
          const absHash = chainStartInContent + localHash;
          if (!consumedHashPos.has(absHash)) {
            consumedHashPos.add(absHash);
            pushIssueRef(refs, owner, repo, num);
          }
          scanOffset = localHash + 1;
        }
        continue;
      }

      // Single-number pattern: locate the '#' in the matched text.
      const hashOffsetInMatch = match[0].indexOf('#');
      const absHash = match.index + hashOffsetInMatch;
      if (consumedHashPos.has(absHash)) continue;
      consumedHashPos.add(absHash);
      pushIssueRef(refs, owner, repo, number);
    }
  }

  return dedupeIssueRefs(refs);
}

function extractCommitRef(content) {
  const patterns = [
    /(^|[^\w/-])(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)@(?<hash>[a-fA-F0-9]{7,40})(?![a-fA-F0-9])/g,
    /(^|[^\w/-])(?<repo>[A-Za-z0-9_.-]+)@(?<hash>[a-fA-F0-9]{7,40})(?![a-fA-F0-9])/g,
    /(^|[^\w/-])(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)\/commit\/(?<hash>[a-fA-F0-9]{7,40})(?![a-fA-F0-9])/g,
    /(^|[^\w/-])(?<repo>[A-Za-z0-9_.-]+)\/commit\/(?<hash>[a-fA-F0-9]{7,40})(?![a-fA-F0-9])/g,
    /(^|[^\w/-])(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)\/(?<hash>[a-fA-F0-9]{7,40})(?![a-fA-F0-9])/g,
    /(^|[^\w/-])(?<repo>[A-Za-z0-9_.-]+)\/(?<hash>[a-fA-F0-9]{7,40})(?![a-fA-F0-9])/g,
    /(^|[^a-fA-F0-9])(?<hash>[a-fA-F0-9]{7,40})(?![a-fA-F0-9])/g,
  ];

  for (const regex of patterns) {
    for (const match of content.matchAll(regex)) {
      const owner = match.groups?.owner || null;
      const repo = match.groups?.repo || null;
      const hash = match.groups?.hash || null;

      if (!hash || !isValidCommitHash(hash)) continue;
      if (/^\d+$/.test(hash)) continue;

      if (!owner && !repo) {
        return {
          owner: null,
          repo: null,
          hash,
          searchDefaultOwner: true,
        };
      }

      if (!owner && repo) {
        if (!isValidRepoName(repo)) continue;
        return {
          owner: DEFAULT_GITHUB_OWNER,
          repo,
          hash,
          searchDefaultOwner: false,
        };
      }

      if (owner && repo) {
        const normalized = normalizeOwnerRepo(owner, repo);
        if (!normalized) continue;
        return {
          owner: normalized.owner,
          repo: normalized.repo,
          hash,
          searchDefaultOwner: false,
        };
      }
    }
  }

  return null;
}

async function fetchGitHubIssue(owner, repo, number) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${number}`;
  const response = await fetch(url, { headers: githubHeaders() });

  if (!response.ok) {
    const body = await response.text();
    console.error('fetchGitHubIssue failed', {
      url,
      status: response.status,
      body,
    });

    if (response.status === 404) return null;
    throw new Error(`GitHub issue API error: ${response.status}`);
  }

  return response.json();
}

async function fetchGitHubPullRequest(owner, repo, number) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`;
  const response = await fetch(url, { headers: githubHeaders() });

  if (!response.ok) {
    const body = await response.text();
    console.error('fetchGitHubPullRequest failed', {
      url,
      status: response.status,
      body,
    });

    if (response.status === 404) return null;
    throw new Error(`GitHub pull request API error: ${response.status}`);
  }

  return response.json();
}

async function fetchGitHubCommit(owner, repo, hash) {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${hash}`;
  const response = await fetch(url, { headers: githubHeaders() });

  if (!response.ok) {
    const body = await response.text();
    console.error('fetchGitHubCommit failed', {
      url,
      status: response.status,
      body,
    });

    if (response.status === 404 || response.status === 422) return null;
    throw new Error(`GitHub commit API error: ${response.status}`);
  }

  return response.json();
}

async function listOrgRepos(owner) {
  const now = Date.now();
  const cacheAgeMs = 5 * 60 * 1000;

  if (
    owner === DEFAULT_GITHUB_OWNER &&
    orgRepoCache.repos.length > 0 &&
    now - orgRepoCache.fetchedAt < cacheAgeMs
  ) {
    return orgRepoCache.repos;
  }

  const repos = [];
  let page = 1;

  while (page <= 10) {
    const url = `https://api.github.com/orgs/${owner}/repos?per_page=100&page=${page}&type=all`;
    const response = await fetch(url, { headers: githubHeaders() });

    if (!response.ok) {
      throw new Error(`GitHub org repos API error: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) break;

    for (const repo of data) {
      if (repo?.name) repos.push(repo.name);
    }

    if (data.length < 100) break;
    page += 1;
  }

  if (owner === DEFAULT_GITHUB_OWNER) {
    orgRepoCache.repos = repos;
    orgRepoCache.fetchedAt = now;
  }

  return repos;
}

async function resolveCommitRef(commitRef) {
  if (!commitRef.searchDefaultOwner) {
    const commit = await fetchGitHubCommit(commitRef.owner, commitRef.repo, commitRef.hash);
    if (!commit) return null;

    return {
      owner: commitRef.owner,
      repo: commitRef.repo,
      commit,
    };
  }

  const direct = await fetchGitHubCommit(DEFAULT_GITHUB_OWNER, DEFAULT_GITHUB_REPO, commitRef.hash);
  if (direct) {
    return {
      owner: DEFAULT_GITHUB_OWNER,
      repo: DEFAULT_GITHUB_REPO,
      commit: direct,
    };
  }

  const repos = await listOrgRepos(DEFAULT_GITHUB_OWNER);

  for (const repo of repos) {
    if (repo === DEFAULT_GITHUB_REPO) continue;

    const commit = await fetchGitHubCommit(DEFAULT_GITHUB_OWNER, repo, commitRef.hash);
    if (commit) {
      return {
        owner: DEFAULT_GITHUB_OWNER,
        repo,
        commit,
      };
    }
  }

  return null;
}

function getIssueVisualState(issue, prData) {
  const isPR = !!issue.pull_request;

  if (issue.state === 'open') {
    return {
      color: 0x238636,
      statusText: isPR ? 'Open PR' : 'Open Issue',
      emoji: '🟢',
    };
  }

  if (isPR) {
    const merged = !!prData?.merged;

    if (merged) {
      return {
        color: 0x8250df,
        statusText: 'Merged PR',
        emoji: '🟣',
      };
    }

    return {
      color: 0xda3633,
      statusText: 'Closed PR',
      emoji: '🔴',
    };
  }

  if (issue.state_reason === 'not_planned') {
    return {
      color: 0xda3633,
      statusText: 'Not Planned',
      emoji: '🔴',
    };
  }

  return {
    color: 0x8250df,
    statusText: 'Closed Issue',
    emoji: '🟣',
  };
}

function buildIssueEmbed(issue, prData, owner, repo) {
  const isPR = !!issue.pull_request;
  const visual = getIssueVisualState(issue, prData);

  const embed = new EmbedBuilder()
    .setColor(visual.color)
    .setTitle(`${visual.emoji} #${issue.number} — ${truncate(issue.title, 180)}`)
    .setURL(issue.html_url)
    .addFields(
      { name: 'Type', value: isPR ? 'Pull Request' : 'Issue', inline: true },
      { name: 'Status', value: visual.statusText, inline: true },
      { name: 'Repo', value: `\`${owner}/${repo}\``, inline: true }
    )
    .setFooter({
      text: `${owner}/${repo}`,
      iconURL: 'https://github.githubassets.com/favicons/favicon.png',
    })
    .setTimestamp(new Date(issue.updated_at));

  if (issue.user?.login) {
    embed.setAuthor({
      name: issue.user.login,
      iconURL: issue.user.avatar_url,
      url: issue.user.html_url,
    });
  }

  return embed;
}

function buildForumPostTitle(issue) {
  const suffix = ` (#${issue.number})`;
  const maxNameLength = 100;
  const maxTitleLength = Math.max(1, maxNameLength - suffix.length);
  return `${truncate(issue.title, maxTitleLength)}${suffix}`;
}

function buildCommitEmbed(commitData, owner, repo) {
  const sha = commitData.sha;
  const shortSha = sha.slice(0, 7);
  const commit = commitData.commit || {};
  const authorName =
    commitData.author?.login ||
    commit.author?.name ||
    commit.committer?.name ||
    'Unknown';

  const firstLine = (commit.message || 'No commit message').split('\n')[0];

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(`🟠 ${shortSha} — ${truncate(firstLine, 180)}`)
    .setURL(commitData.html_url)
    .addFields(
      { name: 'Type', value: 'Commit', inline: true },
      { name: 'Author', value: `\`${authorName}\``, inline: true },
      { name: 'Repo', value: `\`${owner}/${repo}\``, inline: true }
    )
    .setFooter({
      text: `${owner}/${repo}`,
      iconURL: 'https://github.githubassets.com/favicons/favicon.png',
    });

  const commitDate = commit.author?.date || commit.committer?.date;
  if (commitDate) {
    embed.setTimestamp(new Date(commitDate));
  }

  if (commitData.author?.login) {
    embed.setAuthor({
      name: commitData.author.login,
      iconURL: commitData.author.avatar_url,
      url: commitData.author.html_url,
    });
  }

  return embed;
}

async function buildIssueEmbedFromRef(issueRef) {
  const issue = await fetchGitHubIssue(issueRef.owner, issueRef.repo, issueRef.number);
  if (!issue) return null;

  let prData = null;
  if (issue.pull_request) {
    prData = await fetchGitHubPullRequest(issueRef.owner, issueRef.repo, issueRef.number);
  }

  return {
    issue,
    embed: buildIssueEmbed(issue, prData, issueRef.owner, issueRef.repo),
  };
}

async function buildIssueEmbedsFromRefs(issueRefs) {
  const embeds = [];

  for (const issueRef of issueRefs) {
    const built = await buildIssueEmbedFromRef(issueRef);
    if (built) embeds.push(built.embed);
  }

  return embeds;
}

async function buildEmbedsForMessageContent(content) {
  const cleanContent = stripCodeBlocks(content);
  const issueRefs = extractIssueRefs(cleanContent);
  const commitRef = extractCommitRef(cleanContent);
  const embeds = await buildIssueEmbedsFromRefs(issueRefs);

  if (commitRef) {
    const resolved = await resolveCommitRef(commitRef);
    if (resolved) {
      embeds.push(buildCommitEmbed(resolved.commit, resolved.owner, resolved.repo));
    }
  }

  return embeds;
}

async function findForumChannelByName(guild, forumName) {
  const channels = await guild.channels.fetch();
  return channels.find(
    (channel) =>
      channel &&
      channel.type === ChannelType.GuildForum &&
      channel.name === forumName
  );
}

function getThreadIssueNumber(threadName) {
  const match = String(threadName || '').match(/\(#(\d+)\)\s*$/);
  return match ? match[1] : null;
}

function getThreadUrl(thread) {
  return thread.url || `https://discord.com/channels/${thread.guildId}/${thread.id}`;
}

async function findExistingThreadByName(forumChannel, threadName) {
  const targetName = String(threadName || '').trim().toLowerCase();
  if (!targetName) return null;

  const active = await forumChannel.threads.fetchActive();
  for (const thread of active.threads.values()) {
    if (String(thread.name || '').trim().toLowerCase() === targetName) {
      return thread;
    }
  }

  try {
    const archived = await forumChannel.threads.fetchArchived();
    for (const thread of archived.threads.values()) {
      if (String(thread.name || '').trim().toLowerCase() === targetName) {
        return thread;
      }
    }
  } catch (error) {
    console.warn('Unable to fetch archived forum threads:', error.message);
  }

  return null;
}

async function findExistingIssueThread(forumChannel, issueNumber) {
  const target = String(issueNumber);

  const active = await forumChannel.threads.fetchActive();
  for (const thread of active.threads.values()) {
    if (getThreadIssueNumber(thread.name) === target) {
      return thread;
    }
  }

  try {
    const archived = await forumChannel.threads.fetchArchived();
    for (const thread of archived.threads.values()) {
      if (getThreadIssueNumber(thread.name) === target) {
        return thread;
      }
    }
  } catch (error) {
    console.warn('Unable to fetch archived forum threads:', error.message);
  }

  return null;
}

async function createPrDiscussionPost(interaction, projectKey, issueNumberRaw, messageText) {
  const project = PROJECTS[projectKey];
  if (!project) {
    throw new Error(`Unknown project: ${projectKey}`);
  }

  const issueNumber = normalizeIssueNumber(issueNumberRaw);
  if (!issueNumber) {
    throw new Error('Issue number must be in the form 123 or #123.');
  }

  const forumChannel = await findForumChannelByName(interaction.guild, project.forumName);
  if (!forumChannel) {
    throw new Error(`Could not find forum channel "${project.forumName}".`);
  }

  const memberPerms = forumChannel.permissionsFor(interaction.member);
  if (!memberPerms || !memberPerms.has(PermissionsBitField.Flags.ViewChannel)) {
    throw new Error(`You don't have permission to view #${forumChannel.name}.`);
  }

  const existingThread = await findExistingIssueThread(forumChannel, issueNumber);
  if (existingThread) {
    return {
      thread: existingThread,
      mainIssue: null,
      forumChannel,
      existed: true,
    };
  }

  const mainRef = {
    owner: project.owner,
    repo: project.repo,
    number: issueNumber,
  };

  const builtMain = await buildIssueEmbedFromRef(mainRef);
  if (!builtMain) {
    throw new Error(`Could not find issue/PR #${issueNumber} in ${project.owner}/${project.repo}.`);
  }

  const messageIssueRefs = messageText
    ? extractIssueRefs(stripCodeBlocks(messageText)).map((ref) => ({
        owner: project.owner,
        repo: project.repo,
        number: ref.number,
      }))
    : [];

  const allRefs = dedupeIssueRefs([mainRef, ...messageIssueRefs]);
  const embeds = await buildIssueEmbedsFromRefs(allRefs);

  const userMention = `<@${interaction.user.id}>`;
  const postContent = messageText ? `${userMention}\n${messageText}` : userMention;

  const threadName = buildForumPostTitle(builtMain.issue);

  const thread = await forumChannel.threads.create({
    name: threadName,
    message: {
      content: postContent,
      embeds,
      allowedMentions: { users: [interaction.user.id] },
    },
  });

  return {
    thread,
    mainIssue: builtMain.issue,
    forumChannel,
    existed: false,
  };
}

async function createReleaseDiscussionPosts(interaction, versionRaw) {
  const version = String(versionRaw || '').trim();
  if (!version) {
    throw new Error('Version is required.');
  }

  const forumChannel = await findForumChannelByName(interaction.guild, RAILYARD_RELEASE_FORUM);
  if (!forumChannel) {
    throw new Error(`Could not find forum channel "${RAILYARD_RELEASE_FORUM}".`);
  }

  const memberPerms = forumChannel.permissionsFor(interaction.member);
  if (!memberPerms || !memberPerms.has(PermissionsBitField.Flags.ViewChannel)) {
    throw new Error(`You don't have permission to view #${forumChannel.name}.`);
  }

  const userMention = `<@${interaction.user.id}>`;
  const postNames = [`${version} Changelog`, `${version} QE`];
  const posts = [];

  for (const name of postNames) {
    const existingThread = await findExistingThreadByName(forumChannel, name);
    if (existingThread) {
      posts.push({ thread: existingThread, existed: true });
      continue;
    }

    const thread = await forumChannel.threads.create({
      name,
      message: {
        content: userMention,
        allowedMentions: { users: [interaction.user.id] },
      },
    });

    posts.push({ thread, existed: false });
  }

  return {
    forumChannel,
    posts,
  };
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'pr' && interaction.commandName !== 'release') return;

    await interaction.deferReply({ ephemeral: true });

    if (interaction.commandName === 'pr') {
      const projectKey = interaction.options.getString('project', true);
      const issue = interaction.options.getInteger('issue', true);
      const message = interaction.options.getString('message', false) ?? '';

      const result = await createPrDiscussionPost(interaction, projectKey, issue, message);

      await interaction.editReply({
        content: result.existed
          ? `Forum post already exists: ${getThreadUrl(result.thread)}`
          : `Created forum post: ${getThreadUrl(result.thread)}`,
      });
      return;
    }

    const version = interaction.options.getString('version', true);
    const result = await createReleaseDiscussionPosts(interaction, version);
    const lines = result.posts.map((post, index) => {
      const label = index === 0 ? 'Changelog' : 'QE';
      return post.existed
        ? `${label} post already exists: ${getThreadUrl(post.thread)}`
        : `Created ${label} post: ${getThreadUrl(post.thread)}`;
    });

    await interaction.editReply({
      content: lines.join('\n'),
    });
  } catch (error) {
    console.error('Error handling slash command:', error);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: `Error: ${error.message}`,
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: `Error: ${error.message}`,
        ephemeral: true,
      }).catch(() => {});
    }
  }
});

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild) return;
    if (!message.author || message.author.bot) return;
    if (typeof message.content !== 'string') return;

    const exactTextReply = EXACT_TEXT_RESPONSES.get(message.content);
    if (exactTextReply) {
      await message.reply({
        content: exactTextReply,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const exactImageReply = EXACT_IMAGE_RESPONSES.get(message.content);
    if (exactImageReply) {
      await message.reply({
        files: [exactImageReply],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const cleanContent = stripCodeBlocks(message.content);
    const issueRefs = extractIssueRefs(cleanContent);
    const commitRef = extractCommitRef(cleanContent);

    if (issueRefs.length === 0 && !commitRef) return;

    const issueKey = issueRefs
      .map((ref) => `${ref.owner}/${ref.repo}#${ref.number}`)
      .join('|');

    const commitKey = commitRef
      ? `${commitRef.owner || 'search'}/${commitRef.repo || 'search'}@${commitRef.hash}`
      : '';

    const dedupeKey = `${message.channel.id}:${message.id}:${issueKey}:${commitKey}`;
    if (recentReplies.has(dedupeKey)) return;

    recentReplies.add(dedupeKey);
    setTimeout(() => recentReplies.delete(dedupeKey), 5 * 60 * 1000);

    const embeds = await buildIssueEmbedsFromRefs(issueRefs);

    if (commitRef) {
      const resolved = await resolveCommitRef(commitRef);
      if (resolved) {
        embeds.push(buildCommitEmbed(resolved.commit, resolved.owner, resolved.repo));
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

startHttpServer();
client.login(TOKEN);
