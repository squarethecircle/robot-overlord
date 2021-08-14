import * as core from '@actions/core'
import {onPullRequestUpdate} from './reviews'
import {context} from '@actions/github'

async function run(): Promise<void> {
  try {
    const pr = context.payload.pull_request
    await onPullRequestUpdate(pr)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
