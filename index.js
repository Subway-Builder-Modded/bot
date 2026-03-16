require('dotenv').config();
const http = require('http');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ChannelType,
  SlashCommandBuilder,
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

http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  })
  .listen(PORT, () => {
    console.log(`Health server listening on ${PORT}`);
  })
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Health server port ${PORT} already in use — skipping.`);
    } else {
      console.error('Health server error:', err);
    }
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

const EXACT_MESSAGE_RESPONSES = new Map([
  ['update?', 'update.'],
  ['update.', 'update?'],
  ['update', 'update!'],
  ['undapte?', 'undapte.'],
  ['undapte.', 'undapte?'],
  ['undapte', 'undapte!'],
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
  const command = new SlashCommandBuilder()
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

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
    { body: [command.toJSON()] }
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
    if (!isValidRepoName(repo)) return;
    refs.push({
      owner: DEFAULT_GITHUB_OWNER,
      repo,
      number,
    });
    return;
  }

  if (owner && repo) {
    const normalized = normalizeOwnerRepo(owner, repo);
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
        for (const chainedNumber of expandIssueNumberChain(chain)) {
          pushIssueRef(refs, owner, repo, chainedNumber);
        }
        continue;
      }

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

async function buildEmbedsForMessageContent(content) {
  const cleanContent = stripCodeBlocks(content);
  const issueRefs = extractIssueRefs(cleanContent);
  const commitRef = extractCommitRef(cleanContent);
  const embeds = [];

  for (const issueRef of issueRefs) {
    const built = await buildIssueEmbedFromRef(issueRef);
    if (built) embeds.push(built.embed);
  }

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

async function createPrDiscussionPost(interaction, projectKey, issueNumberRaw, messageText) {
  const project = PROJECTS[projectKey];
  if (!project) {
    throw new Error(`Unknown project: ${projectKey}`);
  }

  const issueNumber = normalizeIssueNumber(issueNumberRaw);
  if (!issueNumber) {
    throw new Error('Issue number must be in the form 123 or #123.');
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
  const embeds = [];

  for (const ref of allRefs) {
    const built = await buildIssueEmbedFromRef(ref);
    if (built) embeds.push(built.embed);
  }

  const forumChannel = await findForumChannelByName(interaction.guild, project.forumName);
  if (!forumChannel) {
    throw new Error(`Could not find forum channel "${project.forumName}".`);
  }

  const threadName = buildForumPostTitle(builtMain.issue);

  const thread = await forumChannel.threads.create({
    name: threadName,
    message: {
      ...(messageText ? { content: messageText } : {}),
      embeds,
      allowedMentions: { parse: [] },
    },
  });

  return {
    thread,
    mainIssue: builtMain.issue,
    forumChannel,
  };
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'pr') return;

    const projectKey = interaction.options.getString('project', true);
    const issue = interaction.options.getInteger('issue', true);
    const message = interaction.options.getString('message', false) ?? '';

    await interaction.deferReply({ ephemeral: true });

    const result = await createPrDiscussionPost(interaction, projectKey, issue, message);

    await interaction.editReply({
      content: `Created forum post: ${result.thread.url}`,
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

    const exactReply = EXACT_MESSAGE_RESPONSES.get(message.content);
    if (exactReply) {
      await message.reply({
        content: exactReply,
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

    const embeds = [];

    for (const issueRef of issueRefs) {
      const built = await buildIssueEmbedFromRef(issueRef);
      if (built) embeds.push(built.embed);
    }

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

client.login(TOKEN);
