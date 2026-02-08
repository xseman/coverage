<h1 align="center">coverage</h1>

<p align="center">
	GitHub Action that parses coverage files and posts sticky PR comments with per-file deltas.
</p>

<p align="center">
	<a href="#features">Features</a> •
	<a href="#usage">Usage</a> •
	<a href="#inputs">Inputs</a> •
	<a href="#outputs">Outputs</a> •
	<a href="#generating-coverage-files">Coverage Files</a> •
	<a href="#development">Development</a>
</p>

## Why

Most coverage reporting actions require third-party services or complex setups.
This action works entirely within GitHub Actions using built-in cache, supports
multiple languages, and shows meaningful per-file diffs without external dependencies.

## Features

- Supports any LCOV-producing tool (Bun, Jest, c8, nyc, Istanbul, PHPUnit, …) and Go coverage
- Shows per-file coverage deltas against base branch
- Single sticky PR comment (updates existing, no spam)
- Uses `@actions/cache` for cross-run comparison
- Optional thresholds and fail-on-decrease
- No external services or tokens required

## Usage

```yaml
- uses: xseman/coverage
  with:
      coverage-artifact-paths: |
          bun:coverage/lcov.info
          go:coverage.out
```

### Complete Example

```yaml
name: Coverage
on: pull_request

jobs:
    test:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v6
            - uses: oven-sh/setup-bun@v2
            - run: bun install
            - run: bun test --coverage --coverage-reporter=lcov

            - uses: xseman/coverage
              with:
                  coverage-artifact-paths: bun:coverage/lcov.info
```

### Multi-Tool Example

```yaml
- uses: xseman/coverage
  with:
      coverage-artifact-paths: |
          bun:coverage/lcov.info
          go:coverage.out

      fail-on-decrease: true
      coverage-threshold: 80
```

## Inputs

| Input                     | Default                             | Description                                        |
| ------------------------- | ----------------------------------- | -------------------------------------------------- |
| `coverage-artifact-paths` | _(required)_                        | Newline or comma-separated `<tool>:<path>` entries |
| `base-branch`             | PR base ref                         | Branch for delta comparison                        |
| `cache-key`               | `coverage-reporter`                 | Cache key prefix                                   |
| `update-comment-marker`   | `<!-- coverage-reporter-sticky -->` | HTML comment marker for sticky comments            |
| `colorize`                | `on`                                | Enable `[+]`/`[-]` delta markers (`on` or `off`)   |
| `fail-on-decrease`        | `false`                             | Fail if coverage decreases                         |
| `coverage-threshold`      | `0`                                 | Minimum overall coverage % (0 = disabled)          |
| `github-token`            | `${{ github.token }}`               | Token for PR comments (automatically provided)     |

### Supported Tools

The `<tool>` prefix in `coverage-artifact-paths` selects the parser and labels the output:

| Tool      | Format           | Example                   |
| --------- | ---------------- | ------------------------- |
| `bun`     | LCOV             | `bun:coverage/lcov.info`  |
| `lcov`    | LCOV (generic)   | `lcov:coverage/lcov.info` |
| `go`      | Go cover profile | `go:coverage.out`         |
| `gocover` | Go cover profile | `gocover:coverage.out`    |

## Outputs

| Output               | Description                                 |
| -------------------- | ------------------------------------------- |
| `overall-coverage`   | Overall coverage percentage (e.g., `82.50`) |
| `coverage-decreased` | `true` if any file coverage decreased       |
| `comment-id`         | ID of created/updated PR comment            |

## Generating Coverage Files

### Bun (LCOV)

```bash
bun test --coverage --coverage-reporter=lcov
# Creates: coverage/lcov.info
```

### Go

```bash
go test -coverprofile=coverage.out ./...
```

For integration tests with `-cover` build flag:

```bash
go build -cover -o app .
GOCOVERDIR=coverdata ./app
go tool covdata textfmt -i=coverdata -o=coverage.out
```

## Output Format

Coverage reports appear as sticky PR comments with monospace formatting:

```
 70.00% (49/70) src/api/client.ts     [-] -5.25%
 63.33% (19/30) src/components/Button.tsx
 96.00% (48/50) src/hooks/useAuth.ts     [+] +2.50%
100.00% (45/45) src/store/index.ts

Bun Coverage: 83.48% [-] -1.20%
```

Multi-tool reports show each tool's coverage block followed by an overall total.

## Development

```bash
bun install    # Install dependencies
bun test       # Run tests
bun run lint   # Typecheck + format check
bun run build  # Bundle to lib/index.mjs
```

## Related

- [actions/cache](https://github.com/actions/cache) - GitHub Actions caching
- [Bun test coverage](https://bun.sh/docs/cli/test#coverage) - Bun coverage documentation
- [Go test coverage](https://go.dev/blog/cover) - Go coverage tools
