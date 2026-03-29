const { FEATURE_REQUESTS_CHANNEL_ID, FEATURE_ROLE_ID } = require('../constants');
const { createTicketService } = require('./ticketServiceFactory');

function createFeatureService() {
  return createTicketService({
    channelId: FEATURE_REQUESTS_CHANNEL_ID,
    roleId: FEATURE_ROLE_ID,
    ticketTypeLabel: 'Feature',
    counterFileName: 'feature-ticket-counter.json',
    createCommandName: 'feature',
    setCommandName: 'setfeatureticket',
    resetCommandName: 'resetfeatureticket',
    embedDescriptionParagraphs: [
      'Describe the current limitation and the feature you want added.',
      'Explain the expected behavior and why this would help players or creators.',
      'Share examples, mockups, references, and any edge cases if/when relevant.',
      'Please be patient and avoid duplicate pings. The dev team will review as soon as possible.',
    ],
    embedColor: 0xf59e0b,
    teamLabel: 'Dev',
  });
}

module.exports = {
  createFeatureService,
};
