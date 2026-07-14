---
summary: Workspace rules
alwaysApply: true
priority: 10
kind: rules
guard: true
---

# General

 - Use pnpm as package manager.
 - Use typescript 5 of higher
 - All code should be written in typescript.
 
# Workspace rules

 - Before writing any code always check if functionality already exists. Do not recreate functions.
 - Create reusable code and follow SOLID principles.

# Tests
 - Use vitest to create and run tests
 - Anytime a new code file is created or modified, create or update existing tests
 - Code should have at least 80% of test coverage

 # AGENTS
  - All code folders should have an AGENTS.md file describing the folder, files and their purpose. 
  - Always update or create the AGENTS.md file after any changes.