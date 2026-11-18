import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config } from "./config/env.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDocumentRoutes } from "./routes/documents.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerFrontdeskLocationRoutes } from "./routes/frontdesk-locations.js";
import { registerFrontdeskAppointmentRoutes } from "./routes/frontdesk-appointments.js";
import { registerFrontdeskQueueRoutes } from "./routes/frontdesk-queue.js";
import { registerSurveyRoutes } from "./routes/surveys.js";
export const buildApp = async () => {
    const app = Fastify({ logger: true });
    await app.register(cors, {
        origin: config.corsOrigin,
    });
    await app.register(multipart, {
        limits: {
            fileSize: 10 * 1024 * 1024,
            files: 1,
        },
    });
    app.setErrorHandler((error, _request, reply) => {
        if (error.code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
            return reply.code(400).send({
                error: "Request body is required. Send JSON with email and password.",
            });
        }
        if (error.code === "FST_ERR_CTP_INVALID_JSON_BODY") {
            return reply.code(400).send({
                error: "Request body must be valid JSON.",
            });
        }
        app.log.error(error);
        return reply.code(error.statusCode ?? 500).send({
            error: "Internal server error",
        });
    });
    await app.register(registerHealthRoutes);
    await app.register(registerAuthRoutes);
    await app.register(registerDashboardRoutes);
    await app.register(registerDocumentRoutes);
    await app.register(registerFrontdeskLocationRoutes);
    await app.register(registerFrontdeskAppointmentRoutes);
    await app.register(registerFrontdeskQueueRoutes);
    await app.register(registerSurveyRoutes);
    return app;
};
//# sourceMappingURL=app.js.map