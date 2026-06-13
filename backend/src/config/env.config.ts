import { getEnv } from "../utils/get-env";

export const envConfig = {
    NODE_ENV: getEnv("NODE_ENV", "development"),
    PORT: getEnv("PORT", "4000"),
    FRONTEND_ORIGIN: getEnv("FRONTEND_ORIGIN"),
    MONGO_URI: getEnv("MONGO_URI"),
    JWT_SECRET: getEnv("JWT_SECRET"),
    JWT_EXPIRES_IN: getEnv("JWT_EXPIRES_IN", "7d")
};

