import { fromThrowable } from "neverthrow";
import fs from "node:fs";

export const readDirRecursive = fromThrowable(
    (searchDir: string) => {
        return fs.readdirSync(searchDir, { recursive: true, withFileTypes: true });
    },
    (error) => {
        return error as NodeJS.ErrnoException;
    },
);
