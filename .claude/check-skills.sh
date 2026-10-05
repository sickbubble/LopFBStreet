#!/usr/bin/env bash
# Drift check for .claude/ against the code and docs it describes.
#
# Run by /session-end. Three reports:
#
#   REVIEW   a skill whose "## Sources" names a file this session changed.
#            Not a failure -- a prompt to re-read the skill against that source
#            and either fix it or confirm it is still true.
#
#   STALE    a backticked identifier in a skill, agent or command file that
#            exists neither in packages/ (and the build config) nor in the C#
#            reference, ../LopFBBounce. In the Godot repo DribbleApex,
#            AutoBounce, HorizontalEase and CenteringGain all outlived their
#            code this way.
#
#   PENDING  a name found only in the C# reference: the port has not reached
#            it yet. Expected through W1-W3, never a failure. Once the port is
#            done, a PENDING name is a rename the port made silently.
#
#            A name that is deliberately absent -- browser or library
#            vocabulary, a retired parameter kept as a tombstone, or a spec
#            named before it is built -- goes in .claude/known-names.txt with
#            the reason.
#
# docs/ is deliberately NOT scanned for stale names. TUNING_LOG.md cites
# deleted parameters on purpose, as history, so nobody reaches for them again.
#
# Exit 1 if anything is STALE. REVIEW and PENDING alone exit 0.
#
# Usage:  bash .claude/check-skills.sh [base-ref]

set -u

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root" || exit 1

# The C# reference, read at its tag when the tag is there.
ref_repo="$root/../LopFBBounce"
ref_tag="godot-final"

bold=$'\033[1m'
dim=$'\033[2m'
red=$'\033[31m'
yellow=$'\033[33m'
cyan=$'\033[36m'
green=$'\033[32m'
off=$'\033[0m'

# --- the session base ------------------------------------------------------
# "Record the session: ..." is this repo's session marker. Everything since the
# newest one is this session's work.

base="${1:-}"
base_why="argument"

if [ -z "$base" ]; then
    base=$(git log --format='%H %s' -n 100 2>/dev/null \
           | grep -m1 -E '^[0-9a-f]+ Record the session' \
           | cut -d' ' -f1)
    base_why='last "Record the session"'
fi

if [ -z "$base" ]; then
    base=$(git rev-parse --verify -q HEAD~1 2>/dev/null)
    base_why="HEAD~1, no session marker found"
fi

if [ -z "$base" ]; then
    base=$(git rev-parse --verify -q HEAD 2>/dev/null)
    base_why="HEAD, no earlier commit"
fi

if [ -n "$base" ]; then
    printf '%s\n\n' "${dim}base: $(git rev-parse --short "$base") (${base_why})${off}"
else
    printf '%s\n\n' "${dim}base: none (no commits yet) -- every file counts as changed${off}"
fi

# --- what changed ----------------------------------------------------------
# Committed since the base, plus the working tree: this runs BEFORE the session
# commit, so uncommitted work is most of what matters.

changed=$( { [ -n "$base" ] && git diff --name-only "$base"..HEAD 2>/dev/null
             git status --porcelain --untracked-files=all 2>/dev/null | sed -e 's/^...//' -e 's/.* -> //'
           } | sed 's#^"\(.*\)"$#\1#' | sort -u )

# --- report A: skills whose sources moved ----------------------------------

