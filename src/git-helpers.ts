import { Octokit } from '@octokit/rest'
import * as github from '@actions/github'
import { exec } from '@actions/exec'

type GitHubOctokit = ReturnType<typeof github.getOctokit>

type OctokitClient = Octokit | GitHubOctokit

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

export async function checkClean(): Promise<string | null> {
  let diffOutput = ''

  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        diffOutput += data.toString()
      },
      stderr: (data: Buffer) => {
        diffOutput += data.toString()
      }
    }
  }

  try {
    // similar to the Elm compiler's git diff check at https://github.com/elm/compiler/blob/770071accf791e8171440709effe71e78a9ab37c/terminal/src/Publish.hs
    // but with a slight varation in order to print the list of files and their status from the diff command
    await exec(
      'git',
      ['diff-index', '--name-status', '--exit-code', 'HEAD', '--'],
      options
    )
    return null
  } catch {
    return [
      "The `elm publish` command expects a clean diff. elm-publish-action checks your diff to make sure your publish command will succeed when it's time to run it. This is the diff:\n\n",
      diffOutput,
      // TODO note about stashing
      // TODO should there be an option to stash automatically for files that aren't in the `src/` folder, or README or elm.json?
      'You can check your diff locally by running `git diff-index HEAD --name-status --`'
    ].join('\n')
  }
}
