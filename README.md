# Gap CLI

A CLI tool for managing stacked Git branches, similar to Graphite.

## Installation

```bash
npm install -g .
```

## Commands

### `gap create [branch-name]`
Create a new branch in your stack.

### `gap log`
Get a bird's eye view of your stack.
- Use `-a` to see all stacks
- Use `-v` for verbose output with commits

### `gap submit`
Create or update PRs for every branch in your stack.
- Use `-b <branch>` to submit only a specific branch
- Use `-f` to force push

### `gap modify`
Update changes across your stack with automatic rebasing.
- Use `--continue` after resolving conflicts
- Use `--abort` to cancel the operation

### `gap sync`
Sync your local stack with remote changes and clean up stale branches.
- Use `-d` to delete merged branches
- Use `-f` to skip confirmation prompts

## Example Workflow

```bash
# Start a new stack
gap create feature-1

# Add more branches to the stack
gap create feature-2
gap create feature-3

# View your stack
gap log

# Submit PRs for all branches
gap submit

# Make changes and update the stack
gap modify

# Sync with remote
gap sync -d
```