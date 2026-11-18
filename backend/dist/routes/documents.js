import { randomUUID } from "node:crypto";
import { supabase } from "../lib/supabase.js";
import { authenticateRequest } from "../utils/request-auth.js";
import { isDepartment, isRecord } from "../utils/validation.js";
const bucketName = "document-submissions";
const maxFileSize = 10 * 1024 * 1024;
const allowedMimeTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const isCreateDocumentBody = (value) => isRecord(value) &&
    typeof value.recipientDepartment === "string" &&
    (value.title === undefined || typeof value.title === "string") &&
    typeof value.submissionDate === "string" &&
    (value.clientName === undefined || typeof value.clientName === "string") &&
    (value.cellphoneNo === undefined || typeof value.cellphoneNo === "string") &&
    typeof value.submissionOption === "string" &&
    (value.schoolId === undefined || typeof value.schoolId === "string") &&
    (value.schoolOrOthers === undefined || typeof value.schoolOrOthers === "string") &&
    typeof value.documentType === "string" &&
    typeof value.subjectDetails === "string" &&
    typeof value.receivingOffice === "string" &&
    typeof value.officeDestination === "string";
const isReceiveDocumentBody = (value) => isRecord(value) && typeof value.token === "string";
const parseSubmissionId = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
const submissionOptions = new Set(["ELEM", "SEC", "SDO_BASE", "PRIVATE_OTHERS"]);
export const registerDocumentRoutes = async (app) => {
    app.post("/api/documents", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const body = request.body;
        const title = isCreateDocumentBody(body) && body.title?.trim()
            ? body.title.trim()
            : isCreateDocumentBody(body)
                ? body.subjectDetails.trim()
                : "";
        if (!isCreateDocumentBody(body) ||
            !isDepartment(body.recipientDepartment) ||
            title.length === 0 ||
            title.length > 200 ||
            !isIsoDate(body.submissionDate) ||
            !submissionOptions.has(body.submissionOption) ||
            body.documentType.trim().length === 0 ||
            body.documentType.trim().length > 200 ||
            body.subjectDetails.trim().length === 0 ||
            body.subjectDetails.trim().length > 5000 ||
            body.receivingOffice.trim().length === 0 ||
            body.receivingOffice.trim().length > 200 ||
            body.officeDestination.trim().length === 0 ||
            body.officeDestination.trim().length > 200) {
            return reply.code(400).send({
                error: "Required document registration fields are missing or invalid",
            });
        }
        const { data, error } = await authenticated.client.rpc("create_document_submission", {
            p_recipient_department: body.recipientDepartment,
            p_title: title,
            p_submission_date: body.submissionDate,
            p_client_name: body.clientName?.trim() ?? "",
            p_cellphone_no: body.cellphoneNo?.trim() ?? "",
            p_submission_option: body.submissionOption,
            p_school_id: body.schoolId?.trim() ?? "",
            p_school_or_others: body.schoolOrOthers?.trim() ?? "",
            p_document_type: body.documentType.trim(),
            p_subject_details: body.subjectDetails.trim(),
            p_receiving_office: body.receivingOffice.trim(),
            p_office_destination: body.officeDestination.trim(),
        });
        if (error || !data?.[0]) {
            app.log.error(error);
            return reply.code(400).send({
                error: error?.message ?? "Unable to create document submission",
            });
        }
        return reply.code(201).send({
            submission: {
                id: data[0].submission_id,
                trackingCode: data[0].tracking_code,
            },
            qrToken: data[0].qr_token,
        });
    });
    app.post("/api/documents/:id/files", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const submissionId = parseSubmissionId(request.params.id);
        if (!submissionId) {
            return reply.code(400).send({ error: "Invalid submission ID" });
        }
        const { data: submission, error: submissionError } = await authenticated.client
            .from("document_submissions")
            .select("id")
            .eq("id", submissionId)
            .eq("submitter_id", authenticated.user.id)
            .maybeSingle();
        if (submissionError) {
            app.log.error(submissionError);
            return reply.code(500).send({ error: "Unable to verify submission" });
        }
        if (!submission) {
            return reply.code(404).send({ error: "Submission not found" });
        }
        const file = await request.file();
        if (!file) {
            return reply.code(400).send({ error: "A document file is required" });
        }
        if (!allowedMimeTypes.has(file.mimetype)) {
            return reply.code(415).send({ error: "Unsupported document file type" });
        }
        const fileBuffer = await file.toBuffer();
        if (fileBuffer.length === 0 || fileBuffer.length > maxFileSize) {
            return reply.code(413).send({
                error: "Document file must be greater than 0 and no larger than 10 MB",
            });
        }
        const storagePath = `${authenticated.user.id}/${submissionId}/${randomUUID()}-${file.filename}`;
        const { error: uploadError } = await authenticated.client.storage
            .from(bucketName)
            .upload(storagePath, fileBuffer, {
            contentType: file.mimetype,
            upsert: false,
        });
        if (uploadError) {
            app.log.error(uploadError);
            return reply.code(400).send({ error: "Unable to upload document file" });
        }
        const { data: metadata, error: metadataError } = await authenticated.client
            .from("document_files")
            .insert({
            submission_id: submissionId,
            storage_path: storagePath,
            original_name: file.filename,
            mime_type: file.mimetype,
            size_bytes: fileBuffer.length,
        })
            .select("id, original_name, mime_type, size_bytes, created_at")
            .single();
        if (metadataError) {
            await authenticated.client.storage.from(bucketName).remove([storagePath]);
            app.log.error(metadataError);
            return reply.code(400).send({ error: "Unable to save document metadata" });
        }
        return reply.code(201).send({ file: metadata });
    });
    app.get("/api/documents/resolve", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const token = request.query.token?.trim();
        if (!token) {
            return reply.code(400).send({ error: "QR token is required" });
        }
        const { data, error } = await authenticated.client.rpc("resolve_document_qr", {
            p_qr_token: token,
        });
        if (error) {
            app.log.error(error);
            return reply.code(403).send({ error: "Unable to resolve QR code" });
        }
        if (!data?.[0]) {
            return reply.code(404).send({ error: "Document not found or not authorized" });
        }
        return reply.send({ submission: data[0] });
    });
    app.post("/api/documents/receive", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const body = request.body;
        if (!isReceiveDocumentBody(body) || body.token.trim().length === 0) {
            return reply.code(400).send({ error: "QR token is required" });
        }
        const { data, error } = await authenticated.client.rpc("mark_document_received", { p_qr_token: body.token.trim() });
        if (error) {
            app.log.error(error);
            return reply.code(403).send({
                error: "Document could not be received or is not authorized",
            });
        }
        return reply.send({ status: data });
    });
    app.get("/api/documents", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const { data, error } = await authenticated.client
            .from("document_submissions")
            .select("*")
            .eq("submitter_id", authenticated.user.id)
            .order("created_at", { ascending: false });
        if (error)
            return reply.code(500).send({ error: "Unable to load documents" });
        return reply.send({ submissions: data });
    });
    app.get("/api/documents/:id", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const { data, error } = await authenticated.client
            .from("document_submissions")
            .select("*, document_files(*), document_events(*)")
            .eq("id", request.params.id)
            .eq("submitter_id", authenticated.user.id)
            .maybeSingle();
        if (error)
            return reply.code(500).send({ error: "Unable to load document" });
        if (!data)
            return reply.code(404).send({ error: "Document not found" });
        return reply.send({ submission: data });
    });
    app.get("/api/documents/:id/files", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const { data, error } = await authenticated.client
            .from("document_files")
            .select("id, original_name, mime_type, size_bytes, created_at")
            .eq("submission_id", request.params.id);
        if (error)
            return reply.code(500).send({ error: "Unable to load document files" });
        return reply.send({ files: data });
    });
    app.get("/api/documents/:id/files/:fileId", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const { data: file, error } = await authenticated.client
            .from("document_files")
            .select("storage_path, original_name")
            .eq("id", request.params.fileId)
            .eq("submission_id", request.params.id)
            .maybeSingle();
        if (error)
            return reply.code(500).send({ error: "Unable to load file" });
        if (!file)
            return reply.code(404).send({ error: "File not found" });
        const { data, error: signedError } = await authenticated.client.storage
            .from(bucketName)
            .createSignedUrl(file.storage_path, 300);
        if (signedError)
            return reply.code(500).send({ error: "Unable to create download URL" });
        return reply.send({ file: { name: file.original_name, url: data.signedUrl, expiresIn: 300 } });
    });
    app.delete("/api/documents/:id/files/:fileId", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const { data: file } = await authenticated.client.from("document_files")
            .select("storage_path").eq("id", request.params.fileId).eq("submission_id", request.params.id).maybeSingle();
        if (!file)
            return reply.code(404).send({ error: "File not found" });
        const { error: removeError } = await authenticated.client.storage.from(bucketName).remove([file.storage_path]);
        if (removeError)
            return reply.code(400).send({ error: "Unable to remove document file" });
        const { error } = await authenticated.client.from("document_files").delete().eq("id", request.params.fileId);
        if (error)
            return reply.code(400).send({ error: "Unable to remove file metadata" });
        return reply.code(204).send();
    });
    app.get("/api/documents/:id/events", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const { data, error } = await authenticated.client.from("document_events")
            .select("*").eq("submission_id", request.params.id).order("created_at", { ascending: false });
        if (error)
            return reply.code(500).send({ error: "Unable to load document history" });
        return reply.send({ events: data });
    });
    app.get("/api/documents/track/:trackingCode", async (request, reply) => {
        const { data, error } = await supabase.from("document_submissions")
            .select("id, tracking_code, title, recipient_department, status, created_at, updated_at")
            .eq("tracking_code", request.params.trackingCode.trim().toUpperCase()).maybeSingle();
        if (error)
            return reply.code(500).send({ error: "Unable to track document" });
        if (!data)
            return reply.code(404).send({ error: "Document not found" });
        return reply.send({ submission: data });
    });
    app.patch("/api/documents/:id/status", async (request, reply) => {
        const authenticated = await authenticateRequest(request, reply);
        if (!authenticated)
            return;
        const nextStatus = request.body?.status;
        const allowedStatuses = new Set(["processing", "completed", "rejected"]);
        if (!nextStatus || !allowedStatuses.has(nextStatus)) {
            return reply.code(400).send({ error: "A valid processing status is required" });
        }
        const { data: profile } = await authenticated.client
            .from("profiles")
            .select("role, department")
            .eq("id", authenticated.user.id)
            .maybeSingle();
        const { data: submission, error: submissionError } = await authenticated.client
            .from("document_submissions")
            .select("id, recipient_department, submitter_id")
            .eq("id", request.params.id)
            .maybeSingle();
        if (submissionError)
            return reply.code(500).send({ error: "Unable to verify document" });
        if (!submission)
            return reply.code(404).send({ error: "Document not found" });
        if (submission.submitter_id !== authenticated.user.id &&
            profile?.role !== "ADMIN" &&
            profile?.department !== submission.recipient_department) {
            return reply.code(403).send({ error: "You are not authorized to update this document" });
        }
        const { data, error } = await authenticated.client
            .from("document_submissions")
            .update({ status: nextStatus, processed_at: nextStatus === "completed" ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
            .eq("id", request.params.id)
            .select()
            .single();
        if (error)
            return reply.code(400).send({ error: error.message });
        await authenticated.client.from("document_events").insert({
            submission_id: request.params.id,
            event_type: nextStatus,
            actor_id: authenticated.user.id,
            notes: request.body?.notes?.trim() || null,
        });
        return reply.send({ submission: data });
    });
};
//# sourceMappingURL=documents.js.map