import z, { ZodError } from "zod";
import { EnvResultAsync } from "../lib/env.ts";
import { safeFetch } from "./safe-fetch.ts";
import { zodParse } from "./zod-parse.ts";
import { parseResponseJson } from "./parse-response-json.ts";
import type { ProcessedFileType } from "./process-file.ts";
import { base64Decode } from "./base64-decode.ts";
import { parseJson } from "./parse-json.ts";

const JwtPayloadSchema = z
    .object({
        manifest_id: z.uuidv4(),
        account_id: z.number(),
        wrangler_single_asset_uploads: z.boolean(),
    })
    .transform((v) => ({
        manifestId: v.manifest_id,
        accountId: v.account_id,
        wranglerSingleAssetUploads: v.wrangler_single_asset_uploads,
    }));

const ResponseSchema = z.object({
    result: z
        .object({
            jwt: z.string(),
            buckets: z.array(z.array(z.hex().length(32))),
        })
        .transform(async (arg, ctx) => {
            const [, base64Payload] = arg.jwt.split(".");

            if (base64Payload === undefined) {
                ctx.addIssue({
                    code: "custom",
                    message: "JWT payload (base64) is undefined",
                });

                return z.NEVER;
            }

            const result = await base64Decode(base64Payload)
                .andThen(parseJson)
                .asyncAndThen(zodParse(JwtPayloadSchema));

            if (result.isErr()) {
                const error = result.error;

                if (error instanceof ZodError) {
                    for (const issue of error.issues) {
                        ctx.addIssue({
                            ...issue,
                            path: ["jwt", ...issue.path],
                        });
                    }
                } else {
                    ctx.addIssue({
                        code: "custom",
                        message: error instanceof Error ? error.message : String(error),
                        path: ["jwt"],
                    });
                }

                return z.NEVER;
            }

            return { ...arg, jwtPayload: result.value };
        }),
});

function toManifestPathFormat(pathname: string) {
    if (pathname.startsWith("/")) {
        return pathname;
    }

    return "/" + pathname;
}

function createManifest(processedFiles: ProcessedFileType[]) {
    const manifest: Record<string, { hash: string; size: number }> = {};
    processedFiles.forEach((f) => (manifest[toManifestPathFormat(f.pathname)] = { hash: f.hash, size: f.size }));
    console.log("manifest: ", manifest);
    return manifest;
}

export function createAssetsUploadSession(workerId: string, processedFilesMap: Record<string, ProcessedFileType>) {
    const processedFiles = Object.values(processedFilesMap);

    return EnvResultAsync.andThen((env) => {
        const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${workerId}/assets-upload-session`;

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
