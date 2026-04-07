const { GITHUB_REPORTS_CHANNEL_ID } = require('../constants');

const DAILY_REPORT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const EXCLUDED_REPOSITORY_NAMES = [
  'website-dev',
  'website-legacy',
  'bot',
  '.github',
  'patcher',
  'Dependency-Test-Mod',
  'Test-Mod-VulnerabilityScanning',
];

function normalizeRepositoryName(repoName) {
  return String(repoName || '').trim().toLowerCase();
}

const EXCLUDED_REPOSITORIES = new Set(EXCLUDED_REPOSITORY_NAMES.map(normalizeRepositoryName));

function createGitHubReportService(client, config, githubService, embedService) {
  let reportTimer = null;
  let generationQueue = Promise.resolve();

  function queueExclusive(action) {
    const run = generationQueue.then(action, action);
    generationQueue = run.catch(() => {});
    return run;
  }

  function clearSchedule() {
    if (!reportTimer) return;
    clearTimeout(reportTimer);
    reportTimer = null;
  }

  function scheduleNextReport(delayMs = DAILY_REPORT_INTERVAL_MS) {
    clearSchedule();
    reportTimer = setTimeout(() => {
      generateReports({ trigger: 'scheduled', resetTimer: true }).catch((error) => {
        console.error('[github-reports] scheduled report failed', { error: error.message });
        scheduleNextReport(60 * 1000);
      });
    }, Math.max(0, delayMs));
  }

  function getTargetChannelId() {
    return config.discordGitHubReportsChannelId || GITHUB_REPORTS_CHANNEL_ID;
  }

  function isIncludedRepository(repoName) {
    return !EXCLUDED_REPOSITORIES.has(normalizeRepositoryName(repoName));
  }

  async function resolveReportChannel() {
    const channelId = getTargetChannelId();
    if (!channelId) {
      throw new Error('Missing GitHub reports channel ID.');
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`GitHub reports destination ${channelId} is not a text-based channel/thread.`);
    }

    return channel;
  }

  async function buildRepoReports(owner) {
    const repoNames = await githubService.listOrgRepos(owner);
    return repoNames
      .filter(isIncludedRepository)
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  }

  async function generateReports(options = {}) {
    const trigger = options.trigger || 'manual';
    const resetTimer = options.resetTimer !== false;

    return queueExclusive(async () => {
      const channel = await resolveReportChannel();
      const owner = config.defaultGitHubOwner;
      const repos = await buildRepoReports(owner);
      let sentCount = 0;
      const repoReports = [];
      const failedRepos = [];

      for (const repo of repos) {
        try {
          const report = await githubService.fetchRepositoryIssueReport(owner, repo, { limit: 3 });
          repoReports.push({ repo, report });
          sentCount += 1;
        } catch (error) {
          failedRepos.push(repo);
          console.error('[github-reports] failed to post repo report', {
            owner,
            repo,
            error: error.message,
          });
        }
      }

      const embed = embedService.buildGitHubOrganizationReportEmbed(owner, repoReports, {
        generatedAt: new Date(),
      });

      await channel.send({
        embeds: [embed],
      });

      if (resetTimer) {
        scheduleNextReport(DAILY_REPORT_INTERVAL_MS);
      }

      return {
        trigger,
        sentCount,
        failedRepos,
        attemptedRepos: repos.length,
        channelId: channel.id,
        nextRunInMs: DAILY_REPORT_INTERVAL_MS,
      };
    });
  }

  async function startDailyReports() {
    await generateReports({ trigger: 'startup', resetTimer: true });
  }

  return {
    generateReports,
    scheduleNextReport,
    startDailyReports,
  };
}

module.exports = {
  createGitHubReportService,
};
