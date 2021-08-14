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
