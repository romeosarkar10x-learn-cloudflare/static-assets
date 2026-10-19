import { fromPromise } from "neverthrow";
import fs from "node:fs/promises";

export function safeReadFile(pathname: string) {
    return fromPromise(fs.readFile(pathname), (error) => error as NodeJS.ErrnoException);
}
