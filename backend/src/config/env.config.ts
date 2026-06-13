import { getEnv } from "../utils/get-env";

export const envConfig = {
    NODE_ENV: getEnv("NODE_ENV", "development"),
    PORT: getEnv("PORT", "4000"),
    FRONTEND_ORIGIN: getEnv("FRONTEND_ORIGIN")
};

