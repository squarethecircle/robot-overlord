import {PullRequest} from './types'
import {octokit} from './octokit'
import * as core from '@actions/core'
import * as tg from 'type-guards'

export const extractParamsFromPRLink = (
  link: string
): {owner: string; repo: string; pull_number: number} | null => {
  const match = link.match(/repos\/(.+)\/(.+)\/pulls\/(\d+)/)
  if (match && match.length > 3) {
    return {
      owner: match[1],
      repo: match[2],
      pull_number: parseInt(match[3])
    }
  }
  return null
}

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

export const getPullRequest = async ({
  owner,
  repo,
  pull_number
}: {
  owner: string
  repo: string
  pull_number: number
}): Promise<PullRequest> => {
  const {data: pr} = await octokit.rest.pulls.get({owner, repo, pull_number})
  return pr
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
export const previousPRBotComments = async (
  pullRequest: PullRequest
): Promise<string[]> => {
  const comments = await octokit.paginate(
    octokit.rest.issues.listComments,
    getParamsForPR(pullRequest)
  )
  const actionUser = getActionUser()
  return comments
    .filter(c => c.user && trimUsername(c.user.login) === actionUser)
    .map(c => c.body)
    .filter(tg.isNotNullish)
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
export const parsePatternsFromReviewComment = (body: string): Set<string> => {
  const regex = new RegExp(`- (.+?): \\[`, 'g')
  const matches: string[] = []
  let match
  while ((match = regex.exec(body)) !== null) {
    matches.push(match[1])
  }
  return new Set(matches)
}

export const getActionUser = (): string => {
  return core.getInput('github-user')
}

export function symmetricDifference<T>(setA: Set<T>, setB: Set<T>): Set<T> {
  const _difference = new Set<T>(setA)
  for (const elem of setB) {
    if (_difference.has(elem)) {
      _difference.delete(elem)
    } else {
      _difference.add(elem)
    }
  }
  return _difference
}
