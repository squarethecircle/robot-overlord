import {getOctokit} from '@actions/github'
import * as core from '@actions/core'
import {GitHub} from '@actions/github/lib/utils'

const token = core.getInput('github-token')
const octokit: InstanceType<typeof GitHub> = getOctokit(token)

export {octokit}
