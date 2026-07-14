---
paths:
  - "plans/*.md"
summary: Plan management
kind: rules
triggers:
  - "create a new plan"
  - "update plan"
  - "create plan"
  - "update the plan"
priority: 10
guard: true
---

# The plan file

 - Only create one plan file per session. All the updates and plan details should be tracked in a single file.
 - Keep the current plan file always update as you move trought the tasks.
 - When in plan mode, you should only read files, never write, edit or execute bash commands.
 - Always update the plan file as you progress through the task. 
 - Whenever plan is ready, present the plan to the user.
 - Create the plan file in the `plans` folder. Follow the pattern `TASK_###_PLAN.md`.
 - When the plan is complete, rename the file to `TASK_###_COMPLETE.md`.
