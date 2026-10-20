import { err, ok, Result } from "neverthrow";
import path from "node:path";

const map = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".md": "text/markdown",
} as const;

type FileExtensionType = keyof typeof map;
type ContentType = (typeof map)[FileExtensionType];

function isKnownExtension(fileExtension: string): fileExtension is FileExtensionType {
    return Object.hasOwn(map, fileExtension);
}

export function getFileContentType(pathname: string): Result<ContentType, Error> {
    const fileExtension = path.extname(pathname).toLowerCase();

    if (!isKnownExtension(fileExtension)) {
        return err(new Error(`Unrecognized file extension ${fileExtension}`));
    }

    return ok(map[fileExtension]);
}
