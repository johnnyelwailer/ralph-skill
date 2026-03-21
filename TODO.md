# Issue #40: CI: Add status badge to README

## Tasks

- [x] Add CI status badge `![CI](https://github.com/johnnyelwailer/ralph-skill/actions/workflows/ci.yml/badge.svg)` to the top of README.md, before the first heading — the spec says to place it "before the first heading or description"; owner/repo is `johnnyelwailer/ralph-skill` per git remote

## Notes

- No `ci.yml` workflow exists in the repo yet (no `.github/workflows/` directory at all). The badge will show "no status" until a `ci.yml` workflow is created. This is fine — the spec only asks for the badge, not the workflow itself.

## Spec-Gap Analysis

spec-gap analysis: no discrepancies found — spec fully fulfilled
