import { errAsync, ok, ResultAsync } from "neverthrow";
import type { ProcessedFileType } from "./process-file.js";
import { safeFetch } from "./safe-fetch.js";
import { CLOUDFLARE_API_BASE_URL } from "../constants.js";
import { EnvResultAsync } from "../lib/env.js";
import { parseResponseJson } from "./parse-response-json.js";
import { safeReadFile } from "./safe-read-file.js";
import { getFileContentType } from "./get-file-content-type.ts.js";

function getFile(processedFiles: Record<string, ProcessedFileType>, fileHash: string) {
    const processedFile = processedFiles[fileHash];

    if (processedFile === undefined) {
        return errAsync(new Error(`File hash ${fileHash} not found`));
    }

    return getFileContentType(processedFile.pathname).asyncAndThen((contentType) => {
        return safeReadFile(processedFile.pathname).map(
            (contents) => new Blob([contents.toBase64()], { type: contentType }),
        );
    });
}

function uploadBucket(processedFiles: Record<string, ProcessedFileType>, jwt: string, fileHashes: string[]) {
    return EnvResultAsync.andThen((env) => {
        const form = new FormData();

        const files = fileHashes.map((fileHash) =>
            getFile(processedFiles, fileHash).map((blob) => ({ hash: fileHash, blob })),
        );

        const url = `${CLOUDFLARE_API_BASE_URL}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/assets/upload?base64=true`;

        return safeFetch(url, { headers: { authorization: `Bearer ${jwt}` }, body: form })
            .andThen(parseResponseJson)
            .andThen(() => {
                console.log(`Successfully uploaded bucket with file hashes: ${fileHashes.join(", ")}`);
                return ok();
            });
    });
}

export function uploadAssets({
    processedFiles,
    session: { jwt, buckets },
}: {
    processedFiles: Record<string, ProcessedFileType>;
    session: { jwt: string; buckets: string[][] };
}) {
    return ResultAsync.combine(buckets.map((bucket) => uploadBucket(processedFiles, jwt, bucket)));
}
