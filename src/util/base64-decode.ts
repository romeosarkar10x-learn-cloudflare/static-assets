import { fromThrowable } from "neverthrow";

export const base64Decode = fromThrowable(
    (encoded: string) => atob(encoded),
    (error) => error as DOMException,
);
