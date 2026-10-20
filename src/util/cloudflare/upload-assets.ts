import { ResultAsync } from "neverthrow";
import type { ProcessedFileType } from "../process-file.ts";
import { uploadBucket } from "./upload-bucket.ts";
import type { UploadSessionType } from "./create-assets-upload-session.ts";

export function uploadAssets({
    processedFilesMap,
    session: { jwt, buckets },
}: {
    processedFilesMap: Record<string, ProcessedFileType>;
    session: UploadSessionType;
}) {
    return ResultAsync.combine(buckets.map((bucket) => uploadBucket(processedFilesMap, jwt, bucket)));
}
