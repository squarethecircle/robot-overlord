import {octokit} from './octokit'
import {
  Codeowner,
  CodeownersBotAction,
  CodeownerGroup,
  CodeownerRequirement,
  CodeownersStatus,
  CodeownerUser,
  PullRequest
} from './types'
import {ownersForChangedFilesInPR} from './owners'
import * as tg from 'type-guards'
import * as core from '@actions/core'
import {
  currentPRApprovals,
  getActionUser,
  parsePatternsFromReviewComment,
  postReviewComment,
  postReviewApproval,
  previousPRBotComments,
  symmetricDifference,
  trimUsername
} from './utils'

const getCodeownerApprovalStatusForPR = async (
  pullRequest: PullRequest
): Promise<[CodeownersBotAction, CodeownersStatus[]]> => {
  const author = pullRequest.user?.login
  const actionUser = getActionUser()
  const [
    requiredApprovals,
    currentApprovalLogins,
    previousComments
  ] = await Promise.all([
    ownersForChangedFilesInPR(pullRequest),
    currentPRApprovals(pullRequest),
    previousPRBotComments(pullRequest)
  ])
  const hasAtLeastOneApproval = currentApprovalLogins.length > 0
  if (author) {
    // count author towards owners requirement.
    currentApprovalLogins.push(author)
  }
  const currentApprovals = currentApprovalLogins.map(trimUsername)
  core.info(`current approvals: ${currentApprovals.join(', ')}`)

  const alreadyApprovedByBot = currentApprovals.includes(actionUser)
  const ownerMatchedBy = (owner: Codeowner, candidates: string[]): string[] => {
    const validApprovers = new Set(
      'members' in owner ? owner.members : [owner.username]
    )
    return candidates.filter(c => validApprovers.has(c))
  }

  const requirementSatisfiedBy = (
    requirement: CodeownerRequirement,
    candidates: string[]
  ): string[] => {
    return [
      ...new Set<string>(
        requirement.members
          .map(owner => ownerMatchedBy(owner, candidates))
          .flat()
      )
    ]
  }

  const statuses: CodeownersStatus[] = requiredApprovals.map(requirement => ({
    requirement,
    satisfiedBy: requirementSatisfiedBy(requirement, currentApprovals)
  }))

  const passesAllOwnersRequirements = statuses.every(
    s => !!s.satisfiedBy.length
  )

  const botCanSatisfyRequirement = requiredApprovals.some(r =>
    requirementSatisfiedBy(r, [actionUser])
  )

  const previousPatterns = previousComments.length
    ? parsePatternsFromReviewComment(
        previousComments[previousComments.length - 1]
      )
    : new Set()

  core.info(`Previous patterns: [${Array.from(previousPatterns).join(', ')}]`)

  const currentPatterns: Set<string> = new Set()
  for (const requirement of requiredApprovals) {
    currentPatterns.add(requirement.pattern)
  }
  core.info(`Current patterns: [${Array.from(currentPatterns).join(', ')}]`)

  const patternsChanged = !!symmetricDifference(
    previousPatterns,
    currentPatterns
  ).size

  let finalAction

  if (!botCanSatisfyRequirement || !patternsChanged) {
    finalAction = CodeownersBotAction.NOTHING
  } else {
    if (hasAtLeastOneApproval && passesAllOwnersRequirements) {
      finalAction = alreadyApprovedByBot
        ? CodeownersBotAction.NOTHING
        : CodeownersBotAction.APPROVE
    } else {
      finalAction = alreadyApprovedByBot
        ? CodeownersBotAction.REQUEST_CHANGES
        : CodeownersBotAction.COMMENT
    }
  }

  return [finalAction, statuses]
}

const generateReviewComment = (
  statuses: CodeownersStatus[],
  pr: PullRequest
): string => {
  const usersToConsider = new Set(
    (pr.assignees || [])
      .concat(pr.requested_reviewers || [])
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

export const onPullRequestUpdate = async (
  pullRequest: PullRequest,
  manuallyTriggered: boolean
): Promise<void> => {
  const [action, statuses] = await getCodeownerApprovalStatusForPR(pullRequest)
  if (action === CodeownersBotAction.NOTHING && !manuallyTriggered) {
    return
  }
  const statusBody = generateReviewComment(statuses, pullRequest)
  core.info(statusBody)
  if (
    action === CodeownersBotAction.COMMENT ||
    action === CodeownersBotAction.NOTHING
  ) {
    postReviewComment(pullRequest, statusBody)
  } else {
    postReviewApproval(pullRequest, action, statusBody)
  }
}
