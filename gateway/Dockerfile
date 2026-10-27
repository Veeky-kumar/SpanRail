# syntax=docker/dockerfile:1

# ---- build: compile a static binary ----
# 1.27.2 or newer is required (go.mod): earlier 1.27.x releases have known net/http, HTTP/2 and
# crypto/tls vulnerabilities that govulncheck flags. The image sets GOTOOLCHAIN=local, so an
# older compiler fails the build instead of silently producing a vulnerable binary.
# The build stage always runs on the build machine's own architecture and cross-compiles, so a
# multi-arch image does not need to emulate a second CPU to compile.
FROM --platform=$BUILDPLATFORM golang:1.27.2-alpine AS build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src

# Copy the module files first so the dependency download is cached until they change.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# CGO off => a fully static binary with no libc dependency, so it can run on a minimal image.
# -trimpath removes build-machine paths; -s -w strip the symbol table and DWARF to shrink it.
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /out/gateway ./cmd/gateway

# ---- run: nothing but the binary ----
# distroless/static has no shell, package manager or curl, which leaves nothing for an
# attacker to use. The :nonroot tag runs as uid 65532 instead of root.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/gateway /gateway
EXPOSE 8080
# The image has no curl, so the binary probes itself.
HEALTHCHECK --interval=10s --timeout=4s --start-period=3s --retries=3 CMD ["/gateway", "healthcheck"]
ENTRYPOINT ["/gateway"]
