# Third-party notices

Tracewell is released under the MIT licence (see `LICENSE`). It includes or depends on the following
third-party work, each under its own licence.

## Included in the source tree

- **Anatomy kit** (`src/components/iso/`): isometric drawing kit, MIT licence, copyright Ryan. The licence
  text is kept in `src/components/iso/LICENSE-anatomy`.

## Fonts

- **Schibsted Grotesk** and **JetBrains Mono**, loaded through `next/font`. Both are published under the
  SIL Open Font License 1.1.

## Go gateway (`gateway/`)

The gateway binary and its container image include these Go modules (see `gateway/go.mod`):

- `github.com/prometheus/client_golang`: Apache License 2.0. It ships a NOTICE file, reproduced in the
  module source; the licence requires that notice to accompany redistributions.
- `github.com/prometheus/client_model`, `github.com/prometheus/common`, `github.com/prometheus/procfs`:
  Apache License 2.0.
- `github.com/beorn7/perks`: MIT.
- `github.com/cespare/xxhash/v2`: MIT.
- `github.com/munnerz/goautoneg`: BSD 3-Clause.
- `golang.org/x/sys` and `google.golang.org/protobuf`: BSD 3-Clause.

The container image is built on `gcr.io/distroless/static-debian12`, which carries its own licences.

## npm dependencies

The web app and worker depend on npm packages listed in `package.json` and `package-lock.json`, each under
its own licence. Run a licence report (for example `npx license-checker --summary`) to list them for a
given release.
