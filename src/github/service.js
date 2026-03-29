const { REPO_ALIASES } = require('../constants');

function createGitHubService(config) {
  const orgRepoCache = {
    fetchedAt: 0,
    repos: [],
  };

  function githubHeaders() {
    const headers = {
      'User-Agent': 'discord-gh-link-bot',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (config.githubToken) {
      headers.Authorization = `Bearer ${config.githubToken}`;
    }

    return headers;
  }

  function isValidRepoName(value) {
    return /^[A-Za-z0-9_.-]+$/.test(value);
  }

  function isValidCommitHash(value) {
    return /^[a-fA-F0-9]{7,40}$/.test(value);
  }

  function normalizeOwnerRepo(owner, repo) {
    if (!owner || !repo) return null;
    if (!isValidRepoName(owner) || !isValidRepoName(repo)) return null;
    return { owner, repo };
  }

  function normalizeIssueNumber(value) {
    const match = String(value || '').trim().match(/^#?(\d+)$/);
    return match ? match[1] : null;
  }

  function dedupeIssueRefs(issueRefs) {
    const seen = new Set();
    const result = [];

    for (const ref of issueRefs) {
      const key = `${ref.owner}/${ref.repo}#${ref.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(ref);
    }

    return result;
  }

  function resolveRepoAlias(repo) {
    if (!repo) return repo;
    return REPO_ALIASES[repo.toLowerCase()] || repo;
  }

  function expandIssueNumberChain(numberChain) {
    return String(numberChain || '').match(/\d+/g) || [];
  }

  function pushIssueRef(refs, owner, repo, number) {
    if (!number) return;

    if (!owner && !repo) {
      refs.push({
        owner: config.defaultGitHubOwner,
        repo: config.defaultGitHubRepo,
        number,
      });
      return;
    }

    if (!owner && repo) {
      const resolvedRepo = resolveRepoAlias(repo);
      if (!isValidRepoName(resolvedRepo)) return;
      refs.push({
        owner: config.defaultGitHubOwner,
        repo: resolvedRepo,
        number,
      });
      return;
    }

    if (owner && repo) {
      const resolvedRepo = resolveRepoAlias(repo);
      const normalized = normalizeOwnerRepo(owner, resolvedRepo);
      if (!normalized) return;

      refs.push({
        owner: normalized.owner,
        repo: normalized.repo,
        number,
      });
    }
  }

  function extractIssueRefs(content) {
    const refs = [];
    const consumedHashPos = new Set();

    const patterns = [
      /(^|[^\w/-])(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)\/(?<chain>#\d+(?:\/#\d+)+)(?![\d.])/g,
      /(^|[^\w/-])(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)(?<chain>#\d+(?:\/#\d+)+)(?![\d.])/g,
      /(^|[^\w/-])(?<repo>[A-Za-z0-9_.-]+)\/(?<chain>#\d+(?:\/#\d+)+)(?![\d.])/g,
      /(^|[^\w/-])(?<repo>[A-Za-z0-9_.-]+)(?<chain>#\d+(?:\/#\d+)+)(?![\d.])/g,
      /(^|[^\w])(?<chain>#\d+(?:\/#\d+)+)(?![\d.])/g,
      /(^|[^\w/-])(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)\/#(?<number>\d+)(?![\d.])/g,
      /(^|[^\w/-])(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)#(?<number>\d+)(?![\d.])/g,
      /(^|[^\w/-])(?<repo>[A-Za-z0-9_.-]+)\/#(?<number>\d+)(?![\d.])/g,
      /(^|[^\w/-])(?<repo>[A-Za-z0-9_.-]+)#(?<number>\d+)(?![\d.])/g,
      /(^|[^\w])#(?<number>\d+)(?![\d.])/g,
    ];

    for (const regex of patterns) {
      for (const match of String(content || '').matchAll(regex)) {
        const owner = match.groups?.owner || null;
        const repo = match.groups?.repo || null;
        const chain = match.groups?.chain || null;
        const number = match.groups?.number || null;

        if (chain) {
          const chainStartInContent = match.index + match[0].indexOf(chain);
          let scanOffset = 0;
          for (const num of expandIssueNumberChain(chain)) {
            const localHash = chain.indexOf('#', scanOffset);
            if (localHash === -1) break;
            const absHash = chainStartInContent + localHash;
            if (!consumedHashPos.has(absHash)) {
              consumedHashPos.add(absHash);
              pushIssueRef(refs, owner, repo, num);
            }
            scanOffset = localHash + 1;
          }
          continue;
        }

        const hashOffsetInMatch = match[0].indexOf('#');
        const absHash = match.index + hashOffsetInMatch;
        if (consumedHashPos.has(absHash)) continue;
        consumedHashPos.add(absHash);
        pushIssueRef(refs, owner, repo, number);
      }
    }

    return dedupeIssueRefs(refs);
  }

  function extractCommitRef(content) {
    const patterns = [
      /(^|[^\w/-])(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)@(?<hash>[a-fA-F0-9]{7,40})(?![a-fA-F0-9])/g,
      /(^|[^\w/-])(?<repo>[A-Za-z0-9_.-]+)@(?<hash>[a-fA-F0-9]{7,40})(?![a-fA-F0-9])/g,
      /(^|[^\w/-])(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)\/commit\/(?<hash>[a-fA-F0-9]{7,40})(?![a-fA-F0-9])/g,
      /(^|[^\w/-])(?<repo>[A-Za-z0-9_.-]+)\/commit\/(?<hash>[a-fA-F0-9]{7,40})(?![a-fA-F0-9])/g,
      /(^|[^\w/-])(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)\/(?<hash>[a-fA-F0-9]{7,40})(?![a-fA-F0-9])/g,
      /(^|[^\w/-])(?<repo>[A-Za-z0-9_.-]+)\/(?<hash>[a-fA-F0-9]{7,40})(?![a-fA-F0-9])/g,
      /(^|[^a-fA-F0-9])(?<hash>[a-fA-F0-9]{7,40})(?![a-fA-F0-9])/g,
    ];

    for (const regex of patterns) {
      for (const match of String(content || '').matchAll(regex)) {
        const owner = match.groups?.owner || null;
        const repo = match.groups?.repo || null;
        const hash = match.groups?.hash || null;

        if (!hash || !isValidCommitHash(hash)) continue;
        if (/^\d+$/.test(hash)) continue;

        if (!owner && !repo) {
          return {
            owner: null,
            repo: null,
            hash,
            searchDefaultOwner: true,
          };
        }

        if (!owner && repo) {
          if (!isValidRepoName(repo)) continue;
          return {
            owner: config.defaultGitHubOwner,
            repo,
            hash,
            searchDefaultOwner: false,
          };
        }

        if (owner && repo) {
          const normalized = normalizeOwnerRepo(owner, repo);
          if (!normalized) continue;
          return {
            owner: normalized.owner,
            repo: normalized.repo,
            hash,
            searchDefaultOwner: false,
          };
        }
      }
    }

    return null;
  }

  async function fetchGitHubIssue(owner, repo, number) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${number}`;
    const response = await fetch(url, { headers: githubHeaders() });

    if (!response.ok) {
      const body = await response.text();
      console.error('fetchGitHubIssue failed', {
        url,
        status: response.status,
        body,
      });

      if (response.status === 404) return null;
      throw new Error(`GitHub issue API error: ${response.status}`);
    }

    return response.json();
  }

  async function fetchGitHubPullRequest(owner, repo, number) {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`;
    const response = await fetch(url, { headers: githubHeaders() });

    if (!response.ok) {
      const body = await response.text();
      console.error('fetchGitHubPullRequest failed', {
        url,
        status: response.status,
        body,
      });

      if (response.status === 404) return null;
      throw new Error(`GitHub pull request API error: ${response.status}`);
    }

    return response.json();
  }

  async function fetchGitHubCommit(owner, repo, hash) {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${hash}`;
    const response = await fetch(url, { headers: githubHeaders() });

    if (!response.ok) {
      const body = await response.text();
      console.error('fetchGitHubCommit failed', {
        url,
        status: response.status,
        body,
      });

      if (response.status === 404 || response.status === 422) return null;
      throw new Error(`GitHub commit API error: ${response.status}`);
    }

    return response.json();
  }

  async function listOrgRepos(owner) {
    const now = Date.now();
    const cacheAgeMs = 5 * 60 * 1000;

    if (
      owner === config.defaultGitHubOwner &&
      orgRepoCache.repos.length > 0 &&
      now - orgRepoCache.fetchedAt < cacheAgeMs
    ) {
      return orgRepoCache.repos;
    }

    const repos = [];
    let page = 1;

    while (page <= 10) {
      const url = `https://api.github.com/orgs/${owner}/repos?per_page=100&page=${page}&type=all`;
      const response = await fetch(url, { headers: githubHeaders() });

      if (!response.ok) {
        throw new Error(`GitHub org repos API error: ${response.status}`);
      }

      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) break;

      for (const repo of data) {
        if (repo?.name) repos.push(repo.name);
      }

      if (data.length < 100) break;
      page += 1;
    }

    if (owner === config.defaultGitHubOwner) {
      orgRepoCache.repos = repos;
      orgRepoCache.fetchedAt = now;
    }

    return repos;
  }

  async function resolveCommitRef(commitRef) {
    if (!commitRef.searchDefaultOwner) {
      const commit = await fetchGitHubCommit(commitRef.owner, commitRef.repo, commitRef.hash);
      if (!commit) return null;

      return {
        owner: commitRef.owner,
        repo: commitRef.repo,
        commit,
      };
    }

    const direct = await fetchGitHubCommit(config.defaultGitHubOwner, config.defaultGitHubRepo, commitRef.hash);
    if (direct) {
      return {
        owner: config.defaultGitHubOwner,
        repo: config.defaultGitHubRepo,
        commit: direct,
      };
    }

    const repos = await listOrgRepos(config.defaultGitHubOwner);

    for (const repo of repos) {
      if (repo === config.defaultGitHubRepo) continue;

      const commit = await fetchGitHubCommit(config.defaultGitHubOwner, repo, commitRef.hash);
      if (commit) {
        return {
          owner: config.defaultGitHubOwner,
          repo,
          commit,
        };
      }
    }

    return null;
  }

  async function fetchFileAtCommit(owner, repo, filePath, sha) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${sha}`;
    const response = await fetch(url, { headers: githubHeaders() });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.encoding === 'base64' && data.content) {
      return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
    }
    return null;
  }

  return {
    dedupeIssueRefs,
    extractCommitRef,
    extractIssueRefs,
    fetchFileAtCommit,
    fetchGitHubIssue,
    fetchGitHubPullRequest,
    normalizeIssueNumber,
    resolveCommitRef,
  };
}

module.exports = {
  createGitHubService,
};
