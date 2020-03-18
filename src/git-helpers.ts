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
  core.info(`createTagResponse ${JSON.stringify(createTagResponse)}`)

  const createRefResponse = await octokit.git.createRef({
    owner: repoOwner,
    repo: repoName,
    ref: `refs/tags/${tag}`,
    sha: process.env['GITHUB_SHA']
  })
  core.info(`createRefResponse ${JSON.stringify(createRefResponse)}`)
  core.info('Star waiting')
  await timeout(3000)
  core.info('Done waiting')
}

function timeout(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
