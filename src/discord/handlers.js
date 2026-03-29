const {
  EXACT_IMAGE_RESPONSES,
  EXACT_TEXT_RESPONSES,
  FEATURE_REQUESTS_CHANNEL_ID,
  SUPPORT_CHANNEL_ID,
} = require('../constants');
const { stripCodeBlocks } = require('../utils/text');

function createInteractionHandler(forumService, setupService, supportService, featureService) {
  const commandNames = new Set([
    'pr',
    'support',
    'feature',
    'setsupportticket',
    'resetsupportticket',
    'setfeatureticket',
    'resetfeatureticket',
    'setup',
  ]);

  return async function onInteractionCreate(interaction) {
    try {
      if (!interaction.isChatInputCommand()) return;
      if (!commandNames.has(interaction.commandName)) return;

      await interaction.deferReply({ ephemeral: true });

      if (interaction.commandName === 'setup') {
        const lines = await setupService.runSetup(interaction);
        await interaction.editReply({
          content: lines.join('\n'),
        });
        return;
      }

      if (interaction.commandName === 'pr') {
        const projectKey = interaction.options.getString('project', true);
        const issue = interaction.options.getInteger('issue', true);
        const message = interaction.options.getString('message', false) ?? '';

        const result = await forumService.createPrDiscussionPost(interaction, projectKey, issue, message);

        await interaction.editReply({
          content: result.existed
            ? `Forum post already exists: ${forumService.getThreadUrl(result.thread)}`
            : `Created forum post: ${forumService.getThreadUrl(result.thread)}`,
        });
        return;
      }

      if (interaction.commandName === 'support') {
        const service = interaction.options.getString('service', true);
        const title = interaction.options.getString('title', true);
        const result = await supportService.createTicket(interaction, service, title);

        await interaction.editReply({
          content: `Created support ticket #${result.ticketNumber}: ${forumService.getThreadUrl(result.thread)}`,
        });
        return;
      }

      if (interaction.commandName === 'feature') {
        const service = interaction.options.getString('service', true);
        const title = interaction.options.getString('title', true);
        const result = await featureService.createTicket(interaction, service, title);

        await interaction.editReply({
          content: `Created feature ticket #${result.ticketNumber}: ${forumService.getThreadUrl(result.thread)}`,
        });
        return;
      }

      if (interaction.commandName === 'setsupportticket') {
        const number = interaction.options.getInteger('number', true);
        const next = await supportService.setNextTicketNumber(interaction, number);
        await interaction.editReply({
          content: `Next support ticket number is now #${next}.`,
        });
        return;
      }

      if (interaction.commandName === 'setfeatureticket') {
        const number = interaction.options.getInteger('number', true);
        const next = await featureService.setNextTicketNumber(interaction, number);
        await interaction.editReply({
          content: `Next feature ticket number is now #${next}.`,
        });
        return;
      }

      if (interaction.commandName === 'resetsupportticket') {
        const next = await supportService.resetTicketNumber(interaction);
        await interaction.editReply({
          content: `Support ticket counter reset. Next ticket will be #${next}.`,
        });
        return;
      }

      const next = await featureService.resetTicketNumber(interaction);
      await interaction.editReply({
        content: `Feature ticket counter reset. Next ticket will be #${next}.`,
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
  };
}

function createMessageHandler(githubService, forumService, embedService) {
  const recentReplies = new Set();
  const autoDeleteChannelIds = new Set([SUPPORT_CHANNEL_ID, FEATURE_REQUESTS_CHANNEL_ID]);

  return async function onMessageCreate(message) {
    try {
      if (!message.guild) return;

      if (autoDeleteChannelIds.has(message.channelId) && !message.channel?.isThread?.()) {
        setTimeout(() => {
          message.delete().catch(() => {});
        }, 5000);
        return;
      }

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
      const issueRefs = githubService.extractIssueRefs(cleanContent);
      const commitRef = githubService.extractCommitRef(cleanContent);

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

      const embeds = await forumService.buildIssueEmbedsFromRefs(issueRefs);

      if (commitRef) {
        const resolved = await githubService.resolveCommitRef(commitRef);
        if (resolved) {
          embeds.push(embedService.buildCommitEmbed(resolved.commit, resolved.owner, resolved.repo));
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
  };
}

function createReadyHandler(config, registerSlashCommands) {
  return async function onReady(client) {
    console.log(`Logged in as ${client.user.tag}`);
    console.log('GitHub config:', {
      owner: config.defaultGitHubOwner,
      repo: config.defaultGitHubRepo,
      hasGitHubToken: !!config.githubToken,
      githubTokenLength: config.githubToken.length,
    });

    try {
      await registerSlashCommands(config);
      console.log('Slash commands registered.');
    } catch (error) {
      console.error('Failed to register slash commands:', error);
    }
  };
}

module.exports = {
  createInteractionHandler,
  createMessageHandler,
  createReadyHandler,
};
