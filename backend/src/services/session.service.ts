import { Response } from "express";
import SessionModel from "../models/session.model";
import type { Box } from "@upstash/box";
import { SessionDocument } from "../models/session.model";
import { NotFoundException, BadRequestException } from "../utils/app-error";
import {
    convertToModelMessages,
    createUIMessageStream,
    generateId,
    generateText,
    pipeUIMessageStreamToResponse,
    stepCountIs,
    streamText,
    smoothStream,
    UIMessage,
} from "ai";
import { google } from "@ai-sdk/google";
import { mistral } from "@ai-sdk/mistral";
import { webSearch } from "@exalabs/ai-sdk";
import {
    createMessageService,
    getSessionMessagesService,
    sanitizeUIMessages,
    upsertSessionMessagesService,
} from "./message.service";
import { getGithubAccessToken } from "./github.service";
import { createBox, getBox } from "../lib/sandbox";
import { getCodeSystemPrompt } from "../lib/ai/prompt";
import { codingTools } from "../lib/ai/tools/github-tools";

export const getUserSessionService = async (
    userId: string,
    filters: {
        search?: string;
        pageSize: number;
        pageNumber: number;
    },
) => {
    const query: Record<string, any> = { userId };

    if (filters.search && filters.search !== undefined) {
        query.$or = [
            { title: { $regex: filters.search, $options: "i" } },
            { repoName: { $regex: filters.search, $options: "i" } },
        ];
    }

    const pagination = {
        pageSize: filters.pageSize,
        pageNumber: filters.pageNumber,
    };

    const skip = (pagination.pageNumber - 1) * pagination.pageSize;

    const [sessions, totalCount] = await Promise.all([
        SessionModel.find(query).sort({ createdAt: -1 }).lean(),
        SessionModel.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / pagination.pageSize);
    return {
        sessions,
        pagination: {
            pageSize: pagination.pageSize,
            pageNumber: pagination.pageNumber,
            totalCount,
            totalPages,
            skip,
        },
    };
};

export const getSessionBySlugIdService = async (
    userId: string,
    slugId: string,
) => {
    const session = await SessionModel.findOne({ userId, slugId }).lean();

    if (!session) {
        throw new NotFoundException("Session not found");
    }
    const { messages } = await getSessionMessagesService(session._id.toString());
    return { session, messages };
};

const createOrGetSession = async (
    userId: string,
    slugId: string,
    repoUrl: string,
    defaultBranch: string = "main",
) => {
    if (!userId) throw new BadRequestException("Unable to find user");
    if (!slugId) throw new BadRequestException("slugId is required");
    if (!repoUrl) throw new BadRequestException("repoUrl is required");

    let session = await SessionModel.findOne({ userId, slugId });
    let box = null;
    const accessToken = await getGithubAccessToken(userId);

    if (!session) {
        const repoName =
            repoUrl.split("/").slice(-1)[0].replace(".git", "") || "repo";
        box = await createBox(accessToken);
        session = await SessionModel.create({
            userId,
            slugId,
            repoUrl,
            repoName,
            defaultBranch,
            boxId: box.id,
        });
    } else if (session.boxId) {
        box = await getBox(session.boxId);
    } else {
        box = await createBox(accessToken);
        await SessionModel.findByIdAndUpdate(session._id, { boxId: box.id });
        session.boxId = box.id;
    }
    return { session, box };
};

const generateSessionTitle = async (prompt: string | null) => {
    if (!prompt) return "Untitled Session";
    try {
        const result = await generateText({
            model: google("gemini-3.5-flash"),
            system: `
        You are an AI assistant that generates very short session titles for coding tasks.
        - Keep it under 5 words.
        - Capitalize words appropriately.
        - Be specific and descriptive.
        - Do not include special characters.
        - Return ONLY the title, nothing else.
      `,
            prompt: `Generate a concise title for this coding session: "${prompt}"`,
        });
        return result.text.trim() || "Untitled Session";
    } catch (error) {
        return "Untitled Session";
    }
};

const generateBranchName = async (prompt: string | null) => {
    const uniqueId = Math.random().toString(36).slice(2, 8);
    if (!prompt) return `codepilot/changes-${uniqueId}`;
    try {
        const result = await generateText({
            model: google("gemini-3.5-flash"),
            system: `
        You are a git branch naming expert.
        Generate a concise, descriptive branch suffix based on the task.
        
        Rules:
        - Generate ONLY the suffix part (not the full branch name)
        - Use kebab-case (lowercase, hyphen-separated)
        - Max 30 characters
        - Be descriptive but concise
        - No special characters except hyphens
        
        Examples:
        - "add login form with email" → "login-form"
        - "fix bug in navigation" → "nav-bug-fix"
        - "refactor user service" → "user-service-refactor"
        - "update website theme styles" → "theme-styles"
        
        Return ONLY the suffix, nothing else.
      `,
            prompt: `Generate a branch suffix for this task: "${prompt}"`,
        });

        const suffix =
            result.text
                .trim()
                .replace(/[^a-z0-9-]/g, "")
                .substring(0, 30) || "changes";
        return `codepilot/${suffix}-${uniqueId}`;
    } catch (error) {
        return `codepilot/changes-${uniqueId}`;
    }
};

const ensureSessionWorkspaceReady = async (
    session: SessionDocument,
    box: Box,
    branchName: string,
    repoName: string,
    defaultBranch?: string,
) => {
    if (!session.repoUrl) {
        throw new BadRequestException("Session is missing repository URL");
    }

    const repoExist = await box.exec.command(`test -d ${repoName}/.git`);

    if (repoExist.exitCode !== 0) {
        await box.git.clone({
            repo: session.repoUrl,
            branch: defaultBranch,
        });
    }

    await box.cd(repoName);

    if (branchName && !session.repoInitializedAt) {
        try {
            await box.git.checkout({ branch: branchName });
        } catch (error) {
            await box.git.exec({ args: ["checkout", "-b", branchName] });
        }
    }

    if (!session.repoInitializedAt) {
        await SessionModel.findByIdAndUpdate(session._id, {
            repoInitializedAt: new Date(),
        });
        session.repoInitializedAt = new Date();
    }
};

export const sessionChatService = async (
    userId: string,
    slugId: string,
    repoUrl: string,
    defaultBranch: string | undefined,
    messages: UIMessage[],
    abortSignal: AbortSignal,
    res: Response,
) => {
    let { session, box } = await createOrGetSession(
        userId,
        slugId,
        repoUrl,
        defaultBranch,
    );

    const lastMessage = messages[messages.length - 1];
    const userPrompt =
        lastMessage?.parts.find((part) => part.type === "text")?.text || null;

    if (!session.title) {
        const title = await generateSessionTitle(userPrompt);
        await SessionModel.findByIdAndUpdate(
            session._id,
            {
                title,
            },
            { new: true },
        );
        session.title = title;
    }

    let branchName: string | null = session.branchName;
    if (!branchName) {
        branchName = await generateBranchName(userPrompt);
        await SessionModel.findByIdAndUpdate(
            session._id,
            {
                branchName,
            },
            { new: true },
        );
        session.branchName = branchName;
    }

    await createMessageService(session._id.toString(), {
        id: lastMessage.id || generateId(),
        role: lastMessage.role,
        parts: lastMessage.parts,
    });

    const { messages: dbMessages } = await getSessionMessagesService(
        session._id.toString(),
    );

    const historyMessages = sanitizeUIMessages(dbMessages.slice(-10));

    const uiStream = createUIMessageStream({
        generateId: () => generateId(),
        originalMessages: dbMessages,
        onFinish: async ({ messages }) => {
            await upsertSessionMessagesService(session._id.toString(), messages);
        },
        execute: async ({ writer }) => {
            try {
                // emit session title
                writer.write({
                    type: "data-session-title",
                    data: { title: session.title },
                    transient: true,
                });

                writer.write({
                    type: "data-repo-info",
                    data: {
                        repoName: session.repoName,
                        repoUrl: session.repoUrl,
                        branchName: branchName,
                    },
                    transient: true,
                });

                const repoName = session.repoName;
                const defaultBranch = session.defaultBranch;

                await ensureSessionWorkspaceReady(
                    session,
                    box,
                    branchName,
                    repoName,
                    defaultBranch,
                );

                const SYSTEM_PROMPT = getCodeSystemPrompt(session.repoName);

                const tools = codingTools(
                    box,
                    session.repoUrl,
                    repoName,
                    branchName,
                    session.slugId,
                    //defaultBranch,
                    writer,
                );

                const activeTools = {
                    // web
                    web_search: webSearch(),
                    ...tools,
                };
                const modelMesages = await convertToModelMessages(historyMessages, {
                    tools: activeTools,
                    ignoreIncompleteToolCalls: true,
                    convertDataPart: () => undefined,
                });

                const result = streamText({
                    // model: "anthropic/claude-sonnet-4.5",
                    model: mistral("mistral-large-latest"),
                    system: SYSTEM_PROMPT,
                    messages: modelMesages,
                    tools: activeTools,
                    experimental_transform: smoothStream(),
                    providerOptions: {
                        // anthropic: {
                        //     thinking: { type: "enabled", budgetTokens: 10000 },
                        // },
                        mistral: {
                            thinking: { type: "enabled", budgetTokens: 10000 }
                        },
                        // google: {
                        //     thinking: { type: "enabled", budgetTokens: 10000 }
                        // }
                    },
                    stopWhen: stepCountIs(20),
                    abortSignal,
                });

                writer.merge(result.toUIMessageStream());
            } catch (error) {
                console.log(error);
                writer.write({
                    type: "data-error",
                    data: { message: "Something went wrong" },
                });
            }
        },
        onError: (error) => `Stream error`,
    });

    pipeUIMessageStreamToResponse({
        response: res,
        stream: uiStream,
        status: 200,
    });
};

export const createPullRequestService = async (
    userId: string,
    slugId: string,
    title?: string,
    body?: string,
) => {
    const session = await SessionModel.findOne({ userId, slugId });
    if (!session) throw new NotFoundException("Session not found");
    if (!session.boxId) throw new BadRequestException("Sandbox not available");
    if (!session.repoName)
        throw new BadRequestException("Respository not available");
    if (!session.branchName)
        throw new BadRequestException("Branch not available");

    const box = await getBox(session.boxId);
    await box.cd(session.repoName);
    try {
        await box.git.checkout({ branch: session.branchName });
    } catch (error) {
        await box.git.exec({ args: ["checkout", "-b", session.branchName] });
    }
    // --- Debug block ---
    // console.log("status:", await box.git.status());
    // console.log("current branch:", await box.git.exec({ args: ["branch", "--show-current"] }));
    // console.log("remote:", await box.git.exec({ args: ["remote", "-v"] }));
    // console.log("log:", await box.git.exec({ args: ["log", "--oneline", "-5"] }));
    // console.log("remote head branch:", await box.git.exec({ args: ["ls-remote", "origin", session.branchName] }));
    // console.log("remote base branch:", await box.git.exec({ args: ["ls-remote", "origin", session.defaultBranch] }));
    // -------------------

    // await box.git.push({ branch: session.branchName });

    let pr = { url: "" }
    try {
        pr = await box.git.createPR({
            title: title || `Update ${session.repoName}`,
            body: body || `Create a pull request for ${session.repoName}`,
            base: session.defaultBranch,
        });
    } catch (e: any) {
        console.log(e.statusCode, e.message, e.body);
        throw e;
    }

    return {
        success: true,
        url: pr.url,
    };
};