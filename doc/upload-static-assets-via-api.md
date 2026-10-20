# Uploading static assets with the raw Cloudflare API (no wrangler)

This is what `wrangler deploy` does under the hood for a Worker with `assets`. Static assets are always
attached to a **Worker script** resource, but that script can contain zero code (an "assets-only" Worker).

Official guide for this exact flow: [Direct Uploads][direct-upload].

Base URL: `https://api.cloudflare.com/client/v4`
Auth: [API token][create-token] with **Account → Workers Scripts → Edit**
(plus **Account → Account Settings → Read** to look up your `workers.dev` subdomain in step 5).

```
1. hash every file, build manifest
2. POST  .../workers/scripts/{name}/assets-upload-session   (API token)  -> upload JWT + buckets
3. POST  .../workers/assets/upload?base64=true  per bucket   (upload JWT) -> completion JWT
4. PUT   .../workers/scripts/{name}                          (API token, completion JWT in metadata)
5. POST  .../workers/scripts/{name}/subdomain                (API token)  -> live on workers.dev
```

Limits ([source][limits]): 25 MiB per file; 20,000 files per Worker version on Free, 100,000 on Paid.

---

## Step 1 — Build the manifest

Ref: [Direct Uploads → Upload manifest][direct-upload]

For every file under the asset directory (`upload/`):

- **path**: relative to the asset root, forward slashes, **leading `/`**.
  `upload/dir-cobalt-6542/file-comet-8732.html` → `/dir-cobalt-6542/file-comet-8732.html`
- **hash**: the docs only require "a 32 hexadecimal character hash of the file". It is the content
  identifier Cloudflare dedups on, so it must change when the content changes.
  - Docs sample code: `sha256(base64(contents) + extension_without_dot)`, hex, first 32 chars
    (what `src/util/process-file.ts` does).
  - Wrangler itself uses the same recipe but with **BLAKE3** instead of SHA-256
    ([`hash.ts`][wrangler-hash]). Either works.
- **size**: byte length of raw contents.

```json
{
  "manifest": {
    "/file-nebula-6185.html": { "hash": "a1b2...32 hex chars", "size": 1234 },
    "/dir-cobalt-6542/file-comet-8732.html": { "hash": "...", "size": 567 }
  }
}
```

Note: two files with identical content and extension get the **same hash**. Both paths must still appear
in the manifest; the content is just uploaded once.

## Step 2 — Create an upload session

Ref: [API: Create Worker Assets Upload Session][api-session]

```bash
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$WORKER_ID/assets-upload-session" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data @manifest.json
```

The script does not need to exist yet (wrangler calls this before the first deploy).

Response:

```json
{
  "success": true,
  "result": {
    "jwt": "<upload JWT>",
    "buckets": [["hashA", "hashB"], ["hashC"]]
  }
}
```

- `buckets` lists only hashes Cloudflare **doesn't already have** (files unchanged in recent versions are
  left out), grouped into batches — one upload request per bucket.
- If `buckets` is empty, everything is already uploaded: `result.jwt` is already the **completion JWT** — skip to step 4.
- The upload JWT is valid for **one hour**.

## Step 3 — Upload each bucket

Ref: [API: Upload Worker Assets][api-upload], [Direct Uploads → Upload Static Assets][direct-upload]

One request per bucket (can run in parallel). Note the **different auth**: the upload JWT, not the API token.

- `multipart/form-data`
- one part per hash: field name = hash, value = **base64-encoded** file contents, part `Content-Type` = the
  file's MIME type. Cloudflare stores that type and serves the file with it. Send `application/null` for
  "no content type". (Wrangler also sets the part's filename to the hash —
  [`assets.ts`][wrangler-assets].)
- `?base64=true` query param is required and must be `true`.

```bash
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/assets/upload?base64=true" \
  -H "Authorization: Bearer $UPLOAD_JWT" \
  -F "hashA=$(base64 -w0 upload/file-nebula-6185.html);type=text/html" \
  -F "hashB=$(base64 -w0 upload/file-amber-2819.css);type=text/css"
```

Response:

```json
{ "success": true, "result": { "jwt": "<completion JWT>" } }
```

