import { buildApp } from "./app.js";
import { config } from "./config/env.js";
const start = async () => {
    const app = await buildApp();
    try {
        await app.listen({ port: config.port, host: config.host });
    }
    catch (error) {
        app.log.error(error);
        process.exit(1);
    }
};
start();
//# sourceMappingURL=server.js.map