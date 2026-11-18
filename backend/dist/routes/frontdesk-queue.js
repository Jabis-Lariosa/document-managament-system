import { authenticateRequest } from "../utils/request-auth.js";
import { frontdesk, isDate, isUuid } from "../utils/frontdesk.js";
import { isRecord } from "../utils/validation.js";
const transitions = {
    call: ["waiting", "called"],
    serve: ["called", "serving"],
    complete: ["serving", "completed"],
    cancel: ["waiting", "called", "serving", "transferred"],
    transfer: ["called", "serving"],
};
export const registerFrontdeskQueueRoutes = async (app) => {
    app.post("/api/queue/tickets", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const body = request.body;
        if (!isRecord(body) || typeof body.locationId !== "string" || typeof body.serviceId !== "string" || typeof body.date !== "string") {
            return reply.code(400).send({ error: "locationId, serviceId, and date are required" });
        }
        if (!isUuid(body.locationId) || !isUuid(body.serviceId) || !isDate(body.date)) {
            return reply.code(400).send({ error: "Invalid queue ticket details" });
        }
        const { data: id, error } = await frontdesk(authenticated).rpc("issue_ticket", {
            p_location_id: body.locationId, p_service_id: body.serviceId, p_date: body.date,
            p_appointment_id: typeof body.appointmentId === "string" ? body.appointmentId : null,
            p_priority: body.priority === "eligible_priority" ? body.priority : "standard",
        });
        if (error)
            return reply.code(400).send({ error: error.message });
        return reply.code(201).send({ ticketId: id });
    });
    app.get("/api/queue/tickets/:id", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const { data, error } = await frontdesk(authenticated).from("queue_tickets")
            .select("*, queue_events(*)").eq("id", request.params.id).maybeSingle();
        if (error)
            return reply.code(500).send({ error: "Unable to load queue ticket" });
        if (!data)
            return reply.code(404).send({ error: "Queue ticket not found" });
        return reply.send({ ticket: data });
    });
    app.get("/api/queue/status", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const query = frontdesk(authenticated);
        let builder = query.from("queue_tickets").select("*").in("status", ["waiting", "called", "serving"]);
        if (request.query.locationId)
            builder = builder.eq("location_id", request.query.locationId);
        if (request.query.date)
            builder = builder.eq("queue_date", request.query.date);
        const { data, error } = await builder.order("issued_at");
        if (error)
            return reply.code(500).send({ error: "Unable to load queue status" });
        return reply.send({ tickets: data });
    });
    const transition = async (request, reply, action) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const body = isRecord(request.body) ? request.body : {};
        const current = await frontdesk(authenticated).from("queue_tickets").select("status").eq("id", request.params.id).maybeSingle();
        if (current.error || !current.data)
            return reply.code(404).send({ error: "Queue ticket not found" });
        if (!transitions[action].includes(current.data.status))
            return reply.code(409).send({ error: "Invalid queue ticket transition" });
        const status = action === "call" ? "called" : action === "serve" ? "serving" : action === "complete" ? "completed" : action === "transfer" ? "transferred" : "cancelled";
        const update = { status };
        if (status === "called")
            update.called_at = new Date().toISOString();
        if (status === "completed")
            update.completed_at = new Date().toISOString();
        if (typeof body.counterId === "string" && isUuid(body.counterId))
            update.counter_id = body.counterId;
        const { data, error } = await frontdesk(authenticated).from("queue_tickets").update(update).eq("id", request.params.id).select().single();
        if (error)
            return reply.code(400).send({ error: error.message });
        await frontdesk(authenticated).from("queue_events").insert({ ticket_id: request.params.id, event_type: status, actor_subject: authenticated.user.id, notes: typeof body.notes === "string" ? body.notes : null });
        return reply.send({ ticket: data });
    };
    for (const [action, path] of [["call", "call"], ["serve", "serve"], ["complete", "complete"], ["cancel", "cancel"], ["transfer", "transfer"]]) {
        app.post(`/api/queue/tickets/:id/${path}`, async (request, reply) => transition(request, reply, action));
    }
    app.get("/api/queue/display", async (request, reply) => {
        let query = supabaseQueue().from("queue_tickets").select("ticket_number,status,service_id,counter_id,issued_at").in("status", ["called", "serving"]);
        if (request.query.locationId)
            query = query.eq("location_id", request.query.locationId);
        if (request.query.date)
            query = query.eq("queue_date", request.query.date);
        const { data, error } = await query.order("called_at");
        if (error)
            return reply.code(500).send({ error: "Unable to load queue display" });
        return reply.send({ tickets: data });
    });
};
import { supabase } from "../lib/supabase.js";
const supabaseQueue = () => supabase.schema("frontdesk");
//# sourceMappingURL=frontdesk-queue.js.map