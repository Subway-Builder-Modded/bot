const SUSCAT_IMAGE_URL = 'https://subwaybuildermodded.com/images/art/suscat.jpg';

const EXACT_TEXT_RESPONSES = new Map([
  ['update?', 'update.'],
  ['update.', 'update.'],
  ['update', 'update.'],
  ['undapte?', 'undapte.'],
  ['undapte.', 'undapte.'],
  ['undapte', 'undapte.'],
]);

const EXACT_IMAGE_RESPONSES = new Map([
  ['.env', SUSCAT_IMAGE_URL],
  ['suscat', SUSCAT_IMAGE_URL],
]);

const PROJECTS = {
  railyard: {
    owner: 'Subway-Builder-Modded',
    repo: 'railyard',
    forumName: 'railyard-pr-discussions',
  },
  registry: {
    owner: 'Subway-Builder-Modded',
    repo: 'The-Railyard',
    forumName: 'registry-pr-discussions',
  },
  website: {
    owner: 'Subway-Builder-Modded',
    repo: 'website',
    forumName: 'website-pr-discussions',
  },
  bot: {
    owner: 'Subway-Builder-Modded',
    repo: 'bot',
    forumName: 'bot-pr-discussions',
  },
};

const REPO_ALIASES = {
  registry: 'The-Railyard',
};

const RAILYARD_NEW_PROJECT_CHANNEL_ID = '1485086423882268843';
const THE_RAILYARD_REPO = 'The-Railyard';
const THE_RAILYARD_OWNER = 'Subway-Builder-Modded';

const ADMIN_ROLE_ID = '1476291676036399104';
const RULES_CHANNEL_ID = '1480808298146959460';
const IMPORTANT_LINKS_CHANNEL_ID = '1484623362163736586';
const SUPPORT_CHANNEL_ID = '1487929424170188830';
const SUPPORT_ROLE_ID = '1487941024788516956';
const FEATURE_REQUESTS_CHANNEL_ID = '1487938647935418378';
const FEATURE_ROLE_ID = '1476290491363627049';
const GITHUB_REPORTS_CHANNEL_ID = '1491063696229924914';

module.exports = {
  ADMIN_ROLE_ID,
  EXACT_IMAGE_RESPONSES,
  EXACT_TEXT_RESPONSES,
  FEATURE_ROLE_ID,
  FEATURE_REQUESTS_CHANNEL_ID,
  GITHUB_REPORTS_CHANNEL_ID,
  IMPORTANT_LINKS_CHANNEL_ID,
  PROJECTS,
  RAILYARD_NEW_PROJECT_CHANNEL_ID,
  REPO_ALIASES,
  RULES_CHANNEL_ID,
  SUPPORT_CHANNEL_ID,
  SUPPORT_ROLE_ID,
  SUSCAT_IMAGE_URL,
  THE_RAILYARD_OWNER,
  THE_RAILYARD_REPO,
};
