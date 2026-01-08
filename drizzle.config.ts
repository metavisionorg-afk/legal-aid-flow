import { defineConfig } from "drizzle-kit";

const url =
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV === "production" ? "" : "postgresql:///legal_aidflow");

if (!url) {
  throw new Error("DATABASE_URL is required in production (or set NODE_ENV!=production for local default)");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
