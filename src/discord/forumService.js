const { ChannelType, PermissionsBitField } = require('discord.js');
const { PROJECTS } = require('../constants');
const { stripCodeBlocks } = require('../utils/text');

function createForumService(githubService, embedService) {
  async function buildIssueEmbedFromRef(issueRef) {
    const issue = await githubService.fetchGitHubIssue(issueRef.owner, issueRef.repo, issueRef.number);
    if (!issue) return null;

    let prData = null;
    if (issue.pull_request) {
      prData = await githubService.fetchGitHubPullRequest(issueRef.owner, issueRef.repo, issueRef.number);
    }

    return {
      issue,
      embed: embedService.buildIssueEmbed(issue, prData, issueRef.owner, issueRef.repo),
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

  async function findThreadByPredicate(forumChannel, predicate) {
    const active = await forumChannel.threads.fetchActive();
    for (const thread of active.threads.values()) {
      if (predicate(thread)) return thread;
    }

    try {
      const archived = await forumChannel.threads.fetchArchived();
      for (const thread of archived.threads.values()) {
        if (predicate(thread)) return thread;
      }
    } catch (error) {
      console.warn('Unable to fetch archived forum threads:', error.message);
    }

    return null;
  }

  async function findExistingIssueThread(forumChannel, issueNumber) {
    const target = String(issueNumber);
    return findThreadByPredicate(
      forumChannel,
      (thread) => getThreadIssueNumber(thread.name) === target
    );
  }

  function assertViewPermission(forumChannel, member) {
    const memberPerms = forumChannel.permissionsFor(member);
    if (!memberPerms || !memberPerms.has(PermissionsBitField.Flags.ViewChannel)) {
      throw new Error(`You don't have permission to view #${forumChannel.name}.`);
    }
  }

  async function createPrDiscussionPost(interaction, projectKey, issueNumberRaw, messageText) {
    const project = PROJECTS[projectKey];
    if (!project) {
      throw new Error(`Unknown project: ${projectKey}`);
    }

    const issueNumber = githubService.normalizeIssueNumber(issueNumberRaw);
    if (!issueNumber) {
      throw new Error('Issue number must be in the form 123 or #123.');
    }

    const forumChannel = await findForumChannelByName(interaction.guild, project.forumName);
    if (!forumChannel) {
      throw new Error(`Could not find forum channel "${project.forumName}".`);
    }

    assertViewPermission(forumChannel, interaction.member);

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
      ? githubService.extractIssueRefs(stripCodeBlocks(messageText)).map((ref) => ({
          owner: project.owner,
          repo: project.repo,
          number: ref.number,
        }))
      : [];

    const allRefs = githubService.dedupeIssueRefs([mainRef, ...messageIssueRefs]);
    const embeds = await buildIssueEmbedsFromRefs(allRefs);

    const userMention = `<@${interaction.user.id}>`;
    const postContent = messageText ? `${userMention}\n${messageText}` : userMention;

    const threadName = embedService.buildForumPostTitle(builtMain.issue);

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

  return {
    buildIssueEmbedFromRef,
    buildIssueEmbedsFromRefs,
    createPrDiscussionPost,
    getThreadUrl,
  };
}

module.exports = {
  createForumService,
};
