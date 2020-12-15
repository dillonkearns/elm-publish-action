import * as core from '@actions/core'
import {exec} from '@actions/exec'
import {default as axios} from 'axios'
import {Toolkit} from 'actions-toolkit'
import * as github from '@actions/github'
import {
  createAnnotatedTag,
  getDefaultBranch,
  setCommitStatus
} from './git-helpers'
import * as io from '@actions/io'
import {GitHub} from '@actions/github/lib/utils'

type Octokit = InstanceType<typeof GitHub>
const tools = new Toolkit()

const gitHubToken = core.getInput('github-token')
const octokit = github.getOctokit(gitHubToken)

async function run(): Promise<void> {
  let pathToCompiler = core.getInput('path-to-elm')
  if (!pathToCompiler) {
    pathToCompiler = await io.which('elm', true)
  }
  await exec(pathToCompiler, [`--version`])

  try {
    const githubRepo = process.env['GITHUB_REPOSITORY'] || ''
    const githubRef = process.env['GITHUB_REF'] || ''
    const defaultBranch = await getDefaultBranch(octokit)

    const releasesUrl = `https://package.elm-lang.org/packages/${githubRepo}/releases.json`

    let publishedVersions: string[] = []
    const preventPublishReasons: string[] = []
    axios
      .get(`https://package.elm-lang.org/packages/${githubRepo}/releases.json`)
      .then(versionsResponse => {
        core.debug(`versionsResponse ${versionsResponse}`)
        publishedVersions = Object.keys(versionsResponse.data)
      })
      .catch(packageFetchError => {
        core.debug(`packageFetchError ${packageFetchError}`)
        preventPublishReasons.push(
          `I couldn't find this package in the Elm package server (see ${releasesUrl}). This either means the package server is down, or you haven't published it yet.`
        )
      })

    const currentElmJsonVersion: string = JSON.parse(tools.getFile('elm.json'))
      .version
    core.debug(`currentElmJsonVersion ${currentElmJsonVersion}`)

    if (currentElmJsonVersion === '1.0.0') {
      preventPublishReasons.push(
        `The version in elm.json is at 1.0.0. This action only runs for packages that already have an initial version published. Please run elm publish manually to publish your initial version when you're ready!`
      )
    }
    if (publishedVersions.length === 0) {
      preventPublishReasons.push(
        `I couldn't find this package in the Elm package repository (see ${releasesUrl}). This action only runs for packages that already have an initial version published. Please run elm publish manually to publish your initial version when you're ready!`
      )
    }
    if (publishedVersions.includes(currentElmJsonVersion)) {
      preventPublishReasons.push(
        `The current version in your elm.json has already been published: ${publishedUrl(
          githubRepo,
          currentElmJsonVersion
        )} .\n\nJust run \`elm bump\` when you're ready for a new release and then push your updated elm.json file. Then this action will publish it for you!`
      )
    }
    if (githubRef !== `refs/heads/${defaultBranch}`) {
      if (preventPublishReasons.length === 0) {
        createPendingPublishStatus(octokit, pathToCompiler)
      }
      preventPublishReasons.push(
        `This action only publishes from the default branch (currently set to ${defaultBranch}).`
      )
    }
    if (preventPublishReasons.length > 0) {
      setCommitStatus(octokit, {
        description: `No pending publish on merge. See action output for details.`,
        name: 'Elm Publish',
        state: 'pending'
      })
      core.info(preventPublishReasons.join('\n'))
    } else {
      await tryPublish(pathToCompiler, githubRepo, currentElmJsonVersion)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

async function tryPublish(
  pathToCompiler: string,
  githubRepo: string,
  currentElmJsonVersion: string
): Promise<void> {
  let publishOutput = ''
  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        publishOutput += data.toString()
      },
      stderr: (data: Buffer) => {
        publishOutput += data.toString()
      }
    }
  }
  const status = await exec(pathToCompiler, ['publish'], {
    ...options,
    ignoreReturnCode: true
  })
  if (status === 0) {
    core.info(`Published! ${publishedUrl(githubRepo, currentElmJsonVersion)}`)
    // tag already existed -- no need to call publish
  } else if (/-- NO TAG --/.test(publishOutput)) {
    core.startGroup(`Creating git tag`)
    await createAnnotatedTag(octokit, currentElmJsonVersion)
    await exec(`git fetch --tags`)
    core.info(`Created git tag ${currentElmJsonVersion}`)
    core.endGroup()

    await exec(pathToCompiler, [`publish`])

    core.info(`Published! ${publishedUrl(githubRepo, currentElmJsonVersion)}`)
  } else {
    core.setFailed(publishOutput)
  }
}

function publishedUrl(repoWithOwner: string, version: string): string {
  return `https://package.elm-lang.org/packages/${repoWithOwner}/${version}/`
}

async function createPendingPublishStatus(
  octo: Octokit,
  pathToCompiler: string
): Promise<void> {
  const diffStatus = await getElmDiffStatus(pathToCompiler)
  if (diffStatus) {
    setCommitStatus(octo, {
      description: `A ${diffStatus} package change is pending. Merge branch to publish.`,
      name: 'Elm Publish',
      state: 'success'
    })
  }
}

async function getElmDiffStatus(
  pathToCompiler: string
): Promise<string | null> {
  // This is a MINOR change.

  try {
    let output = ''
    const options = {
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString()
        },
        stderr: (data: Buffer) => {
          output += data.toString()
        }
      }
    }
    await exec(pathToCompiler, ['diff'], {
      ...options
    })
    const maybeMatch = output
      .toLowerCase()
      .match(/^This is a (\w+) change./)?.[0]
    if (maybeMatch) {
      return maybeMatch
    } else {
      return null
    }
  } catch {
    return null
  }
}

run()
