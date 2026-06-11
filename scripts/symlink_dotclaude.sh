#!/usr/bin/env bash
# Mirror every leaf file under dotclaude_folder/ into .claude/ as a relative symlink.
#
# dotclaude_folder/ is the version-controlled source of truth for this project's
# Claude Code configuration; .claude/ is the directory the harness actually reads.
# Re-run this after adding files to dotclaude_folder/. It is idempotent: existing
# symlinks are replaced in place, and a real file at a target path is never clobbered.
set -euo pipefail

# Get the repository root directory (one level up from this script)
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# Define source and destination directories
src_root="dotclaude_folder"
dest_root=".claude"

# Iterate through all files in the source directory
find "$src_root" -type f | while read -r src; do
        # Extract relative path from source file
        rel="${src#"$src_root"/}"
        dest="$dest_root/$rel"
        # Skip if destination is a real file (not a symlink)
        if [ -e "$dest" ] && [ ! -L "$dest" ]; then
                echo "skip (real file exists): $dest"
                continue
        fi
        # Create parent directories for the destination if they don't exist
        mkdir -p "$(dirname "$dest")"
        # Calculate relative path from destination to source for the symlink
        target="$(python3 -c 'import os, sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$src" "$(dirname "$dest")")"
        # Create or replace the symlink
        ln -sfn "$target" "$dest"
        echo "linked: $dest -> $target"
done
