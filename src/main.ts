import * as core from '@actions/core'
import * as fs from 'fs'
import { exec } from '@actions/exec'
import axios from 'axios'
import * as github from '@actions/github'
import { Octokit } from '@octokit/rest'
import {
  createAnnotatedTag,
  getDefaultBranch,
  checkClean
} from './git-helpers.js'
import * as io from '@actions/io'

type GitHubOctokit = ReturnType<typeof github.getOctokit>

type OctokitClient = Octokit | GitHubOctokit

function initializeOctokit(dryRun: boolean): OctokitClient {
  if (dryRun) {
    const token = core.getInput('github-token')
    if (token && token !== '') {
      throw new Error(
        'When performing a dry-run, do not pass the github-token argument.'
      )
    } else {
      // we can't use github.getOctokit because it will throw an error without an authToken argument
      // https://github.com/actions/toolkit/blob/1cc56db0ff126f4d65aeb83798852e02a2c180c3/packages/github/src/internal/utils.ts#L10
      return new Octokit()
    }
  } else {
    const gitHubToken = core.getInput('github-token', { required: true })
    return github.getOctokit(gitHubToken)
  }
}

async function run(): Promise<void> {
  try {
    const dryRun = core.getInput('dry-run').toLowerCase() === 'true'
    const octokit = initializeOctokit(dryRun)
    let pathToCompiler = core.getInput('path-to-elm')
    if (!pathToCompiler) {
      pathToCompiler = await io.which('elm', true)
    }
    await exec(pathToCompiler, [`--version`])

    const githubRepo = process.env['GITHUB_REPOSITORY'] || ''
    const githubRef = process.env['GITHUB_REF'] || ''
    const defaultBranch = await getDefaultBranch(octokit)

    const releasesUrl = `https://package.elm-lang.org/packages/${githubRepo}/releases.json`

    let publishedVersions: string[] = []
    const preventPublishReasons: string[] = []
    await axios
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

    const elmJsonContent = fs.readFileSync('elm.json', 'utf8')
    const currentElmJsonVersion: string = JSON.parse(elmJsonContent).version
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
        createPendingPublishStatus(pathToCompiler)
      }
      preventPublishReasons.push(
        `This action only publishes from the default branch (currently set to ${defaultBranch}).`
      )
    }
    const cleanDiffProblem = await checkClean()
    if (cleanDiffProblem) {
      preventPublishReasons.push(cleanDiffProblem)
    }

    const isPublishable = preventPublishReasons.length === 0
    core.setOutput('is-publishable', `${isPublishable}`)
    if (!isPublishable) {
      if (dryRun) {
        core.info(
          'dry-run is set to true, but even without dry-run true this action would not publish because of the reasons listed below.'
        )
      }
      core.info(preventPublishReasons.join('\n'))
    } else {
      if (dryRun) {
        core.info(
          'Skipping publish because dry-run is set to true. Without dry-run, publish would run now.'
        )
      } else {
        await tryPublish(
          octokit,
          pathToCompiler,
          githubRepo,
          currentElmJsonVersion
        )
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed(String(error))
    }
  }
}

async function tryPublish(
  octokit: OctokitClient,
  pathToCompiler: string,
  githubRepo: string,
  currentElmJsonVersion: string
): Promise<void> {
  const result = await runCommandWithOutput(pathToCompiler, ['publish'])
  if (result.status === 0) {
    core.info(`Published! ${publishedUrl(githubRepo, currentElmJsonVersion)}`)
    // tag already existed -- no need to call publish
  } else if (result.output.includes('-- NO TAG --')) {
    await performPublish(
      octokit,
      currentElmJsonVersion,
      pathToCompiler,
      githubRepo
    )
  } else {
    core.setFailed(result.output)
  }
}

async function runCommandWithOutput(
  command: string,
  args: string[]
): Promise<{ status: number; output: string }> {
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
  const status = await exec(command, args, {
    ...options,
    ignoreReturnCode: true
  })
  return { status, output }
}

async function performPublish(
  octokit: OctokitClient,
  currentElmJsonVersion: string,
  pathToCompiler: string,
  githubRepo: string
): Promise<void> {
  core.startGroup(`Creating git tag`)
  await createAnnotatedTag(octokit, currentElmJsonVersion)
  await exec(`git fetch --tags`)
  core.info(`Created git tag ${currentElmJsonVersion}`)
  core.endGroup()

  await exec(pathToCompiler, [`publish`])

  core.info(`Published! ${publishedUrl(githubRepo, currentElmJsonVersion)}`)
}

function publishedUrl(repoWithOwner: string, version: string): string {
  return `https://package.elm-lang.org/packages/${repoWithOwner}/${version}/`
}

async function createPendingPublishStatus(
  pathToCompiler: string
): Promise<void> {
  const diffStatus = await getElmDiffStatus(pathToCompiler)
  if (diffStatus) {
    // setCommitStatus(octo, {
    //   description: `A ${diffStatus} package change is pending. Merge branch to publish.`,
    //   name: 'Elm Publish',
    //   state: 'success'
    // })
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
