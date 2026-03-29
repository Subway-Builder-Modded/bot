const fs = require('node:fs/promises');
const path = require('node:path');
const { ChannelType, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { truncate } = require('../utils/text');
const { memberHasAdminRole } = require('./permissions');

const THREAD_NAME_MAX_LENGTH = 100;

function createTicketService(options) {
  const {
    channelId,
    roleId,
    ticketTypeLabel,
    counterFileName,
    createCommandName,
    setCommandName,
    resetCommandName,
    embedDescriptionParagraphs,
    embedColor,
    teamLabel,
  } = options;
  const counterFilePath = path.join(__dirname, '..', 'data', counterFileName);
  let stateLoaded = false;
  let nextTicketNumber = 1;
  let opQueue = Promise.resolve();

  async function queueExclusive(action) {
    const run = opQueue.then(action, action);
    opQueue = run.catch(() => {});
    return run;
  }

  async function persistState() {
    const payload = JSON.stringify({ nextTicketNumber }, null, 2);
    await fs.mkdir(path.dirname(counterFilePath), { recursive: true });
    await fs.writeFile(counterFilePath, payload, 'utf8');
  }

  async function loadState() {
    if (stateLoaded) return;

    try {
      const raw = await fs.readFile(counterFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      const parsedNumber = Number(parsed?.nextTicketNumber);
      if (Number.isInteger(parsedNumber) && parsedNumber >= 1) {
        nextTicketNumber = parsedNumber;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`Unable to read ${ticketTypeLabel} ticket counter, defaulting to 1:`, error.message);
      }
    }

    stateLoaded = true;
  }

  async function requireTicketTextChannel(guild) {
    const channel = await guild.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error(`${ticketTypeLabel} channel (${channelId}) is missing or not a text channel.`);
    }

    const channelPerms = channel.permissionsFor(guild.members.me);
    if (!channelPerms?.has(PermissionsBitField.Flags.ViewChannel)) {
      throw new Error(`I need permission to view <#${channelId}>.`);
    }

    if (!channelPerms?.has(PermissionsBitField.Flags.CreatePublicThreads)) {
      throw new Error(`I need permission to create public threads in <#${channelId}>.`);
    }

    if (!channelPerms?.has(PermissionsBitField.Flags.SendMessagesInThreads)) {
      throw new Error(`I need permission to send messages in threads in <#${channelId}>.`);
    }

    return channel;
  }

  function assertChannelInvocation(interaction) {
    if (interaction.channelId !== channelId) {
      throw new Error(`Use /${createCommandName} only in <#${channelId}>.`);
    }
  }

  function buildThreadName(service, title, ticketNumber) {
    const normalizedTitle = String(title || '').trim().replace(/\s+/g, ' ');
    const prefix = `[${service}] `;
    const suffix = ` (#${ticketNumber})`;
    const maxTitleLength = Math.max(1, THREAD_NAME_MAX_LENGTH - prefix.length - suffix.length);
    const safeTitle = truncate(normalizedTitle, maxTitleLength);
    return `${prefix}${safeTitle}${suffix}`;
  }

  function buildTicketEmbed(interaction, service, title, ticketNumber) {
    return new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(title)
      .setDescription(embedDescriptionParagraphs.join('\n\n'))
      .addFields(
        { name: 'Ticket', value: `#${ticketNumber}`, inline: true },
        { name: 'Service', value: service, inline: true },
        { name: 'Submitted By', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'User ID', value: `\`${interaction.user.id}\``, inline: true },
        { name: 'Team', value: teamLabel, inline: true },
        { name: 'Created', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setFooter({ text: `Subway Builder Modded ${ticketTypeLabel}` })
      .setTimestamp();
  }

  async function createTicket(interaction, service, title) {
    assertChannelInvocation(interaction);
    const ticketChannel = await requireTicketTextChannel(interaction.guild);

    return queueExclusive(async () => {
      await loadState();

      const ticketNumber = nextTicketNumber;
      const threadName = buildThreadName(service, title, ticketNumber);
      const embed = buildTicketEmbed(interaction, service, title, ticketNumber);

      const thread = await ticketChannel.threads.create({
        name: threadName,
        autoArchiveDuration: 10080,
      });

      await thread.send({
        content: `<@${interaction.user.id}> <@&${roleId}>`,
        embeds: [embed],
        allowedMentions: {
          users: [interaction.user.id],
          roles: [roleId],
        },
      });

      nextTicketNumber += 1;
      await persistState();

      return {
        ticketNumber,
        thread,
      };
    });
  }

  async function setNextTicketNumber(interaction, ticketNumberRaw) {
    const isAdmin = await memberHasAdminRole(interaction);
    if (!isAdmin) {
      throw new Error(`Only members with the admin role can use /${setCommandName}.`);
    }

    const ticketNumber = Number(ticketNumberRaw);
    if (!Number.isInteger(ticketNumber) || ticketNumber < 1) {
      throw new Error('Ticket number must be an integer greater than or equal to 1.');
    }

    return queueExclusive(async () => {
      await loadState();
      nextTicketNumber = ticketNumber;
      await persistState();
      return nextTicketNumber;
    });
  }

  async function resetTicketNumber(interaction) {
    const isAdmin = await memberHasAdminRole(interaction);
    if (!isAdmin) {
      throw new Error(`Only members with the admin role can use /${resetCommandName}.`);
    }

    return queueExclusive(async () => {
      await loadState();
      nextTicketNumber = 1;
      await persistState();
      return nextTicketNumber;
    });
  }

  return {
    createTicket,
    resetTicketNumber,
    setNextTicketNumber,
  };
}

module.exports = {
  createTicketService,
};
