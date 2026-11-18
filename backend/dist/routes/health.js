export const registerHealthRoutes = async (app) => {
    app.get("/api/health", async () => ({
        status: "ok",
        message: "Fastify API is running",
    }));
};
//# sourceMappingURL=health.js.map