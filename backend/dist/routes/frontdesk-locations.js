import { supabase } from "../lib/supabase.js";
import { isUuid } from "../utils/frontdesk.js";
export const registerFrontdeskLocationRoutes = async (app) => {
    app.get("/api/locations", async (request, reply) => {
        const { data, error } = await supabase.schema("frontdesk").from("service_locations")
            .select("*").eq("active", true).order("name");
        if (error) {
            request.log.error({ err: error }, "Unable to load locations");
            return reply.code(500).send({ error: "Unable to load locations" });
        }
        return reply.send({ locations: data });
    });
    app.get("/api/locations/:id", async (request, reply) => {
        if (!isUuid(request.params.id))
            return reply.code(400).send({ error: "Invalid location ID" });
        const { data, error } = await supabase.schema("frontdesk").from("service_locations")
            .select("*").eq("id", request.params.id).eq("active", true).maybeSingle();
        if (error) {
            request.log.error({ err: error, locationId: request.params.id }, "Unable to load location");
            return reply.code(500).send({ error: "Unable to load location" });
        }
        if (!data)
            return reply.code(404).send({ error: "Location not found" });
        return reply.send({ location: data });
    });
    app.get("/api/locations/:id/services", async (request, reply) => {
        if (!isUuid(request.params.id))
            return reply.code(400).send({ error: "Invalid location ID" });
        const { data, error } = await supabase.schema("frontdesk").from("service_catalog")
            .select("*, service_calendars!inner(location_id)")
            .eq("service_calendars.location_id", request.params.id).eq("active", true);
        if (error) {
            request.log.error({ err: error, locationId: request.params.id }, "Unable to load location services");
            return reply.code(500).send({ error: "Unable to load location services" });
        }
        return reply.send({ services: data });
    });
    app.get("/api/services", async (request, reply) => {
        const { data, error } = await supabase.schema("frontdesk").from("service_catalog")
            .select("*").eq("active", true).order("name");
        if (error) {
            request.log.error({ err: error }, "Unable to load services");
            return reply.code(500).send({ error: "Unable to load services" });
        }
        return reply.send({ services: data });
    });
    app.get("/api/services/:id", async (request, reply) => {
        if (!isUuid(request.params.id))
            return reply.code(400).send({ error: "Invalid service ID" });
        const { data, error } = await supabase.schema("frontdesk").from("service_catalog")
            .select("*").eq("id", request.params.id).eq("active", true).maybeSingle();
        if (error) {
            request.log.error({ err: error, serviceId: request.params.id }, "Unable to load service");
            return reply.code(500).send({ error: "Unable to load service" });
        }
        if (!data)
            return reply.code(404).send({ error: "Service not found" });
        return reply.send({ service: data });
    });
    app.get("/api/services/:id/slots", async (request, reply) => {
        if (!isUuid(request.params.id))
            return reply.code(400).send({ error: "Invalid service ID" });
        let query = supabase.schema("frontdesk").from("appointment_slots").select("*")
            .eq("service_id", request.params.id).eq("enabled", true).gt("starts_at", new Date().toISOString());
        if (request.query.from)
            query = query.gte("starts_at", request.query.from);
        if (request.query.to)
            query = query.lte("starts_at", request.query.to);
        const { data, error } = await query.order("starts_at");
        if (error) {
            request.log.error({ err: error, serviceId: request.params.id }, "Unable to load appointment slots");
            return reply.code(500).send({ error: "Unable to load appointment slots" });
        }
        return reply.send({ slots: data });
    });
};
//# sourceMappingURL=frontdesk-locations.js.map