const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { PROJECTS } = require('../constants');

const TICKET_SERVICE_CHOICES = [
  { name: 'Railyard', value: 'Railyard' },
  { name: 'Registry', value: 'Registry' },
  { name: 'Website', value: 'Website' },
  { name: 'Template Mod', value: 'Template Mod' },
];

async function registerSlashCommands(config) {
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

  const supportCommand = new SlashCommandBuilder()
    .setName('support')
    .setDescription('Create a support ticket thread in #support')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('service')
        .setDescription('Service to create a support ticket for')
        .setRequired(true)
        .addChoices(...TICKET_SERVICE_CHOICES)
    )
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Ticket title')
        .setMaxLength(90)
        .setRequired(true)
    );

  const featureCommand = new SlashCommandBuilder()
    .setName('feature')
    .setDescription('Create a feature request thread in #feature-requests')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('service')
        .setDescription('Service to create a feature request for')
        .setRequired(true)
        .addChoices(...TICKET_SERVICE_CHOICES)
    )
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Ticket title')
        .setMaxLength(90)
        .setRequired(true)
    );

  const setSupportTicketCommand = new SlashCommandBuilder()
    .setName('setsupportticket')
    .setDescription('Set the next support ticket number (mod only)')
    .setDMPermission(false)
    .addIntegerOption((option) =>
      option
        .setName('number')
        .setDescription('Next ticket number to use')
        .setRequired(true)
        .setMinValue(1)
    );

  const resetSupportTicketCommand = new SlashCommandBuilder()
    .setName('resetsupportticket')
    .setDescription('Reset the next support ticket number to 1 (mod only)')
    .setDMPermission(false);

  const setFeatureTicketCommand = new SlashCommandBuilder()
    .setName('setfeatureticket')
    .setDescription('Set the next feature ticket number (mod only)')
    .setDMPermission(false)
    .addIntegerOption((option) =>
      option
        .setName('number')
        .setDescription('Next ticket number to use')
        .setRequired(true)
        .setMinValue(1)
    );

  const resetFeatureTicketCommand = new SlashCommandBuilder()
    .setName('resetfeatureticket')
    .setDescription('Reset the next feature ticket number to 1 (mod only)')
    .setDMPermission(false);

  const setupCommand = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Post server setup embeds to rules, links, support, and feature channels')
    .setDMPermission(false);

  const generateReportsCommand = new SlashCommandBuilder()
    .setName('generatereports')
    .setDescription('Generate GitHub issue report embeds in #github-reports and reset the 24h timer (mod only)')
    .setDMPermission(false);

  const rest = new REST({ version: '10' }).setToken(config.token);

  await rest.put(
    Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
    {
      body: [
        prCommand.toJSON(),
        supportCommand.toJSON(),
        featureCommand.toJSON(),
        setSupportTicketCommand.toJSON(),
        resetSupportTicketCommand.toJSON(),
        setFeatureTicketCommand.toJSON(),
        resetFeatureTicketCommand.toJSON(),
        setupCommand.toJSON(),
        generateReportsCommand.toJSON(),
      ],
    }
  );
}

module.exports = {
  registerSlashCommands,
};
