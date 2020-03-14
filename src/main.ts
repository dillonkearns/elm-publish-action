import * as core from '@actions/core'
import {exec} from '@actions/exec'

async function run(): Promise<void> {
  try {
    core.startGroup('Generate elm package docs')
    await exec('npx elm make --docs docs.json')
    core.endGroup()
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
