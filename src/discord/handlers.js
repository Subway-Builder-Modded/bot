const {
  EXACT_IMAGE_RESPONSES,
  EXACT_TEXT_RESPONSES,
  BETATEST_CREATE_CHANNEL_ID,
  FEATURE_REQUESTS_CHANNEL_ID,
  MOD_ROLE_ID,
  SUPPORT_CHANNEL_ID,
} = require('../constants');
const { stripCodeBlocks } = require('../utils/text');

function createInteractionHandler(
  forumService,
  setupService,
  supportService,
  featureService,
  betatestService
) {
  const commandNames = new Set([
    'support',
    'feature',
    'setsupportticket',
    'resetsupportticket',
    'setfeatureticket',
    'resetfeatureticket',
    'setup',
    'betatest',
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

      if (interaction.commandName === 'betatest') {
        const subcommand = interaction.options.getSubcommand(true);

        if (subcommand === 'create') {
          const id = interaction.options.getString('id', true);
          const result = await betatestService.createProject(interaction, id);

          await interaction.editReply({
            content: [
              `Created beta test project in <#${result.channel.id}>`,
              `Admin role: <@&${result.adminRole.id}>`,
              `Member role: <@&${result.memberRole.id}>`,
              `You were granted both project roles.`,
            ].join('\n'),
          });
          return;
        }

        if (subcommand === 'delete') {
          const id = interaction.options.getString('id', true);
          await betatestService.deleteProject(interaction, id);

          await interaction.editReply({
            content: `Deleted beta test project "${id}" and its associated roles.`,
          });
          return;
        }

        if (subcommand === 'add') {
          const projectId = interaction.options.getString('project-id', true);
          const userId = interaction.options.getString('user-id', true);
          const result = await betatestService.addUserToProject(interaction, projectId, userId);

          await interaction.editReply({
            content: `Added <@${result.targetMember.id}> to <#${result.projectChannel.id}> with role <@&${result.memberRole.id}>.`,
          });
          return;
        }

        if (subcommand === 'remove') {
          const projectId = interaction.options.getString('project-id', true);
          const userId = interaction.options.getString('user-id', true);
          const result = await betatestService.removeUserFromProject(interaction, projectId, userId);

          await interaction.editReply({
            content: `Removed <@${result.targetMember.id}> from <#${result.projectChannel.id}> by removing role <@&${result.memberRole.id}>.`,
          });
          return;
        }
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
  const autoDeleteChannelIds = new Set([SUPPORT_CHANNEL_ID, FEATURE_REQUESTS_CHANNEL_ID, BETATEST_CREATE_CHANNEL_ID]);

  async function memberHasModRole(message) {
    const cachedMember = message.member;
    if (cachedMember?.roles?.cache?.has?.(MOD_ROLE_ID)) {
      return true;
    }

    if (!message.guild || !message.author?.id) {
      return false;
    }

    try {
      const freshMember = await message.guild.members.fetch(message.author.id);
      return freshMember.roles.cache.has(MOD_ROLE_ID);
    } catch {
      return false;
    }
  }

  return async function onMessageCreate(message) {
    try {
      if (!message.guild) return;

      if (autoDeleteChannelIds.has(message.channelId) && !message.channel?.isThread?.()) {
        const isMod = await memberHasModRole(message);
        if (isMod) return;

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
