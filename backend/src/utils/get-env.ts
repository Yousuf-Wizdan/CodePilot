import "dotenv/config"

export function getEnv(key: string, defaultValues?: string): string {
    const value = process.env[key] ?? defaultValues;
    if (value == undefined) {
        throw new Error(`Missing Environment Variables: ${key}`)
    }
    return value;
}