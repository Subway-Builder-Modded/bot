const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TICKET_SERVICE_CHOICES = [
  { name: 'Railyard', value: 'Railyard' },
  { name: 'Registry', value: 'Registry' },
  { name: 'Website', value: 'Website' },
  { name: 'Template Mod', value: 'Template Mod' },
];

async function registerSlashCommands(config) {
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

  const betatestCommand = new SlashCommandBuilder()
    .setName('betatest')
    .setDescription('Manage beta test project channels and roles')
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Create a beta test project')
        .addStringOption((option) =>
          option
            .setName('id')
            .setDescription('Project id in kebab-case (used as channel name)')
            .setRequired(true)
            .setMaxLength(90)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Add a user to a beta test project by id')
        .addStringOption((option) =>
          option
            .setName('project-id')
            .setDescription('Project id (channel name)')
            .setRequired(true)
            .setMaxLength(90)
        )
        .addStringOption((option) =>
          option
            .setName('user-id')
            .setDescription('Discord user id to add to the project')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a user from a beta test project by id')
        .addStringOption((option) =>
          option
            .setName('project-id')
            .setDescription('Project id (channel name)')
            .setRequired(true)
            .setMaxLength(90)
        )
        .addStringOption((option) =>
          option
            .setName('user-id')
            .setDescription('Discord user id to remove from the project')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete a beta test project channel and roles')
        .addStringOption((option) =>
          option
            .setName('id')
            .setDescription('Project id to delete')
            .setRequired(true)
            .setMaxLength(90)
        )
    );

  const rest = new REST({ version: '10' }).setToken(config.token);

  await rest.put(
    Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
    {
      body: [
        supportCommand.toJSON(),
        featureCommand.toJSON(),
        setSupportTicketCommand.toJSON(),
        resetSupportTicketCommand.toJSON(),
        setFeatureTicketCommand.toJSON(),
        resetFeatureTicketCommand.toJSON(),
        setupCommand.toJSON(),
        betatestCommand.toJSON(),
      ],
    }
  );
}

module.exports = {
  registerSlashCommands,
};
