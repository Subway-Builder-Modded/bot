const {
  FEATURE_REQUESTS_CHANNEL_ID,
  IMPORTANT_LINKS_CHANNEL_ID,
  RULES_CHANNEL_ID,
  SUPPORT_CHANNEL_ID,
} = require('../constants');
const { memberHasModRole } = require('./permissions');

function createSetupService(embedService) {
  async function requireTextChannel(guild, channelId, label) {
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`${label} channel (${channelId}) is missing or not text-based.`);
    }
    return channel;
  }

  async function runSetup(interaction) {
    const authorized = await memberHasModRole(interaction);
    if (!authorized) {
      throw new Error('Only members with the mod role can use /setup.');
    }

    const rulesChannel = await requireTextChannel(interaction.guild, RULES_CHANNEL_ID, 'Rules');
    const linksChannel = await requireTextChannel(interaction.guild, IMPORTANT_LINKS_CHANNEL_ID, 'Important links');
    const supportChannel = await requireTextChannel(interaction.guild, SUPPORT_CHANNEL_ID, 'Support');
    const featureChannel = await requireTextChannel(interaction.guild, FEATURE_REQUESTS_CHANNEL_ID, 'Feature requests');

    await rulesChannel.send({ embeds: [embedService.buildSetupRulesEmbed()] });
    await linksChannel.send({ embeds: [embedService.buildSetupImportantLinksEmbed()] });
    await supportChannel.send({ embeds: [embedService.buildSetupSupportEmbed()] });
    await featureChannel.send({ embeds: [embedService.buildSetupFeatureRequestsEmbed()] });

    return [
      `Posted rules embed in <#${RULES_CHANNEL_ID}>`,
      `Posted links embed in <#${IMPORTANT_LINKS_CHANNEL_ID}>`,
      `Posted support embed in <#${SUPPORT_CHANNEL_ID}>`,
      `Posted feature-request embed in <#${FEATURE_REQUESTS_CHANNEL_ID}>`,
    ];
  }

  return {
    runSetup,
  };
}

module.exports = {
  createSetupService,
};
