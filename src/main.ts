import * as core from '@actions/core'
import {onPullRequestUpdate} from './reviews'
import {PullRequest, PullRequestReview} from './types'
import {context} from '@actions/github'

async function run(): Promise<void> {
  try {
    if (context.eventName === 'pull_request_review') {
      const review = context.payload.review as PullRequestReview
      if (review.state === 'commented') {
        core.info('No need to run, it was only a comment.')
        return
      }
    }
    const pr: PullRequest = context.payload.pull_request as PullRequest
    await onPullRequestUpdate(pr)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
