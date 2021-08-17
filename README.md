<p align="center">
  <a href="https://github.com/actions/typescript-action/actions"><img alt="typescript-action status" src="https://github.com/actions/typescript-action/workflows/build-test/badge.svg"></a>
</p>

# CODEOWNERS, but without the blargh.
Inspired by https://www.fullstory.com/blog/taming-github-codeowners-with-bots/
Allows enforcement of CODEOWNERS, with two main differences:
1. Being in a CODEOWNERS team doesn't make you an assignee for every single pull request touching those files, so you can actually filter your PRs on assignee in a meaningful way.
2. If you yourself are in the CODEOWNERS group for a changed file, you can count towards the owner approval requirement (although if you have required reviews enabled for the repository, you'll still need an approval from someone else, they just don't need to be a CODEOWNER).
This bot reads CODEOWNERS files as normal, but interprets any Github teams listed as owners to include the union of the team members and the approvers listed in the corresponding yaml file (specified by the `approvers-dir` parameter).  If it detects that CODEOWNERS requirements have been satisfied according to its own interpretation, it adds an approval to the pull request.  If the bot is a member of every relevant CODEOWNERS group, this will satisfy Github that CODEOWNERS requirements are met and unblock the PR.
To enable the bot after setting up a workflow, add it to a CODEOWNERS file or team listed in a CODEOWNERS file.  It will then be triggered for any PRs where it has CODEOWNERS approval rights.

### Sample workflow file
```yaml
name: 'CODEOWNERS check'
on:
  pull_request_target: {types: [opened]}
  pull_request_review: {types: [submitted]}
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run Codeowners merge check
        uses: squarethecircle/robot-overlord@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          github-user: 'github-actions'
          org-name: TheMachine
          approvers-dir: '.github/approvers'
```
