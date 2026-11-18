import { departments } from "../types/auth.js";
export const isRecord = (value) => typeof value === "object" && value !== null;
export const isDepartment = (value) => departments.includes(value);
export const isSignupBody = (value) => isRecord(value) &&
    typeof value.fullName === "string" &&
    typeof value.email === "string" &&
    typeof value.department === "string" &&
    typeof value.password === "string";
export const isSigninBody = (value) => isRecord(value) &&
    typeof value.email === "string" &&
    typeof value.password === "string";
//# sourceMappingURL=validation.js.map