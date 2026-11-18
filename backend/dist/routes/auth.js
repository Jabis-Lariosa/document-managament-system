import { supabase } from "../lib/supabase.js";
import { authenticateRequest } from "../utils/request-auth.js";
import { isDepartment, isSigninBody, isSignupBody, } from "../utils/validation.js";
export const registerAuthRoutes = async (app) => {
    app.post("/api/auth/signup", async (request, reply) => {
        const body = request.body;
        if (!isSignupBody(body)) {
            return reply.code(400).send({
                error: "Full name, email, department, and password are required",
            });
        }
        const { fullName, email, department, password } = body;
        if (fullName.trim().length < 2 ||
            !email.includes("@") ||
            !isDepartment(department) ||
            password.length < 8 ||
            password.length > 72) {
            return reply.code(400).send({ error: "Invalid sign-up details" });
        }
        const { data, error } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password,
            options: {
                data: {
                    full_name: fullName.trim(),
                    department,
                },
            },
        });
        if (error) {
            if (error.message.toLowerCase().includes("already registered")) {
                return reply.code(409).send({ error: "An account with that email already exists" });
            }
            return reply.code(400).send({ error: error.message });
        }
        return reply.code(201).send({
            user: data.user,
            session: data.session,
            message: data.session
                ? "Account created successfully"
                : "Account created. Check your email to confirm your account.",
        });
    });
    app.post("/api/auth/signin", async (request, reply) => {
        const body = request.body;
        if (!isSigninBody(body)) {
            return reply.code(400).send({
                error: "Email and password are required as JSON strings",
            });
        }
        const { email, password } = body;
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail.includes("@") || password.length === 0) {
            return reply.code(400).send({
                error: "A valid email and password are required",
            });
        }
        const { data, error } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
        });
        if (error) {
            return reply.code(401).send({ error: "Invalid email or password" });
        }
        return reply.send({
            user: data.user,
            session: data.session,
        });
    });
    app.post("/api/auth/signout", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const { error } = await authenticated.client.auth.signOut();
        if (error)
            return reply.code(400).send({ error: error.message });
        return reply.code(204).send();
    });
    app.get("/api/auth/me", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const { data: profile, error } = await authenticated.client
            .from("profiles")
            .select("id, full_name, email, department, role, created_at, updated_at")
            .eq("id", authenticated.user.id)
            .maybeSingle();
        if (error)
            return reply.code(500).send({ error: "Unable to load profile" });
        return reply.send({ user: authenticated.user, profile });
    });
    app.post("/api/auth/forgot-password", async (request, reply) => {
        const email = request.body?.email?.trim().toLowerCase();
        if (!email || !email.includes("@"))
            return reply.code(400).send({ error: "A valid email is required" });
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error)
            return reply.code(400).send({ error: error.message });
        return reply.send({ message: "If the account exists, a reset email has been sent" });
    });
    app.post("/api/auth/reset-password", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const password = request.body?.password;
        if (!password || password.length < 8 || password.length > 72) {
            return reply.code(400).send({ error: "Password must be between 8 and 72 characters" });
        }
        const { data, error } = await authenticated.client.auth.updateUser({ password });
        if (error)
            return reply.code(400).send({ error: error.message });
        return reply.send({ user: data.user });
    });
    app.patch("/api/auth/profile", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const updates = {};
        if (request.body?.fullName?.trim())
            updates.full_name = request.body.fullName.trim();
        if (request.body?.department && isDepartment(request.body.department))
            updates.department = request.body.department;
        if (Object.keys(updates).length === 0)
            return reply.code(400).send({ error: "No valid profile changes supplied" });
        const { data, error } = await authenticated.client.from("profiles").update(updates).eq("id", authenticated.user.id).select().single();
        if (error)
            return reply.code(400).send({ error: error.message });
        return reply.send({ profile: data });
    });
};
//# sourceMappingURL=auth.js.map