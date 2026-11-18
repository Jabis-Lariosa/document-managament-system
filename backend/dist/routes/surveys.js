import { createHash, randomBytes } from "node:crypto";
import { supabase } from "../lib/supabase.js";
import { authenticateRequest } from "../utils/request-auth.js";
import { frontdesk, isUuid } from "../utils/frontdesk.js";
import { isRecord } from "../utils/validation.js";
const hash = (value) => createHash("sha256").update(value).digest("hex");
export const registerSurveyRoutes = async (app) => {
    app.get("/api/surveys/questionnaires", async (_request, reply) => {
        const { data, error } = await supabase.schema("frontdesk").from("csm_questionnaire_versions")
            .select("*, csm_questions(*, csm_answer_options(*))").eq("approved", true).order("effective_from", { ascending: false });
        if (error)
            return reply.code(500).send({ error: "Unable to load questionnaires" });
        return reply.send({ questionnaires: data });
    });
    app.post("/api/surveys/invitations", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const body = request.body;
        if (!isRecord(body) || typeof body.visitId !== "string" || typeof body.questionnaireId !== "string" || typeof body.expiresAt !== "string") {
            return reply.code(400).send({ error: "visitId, questionnaireId, and expiresAt are required" });
        }
        if (!isUuid(body.visitId) || !isUuid(body.questionnaireId) || Date.parse(body.expiresAt) <= Date.now()) {
            return reply.code(400).send({ error: "Invalid survey invitation details" });
        }
        const token = randomBytes(32).toString("hex");
        const { data, error } = await frontdesk(authenticated).from("csm_survey_invitations").insert({
            visit_id: body.visitId, questionnaire_id: body.questionnaireId, token_hash: hash(token),
            channel: typeof body.channel === "string" ? body.channel : "web", expires_at: body.expiresAt,
        }).select("id, visit_id, questionnaire_id, channel, expires_at").single();
        if (error)
            return reply.code(400).send({ error: error.message });
        return reply.code(201).send({ invitation: data, token });
    });
    app.get("/api/surveys/:token", async (request, reply) => {
        const { data, error } = await supabase.schema("frontdesk").from("csm_survey_invitations")
            .select("id, expires_at, redeemed_at, csm_questionnaire_versions(*, csm_questions(*, csm_answer_options(*)))")
            .eq("token_hash", hash(request.params.token)).maybeSingle();
        if (error)
            return reply.code(500).send({ error: "Unable to load survey" });
        if (!data || data.redeemed_at || Date.parse(data.expires_at) <= Date.now())
            return reply.code(404).send({ error: "Survey is unavailable" });
        return reply.send({ survey: data });
    });
    app.post("/api/surveys/:token/responses", async (request, reply) => {
        const body = request.body;
        if (!isRecord(body) || !Array.isArray(body.answers))
            return reply.code(400).send({ error: "Survey answers are required" });
        const client = supabase.schema("frontdesk");
        const { data: invitation, error: invitationError } = await client.from("csm_survey_invitations")
            .select("id, questionnaire_id, visit_id, expires_at, redeemed_at").eq("token_hash", hash(request.params.token)).maybeSingle();
        if (invitationError || !invitation || invitation.redeemed_at || Date.parse(invitation.expires_at) <= Date.now()) {
            return reply.code(404).send({ error: "Survey is unavailable" });
        }
        const { data: visit } = await client.from("service_visits").select("service_id, location_id").eq("id", invitation.visit_id).single();
        if (!visit)
            return reply.code(400).send({ error: "Survey visit not found" });
        const { data: response, error } = await client.from("csm_responses").insert({
            invitation_id: invitation.id, questionnaire_id: invitation.questionnaire_id,
            service_id: visit.service_id, location_id: visit.location_id, source_node: "cloud",
        }).select("id").single();
        if (error)
            return reply.code(400).send({ error: error.message });
        const answers = body.answers.filter(isRecord).map((answer) => ({
            response_id: response.id, questionnaire_id: invitation.questionnaire_id,
            question_id: answer.questionId, option_id: typeof answer.optionId === "string" ? answer.optionId : null,
            free_text: typeof answer.freeText === "string" ? answer.freeText : null,
        }));
        const { error: answerError } = await client.from("csm_response_answers").insert(answers);
        if (answerError)
            return reply.code(400).send({ error: answerError.message });
        await client.from("csm_survey_invitations").update({ redeemed_at: new Date().toISOString() }).eq("id", invitation.id);
        return reply.code(201).send({ responseId: response.id });
    });
    app.get("/api/admin/surveys/reports", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const { data: profile } = await authenticated.client.from("profiles").select("role").eq("id", authenticated.user.id).single();
        if (profile?.role !== "ADMIN")
            return reply.code(403).send({ error: "Administrator access is required" });
        const { data, error } = await frontdesk(authenticated).from("csm_reporting_snapshots").select("*").order("generated_at", { ascending: false });
        if (error)
            return reply.code(500).send({ error: "Unable to load survey reports" });
        return reply.send({ reports: data });
    });
};
//# sourceMappingURL=surveys.js.map