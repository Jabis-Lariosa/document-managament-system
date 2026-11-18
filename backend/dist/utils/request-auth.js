import { createClient } from "@supabase/supabase-js";
import { config } from "../config/env.js";
import { supabase } from "../lib/supabase.js";
export const getBearerToken = (request) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
        return null;
    }
    const token = authorization.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
};
export const authenticateRequest = async (request, reply) => {
    const accessToken = getBearerToken(request);
    if (!accessToken) {
        reply.code(401).send({ error: "Authorization bearer token is required" });
        return null;
    }
    const { data: { user }, error, } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
        reply.code(401).send({ error: "Invalid or expired access token" });
        return null;
    }
    return {
        user,
        client: createClient(config.supabaseUrl, config.supabaseAnonKey, {
            global: {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        }),
    };
};
//# sourceMappingURL=request-auth.js.map