import * as core from '@actions/core'
import octokitCore from '@octokit/core'

type Octokit = octokitCore.Octokit

export async function createAnnotatedTag(
  octokit: Octokit,
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
    tag,
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

export async function getDefaultBranch(octokit: Octokit): Promise<string> {
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

export async function setCommitStatus(
  octokit: Octokit,
  params: {
    name: string
    description: string
    state: 'error' | 'failure' | 'pending' | 'success'
  }
): Promise<void> {
  try {
    const githubRepo = process.env['GITHUB_REPOSITORY'] || ''
    const [owner, repo] = githubRepo.split('/')
    core.debug(
      `Updating status: ${JSON.stringify({
        context: params.name,
        description: params.description,
        owner,
        repo,
        sha: process.env['GITHUB_SHA'] || '',
        state: params.state
      })}`
    )
    await octokit.repos.createCommitStatus({
      context: params.name,
      description: params.description,
      owner,
      repo,
      sha: process.env['GITHUB_SHA'] || '',
      state: params.state,
      target_url: 'https://elm-lang.org/news/0.14'
    })
    core.debug(`Updated build status: ${params.state}`)
  } catch (error) {
    throw new Error(`error while setting context status: ${error.message}`)
  }
}
