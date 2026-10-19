import z from "zod";
import { zodParse } from "../util/zod-parse.ts";

const EnvSchema = z.object({
    CLOUDFLARE_ACCOUNT_ID: z.hex().length(32),
    CLOUDFLARE_API_TOKEN: z.string(),
    WORKER_ID: z.string().default("static-assets-test-worker"),
});

export const EnvResultAsync = zodParse(EnvSchema)(process.env);
