import {octokit} from './octokit'
import {OctokitResponse} from '@octokit/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...args: any) => any
type extractOctokitResponse<T extends Fn> = ReturnType<T> extends Promise<
  OctokitResponse<infer X>
>
  ? X
  : never

export type PullRequest = extractOctokitResponse<typeof octokit.rest.pulls.get>
export type PullRequestReview = extractOctokitResponse<
  typeof octokit.rest.pulls.getReview
>
export type IssueComment = extractOctokitResponse<
  typeof octokit.rest.issues.getComment
>

export type CodeownerGroup = {
  groupName: string
  members: string[]
}

export type CodeownerUser = {
  username: string
}

export type Codeowner = CodeownerGroup | CodeownerUser

export type CodeownerRequirement = {
  pattern: string
  matchedFiles: string[]
  members: Codeowner[]
}

export type CodeownersStatus = {
  requirement: CodeownerRequirement
  satisfiedBy: string[]
}

export enum CodeownersBotAction {
  APPROVE = 'APPROVE',
  COMMENT = 'COMMENT',
  REQUEST_CHANGES = 'REQUEST_CHANGES',
  NOTHING = 'NOTHING'
}
