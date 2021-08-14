import {getOctokit} from '@actions/github'
import * as core from '@actions/core'
import {GitHub} from '@actions/github/lib/utils'
import {OctokitResponse} from '@octokit/types'
import {trimUsername} from './owners'

const token = core.getInput('github-token')
const octokit: InstanceType<typeof GitHub> = getOctokit(token)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...args: any) => any
type extractOctokitResponse<T extends Fn> = ReturnType<T> extends Promise<
  OctokitResponse<infer X>
>
  ? X
  : never

export type PullRequest = extractOctokitResponse<typeof octokit.rest.pulls.get>
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

const getActionUsername = async (): Promise<string> => {
  return trimUsername('github-actions')
}

export {octokit, extractOctokitResponse, getActionUsername}
