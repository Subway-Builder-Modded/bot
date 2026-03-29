const { SUPPORT_CHANNEL_ID, SUPPORT_ROLE_ID } = require('../constants');
const { createTicketService } = require('./ticketServiceFactory');

function createSupportService() {
  return createTicketService({
    channelId: SUPPORT_CHANNEL_ID,
    roleId: SUPPORT_ROLE_ID,
    ticketTypeLabel: 'Support',
    counterFileName: 'support-ticket-counter.json',
    createCommandName: 'support',
    setCommandName: 'setsupportticket',
    resetCommandName: 'resetsupportticket',
    embedDescriptionParagraphs: [
      'Describe the issue clearly and include steps to reproduce it.',
      'Share screenshots, logs, error messages, and game version if/when relevant.',
      'Please be patient and avoid duplicate pings. The support team will respond as soon as possible.',
    ],
    embedColor: 0x0ea5e9,
    teamLabel: 'Support',
  });
}

module.exports = {
  createSupportService,
};