review_report=$(
    for skill in .claude/skills/*/SKILL.md; do
        [ -f "$skill" ] || continue

        name=$(basename "$(dirname "$skill")")

        sed -n '/^## Sources/,$p' "$skill" \
          | grep -oE '`[^`]+`' | tr -d '`' | sort -u \
          | while read -r src; do
                [ -n "$src" ] || continue
                if printf '%s\n' "$changed" | grep -qxF -- "$src"; then
                    printf '%s\t%s\n' "$name" "$src"
                fi
            done
    done
)

reviews=0

if [ -n "$review_report" ]; then
    reviews=$(printf '%s\n' "$review_report" | cut -f1 | sort -u | wc -l | tr -d ' ')

    printf '%s\n' "$review_report" | cut -f1 | sort -u | while read -r name; do
        printf '%s  %s\n' "${yellow}REVIEW${off}" "${bold}${name}${off}"
        printf '%s\n' "$review_report" \
          | awk -F'\t' -v n="$name" '$1 == n { print "        " $2 " changed" }'
    done

    printf '\n'
fi

# --- report B: names that no longer exist ----------------------------------
# Two-hump CamelCase only (BounceSolver, HoldOffset, KeepUpReach). That is the
# shape a code identifier has and a heading or a file name does not, which
# keeps the false-positive rate low enough that the report gets read.

known=".claude/known-names.txt"

in_packages() {
    grep -rqF --include='*.ts' --include='*.json' --exclude-dir=node_modules --exclude-dir=dist \
        -- "$1" packages package.json tsconfig.base.json vitest.config.ts 2>/dev/null
}

in_reference() {
    [ -d "$ref_repo" ] || return 1
    if git -C "$ref_repo" rev-parse -q --verify "$ref_tag" >/dev/null 2>&1; then
        git -C "$ref_repo" grep -q -F -e "$1" "$ref_tag" -- domain game tests 2>/dev/null
    else
        grep -rqF --include='*.cs' -- "$1" "$ref_repo/domain" "$ref_repo/game" "$ref_repo/tests" 2>/dev/null
    fi
}

name_report=$(
    for file in .claude/skills/*/SKILL.md .claude/agents/*.md .claude/commands/*.md; do
        [ -f "$file" ] || continue

        grep -noE '`[^`]+`' "$file" \
          | tr -d '`' \
          | tr '.' ':' \
          | awk -F: '{ for (i = 2; i <= NF; i++) if ($i != "") print $1 ":" $i }' \
          | grep -E ':[A-Z][a-z0-9]+([A-Z][a-z0-9]*)+$' \
          | sort -u -t: -k2,2 \
          | while IFS=: read -r line name; do
                if [ -r "$known" ] && grep -qxF -- "$name" "$known"; then
                    continue
                fi
                if in_packages "$name"; then
                    continue
                fi
                if in_reference "$name"; then
                    printf 'PENDING\t%s\t%s\t%s\n' "$file" "$line" "$name"
                else
                    printf 'STALE\t%s\t%s\t%s\n' "$file" "$line" "$name"
                fi
            done
    done
)

stale_report=$(printf '%s\n' "$name_report" | grep '^STALE' || true)
pending_report=$(printf '%s\n' "$name_report" | grep '^PENDING' || true)

stale=0
pending=0

if [ -n "$stale_report" ]; then
    stale=$(printf '%s\n' "$stale_report" | wc -l | tr -d ' ')

    printf '%s\n' "$stale_report" | while IFS=$'\t' read -r _ f l n; do
        printf '%s   %s\n' "${red}STALE${off}" "${bold}${f}:${l}${off}"
        printf '        %s\n' "\`${n}\` not found in packages/, the build config, or the C# reference"
    done

    printf '\n'
fi

if [ -n "$pending_report" ]; then
    pending=$(printf '%s\n' "$pending_report" | cut -f4 | sort -u | wc -l | tr -d ' ')

    printf '%s %s\n' "${cyan}PENDING${off}" "${dim}in ../LopFBBounce, not ported yet:${off}"
    printf '%s\n' "$pending_report" | cut -f4 | sort -u | tr '\n' ' ' | fold -s -w 76 | sed 's/^/        /'
    printf '\n\n'
fi

# --- summary ---------------------------------------------------------------

if [ "$reviews" -eq 0 ] && [ "$stale" -eq 0 ]; then
    printf '%s\n' "${green}nothing to review, no stale names${off} ${dim}(${pending} pending the port)${off}"
    exit 0
fi

printf '%s\n' "${dim}${reviews} to review, ${stale} stale, ${pending} pending the port${off}"

[ "$stale" -gt 0 ] && exit 1
exit 0
