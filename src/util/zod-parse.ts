import z from "zod";
import { fromPromise } from "neverthrow";

export function zodParse<T>(schema: z.ZodType<T>) {
    return function (data: unknown) {
        return fromPromise(schema.parseAsync(data), (error): z.ZodError<T> | Error => {
            if (error instanceof z.ZodError) {
                return error as z.ZodError<T>;
            }

            return new Error("Unknown error while parsing zod schema", { cause: error });
        });
    };
}
