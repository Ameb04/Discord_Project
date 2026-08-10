#!/bin/bash

# Exit on error
set -e

# 1. Create a new branch with a unique name (timestamp)
BRANCH_NAME="feature/commit-split-$(date +%s)"
git checkout -b "$BRANCH_NAME"

# 2. Get list of all changed files (modified + untracked, excluding ignored)
#    Using git status --porcelain to parse cleanly.
#    We take the second column (file name) for modified (M, M?) and untracked (??)
FILES=$(git status --porcelain | awk '{if ($1 == "??" || $1 ~ /^M/) print $2}')

# If no files, exit
if [ -z "$FILES" ]; then
    echo "No changes to commit."
    exit 1
fi

# Convert to array
readarray -t FILE_ARRAY <<<"$FILES"

# 3. Split into 7 chunks (roughly equal)
TOTAL=${#FILE_ARRAY[@]}
CHUNK_SIZE=$(( (TOTAL + 6) / 7 ))  # ceil division

# 4. Commit each chunk with a random date within the last 7 days
for ((i=0; i<7; i++)); do
    START=$((i * CHUNK_SIZE))
    END=$((START + CHUNK_SIZE))
    if [ $START -ge $TOTAL ]; then
        break
    fi
    if [ $END -gt $TOTAL ]; then
        END=$TOTAL
    fi

    # Get the files for this chunk
    CHUNK_FILES=("${FILE_ARRAY[@]:$START:$((END - START))}")

    # Stage them
    git add -- "${CHUNK_FILES[@]}"

    # Generate a random date in the past 7 days
    # Random days ago (0-6) and random seconds offset within that day
    DAYS_AGO=$((RANDOM % 7))
    SECONDS_OFFSET=$((RANDOM % 86400))  # up to 24h
    # Compute the timestamp: current time - (DAYS_AGO days) - (SECONDS_OFFSET seconds)
    COMMIT_DATE=$(date -d "now - $DAYS_AGO days - $SECONDS_OFFSET seconds" --iso-8601=seconds)

    # Commit with that date (both author and committer)
    export GIT_COMMITTER_DATE="$COMMIT_DATE"
    git commit --date="$COMMIT_DATE" -m "Commit $((i+1)) of 7: split changes"

    # Unset to avoid affecting later commits
    unset GIT_COMMITTER_DATE
done

# 5. Push the new branch to origin
git push -u origin "$BRANCH_NAME"

echo "Done. Branch $BRANCH_NAME pushed with 7 commits."
