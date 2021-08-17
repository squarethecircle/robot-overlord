import * as core from '@actions/core'
import {onPullRequestUpdate} from './reviews'
import {PullRequest, PullRequestReview, IssueComment} from './types'
import {extractParamsFromPRLink, getPullRequest} from './utils'
import {context} from '@actions/github'

async function run(): Promise<void> {
  try {
    if (
      !['pull_request_review', 'pull_request_target', 'issue_comment'].includes(
        context.eventName
      )
    ) {
      core.error(
        'Invalid triggering event, must be one of [pull_request_review, pull_request_target, issue_comment]'
      )
      return
    }
    let pr: PullRequest = context.payload.pull_request as PullRequest
    let manuallyTriggered = false
    if (context.eventName === 'issue_comment') {
      const comment = context.payload.comment as IssueComment
      if (
        !context.payload.issue?.pull_request ||
        !comment.body ||
        !comment.body.includes('/codeowners')
      ) {
        core.info('No need to run, issue comment without trigger.')
        return
      }
      manuallyTriggered = true
      const prParams = extractParamsFromPRLink(
        context.payload.issue.pull_request.url
      )
      if (!prParams) {
        core.info(
          `Failed to parse PR link: ${context.payload.issue.pull_request.url}`
        )
        return
      }
      pr = await getPullRequest(prParams)
    }
    if (context.eventName === 'pull_request_review') {
      const review = context.payload.review as PullRequestReview
      if (review.state === 'commented') {
        core.info('No need to run, it was only a review comment.')
        return
      }
    }
    await onPullRequestUpdate(pr, manuallyTriggered)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
