const { EmbedBuilder } = require('discord.js');
const { truncate, truncateWebhookText } = require('../utils/text');

function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return '';
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397))
    .join('');
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

function buildForumPostTitle(issue) {
  const suffix = ` (#${issue.number})`;
  const maxNameLength = 100;
  const maxTitleLength = Math.max(1, maxNameLength - suffix.length);
  return `${truncate(issue.title, maxTitleLength)}${suffix}`;
}

function buildNewProjectEmbed(manifest, type, projectName) {
  const name = manifest.name || projectName;
  const author = Array.isArray(manifest.author)
    ? manifest.author.join(', ')
    : manifest.author || 'Unknown';
  const description = manifest.description || '';
  const isMap = type === 'map';

  const embed = new EmbedBuilder()
    .setColor(isMap ? 0x3b82f6 : 0x10b981)
    .setTitle(`${isMap ? '🗺️ New Map' : '🔧 New Mod'}: ${name}`)
    .setFooter({ text: 'The Railyard' })
    .setTimestamp();

  const fields = [{ name: 'Author', value: author, inline: true }];

  if (isMap && manifest.country) {
    const flag = countryCodeToFlag(manifest.country);
    const flagText = flag ? `${flag} ${manifest.country.toUpperCase()}` : manifest.country;
    fields.push({ name: 'Country', value: flagText, inline: true });
  }

  if (description) {
    fields.push({ name: 'Description', value: truncate(description, 1024), inline: false });
  }

  embed.addFields(fields);
  return embed;
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

function buildGitHubWebhookPayload(config, event, payload) {
  return {
    username: config.discordUsername || 'GitHub Org Bot',
    avatar_url: config.discordAvatarUrl || undefined,
    embeds: [buildGitHubWebhookEmbed(event, payload)],
  };
}

function normalizeRepositoryDisplayName(repo) {
  return String(repo || 'Unknown Repo')
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function pickFirst(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[0];
}

function formatRef(item, fallback) {
  if (!item) return fallback;

  const issueNumber = Number(item?.number);
  const linkText = Number.isFinite(issueNumber) ? `#${issueNumber}` : '#?';
  const linked = item?.htmlUrl ? `[${linkText}](${item.htmlUrl})` : linkText;
  return linked;
}

function buildRepositoryReportFieldValue(owner, repo, report) {
  const issuesUrl = `https://github.com/${owner}/${repo}/issues`;
  const stalePr = formatRef(pickFirst(report.stalePullRequests), 'none');
  const staleIssue = formatRef(pickFirst(report.staleIssues), 'none');
  const latestPr = formatRef(pickFirst(report.latestPullRequests), 'none');
  const latestIssue = formatRef(pickFirst(report.latestIssues), 'none');

  const lines = [
    `[Open Issues](${issuesUrl})`,
    `Issues: ${report.openIssues}`,
    `PRs: ${report.openPullRequests} (${report.readyForReviewPullRequests} ready / ${report.draftPullRequests} draft)`,
    `Stale: PR ${stalePr} | Issue ${staleIssue}`,
    `Latest: PR ${latestPr} | Issue ${latestIssue}`,
  ];

  return truncateWebhookText(lines.join('\n'), 1024);
}

function buildGitHubOrganizationReportEmbed(owner, repoReports, options = {}) {
  const generatedAt = options.generatedAt instanceof Date ? options.generatedAt : new Date();
  const safeRepoReports = Array.isArray(repoReports) ? repoReports : [];
  const maxRepoFields = 24;
  const visibleRepoReports = safeRepoReports.slice(0, maxRepoFields);
  const hiddenCount = safeRepoReports.length - visibleRepoReports.length;

  const fields = visibleRepoReports.map(({ repo, report }) => ({
    name: `${normalizeRepositoryDisplayName(repo)} Issue Report`,
    value: buildRepositoryReportFieldValue(owner, repo, report),
    inline: false,
  }));

  if (hiddenCount > 0) {
    fields.push({
      name: 'More Repositories',
      value: `+${hiddenCount} more repositories were omitted due to Discord embed field limits.`,
      inline: false,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x60a5fa)
    .setTitle('Subway Builder Modded Issue Report')
    .setURL(`https://github.com/${owner}`)
    .setThumbnail(`https://github.com/${owner}.png`)
    .setDescription(`Daily issue report across ${safeRepoReports.length} repositories.`)
    .setFooter({ text: `Generated ${generatedAt.toLocaleString('en-US')}` })
    .setTimestamp(generatedAt);

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  return embed;
}

function buildSetupRulesEmbed() {
  return new EmbedBuilder()
    .setColor(0x2563eb)
    .setTitle('Subway Builder Modded Rules')
    .setDescription(
      [
        'Welcome to Subway Builder Modded. Keep this space friendly, helpful, and fun for everyone.',
        '',
        '**Note: Not afilliated with Subway Builder or Redistricter, LLC.**',
      ].join('\n')
    )
    .addFields(
      {
        name: '1) Be Respectful',
        value:
          'Be nice to everyone. Treat people with patience and good intent, even when you disagree.',
      },
      {
        name: '2) Use The Right Channel',
        value:
          "Keep discussions relevant to the channel you're in so members can find info easily.",
      },
      {
        name: '3) No Spam',
        value:
          'Avoid spam, repeated messages, excessive pinging, or self-promotion.',
      },
      {
        name: '4) Protect Privacy',
        value:
          "Don't share personal info (yours or anyone else's), including DMs, emails, phone numbers, or locations.",
      },
      {
        name: '5) Follow Discord ToS',
        value: "You must follow Discord's Terms of Service and Community Guidelines at all times.",
      },
      {
        name: '6) Respect DMs And Mentions',
        value:
          "Do not DM or @mention people you don't know without permission, including mods/devs unless urgent.",
      },
      {
        name: '7) Keep It Safe',
        value:
          'No harassment, hate speech, threats, NSFW content, scams, malware, or instructions meant to harm others.',
      },
      {
        name: '8) No Impersonation',
        value:
          'Do not impersonate staff, developers, or other community members. Keep usernames and profiles honest.',
      }
    )
    .setFooter({ text: 'Thanks for helping keep the community welcoming and constructive.' })
    .setTimestamp();
}

function buildSetupImportantLinksEmbed() {
  return new EmbedBuilder()
    .setColor(0x0f766e)
    .setTitle('Important Links')
    .setDescription('Quick links for community resources, downloads, docs, and submissions.')
    .addFields(
      {
        name: 'General',
        value: [
          '[Website](https://subwaybuildermodded.com)',
          '[Discord Server (Subway Builder Modded)](https://discord.gg/syG9YHMyeG)',
          '[Discord Server (Subway Builder)](https://discord.gg/jrNQpbytUQ)',
          '[Credits](https://subwaybuildermodded.com/credits/)',
          '[License](https://subwaybuildermodded.com/license/)',
          '[GitHub](https://github.com/Subway-Builder-Modded/)',
        ].join('\n'),
      },
      {
        name: 'Railyard Users',
        value: [
          '[Download Railyard](https://subwaybuildermodded.com/railyard/)',
          '[Installation Guides](https://subwaybuildermodded.com/docs/railyard/latest/players)',
          "[Setting Up Railyard's GitHub Token](https://subwaybuildermodded.com/docs/railyard/latest/github-token)",
        ].join('\n'),
      },
      {
        name: 'Railyard Creators',
        value: [
          '[Registry Submission Page](https://github.com/Subway-Builder-Modded/The-Railyard/issues/new/choose)',
          '[Submitting Content Guide](https://subwaybuildermodded.com/docs/railyard/latest/developers/publishing-projects/)',
          '[Map Data Quality Guidelines](https://subwaybuildermodded.com/docs/railyard/latest/developers/data-quality/)',
        ].join('\n'),
      },
      {
        name: 'Contact',
        value: 'Email: admin@subwaybuildermodded.com',
      }
    )
    .setTimestamp();
}

function buildSetupSupportEmbed() {
  return new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('Support')
    .setDescription(
      [
        'Welcome to the official Subway Builder Modded support channel.',
        'To create a support ticket, use `/support <service> <title>` to open one automatically.',
      ].join('\n')
    )
    .addFields(
      {
        name: 'What to Include',
        value:
          'After creating a support ticket, describe the issue clearly and include steps to reproduce it. Share screenshots, logs, error messages, and game version if/when relevant.',
      },
      {
        name: 'Response Expectations',
        value:
          'Please be patient and avoid duplicate pings. The support team will respond as soon as possible.',
      }
    )
    .setTimestamp();
}

function buildSetupFeatureRequestsEmbed() {
  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle('Feature Requests')
    .setDescription(
      [
        'Welcome to the official Subway Builder Modded feature requests channel.',
        'To create a feature request ticket, use `/feature <service> <title>` to open one automatically.',
      ].join('\n')
    )
    .addFields(
      {
        name: 'What to Include',
        value:
          'Explain the current problem, what you want improved, and why it helps players or creators. Include screenshots, examples, and sources. If possible, suggest expected behavior and edge cases.',
      },
      {
        name: 'Response Expectations',
        value:
          'Not every request can be built right away. Clear, practical requests are easier to review and schedule.',
      }
    )
    .setTimestamp();
}

module.exports = {
  buildCommitEmbed,
  buildForumPostTitle,
  buildGitHubWebhookEmbed,
  buildGitHubWebhookPayload,
  buildGitHubOrganizationReportEmbed,
  buildIssueEmbed,
  buildNewProjectEmbed,
  buildSetupFeatureRequestsEmbed,
  buildSetupImportantLinksEmbed,
  buildSetupRulesEmbed,
  buildSetupSupportEmbed,
};
