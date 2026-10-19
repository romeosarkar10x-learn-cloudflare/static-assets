import z from "zod";
import { EnvResultAsync } from "../lib/env.ts";
import { safeFetch } from "./safe-fetch.ts";
import { zodParse } from "./zod-parse.ts";
import { parseResponseJson } from "./parse-response-json.ts";
import type { ProcessedFileType } from "./process-file.ts";

const ResponseSchema = z.object({
    result: z.object({
        jwt: z.jwt(),
        buckets: z.array(z.array(z.hex().length(32))),
    }),
});

function createManifest(processedFiles: ProcessedFileType[]) {
    const manifest: Record<string, { hash: string; size: number }> = {};
    processedFiles.forEach((f) => (manifest[f.pathname] = { hash: f.hash, size: f.size }));
    return manifest;
}

export function createAssetsUploadSession(processedFilesMap: Record<string, ProcessedFileType>) {
    const processedFiles = Object.values(processedFilesMap);

    return EnvResultAsync.andThen((env) => {
        const WORKER_ID = "my-test-worker-000";
        const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${WORKER_ID}/assets-upload-session`;

        return safeFetch(url, {
            method: "POST",
            headers: {
                authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                manifest: createManifest(processedFiles),
            }),
        });
    })
        .andThen(parseResponseJson)
        .andThen(zodParse(ResponseSchema));
}
