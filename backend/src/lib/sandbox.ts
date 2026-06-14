import type { Box } from "@upstash/box";

const loadBoxModule = async (): Promise<typeof import("@upstash/box")> => {
    return (0, eval)(`import("@upstash/box")`);
};

export const createBox = async (accessToken: string): Promise<Box> => {
    if (!accessToken) {
        throw new Error("Access token is required to create a box for the session.");
    }
    const { Box } = await loadBoxModule();

    return Box.create({
        runtime: "node",
        git: {
            token: accessToken,
            userName: "codepilot.ai",
            userEmail: "codepilot@codepilot.ai"
        }
    })
}

export const getBox = async (boxId: string): Promise<Box> => {
    if (!boxId) throw new Error("Box ID is required to retrieve the box for the session.");
    const { Box } = await loadBoxModule();
    return Box.get(boxId);
}