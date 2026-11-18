import { authenticateRequest } from "../utils/request-auth.js";
import { frontdesk, isUuid } from "../utils/frontdesk.js";
import { isRecord } from "../utils/validation.js";
const channels = new Set(["online", "onsite", "staff"]);
const statuses = new Set(["confirmed", "checked_in", "completed", "cancelled", "no_show"]);
export const registerFrontdeskAppointmentRoutes = async (app) => {
    app.post("/api/appointments", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const body = request.body;
        if (!isRecord(body) || typeof body.slotId !== "string" || typeof body.bookingReference !== "string") {
            return reply.code(400).send({ error: "slotId and bookingReference are required" });
        }
        if (!isUuid(body.slotId) || body.bookingReference.trim().length === 0) {
            return reply.code(400).send({ error: "Invalid appointment details" });
        }
        const client = frontdesk(authenticated);
        const { data: id, error } = await client.rpc("book_slot", {
            p_slot_id: body.slotId, p_reference: body.bookingReference.trim(),
            p_name: typeof body.clientName === "string" ? body.clientName.trim() : null,
            p_email: typeof body.contactEmail === "string" ? body.contactEmail.trim() : null,
            p_mobile: typeof body.contactMobile === "string" ? body.contactMobile.trim() : null,
            p_channel: typeof body.bookedChannel === "string" && channels.has(body.bookedChannel) ? body.bookedChannel : "online",
        });
        if (error)
            return reply.code(400).send({ error: error.message });
        return reply.code(201).send({ appointmentId: id });
    });
    app.get("/api/appointments", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const { data, error } = await frontdesk(authenticated).from("appointments")
            .select("*, appointment_slots(*)").order("created_at", { ascending: false });
        if (error)
            return reply.code(500).send({ error: "Unable to load appointments" });
        return reply.send({ appointments: data });
    });
    app.get("/api/appointments/:id", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        if (!isUuid(request.params.id))
            return reply.code(400).send({ error: "Invalid appointment ID" });
        const { data, error } = await frontdesk(authenticated).from("appointments")
            .select("*, appointment_slots(*), appointment_events(*)").eq("id", request.params.id).maybeSingle();
        if (error)
            return reply.code(500).send({ error: "Unable to load appointment" });
        if (!data)
            return reply.code(404).send({ error: "Appointment not found" });
        return reply.send({ appointment: data });
    });
    app.patch("/api/appointments/:id", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const body = request.body;
        const status = isRecord(body) && typeof body.status === "string" ? body.status : "";
        if (!isUuid(request.params.id) || !statuses.has(status))
            return reply.code(400).send({ error: "A valid appointment status is required" });
        const { data, error } = await frontdesk(authenticated).from("appointments")
            .update({ status, updated_at: new Date().toISOString() }).eq("id", request.params.id)
            .neq("status", "completed").select().single();
        if (error)
            return reply.code(400).send({ error: error.message });
        await frontdesk(authenticated).from("appointment_events").insert({ appointment_id: request.params.id, event_type: status, actor_subject: authenticated.user.id });
        return reply.send({ appointment: data });
    });
    app.post("/api/appointments/:id/cancel", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        if (!isUuid(request.params.id))
            return reply.code(400).send({ error: "Invalid appointment ID" });
        const { data, error } = await frontdesk(authenticated).from("appointments")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", request.params.id).in("status", ["confirmed", "checked_in"]).select().single();
        if (error)
            return reply.code(400).send({ error: error.message });
        await frontdesk(authenticated).from("appointment_events").insert({ appointment_id: request.params.id, event_type: "cancelled", actor_subject: authenticated.user.id });
        return reply.send({ appointment: data });
    });
    app.post("/api/appointments/:id/check-in", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const { data, error } = await frontdesk(authenticated).from("appointments")
            .update({ status: "checked_in", checked_in_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", request.params.id).eq("status", "confirmed").select().single();
        if (error)
            return reply.code(400).send({ error: error.message });
        return reply.send({ appointment: data });
    });
};
//# sourceMappingURL=frontdesk-appointments.js.map