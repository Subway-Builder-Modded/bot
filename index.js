const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { config, validateRequiredConfig } = require('./src/config');
const { createGitHubService } = require('./src/github/service');
const embedService = require('./src/discord/embeds');
const { createForumService } = require('./src/discord/forumService');
const { registerSlashCommands } = require('./src/discord/commands');
const {
  createInteractionHandler,
  createMessageHandler,
  createReadyHandler,
} = require('./src/discord/handlers');
const { createFeatureService } = require('./src/discord/featureService');
const { createSetupService } = require('./src/discord/setupService');
const { createSupportService } = require('./src/discord/supportService');
const { createRailyardService } = require('./src/railyard/service');
const { createWebhookServer } = require('./src/http/webhookServer');

try {
  validateRequiredConfig();
} catch (error) {
  console.error(error.message);
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

const githubService = createGitHubService(config);
const forumService = createForumService(githubService, embedService);
const setupService = createSetupService(embedService);
const supportService = createSupportService();
const featureService = createFeatureService();
const railyardService = createRailyardService(client, githubService, embedService);
const webhookServer = createWebhookServer(client, config, railyardService);
const readyHandler = createReadyHandler(config, registerSlashCommands);

client.once('ready', () => readyHandler(client));
client.on('interactionCreate', createInteractionHandler(forumService, setupService, supportService, featureService));
client.on('messageCreate', createMessageHandler(githubService, forumService, embedService));

webhookServer.startHttpServer();
client.login(config.token);
