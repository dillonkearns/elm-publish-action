import * as core from '@actions/core'
import {exec} from '@actions/exec'
import {default as axios} from 'axios'
import {Toolkit} from 'actions-toolkit'
import * as github from '@actions/github'
const tools = new Toolkit()
import {createAnnotatedTag} from './git-helpers'
import * as io from '@actions/io'

let publishOutput = ''

const gitHubToken = core.getInput('github-token')
const octokit = new github.GitHub(gitHubToken)

async function run(): Promise<void> {
  let pathToCompiler = core.getInput('path-to-elm')
  if (!pathToCompiler) {
    pathToCompiler = await io.which('elm', true)
  }

  try {
    const githubRepo = process.env['GITHUB_REPOSITORY'] || ''
    const githubRef = process.env['GITHUB_REF'] || ''

    const releasesUrl = `https://package.elm-lang.org/packages/${githubRepo}/releases.json`

    const versionsResponse = await axios.get(
      `https://package.elm-lang.org/packages/${githubRepo}/releases.json`
    )
    const publishedVersions = Object.keys(versionsResponse.data)
    const currentElmJsonVersion = JSON.parse(tools.getFile('elm.json')).version
    core.debug(`currentElmJsonVersion ${currentElmJsonVersion}`)
    core.debug(`versionsResponse ${versionsResponse}`)

    if (githubRef !== 'refs/heads/master') {
      core.info(
        'This action only publishes from the master branch. Skipping checks.'
      )
    } else if (currentElmJsonVersion === '1.0.0') {
      core.info('The version in elm.json is at 1.0.0.')
      core.info(
        "This action only runs for packages that already have an initial version published. Please run elm publish manually to publish your initial version when you're ready!"
      )
    } else if (publishedVersions.length === 0) {
      core.info(
        `I couldn't find this package in the Elm package repository (see ${releasesUrl}).`
      )
      core.info(
        "This action only runs for packages that already have an initial version published. Please run elm publish manually to publish your initial version when you're ready!"
      )
    } else if (publishedVersions.includes(currentElmJsonVersion)) {
      core.info(
        `The current version in your elm.json has already been published: ${publishedUrl(
          githubRepo,
          currentElmJsonVersion
        )} .\n\nJust run \`elm bump\` when you're ready for a new release and then push your updated elm.json file. Then this action will publish it for you!`
      )
    } else {
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
      let status = await exec(pathToCompiler, ['publish'], {
        ...options,
        ignoreReturnCode: true
      })
      if (status === 0) {
        core.info(
          `Published! ${publishedUrl(githubRepo, currentElmJsonVersion)}`
        )
        // tag already existed -- no need to call publish
      } else if (/-- NO TAG --/.test(publishOutput)) {
        core.startGroup(`Creating git tag`)
        await createAnnotatedTag(octokit, currentElmJsonVersion)
        await exec(`git fetch --tags`)
        core.info(`Created git tag ${currentElmJsonVersion}`)
        core.endGroup()

        await exec(pathToCompiler, [`publish`])

        core.info(
          `Published! ${publishedUrl(githubRepo, currentElmJsonVersion)}`
        )
      } else {
        core.setFailed(publishOutput)
      }
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

function publishedUrl(repoWithOwner: string, version: string) {
  return `https://package.elm-lang.org/packages/${repoWithOwner}/${version}/`
}

run()
