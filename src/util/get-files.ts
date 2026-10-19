import { fromThrowable } from "neverthrow";
import fs from "node:fs";

export const getFiles = fromThrowable(
    (searchDir: string) => fs.readdirSync(searchDir, { recursive: true }) as string[],
    (error) => {
        return error as NodeJS.ErrnoException;
    },
);
