function createForumService(githubService, embedService) {
  async function buildIssueEmbedFromRef(issueRef) {
    const issue = await githubService.fetchGitHubIssue(issueRef.owner, issueRef.repo, issueRef.number);
    if (!issue) return null;

    let prData = null;
    if (issue.pull_request) {
      prData = await githubService.fetchGitHubPullRequest(issueRef.owner, issueRef.repo, issueRef.number);
    }

    return {
      issue,
      embed: embedService.buildIssueEmbed(issue, prData, issueRef.owner, issueRef.repo),
    };
  }

  async function buildIssueEmbedsFromRefs(issueRefs) {
    const embeds = [];

    for (const issueRef of issueRefs) {
      const built = await buildIssueEmbedFromRef(issueRef);
      if (built) embeds.push(built.embed);
    }

    return embeds;
  }

  function getThreadUrl(thread) {
    return thread.url || `https://discord.com/channels/${thread.guildId}/${thread.id}`;
  }

  return {
    buildIssueEmbedFromRef,
    buildIssueEmbedsFromRefs,
    getThreadUrl,
  };
}

module.exports = {
  createForumService,
};
