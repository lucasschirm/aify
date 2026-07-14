#!/bin/bash

# Improved script to convert GitHub raw URLs to relative paths
# Replaces: https://raw.githubusercontent.com/ServiceNow/ServiceNowDocs/australia/markdown/
# With: relative path based on file's location relative to the markdown root

REFERENCE_ROOT="reference_docs"
MARKDOWN_ROOT="reference_docs/ServiceNowDocs/markdown"

# Check if the reference directory exists
if [ ! -d "$REFERENCE_ROOT" ]; then
  echo "Error: Directory $REFERENCE_ROOT not found"
  exit 1
fi

echo "Converting GitHub URLs to relative paths in $REFERENCE_ROOT..."
echo "Processing all files recursively..."

# Find all files recursively in the entire reference_docs directory
find "$REFERENCE_ROOT" -type f \( -name "*.md" -o -name "*.html" -o -name "*.txt" -o -name "*.json" \) | while read -r filepath; do
  # Calculate the relative path from the file to the markdown root

  # Get the absolute path of both file and markdown root
  abs_filepath="$(cd "$(dirname "$filepath")" && pwd)/$(basename "$filepath")"
  abs_markdown_root="$(cd "$MARKDOWN_ROOT" 2>/dev/null && pwd)"

  if [ -z "$abs_markdown_root" ]; then
    # If markdown root doesn't exist, calculate it
    abs_markdown_root="$(cd "$MARKDOWN_ROOT" && pwd 2>/dev/null || echo "${PWD}/${MARKDOWN_ROOT}")"
  fi

  # Get the directory of the file
  abs_filedir="$(dirname "$abs_filepath")"

  # Calculate relative path from file's directory to markdown root
  # This is a bit tricky in bash, so we'll use Python for accuracy
  relative_path=$(python3 << PYTHON_EOF
import os
import os.path

file_dir = "$abs_filedir"
markdown_root = "$abs_markdown_root"

try:
    # Calculate relative path from file_dir to markdown_root
    rel_path = os.path.relpath(markdown_root, file_dir)
    # Prefix with ./ to match the required format
    print("." + "/" + rel_path if rel_path != "." else ".")
except:
    print(".")
PYTHON_EOF
)

  # Create a temporary file
  tmpfile="${filepath}.tmp"

  # Perform the replacement
  # The replacement string should reference paths within markdown relative to the file
  sed "s|https://raw\.githubusercontent\.com/ServiceNow/ServiceNowDocs/australia/markdown/|${relative_path}/|g" "$filepath" > "$tmpfile"

  # Check if changes were made
  if ! cmp -s "$filepath" "$tmpfile"; then
    mv "$tmpfile" "$filepath"
    echo "✓ Updated: $filepath"
  else
    rm "$tmpfile"
  fi
done

echo "Conversion complete!"
