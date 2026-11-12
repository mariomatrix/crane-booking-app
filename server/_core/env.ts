const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

function normalizeGeminiModel(rawModel?: string): string {
  const trimmed = (rawModel ?? "").trim();
  if (!trimmed) return DEFAULT_GEMINI_MODEL;
  if (/^gemini-(1\.5|2\.0|2\.5)/i.test(trimmed)) {
    return DEFAULT_GEMINI_MODEL;
  }
  return trimmed;
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "",
  geminiModel: normalizeGeminiModel(process.env.GEMINI_MODEL),
  geminiVoiceModel: normalizeGeminiModel(
    process.env.GEMINI_VOICE_MODEL || process.env.GEMINI_MODEL
  ),
};
