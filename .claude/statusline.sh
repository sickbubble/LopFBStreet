#!/usr/bin/env bash
# Status line for LopFBStreet.
#
# Shows the current phase and its gate status, read live from
# docs/PROGRESS.md, plus the four project commands -- which exist but are
# manual, so this is what stops them being forgotten.
#
# Claude Code pipes session JSON on stdin; we do not need any of it, but we
# must drain it or the writer can block.
cat >/dev/null 2>&1

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
progress="$root/docs/PROGRESS.md"

dim=$'\033[2m'
bold=$'\033[1m'
cyan=$'\033[36m'
green=$'\033[32m'
yellow=$'\033[33m'
off=$'\033[0m'

milestone="?"
gate=""

if [ -r "$progress" ]; then
    # "**Milestone W0 - Setup.** ..."  ->  "W0 - Setup"
    milestone=$(sed -n 's/^\*\*Milestone \(.*\)\.\*\*.*/\1/p' "$progress" | head -1)
    [ -n "$milestone" ] || milestone="?"

    # "**Status: not passed.** ..."  ->  "not passed"
    gate=$(sed -n 's/^\*\*Status: \([^.]*\)\.\*\*.*/\1/p' "$progress" | head -1)
fi

case "$gate" in
    passed)     gate_out="${green}gate passed${off}" ;;
    "not passed") gate_out="${yellow}gate open${off}" ;;
    "")         gate_out="" ;;
    *)          gate_out="${yellow}${gate}${off}" ;;
esac

line="${bold}${milestone}${off}"
[ -n "$gate_out" ] && line="$line ${dim}|${off} $gate_out"
line="$line ${dim}|${off} ${cyan}/session-start /session-end /gate-check /tune${off}"

printf '%s' "$line"
