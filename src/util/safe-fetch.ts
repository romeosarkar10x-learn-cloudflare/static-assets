import { fromPromise } from "neverthrow";

export function safeFetch(input: string | URL | Request, init?: RequestInit) {
    return fromPromise(fetch(input, init), (error) => error as Error);
}
