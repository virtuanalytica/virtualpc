# Git Workflow for Custom Paperclip

## Branch Strategy

We use **feature/task-N** branching strategy for autonomous agent execution:

### Branch Naming Conventions

```
feature/task-16-lightrag-integration      # Task #16
feature/task-17-kafka-setup               # Task #17
feature/task-18-nginx-security            # Task #18
...
```

Each agent claims a task, creates a feature branch, and opens a PR when ready.

### Branch Protection Rules

- `main`: Requires 1 approval before merge
- All PRs require passing CI/CD before merge
- No force-pushes to main

## Commit Message Format

Follow **Conventional Commits**:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat`: New feature (Task #16-25)
- `fix`: Bug fix
- `test`: Test additions/modifications
- `docs`: Documentation updates
- `chore`: Build, dependency updates
- `refactor`: Code restructuring
- `ci`: CI/CD pipeline changes

### Examples

```
feat(lightrag): implement agent query wrapper with caching

- Create src/integrations/lightrag/agent-api.ts
- Implement LRU cache (1000 entries max)
- Add rate limiting (100 queries/min per agent)
- All tests passing with >90% coverage

Closes #16
```

```
test(kafka): add producer/consumer integration tests

- Verify topic creation with correct partitions
- Test message publish/consume cycle
- Validate consumer group behavior

Closes #17
```

## Workflow Steps

### 1. Pick a Task

Check `/home/knight2/DETAILED_TASK_BRIEFS.md` for task assignments:

| Task | Assigned | What to Build | Est. Hours |
|------|----------|---------------|-----------|
| #16  | Kai (CTO) | LightRAG integration | 4-6h |
| #17  | Zip (Jr)  | Kafka message queue | 3-4h |
| #18  | Kai (CTO) | Nginx security | 2-3h |
| #19  | Zip (Jr)  | Model router | 5-6h |
| #20  | Kai (CTO) | Docker deployment | 4-5h |
| #21  | Zip (Jr)  | Venv setup | 2-3h |
| #22  | Kai (CTO) | Paperclip fork | 4-6h |
| #23  | Zip (Jr)  | Skills system | 3-4h |
| #24  | Kai (CTO) | Kafka API orchestration | 5-6h |
| #25  | Vex (Sr)  | ROI analysis | 2-3h |

### 2. Create Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/task-16-lightrag-integration
```

### 3. Implement

- Follow task brief's "What You Need to Build" section
- Write code with clear logging
- Add tests as you go (don't leave for end)
- Commit frequently with meaningful messages

### 4. Test Locally

```bash
npm install
npm run build
npm run test
npm run lint
```

### 5. Push & Create PR

```bash
git push -u origin feature/task-16-lightrag-integration
```

Then create PR on GitHub with:

**Title:** `[Task #16] LightRAG Agent Integration`

**Body:**
```markdown
## Summary
Completes Task #16: Create seamless integration between Paperclip agents and LightRAG shared memory

## What's Implemented
- ✓ Agent query wrapper (`src/integrations/lightrag/agent-api.ts`)
- ✓ Memory schema with Neo4j indexes (`src/integrations/lightrag/schema.ts`)
- ✓ Integration tests (`tests/integration/lightrag.test.ts`)

## Success Criteria Met
- ✓ Query latency <100ms
- ✓ Cache hit rate >70%
- ✓ Data persists across restarts
- ✓ Tests passing (>90% coverage)

## Testing
```bash
npm test tests/integration/lightrag.test.ts
```

## Closes
Fixes #16
```

### 6. Code Review

- GitHub Actions runs tests automatically
- Reviewer checks code quality, tests, and success criteria
- Address review comments with new commits (don't rebase/amend)
- Once approved, merge to main

### 7. Mark Task Complete

Update status in GitHub Issues (or equivalent):
- Set status to ✅ **Completed**
- Link to merged PR
- Note any blockers for next task

## CI/CD Integration

### GitHub Actions Workflow

File: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, feature/**]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Lint
        run: npm run lint
      
      - name: Test
        run: npm run test -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## How to Integrate with GitHub

### 1. Create Repository on GitHub

```bash
cd /home/knight2/custom-virtualpc
git remote add origin https://github.com/your-org/custom-virtualpc.git
git branch -M main
git push -u origin main
```

### 2. Create GitHub Issues for Tasks #16-25

Use GitHub Issues to track:
- Task #16: LightRAG Agent Integration
- Task #17: Kafka Message Queue Setup
- ... (all 25 tasks)

Label each with `task-XX`, assign to agent (Kai, Zip, Vex), set status to 🚀 **In Progress**.

### 3. Link PRs to Issues

In PR description, write `Closes #16` to auto-link and close issue on merge.

## Critical Path to MVP (14-19 hours)

```
1. Task #16 (Kai)  → LightRAG integration [4-6h]
   ↓
2. Task #17 (Zip)  → Kafka setup [3-4h]
   ↓
3. Task #24 (Kai)  → Kafka API orchestration [5-6h]
   ↓
4. Task #21 (Zip)  → Venv setup [2-3h]
   
(Parallel) Task #18, #19, #20, #22, #23, #25
```

## Troubleshooting

### "Your branch is ahead of origin/main by X commits"

You committed but didn't push. Run:
```bash
git push origin feature/task-16-lightrag-integration
```

### "Changes not staged for commit"

You edited files but didn't stage them. Run:
```bash
git add -A
git commit -m "feat(lightrag): ..."
git push
```

### "Merge conflict"

Pull latest main and resolve:
```bash
git fetch origin
git rebase origin/main
# Fix conflicts in your editor
git add .
git rebase --continue
git push -f origin feature/task-16-lightrag-integration
```

### "env file committed accidentally"

Remove immediately:
```bash
git rm --cached .env
git commit -m "chore: remove .env from git"
git push
```

Then rotate the exposed secret in the key manager. Do not recreate local `.env`
files for VirtualPC; use Infisical, managed identity, or process-manager
injection for runtime-only bootstrap values.

## Best Practices

✅ **DO:**
- Commit frequently (every 30-60 min of work)
- Write descriptive commit messages
- Test before pushing
- Keep PRs focused on one task
- Update task status in GitHub Issues
- Review others' PRs

❌ **DON'T:**
- Commit `.env` or secrets
- Force-push to main
- Merge without tests passing
- Leave tasks in "In Progress" for >1 day without updates
- Rebase main after PR created (causes issues)

## Contact

Questions? Ping **Kai (CTO)** or **Zip (Jr Dev)** in Slack.

Let's build! 🚀
