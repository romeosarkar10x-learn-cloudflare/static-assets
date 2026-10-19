import "dotenv/config";
import path from "node:path";
import { getFiles } from "./utils/get-files.ts";
import { processFile, type ProcessedFileType } from "./utils/process-file.ts";
import { Result } from "neverthrow";
import { createAssetsUploadSession } from "./utils/create-assets-upload-session.ts";

const DIR = "files";

getFiles(DIR)
    .andThen((files) => Result.combine(files.map((pathname) => processFile(path.join(DIR, pathname)))))
    .map((processedFiles) => {
        const processedFilesMap: Record<string, ProcessedFileType> = {};

        processedFiles.forEach((f) => {
            processedFilesMap[f.hash] = f;
        });

        return processedFilesMap;
    })
    .asyncAndThen((files) => createAssetsUploadSession(files).map((session) => ({ session, processedFiles: files })));

// processedFiles.forEach

// createAssetsUploadSession(
//
/*
scripts/upload.ts|11 col 7-14 error 2349| This expression is not callable. Each member of the union type '{ <R extends Result<unknown, unknown>>(f: (t: never) => R): ResultAsync<InferOkTypes<R>, ErrnoException | InferErrTypes<R>>; <R extends ResultAsync<unknown, unknown>>(f: (t: never) => R): ResultAsync<...>; <U, F>(f: (t: never) => Result<...> | ResultAsync<...>): ResultAsync<...>; } | { ...; }' has signatures, but none of those signatures are compatible with each other.
*/
