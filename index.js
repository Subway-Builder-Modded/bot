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
const { createBetatestService } = require('./src/discord/betatestService');
const { createRailyardService } = require('./src/railyard/service');
const { createWebhookServer } = require('./src/http/webhookServer');

function bootLog(message, extra) {
  if (extra) {
    console.log(`[boot] ${message}`, extra);
    return;
  }
  console.log(`[boot] ${message}`);
}

process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[process] uncaughtException', error);
});

try {
  bootLog('Validating required config...');
  validateRequiredConfig();
  bootLog('Required config validated.');
} catch (error) {
  console.error('[boot] Config validation failed:', error.message);
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
const betatestService = createBetatestService();
const railyardService = createRailyardService(client, githubService, embedService);
const webhookServer = createWebhookServer(client, config, railyardService);
const readyHandler = createReadyHandler(config, registerSlashCommands);

client.on('error', (error) => {
  console.error('[discord] client error', error);
});

client.on('shardError', (error) => {
  console.error('[discord] shard error', error);
});

client.once('ready', () => readyHandler(client));
client.on(
  'interactionCreate',
  createInteractionHandler(forumService, setupService, supportService, featureService, betatestService)
);
client.on('messageCreate', createMessageHandler(githubService, forumService, embedService));

bootLog('Starting HTTP webhook server...', { port: config.port, webhookPath: config.githubWebhookPath });
webhookServer.startHttpServer();
bootLog('Logging in to Discord...');
client.login(config.token).catch((error) => {
  console.error('[discord] login failed', error);
  process.exit(1);
});
