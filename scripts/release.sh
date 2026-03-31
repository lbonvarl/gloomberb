#!/usr/bin/env bash
set -euo pipefail

PROMPT=$(cat <<'EOF'
You are releasing the project "gloomberb" (a Bloomberg-style terminal stock tracker).

Use gh to:
1. Find the latest release tag and its date
2. List all merged PRs since that release
3. Decide the version bump. We're pre-1.0, so bump the minor (0.x.0) for features/breaking changes and patch (0.x.y) for fixes/improvements. Never bump to 1.0+.
4. Create a new GitHub release with gh release create using a catchy title and nice markdown release notes referencing PR numbers

The release tag should be vX.Y.Z. Steps:
1. Update the version in package.json using jq
2. Commit the version bump with message "vX.Y.Z"
3. Create a git tag vX.Y.Z
4. Push the commit and tag
5. Create the GitHub release with gh release create --draft
EOF
)

claude -p --allowedTools 'bash(gh:*)' 'bash(git:*)' "$PROMPT"
