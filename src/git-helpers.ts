import * as core from '@actions/core'
import * as github from '@actions/github'

export async function createAnnotatedTag(
  octokit: github.GitHub,
  tag: string
): Promise<void> {
  const [repoOwner, repoName] = process.env['GITHUB_REPOSITORY']?.split(
    '/'
  ) || ['', '']

  if (!process.env['GITHUB_SHA']) {
    throw "Couldn't find GITHUB_SHA."
  }

  const createTagResponse = await octokit.git.createTag({
    owner: repoOwner,
    repo: repoName,
    tag: tag,
    message: 'new release',
    object: process.env['GITHUB_SHA'],
    type: 'commit'
  })

  const createRefResponse = await octokit.git.createRef({
    owner: repoOwner,
    repo: repoName,
    ref: `refs/tags/${tag}`,
    sha: process.env['GITHUB_SHA']
  })
}

export async function getDefaultBranch(
  octokit: github.GitHub
): Promise<string> {
  const githubRepo = process.env['GITHUB_REPOSITORY']
  if (githubRepo) {
    const [owner, repo] = githubRepo.split('/')
    const repoDetails = await octokit.repos.get({
      owner,
      repo
    })
    return repoDetails.data.default_branch
  } else {
    throw new Error('Could not find GITHUB_REPOSITORY')
  }
}