- `result.jwt` (the **completion JWT**) shows up once **all** manifest files have been uploaded. Per the
  Direct Uploads guide that final response is a `201`. Earlier buckets may come back without a `jwt`.
  Wrangler keeps whichever response carries one (`completionJwt = res.jwt || completionJwt`).
- Completion JWT is valid for **one hour**. Keep it for step 4.

## Step 4 — Deploy the Worker script with the assets attached

Ref: [API: Upload Worker Module][api-script-update], [Multipart upload metadata][multipart-metadata],
[Direct Uploads → Create/Deploy New Version][direct-upload]

`PUT` the script as `multipart/form-data`. The `metadata` part links the uploaded assets via the completion JWT.

This `PUT` is an upsert: if no Worker named `$WORKER_ID` exists, this call creates it; otherwise it
replaces the current version. The API page only says "Upload a worker module", but wrangler's first
deploy of a new Worker uses this same `PUT`, with no separate create call
([`deploy.ts`][wrangler-deploy]). Steps 2–3 create nothing visible: the Worker doesn't appear in your
account until this step succeeds.

### Assets-only (no code)

The [metadata docs][multipart-metadata] say `main_module` is required "at a minimum". Wrangler skips it
for assets-only Workers anyway: it sends a `metadata` part with only `assets`, `compatibility_date` and
`compatibility_flags`, and no module parts
([`create-worker-upload-form.ts`][wrangler-upload-form], "short circuit if static assets upload only").
If the API rejects this, fall back to the code variant with a trivial module.

```bash
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$WORKER_ID" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -F 'metadata={
        "compatibility_date": "2026-10-01",
        "assets": {
          "jwt": "'"$COMPLETION_JWT"'",
          "config": {
            "html_handling": "auto-trailing-slash",
            "not_found_handling": "none"
          }
        }
      };type=application/json'
```

### With code (for later, when you want a Worker in front)

Add `main_module` to metadata, a module part, and optionally an `ASSETS` binding
([Static Assets binding][assets-binding]):

```bash
  -F 'metadata={"main_module":"index.js","compatibility_date":"2026-10-01",
       "assets":{"jwt":"'"$COMPLETION_JWT"'"},
       "bindings":[{"type":"assets","name":"ASSETS"}]};type=application/json' \
  -F 'index.js=@index.js;type=application/javascript+module'
```

To redeploy code without re-uploading assets, send `"keep_assets": true` instead of `assets.jwt`.

The Direct Uploads guide's sample code does this step differently: it creates a **version** and then a
**deployment** at 100%. `PUT /workers/scripts/{name}` (what `wrangler deploy` uses) does both in one call.

`config` options (values from the [Wrangler configuration reference][wrangler-config]):

| field | values |
|---|---|
| `html_handling` | `auto-trailing-slash` (default), `force-trailing-slash`, `drop-trailing-slash`, `none` — [HTML handling][html-handling] |
| `not_found_handling` | `none` (default, 404), `404-page` (nearest `404.html`), `single-page-application` (serve `/index.html`) — [SSG / 404][ssg], [SPA][spa] |
| `run_worker_first` | `false` (default), `true`, or an array of up to 100 route patterns (`/api/*`, `!/api/docs/*`); code variant only — [binding docs][assets-binding] |

## Step 5 — Make it reachable

Ref: [API: Update Worker Script Subdomain][api-script-subdomain], [workers.dev routing][workers-dev]

Enable the `workers.dev` route for the script:

```bash
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$WORKER_ID/subdomain" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"enabled": true}'
```

Find your account subdomain ([API: Get a Workers Subdomain][api-account-subdomain]). The account must
have claimed one already; the dashboard does that the first time you open Workers.

```bash
curl "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
# -> { "result": { "subdomain": "<sub>" } }
```

Test:

```bash
curl -i "https://$WORKER_ID.<sub>.workers.dev/file-nebula-6185.html"
curl -i "https://$WORKER_ID.<sub>.workers.dev/dir-cobalt-6542/file-comet-8732.html"
```

Check `content-type` matches what you sent in step 3.

## Cleanup

Ref: [API: Delete Worker][api-script-delete]

