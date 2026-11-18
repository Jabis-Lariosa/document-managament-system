import "dotenv/config";
const requiredEnv = (name) => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} must be set in .env`);
    }
    return value;
};
export const config = {
    port: Number(process.env.PORT ?? 3001),
    host: process.env.HOST ?? "0.0.0.0",
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    supabaseUrl: requiredEnv("SUPABASE_URL"),
    supabaseAnonKey: requiredEnv("SUPABASE_ANON_KEY"),
};
//# sourceMappingURL=env.js.map