import { fromPromise } from "neverthrow";

export function parseResponseJson(response: Response) {
    return fromPromise(response.json(), (error) => error as SyntaxError | TypeError | DOMException);
}
