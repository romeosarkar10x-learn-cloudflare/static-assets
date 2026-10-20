import { fromThrowable } from "neverthrow";

export const parseJson = fromThrowable(
    (stringified) => JSON.parse(stringified),
    (error) => error as SyntaxError,
);
