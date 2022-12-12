import octokitRest from '@octokit/rest'
import {GitHub} from '@actions/github/lib/utils'

type OctokitUtil = InstanceType<typeof GitHub>

type Octokit = octokitRest.Octokit | OctokitUtil

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

export async function checkClean(): Promise<string | null> {
  const exec = require('@actions/exec')

  let diffOutput = ''
  let errorOutput = ''

  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        diffOutput += data.toString()
      },
      stderr: (data: Buffer) => {
        errorOutput += data.toString()
      }
    }
  }

  try {
    // similar to the Elm compiler's git diff check at https://github.com/elm/compiler/blob/770071accf791e8171440709effe71e78a9ab37c/terminal/src/Publish.hs
    // but with a slight varation in order to print the list of files and their status from the diff command
    await exec.exec(
      'git',
      ['diff-index', '--quiet', 'HEAD', '--name-status', '--'],
      options
    )
    return null
  } catch (error) {
    return [
      "The `elm publish` command expects a clean diff. elm-publish-action checks your diff to make sure your publish command will succeed when it's time to run it. This is the diff:\n\n",
      diffOutput,
      // TODO note about stashing
      // TODO should there be an option to stash automatically for files that aren't in the `src/` folder, or README or elm.json?
      'You can check your diff locally by running `git diff-index HEAD --name-status --`'
    ].join('\n')
  }
}
