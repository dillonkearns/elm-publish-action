import { Octokit } from '@octokit/rest'
import * as github from '@actions/github'
import { exec } from '@actions/exec'
import * as core from '@actions/core'

type GitHubOctokit = ReturnType<typeof github.getOctokit>

type OctokitClient = Octokit | GitHubOctokit

// Files that matter for elm publish - changes to these should block publishing
function isElmRelated(filePath: string): boolean {
  // Exact matches at root
  if (
    filePath === 'elm.json' ||
    filePath === 'README.md' ||
    filePath === 'LICENSE'
  ) {
    return true
  }
  // Elm source files only
  if (filePath.startsWith('src/') && filePath.endsWith('.elm')) {
    return true
  }
  return false
}

export interface ChangedFilesResult {
  elmRelated: string[]
  unrelated: string[]
}

async function execGetOutput(command: string, args: string[]): Promise<string> {
  let output = ''
  await exec(command, args, {
    silent: true,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString()
      }
    }
  })
  return output
}

export async function getChangedFiles(): Promise<ChangedFilesResult> {
  // Get tracked changes (modified, added, deleted)
  const diffOutput = await execGetOutput('git', [
    'diff-index',
    '--name-only',
    'HEAD',
    '--'
  ])
  const trackedChanges = diffOutput.split('\n').filter(f => f.trim())

  // Get untracked files (excluding ignored files)
  const untrackedOutput = await execGetOutput('git', [
    'ls-files',
    '--others',
    '--exclude-standard'
  ])
  const untrackedFiles = untrackedOutput.split('\n').filter(f => f.trim())

  // Combine and dedupe
  const allChanges = [...new Set([...trackedChanges, ...untrackedFiles])]

  const elmRelated: string[] = []
  const unrelated: string[] = []

  for (const filePath of allChanges) {
    if (isElmRelated(filePath)) {
      elmRelated.push(filePath)
    } else {
      unrelated.push(filePath)
    }
  }

  return { elmRelated, unrelated }
}

export async function stashFiles(files: string[]): Promise<void> {
  if (files.length === 0) return

  core.startGroup(`Stashing ${files.length} unrelated file(s)`)
  core.info(`Files: ${files.join(', ')}`)
  await exec('git', [
    'stash',
    'push',
    '--include-untracked',
    '-m',
    'elm-publish-action',
    '--',
    ...files
  ])
  core.endGroup()
}

export async function popStash(): Promise<void> {
  core.startGroup('Restoring stashed files')
  await exec('git', ['stash', 'pop'])
  core.endGroup()
}

export async function createAnnotatedTag(
  octokit: OctokitClient,
  tag: string
): Promise<void> {
  const [repoOwner, repoName] = process.env['GITHUB_REPOSITORY']?.split(
    '/'
  ) || ['', '']

  if (!process.env['GITHUB_SHA']) {
    throw new Error("Couldn't find GITHUB_SHA.")
  }

  await octokit.rest.git.createTag({
    owner: repoOwner,
    repo: repoName,
    tag,
    message: 'new release',
    object: process.env['GITHUB_SHA'],
    type: 'commit'
  })

  await octokit.rest.git.createRef({
    owner: repoOwner,
    repo: repoName,
    ref: `refs/tags/${tag}`,
    sha: process.env['GITHUB_SHA']
  })
}

export async function getDefaultBranch(
  octokit: OctokitClient
): Promise<string> {
  const githubRepo = process.env['GITHUB_REPOSITORY']
  if (githubRepo) {
    const [owner, repo] = githubRepo.split('/')
    const repoDetails = await octokit.rest.repos.get({
      owner,
      repo
    })
    return repoDetails.data.default_branch
  } else {
    throw new Error('Could not find GITHUB_REPOSITORY')
  }
}
