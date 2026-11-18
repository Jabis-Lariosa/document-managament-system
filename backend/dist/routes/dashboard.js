import { createClient } from "@supabase/supabase-js";
import { config } from "../config/env.js";
import { supabase } from "../lib/supabase.js";
const getBearerToken = (request) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
        return null;
    }
    const token = authorization.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
};
export const registerDashboardRoutes = async (app) => {
    app.get("/api/dashboard", async (request, reply) => {
        const accessToken = getBearerToken(request);
        if (!accessToken) {
            return reply.code(401).send({
                error: "Authorization bearer token is required",
            });
        }
        const { data: { user }, error: userError, } = await supabase.auth.getUser(accessToken);
        if (userError || !user) {
            return reply.code(401).send({
                error: "Invalid or expired access token",
            });
        }
        const userScopedSupabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
            global: {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        });
        const { data: profile, error: profileError } = await userScopedSupabase
            .from("profiles")
            .select("id, full_name, email, department, role, created_at, updated_at")
            .eq("id", user.id)
            .maybeSingle();
        if (profileError) {
            app.log.error(profileError);
            return reply.code(500).send({
                error: "Unable to load dashboard profile",
            });
        }
        if (!profile) {
            return reply.code(404).send({
                error: "Profile not found",
            });
        }
        return reply.send({
            user: {
                id: user.id,
                email: user.email,
            },
            profile,
        });
    });
};
//# sourceMappingURL=dashboard.js.map