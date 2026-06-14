import type { Box } from "@upstash/box";
import { tool } from "ai";
import z from "zod";

function splitLines(text: string): string[] {
    if (!text) return [];
    return text.split(/\r?\n/).filter(Boolean);
}

function escapeShellArg(value: string): string {
    return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function getDiffStats(diffText: string) {
    let additions = 0;
    let deletions = 0;

    for (const line of splitLines(diffText)) {
        if (line.startsWith("+++") || line.startsWith("---")) continue;
        if (line.startsWith("+")) additions += 1;
        if (line.startsWith("-")) deletions += 1;
    }
    return { additions, deletions };
}

export const codingTools = (
    box: Box,
    repoUrl: string | null,
    repoName: string,
    branchName: string | null,
    slugId: string,
    //defaultBranch: string
    writer?: { write: (payload: any) => void } | null,
) => {
    return {
        list: tool({
            description:
                "List files and directories at a given path relative to the current repo root. Use . for the root, or src/components for subfolders.",
            inputSchema: z.object({
                path: z
                    .string()
                    .default(".")
                    .describe(
                        "Path relative to the repo root e.g src/components, use . for root",
                    ),
            }),
            execute: async ({ path }) => {
                const files = await box.files.list(path);
                return { success: true, path, files };
            },
        }),

        grep: tool({
            description: "Search for text across files in the repository",
            inputSchema: z.object({
                query: z.string().describe("Text or pattern to search for"),
                path: z.string().default(".").describe("Directory to search in"),
            }),
            execute: async ({ query, path }) => {
                const result = await box.exec.command(
                    `grep -RIn --exclude-dir=.git --exclude-dir=node_modules ${escapeShellArg(query)} ${escapeShellArg(path)}`,
                );
                const lines = splitLines(result.result || "");
                return {
                    success: result.exitCode === 0,
                    query,
                    path,
                    lines,
                    matchCount: lines.length,
                    exitCode: result.exitCode,
                };
            },
        }),

        // READ TOOL
        read: tool({
            description: "Read the full content of a file",
            inputSchema: z.object({
                path: z
                    .string()
                    .describe("Path relative to repo root e.g. src/index.ts"),
            }),
            execute: async ({ path }) => {
                const content = await box.files.read(path);
                const lineCount = splitLines(content).length;
                return { success: true, path, content, lineCount };
            },
        }),

        // WRITE TOOL
        write: tool({
            description: "Create a new file with the given content",
            inputSchema: z.object({
                path: z
                    .string()
                    .describe("Path relative to repo root e.g. src/utils/helper.ts"),
                content: z.string().describe("Content to write into the file"),
            }),
            execute: async ({ path, content }) => {
                await box.files.write({ path, content });
                const lineCount = splitLines(content).length;
                return { success: true, path, lineCount };
            },
        }),

        // EDIT TOOL
        edit: tool({
            description: "Overwrite an existing file with new content",
            inputSchema: z.object({
                path: z
                    .string()
                    .describe("Path relative to repo root e.g. src/index.ts"),
                content: z.string().describe("New file content"),
            }),
            execute: async ({ path, content }) => {
                await box.files.write({ path, content });
                const diffResult = await box.git.exec({ args: ["diff", "--", path] });
                const patch = diffResult.output.trim();
                const { additions, deletions } = getDiffStats(patch);
                return { success: true, path, patch, additions, deletions };
            },
        }),

        //BASH TOOl
        bash: tool({
            description:
                "Run a shell command in the repository (npm install, build, test, delete files etc.)",
            inputSchema: z.object({
                command: z.string().describe("Shell command to run"),
            }),
            execute: async ({ command }) => {
                const result = await box.exec.command(command);
                const lines = splitLines(result.result || "");
                return {
                    success: result.exitCode === 0,
                    output: result.result,
                    lines,
                    exitCode: result.exitCode,
                };
            },
        }),

        //GIT STATUS TOOL
        git_status: tool({
            description:
                "Run git status to get the current changed/status files in the repository",
            inputSchema: z.object({}),
            execute: async () => {
                const statusResult = await box.git.status();
                return {
                    success: true,
                    message: "Git status retrieved",
                    status: statusResult,
                };
            },
        }),

        //COMMIT TOOL
        commit: tool({
            description:
                "Stage all changes and create a commit. Use a short conventional commit subject only, ideally under 72 characters, with no bullet list or body.",
            inputSchema: z.object({
                message: z
                    .string()
                    .describe("short Commit message e.g. feat: add new feature"),
            }),
            execute: async ({ message }) => {
                // Clean the message to remove any leading bullets or extra whitespace
                const cleanMessage =
                    String(message ?? "")
                        .split(/\r?\n/)
                        .map((line) => line.trim())
                        .find(Boolean)
                        ?.replace(/^[-*•\s]+/, "")
                        .replace(/\s+/g, " ")
                        .trim() || "chore: update files";

                const diffText = await box.git.diff();
                const { additions, deletions } = getDiffStats(diffText);

                const result = await box.git.commit({ message: cleanMessage });
                return {
                    success: true,
                    sha: result.sha,
                    shortSha: result.sha?.slice(0, 7),
                    message: cleanMessage,
                    branch: branchName,
                    timestamp: new Date().toISOString(),
                    additions,
                    deletions,
                };
            },
        }),

        // PUSH COMMIT
        git_push: tool({
            description: "Push committed changes to the remote branch",
            inputSchema: z.object({}),
            execute: async () => {
                if (!branchName) return "Branch not passed";
                await box.git.push({ branch: branchName });
                const repoWithoutGit = repoUrl?.replace(/\.git$/, "");
                const repoWithBranch = repoWithoutGit
                    ? `${repoWithoutGit}/tree/${branchName}`
                    : null;
                const commitResult = await box.git.exec({
                    args: ["log", "-1", "--pretty=%s"],
                });
                const commitTitle =
                    String(commitResult.output || "").trim() || `Update ${repoName}`;

                try {
                    await box.git.exec({
                        args: ["pull", "--rebase", "origin", branchName],
                    });
                } catch (e) {
                }

                const prBody = `Create a pull request for ${branchName} in ${repoName}.`;

                writer?.write({
                    type: "data-pr-ready",
                    data: {
                        slugId,
                        branch: branchName,
                        title: commitTitle,
                        body: prBody,
                    },
                    transient: true,
                });

                return {
                    success: true,
                    branch: branchName,
                    repoUrl,
                    compareUrl: repoWithBranch,
                    timestamp: new Date().toISOString(),
                };
            },
        }),

        // CREATE PR
        //  create_pr: tool({
        //   description: "Open a pull request on GitHub. Only call this if the user explicitly asks for a PR.",
        //   inputSchema: z.object({
        //     title: z.string().describe("Pull request title"),
        //     body: z.string().describe("Pull request description"),
        //   }),
        //   execute: async ({ title, body }) => {
        //     if (!branchName) return "Branch not passed"

        //     const pr = await box.git.createPR({
        //          title,
        //           body,
        //           base:defaultBranch,
        //     });
        //     return {
        //       success: true,
        //       url: pr.url,
        //       title,
        //       body,
        //       base: defaultBranch,
        //       branch: branchName,
        //       timestamp: new Date().toISOString(),
        //     };
        //   },
        // }),
    };
};