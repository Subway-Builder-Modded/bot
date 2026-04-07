const http = require('http');
const { buildGitHubWebhookEmbed, buildGitHubWebhookPayload } = require('../discord/embeds');
const { normalizeWebhookPath, readRequestBody, writePlainResponse } = require('./request');
const { verifyGitHubSignature } = require('../utils/security');

const BLOCKED_GITHUB_WEBHOOK_REPOSITORIES = new Set(['subway-builder-modded/regitsry']);

function createWebhookServer(client, config, railyardService) {
  function getRepositoryFullName(payload) {
    const fullName = payload?.repository?.full_name;
    return typeof fullName === 'string' ? fullName.trim().toLowerCase() : '';
  }

  function isBlockedWebhookRepository(payload) {
    const fullName = getRepositoryFullName(payload);
    return fullName ? BLOCKED_GITHUB_WEBHOOK_REPOSITORIES.has(fullName) : false;
  }

  async function sendGitHubWebhookViaDiscordWebhook(event, payload) {
    if (!config.discordWebhookUrl) {
      throw new Error('Missing DISCORD_WEBHOOK_URL.');
    }

    const discordBody = buildGitHubWebhookPayload(config, event, payload);
    const response = await fetch(config.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordBody),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discord webhook API error: ${response.status} ${text}`);
    }
  }

  async function sendGitHubWebhookToDiscord(event, payload) {
    const destinationId = config.discordGitHubEventsChannelId;
    if (!destinationId) {
      throw new Error('Missing DISCORD_GITHUB_EVENTS_CHANNEL_ID.');
    }

    const channel = await client.channels.fetch(destinationId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Destination ${destinationId} is not a text-based channel/thread.`);
    }

    const embed = buildGitHubWebhookEmbed(event, payload);
    await channel.send({ embeds: [embed] });
  }

  async function deliverGitHubWebhook(event, payload) {
    if (config.discordGitHubEventsChannelId) {
      try {
        await sendGitHubWebhookToDiscord(event, payload);
        return 'bot-channel';
      } catch (error) {
        if (!config.discordWebhookUrl) {
          throw error;
        }
        console.warn('[webhook] bot-channel delivery failed, falling back to Discord webhook', {
          error: error.message,
        });
        await sendGitHubWebhookViaDiscordWebhook(event, payload);
        return 'discord-webhook-fallback';
      }
    }

    await sendGitHubWebhookViaDiscordWebhook(event, payload);
    return 'discord-webhook';
  }

  async function handleGitHubWebhookRequest(req, res) {
    const deliveryHeader = req.headers['x-github-delivery'];
    const eventHeader = req.headers['x-github-event'];
    const deliveryId = Array.isArray(deliveryHeader) ? deliveryHeader[0] : deliveryHeader || 'unknown';
    const eventName = Array.isArray(eventHeader) ? eventHeader[0] : eventHeader || 'unknown';

    if (req.method !== 'POST') {
      console.warn('[webhook] rejected non-POST request', { deliveryId, event: eventName, method: req.method });
      writePlainResponse(res, 405, 'Only POST allowed');
      return;
    }

    const rawBody = await readRequestBody(req);
    const signatureHeader = req.headers['x-hub-signature-256'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader || '';
    const event = Array.isArray(eventHeader) ? eventHeader[0] : eventHeader || 'unknown';
    const valid = verifyGitHubSignature(rawBody, signature, config.githubWebhookSecret);

    if (!valid) {
      console.warn('[webhook] bad signature', { deliveryId, event });
      writePlainResponse(res, 401, 'Bad signature');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.warn('[webhook] invalid json', { deliveryId, event });
      writePlainResponse(res, 400, 'Invalid JSON');
      return;
    }

    if (event === 'ping') {
      console.log('[webhook] ping acknowledged', { deliveryId });
      writePlainResponse(res, 200, 'pong');
      return;
    }

    if (isBlockedWebhookRepository(payload)) {
      console.log('[webhook] skipped blocked repository event', {
        deliveryId,
        event,
        repository: payload.repository?.full_name || 'unknown',
      });
      writePlainResponse(res, 200, 'ok');
      return;
    }

    if (!client.isReady()) {
      console.warn('[webhook] bot not ready', { deliveryId, event });
      writePlainResponse(res, 503, 'Bot not ready');
      return;
    }

    if (event === 'push') {
      railyardService.handleRailyardNewProjectPush(payload).catch((error) => {
        console.error('[railyard-push] failed', { deliveryId, error: error.message });
      });
    }

    try {
      const mode = await deliverGitHubWebhook(event, payload);
      console.log('[webhook] delivered to discord', { deliveryId, event, mode });
      writePlainResponse(res, 200, 'ok');
    } catch (error) {
      console.error('[webhook] discord delivery failed', { deliveryId, event, error: error.message });
      writePlainResponse(res, 500, `Discord error: ${error.message}`);
    }
  }

  function isGitHubWebhookRequest(req, requestPathname, webhookPath) {
    const signatureHeader = req.headers['x-hub-signature-256'];
    const eventHeader = req.headers['x-github-event'];
    const hasGitHubHeaders = !!signatureHeader || !!eventHeader;
    if (hasGitHubHeaders) return true;
    return req.method === 'POST' && requestPathname === webhookPath;
  }

  function startHttpServer() {
    const webhookPath = normalizeWebhookPath(config.githubWebhookPath);

    http
      .createServer(async (req, res) => {
        try {
          const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

          if (isGitHubWebhookRequest(req, requestUrl.pathname, webhookPath)) {
            await handleGitHubWebhookRequest(req, res);
            return;
          }

          writePlainResponse(res, 200, 'ok');
        } catch (error) {
          console.error('HTTP server request error:', error);
          if (!res.headersSent) {
            writePlainResponse(res, 500, 'internal error');
          }
        }
      })
      .listen(config.port, () => {
        console.log(`Health + webhook server listening on ${config.port} (webhook path: ${webhookPath})`);
        console.log('Webhook config:', {
          webhookPath,
          hasWebhookSecret: !!config.githubWebhookSecret,
          discordGithubEventsChannelId: config.discordGitHubEventsChannelId || null,
          hasDiscordWebhookUrl: !!config.discordWebhookUrl,
        });
      })
      .on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`Health server port ${config.port} already in use — skipping.`);
        } else {
          console.error('Health server error:', err);
        }
      });
  }

  return {
    startHttpServer,
  };
}

module.exports = {
  createWebhookServer,
};
