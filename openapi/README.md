# OpenAPI specification

`openapi.json` is generated from the daemon's route table. Regenerate it from the repo root:

```sh
make openapi
```

This needs no running daemon and no root. The daemon test `checked_in_openapi_spec_is_current` fails
when the checked-in file is stale, so it should rarely be out of date.

The daemon also serves the same document at `/api.json`, but only in debug builds.
