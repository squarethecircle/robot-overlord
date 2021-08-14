import {PullRequest} from './types'
import {octokit} from './octokit'
import * as core from '@actions/core'

export const getParamsForPR = (
  pr: PullRequest
): {owner: string; repo: string; pull_number: number; issue_number: number} => {
  return {
    owner: pr.base.repo.owner.login,
    repo: pr.base.repo.name,
    pull_number: pr.number,
    issue_number: pr.number
  }
}

export const postReviewComment = async (
  pullRequest: PullRequest,
  body: string
): Promise<void> => {
  await octokit.rest.issues.createComment({
    body,
    ...getParamsForPR(pullRequest)
  })
}

export const postReviewApproval = async (
  pullRequest: PullRequest,
  action: 'APPROVE' | 'REQUEST_CHANGES',
  body: string
): Promise<void> => {
  await octokit.rest.pulls.createReview({
    body,
    event: action,
    ...getParamsForPR(pullRequest)
  })
}

export const currentPRApprovals = async (
  pullRequest: PullRequest
): Promise<string[]> => {
  const reviews = await octokit.paginate(
    octokit.rest.pulls.listReviews,
    getParamsForPR(pullRequest)
  )
  if (!reviews) {
    return []
  }
  const approvedBy = new Set<string>()

  reviews.forEach(review => {
    if (!review.user) {
      return
    }
    if (review.state === 'APPROVED') {
      approvedBy.add(review.user.login)
    }
    if (review.state === 'DISMISSED' || review.state === 'CHANGES_REQUESTED') {
      approvedBy.delete(review.user.login)
    }
  })
  return Array.from(approvedBy)
}

export function mapWithDefault<K, V>(
  map: Map<K, V>,
  key: K,
  options: {updater?: (arg: V) => V; defaultValue: V}
): V {
  const value = map.get(key)
  if (value) {
    if (options.updater) {
      map.set(key, options.updater(value))
    }
    return value
  }
  map.set(key, options.defaultValue)
  return options.defaultValue
}

export const trimUsername = (original: string): string => {
  const match = original.match(/[\w-/]+/)
  return match ? match[0] : original
}

export const getPRChangedFilenames = async (
  pr: PullRequest
): Promise<string[]> => {
  const files = await octokit.paginate(
    octokit.rest.pulls.listFiles,
    getParamsForPR(pr)
  )
  return files.map(f => f.filename)
}

export const getActionUser = (): string => {
  return core.getInput('github-user')
}
