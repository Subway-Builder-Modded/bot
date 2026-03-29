const {
  RAILYARD_NEW_PROJECT_CHANNEL_ID,
  THE_RAILYARD_OWNER,
  THE_RAILYARD_REPO,
} = require('../constants');

function createRailyardService(client, githubService, embedService) {
  async function handleRailyardNewProjectPush(payload) {
    if (payload.ref !== 'refs/heads/main') return;
    if (payload.repository?.name !== THE_RAILYARD_REPO) return;

    const pusherName = (payload.pusher?.name || '').toLowerCase();
    if (!pusherName.includes('github-actions')) return;

    const channel = await client.channels.fetch(RAILYARD_NEW_PROJECT_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    for (const commit of payload.commits || []) {
      const message = commit.message || '';
      if (!message.toLowerCase().startsWith('feat')) continue;

      for (const addedFile of commit.added || []) {
        const mapMatch = addedFile.match(/^maps\/([^/]+)\/manifest\.json$/);
        const modMatch = addedFile.match(/^mods\/([^/]+)\/manifest\.json$/);
        const match = mapMatch || modMatch;
        if (!match) continue;

        const type = mapMatch ? 'map' : 'mod';
        const projectName = match[1];

        const raw = await githubService.fetchFileAtCommit(THE_RAILYARD_OWNER, THE_RAILYARD_REPO, addedFile, commit.id);
        if (!raw) continue;

        let manifest;
        try {
          manifest = JSON.parse(raw);
        } catch {
          console.warn('[railyard-push] failed to parse manifest', { file: addedFile });
          continue;
        }

        const embed = embedService.buildNewProjectEmbed(manifest, type, projectName);
        await channel.send({ embeds: [embed] });
        console.log('[railyard-push] announced new project', { type, projectName });
      }
    }
  }

  return {
    handleRailyardNewProjectPush,
  };
}

module.exports = {
  createRailyardService,
};
