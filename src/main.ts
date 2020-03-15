import * as core from '@actions/core'
import {exec} from '@actions/exec'
import {default as axios} from 'axios'
import {Toolkit} from 'actions-toolkit'
const tools = new Toolkit()

async function run(): Promise<void> {
  try {
    const githubRepo = process.env['GITHUB_REPOSITORY'] || ''
    // 'https://package.elm-lang.org/packages/dillonkearns/elm-pages/releases.json'

    // Make a request for a user with a given ID
    console.log(
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
      await exec('npx --no-install elm publish')
    }

    // core.startGroup('Generate elm package docs')
    // await exec('npx elm make --docs docs.json')
    // core.endGroup()
    // core.startGroup('elm-format --validate')
    // await exec('npx elm-format --validate')
    // core.endGroup()
    // core.startGroup('elm-test')
    // await exec('npx elm-test')
    // core.endGroup()
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
