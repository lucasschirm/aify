#!/bin/bash

# Script to add ./ prefix to existing relative paths
# Converts: ../../ or ../ to ./../../ or ./../ format in markdown links

REFERENCE_ROOT="reference_docs"

if [ ! -d "$REFERENCE_ROOT" ]; then
  echo "Error: Directory $REFERENCE_ROOT not found"
  exit 1
fi

echo "Adding ./ prefix to relative paths in $REFERENCE_ROOT..."

# Find all markdown/text files and fix relative paths
find "$REFERENCE_ROOT" -type f \( -name "*.md" -o -name "*.html" -o -name "*.txt" \) | while read -r filepath; do
  tmpfile="${filepath}.tmp"

  # Replace ( followed by .. with (./..
  # This handles links like [text](../../path) -> [text](./../../path)
  sed 's|(\.\.|(./\.\.|g' "$filepath" > "$tmpfile"

  # Check if changes were made
  if ! cmp -s "$filepath" "$tmpfile"; then
    mv "$tmpfile" "$filepath"
    echo "✓ Updated: $filepath"
  else
    rm -f "$tmpfile"
  fi
done

echo "Conversion complete!"
