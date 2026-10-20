import { safeFetch } from "../safe-fetch.ts";
import { CLOUDFLARE_API_BASE_URL } from "../../constants.ts";
import { EnvResultAsync } from "../../lib/env.ts";
import { parseResponseJson } from "../parse-response-json.ts";
import { safeReadFile } from "../safe-read-file.ts";
import { getFileContentType } from "../get-file-content-type.ts";
import type { ProcessedFileType } from "../process-file.ts";
import { ok, errAsync, ResultAsync } from "neverthrow";

function getFile(processedFiles: Record<string, ProcessedFileType>, fileHash: string) {
    const processedFile = processedFiles[fileHash];

    if (processedFile === undefined) {
        return errAsync(new Error(`No file found with hash ${fileHash}`));
    }

    return getFileContentType(processedFile.pathname).asyncAndThen((contentType) => {
        return safeReadFile(processedFile.pathname).map(
            (contents) => new Blob([contents.toBase64()], { type: contentType }),
        );
    });
}

export function uploadBucket(processedFilesMap: Record<string, ProcessedFileType>, jwt: string, fileHashes: string[]) {
    return EnvResultAsync.andThen((env) => {
        const url = `${CLOUDFLARE_API_BASE_URL}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/assets/upload?base64=true`;

        return ResultAsync.combineWithAllErrors(
            fileHashes.map((fileHash) =>
                getFile(processedFilesMap, fileHash).map((blob) => ({ hash: fileHash, blob })),
            ),
        ).map((files) => {
            const formData = new FormData();

            files.forEach((file) => {
                formData.append(file.hash, file.blob, file.hash);
            });

            return safeFetch(url, { method: "POST", headers: { authorization: `Bearer ${jwt}` }, body: formData })
                .andThen(parseResponseJson)
                .andThen(() => {
                    console.log(`Successfully uploaded bucket with file hashes: [${fileHashes.join(", ")}]`);
                    return ok();
                });
        });
    });
}
