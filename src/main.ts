import * as core from '@actions/core'
import {exec} from '@actions/exec'
import {default as axios} from 'axios'
import {Toolkit} from 'actions-toolkit'
import * as github from '@actions/github'
const tools = new Toolkit()

const gitHubToken = core.getInput('github-token')
const octokit = new github.GitHub(gitHubToken)

let publishOutput = ''

async function run(): Promise<void> {
  try {
    const githubRepo = process.env['GITHUB_REPOSITORY'] || ''

    core.debug(
      `https://package.elm-lang.org/packages/${githubRepo}/releases.json`
    )
    const versionsResponse = await axios.get(
      `https://package.elm-lang.org/packages/${githubRepo}/releases.json`
    )
    const elmVersion = JSON.parse(tools.getFile('elm.json')).version

    core.debug(`elmVersion ${elmVersion}`)
    core.debug(`versionsResponse ${versionsResponse}`)
    core.debug(`Version published ${versionsResponse.data[elmVersion]}`)
    if (Object.keys(versionsResponse.data).includes(elmVersion)) {
      core.debug(`This Elm version has already been published.`)
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
      core.debug('running command 1')
      let status = await exec('npx --no-install elm publish', undefined, {
        ...options,
        ignoreReturnCode: true
      })
      core.debug('finished command 1 with no error')
      if (status === 0) {
        core.debug('Already published successfully!')
        // tag already existed -- no need to call publish
      } else if (/-- NO TAG --/.test(publishOutput)) {
        core.debug('Found NO TAG - trying to create tag')
        await createAnnotatedTag(elmVersion)
        core.debug(
          'Tag create function succeeded. Checking working directory for changes.'
        )
        await exec('git checkout package-lock.json')
        await exec('git diff --exit-code')
        core.debug('No changes... publishing')
        await exec('npx --no-install elm publish')
        core.debug('Published successfully.')
      } else {
        core.setFailed(publishOutput)
      }
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

async function createAnnotatedTag(tag: string): Promise<void> {
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

  core.debug(`createTagResponse: ${createTagResponse}`)

  const createRefResponse = await octokit.git.createRef({
    owner: repoOwner,
    repo: repoName,
    ref: `refs/tags/${tag}`,
    sha: process.env['GITHUB_SHA']
  })

  core.debug(`createRefResponse: ${createRefResponse}`)
}

run()
