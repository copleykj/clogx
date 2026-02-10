# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClogX is a CLI tool that generates formatted commit logs (.docx or .pdf) from git repositories. It scans all subdirectories in the current working directory for git repos, extracts commits filtered by author and date range, and produces a document with commit messages and diff statistics. Designed for freelancers reporting work to clients.

## Tech Stack & Runtime

- **Runtime:** Bun (TypeScript executed directly, no build step)
- **Language:** TypeScript (ESNext, strict mode)
- **CLI framework:** Commander with `@commander-js/extra-typings`
- **Key libraries:** simple-git (git ops), docx (Word generation), libreoffice-convert (PDF), date-fns (dates), fozziejs (WakaTime API), inquirer (prompts)

## Commands

```bash
# Install dependencies
bun install

# Run locally
bun run index.ts --month=May --author="John Doe"

# Run with all options
bun run index.ts --month=May --author="John Doe" --pdf --fetch --waka

# Publish a release (uses changesets)
bun run publish-release
```

There are no test, lint, or build scripts configured.

## Architecture

This is a single-file CLI application. All logic lives in `index.ts` (~278 lines):

- **Lines 49-56:** Commander CLI definition with options parsing
- **Lines 59-183:** Main flow — validates month, calculates date range, scans directories for git repos, extracts commit logs, generates document
- **Lines 185-237:** `pullAllBranches()` — fetches and checks out all remote branches when `--fetch` is used
- **Lines 239-271:** `initWakaTime()` — reads or prompts for WakaTime API key from `~/.wakatime.cfg`
- **Lines 273-277:** `getCumTimeForProject()` — gets cumulative editor time from WakaTime API

The CLI is registered as `clogx` via the `bin` field in package.json and uses a `#!/usr/bin/env bun` shebang.

## Key Behaviors

- The tool must be run from a **parent directory** containing git repositories as subdirectories
- Month can be specified as full name ("january") or 3-letter abbreviation ("jan")
- Date range is calculated using date-fns: from last day of previous month to last day of target month
- PDF output requires LibreOffice installed on the system
- WakaTime integration reads the API key from `~/.wakatime.cfg` (INI format) or prompts interactively
- Output files are written to the current directory as `commit-log.docx` or `commit-log.pdf`
