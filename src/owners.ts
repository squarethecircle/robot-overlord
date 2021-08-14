import {octokit, PullRequest, getParamsForPR} from './octokit';
import { Codeowner, CodeownerGroup, CodeownerUser, CodeownerRequirement } from './types';
import * as codeowners from 'codeowners-utils';
import * as core from '@actions/core';
import * as fs from 'fs';
import path from 'path/posix';
import YAML from 'yaml';
import * as tg from 'type-guards';

function mapWithDefault<K, V>(map: Map<K, V>, key: K, options: { updater?: ((arg: V) => V), defaultValue: V}): V {
    let value = map.get(key);
    if (value) {
        if (options.updater) {
            map.set(key, options.updater(value));
        }
        return value;
    }
    map.set(key, options.defaultValue);
    return options.defaultValue;
};

const getPRChangedFilenames = async (pr: PullRequest) : Promise<string[]> => {
    const files = await octokit.paginate(octokit.rest.pulls.listFiles, getParamsForPR(pr));
    return files.map(f => f.filename);
};

const approverGroupsFromConfigDir = (): CodeownerGroup[] => {
    const orgName = core.getInput("org-name");
    const approversDir = core.getInput("approvers-dir");
    if (!orgName || !approversDir) {
        core.warning('No approver group dir configured.');
        return [];
    }
    const members: CodeownerGroup[] = [];
    fs.readdirSync(approversDir).forEach(filename => {
        const matches = filename.match(/(.+)\.yaml/);
        if (!matches) return;
        const groupName = `@${orgName}/matches[1]`;
        const data = fs.readFileSync(path.join(approversDir, filename), 'utf-8');
        try {
            const parsedConfig = YAML.parse(data);
            if (parsedConfig.approvers) {
                members.push({ groupName, members: parsedConfig.approvers});
            }
        } catch (err) {
            core.error(`Reading approver file ${filename} failed, continuing on.`);
        }
    });
    return members;
}

const findGithubGroupMembers = async (groupName: string): Promise<CodeownerGroup> => {
    const [org, team_slug] = groupName.split('/');
    const group: CodeownerGroup  = { groupName, members: []};
    const groupMembers = await octokit.paginate(octokit.rest.teams.listMembersInOrg, {org, team_slug});
    if (groupMembers) {
        group.members = groupMembers.filter(tg.isNotNullish).map(memberData => memberData.login);
    }
    return group;
};

const resolveGroupMembership = async (groups: CodeownerGroup[]): Promise<void> => {
    const mergeGroups = (groupName: string, a: CodeownerGroup, b: CodeownerGroup): CodeownerGroup => {
        const members = new Set<string>();
        a.members.forEach(m => members.add(m));
        b.members.forEach(m => members.add(m));
        return {groupName, members: Array.from(members)};
    }
    const groupsByName = new Map<string, CodeownerGroup[]>();
    const configGroups = approverGroupsFromConfigDir();
    const githubGroups = await Promise.all(groups.map(g => findGithubGroupMembers(g.groupName)));
    configGroups.concat(githubGroups).forEach(group => {
        mapWithDefault(groupsByName, group.groupName, {defaultValue: [group], updater: l => {
            l.push(group); 
            return l;
        }});
    });
    const finalGroupsByName: Map<string, CodeownerGroup> = new Map();
    groupsByName.forEach((groupList, groupName) => {
        finalGroupsByName.set(groupName, groupList.reduce((prev, cur) => mergeGroups(groupName, prev, cur)));
    });
    // fill in members for our original groups
    groups.forEach(group => {
        group.members = finalGroupsByName.get(group.groupName)?.members || [];
    });
};

const loadCodeownersFile = async (): Promise<codeowners.CodeOwnersEntry[]> => {
    const cwd = core.getInput('cwd') || process.cwd()
    const owners = await codeowners.loadOwners(cwd);
    if (!owners) {
        throw new Error('Could not load CODEOWNERS file.');
    }
    return owners;
};

export const ownersForChangedFilesInPR = async (pullRequest: PullRequest): Promise<CodeownerRequirement[]> => {
    const changedFiles = await getPRChangedFilenames(pullRequest);
    const codeownersEntries = await loadCodeownersFile();
    const ownerGroupsByName = new Map<string, CodeownerGroup>();
    const ownerUsersByName = new Map<string, CodeownerUser>();
    const ownerRequirements = new Map<string, CodeownerRequirement>();
    for (const filename of changedFiles) {
      const matchingEntry = codeowners.matchFile(filename, codeownersEntries);
      if (!matchingEntry) {
        continue;
      }
      let requirement: CodeownerRequirement | undefined = ownerRequirements.get(matchingEntry.pattern);
      if (requirement) {
        requirement.matchedFiles.push(filename);
      } else {
          const members: Codeowner[] = matchingEntry.owners.map(o => {
            if (o.includes('/')) {
                return mapWithDefault(ownerGroupsByName, o, {defaultValue: {groupName: o, members: []}}); 
            }
            return mapWithDefault(ownerUsersByName, o, {defaultValue: {username: o}}); 
          });  
          requirement = {pattern: matchingEntry.pattern, matchedFiles: [filename], members: members};
          ownerRequirements.set(matchingEntry.pattern, requirement);
      }
    }
    await resolveGroupMembership(Array.from(ownerGroupsByName.values()));
    return Array.from(ownerRequirements.values());
};