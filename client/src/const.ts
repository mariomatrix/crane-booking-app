export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime. We use the local /auth page.
export const getLoginUrl = () => {
  return "/auth";
};
