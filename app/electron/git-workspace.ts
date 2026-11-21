export type GitFileChange = {
  path: string;
  status: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
  renamed: boolean;
};
export type ParsedGitStatus = {
  branch: string;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  changes: GitFileChange[];
};

/** Parses git status porcelain output. File paths are display data, never command input. */
export function parseGitStatus(output: string): ParsedGitStatus {
  const lines = output.split(/\r?\n/).filter(Boolean);
  const branchLine = lines.find(line => line.startsWith("## ")) || "## (unknown)";
  let branch = branchLine.slice(3).split("...")[0].trim();
  branch = branch.replace(/^No commits yet on /, "");
  if (branch === "HEAD (no branch)") branch = "(detached HEAD)";
  const aheadMatch = branchLine.match(/\[ahead (\d+)/);
  const behindMatch = branchLine.match(/\[behind (\d+)/);
  const changes: GitFileChange[] = [];

  for (const line of lines) {
    if (line.startsWith("## ") || line.length < 3) continue;
    const status = line.slice(0, 2);
    const filePath = line.slice(3).trim();
    if (!filePath) continue;
    const untracked = status === "??";
    const conflicted = /U/.test(status) || status === "AA" || status === "DD";
    changes.push({
      path: filePath,
      status,
      staged: !untracked && status[0] !== " ",
      unstaged: !untracked && status[1] !== " ",
      untracked,
      conflicted,
      renamed: /R|C/.test(status),
    });
  }
  return {
    branch,
    ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
    behind: behindMatch ? Number(behindMatch[1]) : 0,
    staged: changes.filter(x => x.staged).length,
    unstaged: changes.filter(x => x.unstaged).length,
    untracked: changes.filter(x => x.untracked).length,
    conflicted: changes.filter(x => x.conflicted).length,
    changes,
  };
}

export function boundGitDiff(output: string, maxCharacters = 60_000): { text: string; truncated: boolean } {
  const limit = Math.max(1_000, Math.min(100_000, Math.floor(maxCharacters) || 60_000));
  if (output.length <= limit) return { text: output, truncated: false };
  const marker = "\n\n[Diff preview truncated at the configured size limit.]";
  return { text: output.slice(0, Math.max(0, limit - marker.length)) + marker, truncated: true };
}
