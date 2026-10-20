import "dotenv/config";
import path from "node:path";
import { processFile, type ProcessedFileType } from "./util/process-file.ts";
import { Result } from "neverthrow";
import { createAssetsUploadSession } from "./util/cloudflare/create-assets-upload-session.ts";
import { readDirRecursive } from "./util/read-dir-recursive.ts";
import { uploadAssets } from "./util/cloudflare/upload-assets.ts";

const DIR = "test-upload";

readDirRecursive(DIR)
    .map((entries) => entries.filter((entry) => entry.isFile()))
    .andThen((files) => Result.combine(files.map((entry) => processFile(path.join(entry.parentPath, entry.name)))))
    .map((processedFiles) => {
        console.log(
            "processedFiles:",
            JSON.stringify(
                processedFiles.map((value) => ({ path: value.pathname, size: value.size, hash: value.hash })),
                null,
                4,
            ),
        );
        return processedFiles;
    })
    .map((processedFiles) => {
        const processedFilesMap: Record<string, ProcessedFileType> = {};

        processedFiles.forEach((f) => {
            processedFilesMap[f.hash] = f;
        });

        return processedFilesMap;
    })
    /* .map((files) => {
        console.log("files:", files);
    })
    .mapErr((error) => {
        console.error(error);
    }) */
    .asyncAndThen((processedFilesMap) =>
        createAssetsUploadSession("gadha-worker-0", processedFilesMap).map((session) => ({
            processedFilesMap,
            session,
        })),
    )
    .andTee(({ session }) => {
        console.log(JSON.stringify(session, null, 4));
        return session;
    })
    .andThen(uploadAssets)
    .andTee((t) => console.log(t))
    .mapErr((error) => {
        console.log(error);
    });

// processedFiles.forEach

// createAssetsUploadSession(
//
/*
scripts/upload.ts|11 col 7-14 error 2349| This expression is not callable. Each member of the union type '{ <R extends Result<unknown, unknown>>(f: (t: never) => R): ResultAsync<InferOkTypes<R>, ErrnoException | InferErrTypes<R>>; <R extends ResultAsync<unknown, unknown>>(f: (t: never) => R): ResultAsync<...>; <U, F>(f: (t: never) => Result<...> | ResultAsync<...>): ResultAsync<...>; } | { ...; }' has signatures, but none of those signatures are compatible with each other.
*/
