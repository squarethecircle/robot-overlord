import {
  octokit,
  PullRequest,
  getParamsForPR,
  getActionUsername
} from './octokit'
import {
  Codeowner,
  CodeownerGroup,
  CodeownerUser,
  CodeownerRequirement
} from './types'
import {ownersForChangedFilesInPR, trimUsername} from './owners'
import * as tg from 'type-guards'
import * as core from '@actions/core'

type CodeownersStatus = {
  requirement: CodeownerRequirement
  satisfiedBy: string[]
}

enum CodeownersBotAction {
  APPROVE = 'APPROVE',
  COMMENT = 'COMMENT',
  REQUEST_CHANGES = 'REQUEST_CHANGES',
  NOTHING = 'NOTHING'
}

const currentPRApprovals = async (
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

const getCodeownerApprovalStatusForPR = async (
  pullRequest: PullRequest
): Promise<[CodeownersBotAction, CodeownersStatus[]]> => {
  const author = pullRequest.user?.login
  const [requiredApprovals, currentApprovals, actionUser] = await Promise.all([
    ownersForChangedFilesInPR(pullRequest),
    currentPRApprovals(pullRequest),
    getActionUsername()
  ])
  core.info(`current approvals: ${currentApprovals.join(', ')}`)
  if (author) {
    // count author towards owners requirement.
    currentApprovals.push(author)
  }
  const currentApprovalsTrimmed = currentApprovals.map(trimUsername)
  const alreadyApprovedByBot = currentApprovals.includes(actionUser)

  const ownerMatchedBy = (owner: Codeowner, candidates: string[]): string[] => {
    const validApprovers = new Set(
      'members' in owner ? owner.members : [owner.username]
    )
    return candidates.filter(c => validApprovers.has(c))
  }

  const statuses: CodeownersStatus[] = requiredApprovals.map(requirement => ({
    requirement,
    satisfiedBy: [
      ...new Set<string>(
        requirement.members
          .map(owner => ownerMatchedBy(owner, currentApprovalsTrimmed))
          .flat()
      )
    ]
  }))

  const hasAtLeastOneApproval = currentApprovals.length > 0
  const passesAllOwnersRequirements = statuses.every(
    s => !!s.satisfiedBy.length
  )

  let finalAction

  if (hasAtLeastOneApproval && passesAllOwnersRequirements) {
    finalAction = alreadyApprovedByBot
      ? CodeownersBotAction.NOTHING
      : CodeownersBotAction.APPROVE
  } else {
    finalAction = alreadyApprovedByBot
      ? CodeownersBotAction.REQUEST_CHANGES
      : CodeownersBotAction.COMMENT
  }

  return [finalAction, statuses]
}

const generateReviewComment = (
  statuses: CodeownersStatus[],
  pr: PullRequest
): string => {
  const usersToConsider = new Set(
    (pr.assignees || [])
      .concat([pr.user])
      .filter(tg.isNotNullish)
      .map(user => user.login)
  )
  const membersFormat = (members: string[]): string => {
    const filteredMembers = members.filter(m => usersToConsider.has(m))
    return filteredMembers.length
      ? `(${filteredMembers.join(', ')})`
      : '(no reviewers currently assigned)'
  }
  const groupFormat = (owner: CodeownerGroup): string =>
    `@${owner.groupName} ${membersFormat(owner.members)}`
  const userFormat = (owner: CodeownerUser): string => `@${owner.username}`
  const ownerFormat = (owner: Codeowner): string =>
    'members' in owner ? groupFormat(owner) : userFormat(owner)

  const remainingApprovalOwners = statuses
    .filter(s => s.satisfiedBy.length === 0)
    .map(s => s.requirement.members)
    .flat()
  const remainingApprovalOwnersByName = new Map<string, Codeowner>()
  remainingApprovalOwners.forEach(owner => {
    const name = 'username' in owner ? owner.username : owner.groupName
    remainingApprovalOwnersByName.set(name, owner)
  })

  const requirementFormat = (req: CodeownerRequirement): string =>
    `- ${req.pattern}: [${req.members.map(ownerFormat).join(' ')}]`
  const codeownerSummary = [
    `CODEOWNERS was triggered for the following patterns:`,
    ...statuses.map(s => requirementFormat(s.requirement)),
    ''
  ]

  const remainingApprovalSummary = remainingApprovalOwners.length
    ? [
        `This PR still requires approval by`,
        ...Array.from(remainingApprovalOwnersByName.values()).map(
          o => `-  ${ownerFormat(o)}`
        )
      ]
    : [`This PR has received all required CODEOWNERS approvals.`]
  return codeownerSummary.concat(remainingApprovalSummary).join('\n')
}

const postReviewComment = async (
  pullRequest: PullRequest,
  body: string
): Promise<void> => {
  await octokit.rest.issues.createComment({
    body,
    ...getParamsForPR(pullRequest)
  })
}
const postReviewApproval = async (
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

export const onPullRequestUpdate = async (
  pullRequest: PullRequest
): Promise<void> => {
  const [action, statuses] = await getCodeownerApprovalStatusForPR(pullRequest)
  if (action === CodeownersBotAction.NOTHING) {
    return
  }
  const statusBody = generateReviewComment(statuses, pullRequest)
  core.info(statusBody)
  if (action === CodeownersBotAction.COMMENT) {
    postReviewComment(pullRequest, statusBody)
  } else {
    postReviewApproval(pullRequest, action, statusBody)
  }
}
