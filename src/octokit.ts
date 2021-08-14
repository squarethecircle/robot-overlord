import { context, getOctokit } from '@actions/github';
import * as core from '@actions/core'
import { GitHub } from '@actions/github/lib/utils';
import { OctokitResponse } from '@octokit/types';

const token = core.getInput('github-token');
const octokit: InstanceType<typeof GitHub> = getOctokit(token);
type Fn = (...args: any) => any;
type extractOctokitResponse<T extends Fn> = ReturnType<T> extends Promise<OctokitResponse<infer X>> ? X : never;

const getRepoInfo = () => {
    return { owner: context.repo.owner, repo: context.repo.repo };
};

const getPullRequest = () => context.payload.pull_request;

export type PullRequest = extractOctokitResponse<typeof octokit.rest.pulls.get>;
export const getParamsForPR = (pr: PullRequest): {owner: string, repo: string, pull_number: number, issue_number: number} => {
    return {
        owner: pr.base.repo.owner.login,
        repo: pr.base.repo.name, 
        pull_number: pr.number,
        issue_number: pr.number,
    };
};

export const getActionUsername = async () => {
    const userData = await octokit.rest.users.getAuthenticated();
    return userData.data.login;
};

export {octokit, extractOctokitResponse, getRepoInfo, getPullRequest};