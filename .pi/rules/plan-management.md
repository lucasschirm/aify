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
 - Always check tasks as complete whenever you finish them.
 - Whenever plan is ready, present the plan to the user.
