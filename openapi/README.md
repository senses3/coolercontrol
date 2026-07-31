# OpenAPI specification

`openapi.json` is generated from the daemon's route table. Regenerate it from the repo root:

```sh
make openapi
```

This needs no running daemon and no root. The daemon test `checked_in_openapi_spec_is_current` fails
when the checked-in file is stale, so it should rarely be out of date.

The daemon also serves the same document at `/api.json`, but only in debug builds.

## Hosting note

The file is pretty-printed so that merge request diffs are readable. Indentation is almost pure
redundancy, so it costs about 3 KB gzipped, but only if the host actually compresses it.

`docs.coolercontrol.org` gzips HTML but not `application/json`, so it currently serves this file
uncompressed. Adding the JSON type to Apache's `mod_deflate` config makes the download roughly 5
times smaller than it is today:

```apache
AddOutputFilterByType DEFLATE application/json
```
