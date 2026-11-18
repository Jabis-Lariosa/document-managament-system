export const frontdesk = (authenticated) => authenticated.client.schema("frontdesk");
export const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
export const isAdmin = async (authenticated) => {
    const { data } = await authenticated.client
        .from("profiles")
        .select("role")
        .eq("id", authenticated.user.id)
        .maybeSingle();
    return data?.role === "ADMIN";
};
//# sourceMappingURL=frontdesk.js.map