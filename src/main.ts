import * as core from '@actions/core'
import {onPullRequestUpdate} from './reviews'
import {PullRequest} from './octokit';
import {context} from '@actions/github'

async function run(): Promise<void> {
  try {
    const pr: PullRequest = context.payload.pull_request as PullRequest
    await onPullRequestUpdate(pr)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