```bash
curl -X DELETE \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$WORKER_ID" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

---

## Gaps in current `src/` vs these steps

- `create-assets-upload-session.ts`: manifest key is `f.pathname` (`upload/x.js`); must be `/x.js`
  (strip `upload/`, add leading `/`). `WORKER_ID` hardcoded instead of `env.WORKER_ID`.
- `upload.ts`: files keyed by hash in `processedFilesMap`, so duplicate-content files collapse and vanish
  from the manifest. Build manifest from the full list; use a hash → file map only for step 3 lookups.
- `upload-assets.ts`:
  - `form` never gets parts — `files` is built but never appended to it.
  - `fetch` has no `method: "POST"` — a GET with a body throws `TypeError`.
  - completion JWT from the final response is discarded; step 4 needs it.
  - imports use `.js` extensions while the rest of `src/` uses `.ts`.
  - re-reads files from disk although `ProcessedFileType.contents` already holds them.
- Steps 4 and 5 not implemented yet.

---

## References

Guides

- [Direct Uploads (static assets via API)][direct-upload] — the main reference for this whole flow
- [Static Assets binding & `run_worker_first`][assets-binding]
- [Multipart upload metadata][multipart-metadata]
- [HTML handling][html-handling] · [Static site generation / 404 pages][ssg] · [Single Page Application][spa]
- [Wrangler configuration → `assets`][wrangler-config]
- [workers.dev routing][workers-dev]
- [Workers limits][limits]
- [Create an API token][create-token]

API reference

- [Create Worker Assets Upload Session][api-session] — `POST /accounts/{account_id}/workers/scripts/{script_name}/assets-upload-session`
- [Upload Worker Assets][api-upload] — `POST /accounts/{account_id}/workers/assets/upload`
- [Upload Worker Module][api-script-update] — `PUT /accounts/{account_id}/workers/scripts/{script_name}`
- [Update Worker Script Subdomain][api-script-subdomain] — `POST /accounts/{account_id}/workers/scripts/{script_name}/subdomain`
- [Get a Workers Subdomain][api-account-subdomain] — `GET /accounts/{account_id}/workers/subdomain`
- [Delete Worker][api-script-delete] — `DELETE /accounts/{account_id}/workers/scripts/{script_name}`

Wrangler source (how the official client does it)

- [`deploy-helpers/.../assets.ts`][wrangler-assets] — manifest, session, bucket upload
- [`deploy-helpers/.../hash.ts`][wrangler-hash] — file hash
- [`deploy-helpers/.../create-worker-upload-form.ts`][wrangler-upload-form] — script upload metadata (assets-only short circuit)

[direct-upload]: https://developers.cloudflare.com/workers/static-assets/direct-upload/
[assets-binding]: https://developers.cloudflare.com/workers/static-assets/binding/
[multipart-metadata]: https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/
[html-handling]: https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/
[ssg]: https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/
[spa]: https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
[wrangler-config]: https://developers.cloudflare.com/workers/wrangler/configuration/
[workers-dev]: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
[limits]: https://developers.cloudflare.com/workers/platform/limits/
[create-token]: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
[api-session]: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/assets/subresources/upload/methods/create/
[api-upload]: https://developers.cloudflare.com/api/resources/workers/subresources/assets/subresources/upload/methods/create/
[api-script-update]: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/
[api-script-subdomain]: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/subdomain/methods/create/
[api-account-subdomain]: https://developers.cloudflare.com/api/resources/workers/subresources/subdomains/methods/get/
[api-script-delete]: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/delete/
[wrangler-assets]: https://github.com/cloudflare/workers-sdk/blob/main/packages/deploy-helpers/src/deploy/helpers/assets.ts
[wrangler-deploy]: https://github.com/cloudflare/workers-sdk/blob/main/packages/deploy-helpers/src/deploy/deploy.ts
[wrangler-hash]: https://github.com/cloudflare/workers-sdk/blob/main/packages/deploy-helpers/src/deploy/helpers/hash.ts
[wrangler-upload-form]: https://github.com/cloudflare/workers-sdk/blob/main/packages/deploy-helpers/src/deploy/helpers/create-worker-upload-form.ts
