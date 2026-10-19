import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { err, ok } from "neverthrow";

export type ProcessedFileType = {
    pathname: string;
    contents: Buffer;
    size: number;
    hash: string;
};

export function processFile(filePathname: string) {
    const fileExtension = path.extname(filePathname).slice(1);

    try {
        const fileContents = fs.readFileSync(filePathname);

        const size = fileContents.byteLength;
        const base64Encoded = fileContents.toBase64();
        const hash = crypto.hash("sha256", base64Encoded + fileExtension, { outputEncoding: "hex" }).slice(0, 32);

        return ok({ pathname: filePathname, contents: fileContents, size, hash } satisfies ProcessedFileType);
    } catch (error) {
        return err(error as NodeJS.ErrnoException);
    }
}
