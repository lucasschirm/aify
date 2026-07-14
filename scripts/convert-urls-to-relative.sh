#!/bin/bash

# Script to convert GitHub raw URLs to relative paths in markdown documentation
# Replaces: https://raw.githubusercontent.com/ServiceNow/ServiceNowDocs/australia/markdown/
# With: relative path based on file's depth

MARKDOWN_ROOT="reference_docs/ServiceNowDocs/markdown"

# Check if the markdown directory exists
if [ ! -d "$MARKDOWN_ROOT" ]; then
  echo "Error: Directory $MARKDOWN_ROOT not found"
  exit 1
fi

echo "Converting GitHub URLs to relative paths in $MARKDOWN_ROOT..."

# Find all files recursively
find "$MARKDOWN_ROOT" -type f \( -name "*.md" -o -name "*.html" -o -name "*.txt" \) | while read -r filepath; do
  # Calculate the relative path
  # Get the directory of the file relative to markdown root
  dir_relative_to_root="${filepath#$MARKDOWN_ROOT/}"
  dir_only="${dir_relative_to_root%/*}"

  # Count the depth (number of directories)
  if [ "$dir_only" = "$dir_relative_to_root" ]; then
    # File is directly in markdown root
    depth=0
  else
    # Count slashes to determine depth
    depth=$(echo "$dir_only" | tr -cd '/' | wc -c)
  fi

  # Build the relative path string
  # Each level needs ../ to go back, starting with ./
  relative_prefix="./"
  for ((i=0; i<=depth; i++)); do
    relative_prefix="${relative_prefix}../"
  done

  # Create a temporary file
  tmpfile="${filepath}.tmp"

  # Perform the replacement
  # Match the GitHub URL pattern and replace with relative path
  sed "s|https://raw\.githubusercontent\.com/ServiceNow/ServiceNowDocs/australia/markdown/|${relative_prefix}|g" "$filepath" > "$tmpfile"

  # Check if changes were made
  if ! cmp -s "$filepath" "$tmpfile"; then
    mv "$tmpfile" "$filepath"
    echo "✓ Updated: $filepath"
  else
    rm "$tmpfile"
  fi
done

echo "Conversion complete!"
