# Gap CLI - AI Assistant Guide

## Project Overview

**Description**: Gap CLI is a command-line tool for managing stacked Git branches, similar to Graphite. It helps developers work with dependent branches by providing commands to create, modify, submit, and navigate through branch stacks.

**Primary Technologies**:
- Node.js (ES Modules - `type: "module"`)
- Commander.js for CLI framework
- Simple-git for Git operations
- Chalk for terminal styling
- Inquirer for interactive prompts
- Ora for loading spinners

**Key Architectural Decisions**:
- Uses ES modules throughout (`import`/`export` syntax)
- Stores stack metadata in `~/.gap/stacks.json`
- Maintains parent-child relationships between branches
- Commands are modular and self-contained
- Utilities are separated into git operations and stack management

## Coding Conventions

### Naming Conventions
- **Files**: Lowercase with hyphens (e.g., `create.js`, `stack.js`)
- **Functions**: camelCase (e.g., `ensureCleanWorkingTree`, `getStackForBranch`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `GAP_DIR`, `STACKS_FILE`)
- **Variables**: camelCase (e.g., `currentBranch`, `stackName`)
- **Command names**: Lowercase single words (e.g., `create`, `log`, `submit`)
- **Options**: Kebab-case for long options (e.g., `--delete-merged`, `--force`)

### File Organization
```
/bin/gap.js         - CLI entry point
/src/
  /commands/        - Individual command implementations
  /utils/           - Shared utilities
    git.js         - Git operations wrapper
    stack.js       - Stack management functions
```

### Import/Export Conventions
- Always use ES module syntax
- Export individual functions/constants with named exports
- Import with destructuring: `import { functionName } from './utils/file.js'`
- Always include `.js` extension in imports
- Commands export a Commander.js Command instance

### Comment Style
- Minimal to no comments in the codebase
- Code is self-documenting through clear function and variable names
- Complex logic is broken into well-named functions

## Code Style Guidelines

### Indentation and Formatting
- 2-space indentation
- No tabs
- Unix line endings (LF)
- Trailing newline at end of files

### Line Length
- No strict limit enforced, but most lines are under 100 characters
- Long strings are broken for readability

### Bracket Placement
- Opening braces on same line (K&R style)
- Consistent spacing around braces

### Spacing Conventions
- Space after keywords: `if (condition)`, `for (let i = 0)`
- Space around operators: `a + b`, `x === y`
- Space after commas: `[1, 2, 3]`
- No space inside parentheses: `(value)`
- Blank line between logical sections

### Preferred Syntax Patterns
- Arrow functions for callbacks and short functions
- Regular function declarations for exported functions
- Async/await over promises
- Destructuring for imports and object access
- Template literals for string interpolation
- Strict equality (`===`) over loose equality

## Development Practices

### Git Commit Message Format
- Follow conventional commit format when contributing
- Use present tense ("add feature" not "added feature")
- Keep first line under 50 characters
- Reference issues when applicable

### Branch Naming Conventions
- No strict convention enforced in code
- Tool supports any branch name without spaces
- Encourages descriptive branch names

### Testing Approach
- Currently no tests implemented (npm test exits with error)
- Consider adding tests for critical git operations

### Error Handling Patterns
- Try-catch blocks around async operations
- Consistent error messaging with chalk.red
- Exit with code 1 on errors
- Ora spinner fail states for visual feedback

### Logging Conventions
- Use chalk for colored output:
  - `chalk.green` for success
  - `chalk.red` for errors
  - `chalk.yellow` for warnings
  - `chalk.cyan.bold` for headers
  - `chalk.dim` for secondary information
- Ora spinners for long-running operations
- Console.log for general output

## Project-Specific Patterns

### Common Design Patterns

1. **Command Pattern**: Each command is a self-contained module exporting a Commander Command instance
2. **Async/Await Pattern**: All git operations and I/O use async/await
3. **Builder Pattern**: Commands are built using method chaining with Commander.js
4. **Repository Pattern**: Stack data is persisted to JSON file with load/save functions

### Custom Utilities Frequently Used

**Git Utilities** (`src/utils/git.js`):
- `ensureCleanWorkingTree()` - Validates no uncommitted changes
- `getCurrentCommit()` - Gets current HEAD commit
- `branchExists()` - Checks if branch exists
- `createBranch()` - Creates and checks out new branch
- `rebaseBranch()` - Rebases branch onto another
- `pushBranch()` - Pushes with lease support

**Stack Utilities** (`src/utils/stack.js`):
- `getCurrentBranch()` - Gets current branch name
- `getStackForBranch()` - Finds stack containing branch
- `createStack()` - Creates new stack
- `addBranchToStack()` - Adds branch with parent tracking
- `getParentBranch()` - Gets parent of branch in stack
- `getChildBranches()` - Gets children of branch

### State Management Approach
- Stack state persisted in `~/.gap/stacks.json`
- Structure:
  ```json
  {
    "repo-url": {
      "stack-name": {
        "baseBranch": "main",
        "branches": ["feature-1", "feature-2"],
        "branchParents": {
          "feature-2": "feature-1"
        },
        "created": "ISO-date"
      }
    }
  }
  ```
- Modify operation state stored in git config during rebase

### API Interaction Patterns
- Uses GitHub CLI (`gh`) for PR operations
- Executes external commands with `execSync`
- Parses JSON output from `gh` commands

## Dependencies and Environment

### Key Dependencies
- **commander** (^14.0.0): CLI framework for parsing arguments and options
- **chalk** (^5.4.1): Terminal string styling
- **inquirer** (^12.6.3): Interactive command line prompts
- **ora** (^8.2.0): Terminal spinners for loading states
- **simple-git** (^3.28.0): Git command wrapper

### Environment Variables
- No environment variables used directly
- Relies on system git configuration
- Uses OS home directory for config storage

### Build and Deployment
- No build process required (pure JavaScript)
- Install globally with `npm install -g .`
- Entry point: `#!/usr/bin/env node` shebang

### Development Setup Requirements
1. Node.js with ES module support
2. Git installed and configured
3. GitHub CLI (`gh`) for PR operations
4. Unix-like environment (uses paths like `~/.gap`)

## Common Pitfalls and Gotchas

### Known Issues
1. **Working Tree Must Be Clean**: Most operations require clean working tree
2. **Stack Persistence**: Stacks are tied to repository URL, changing remotes may lose stack data
3. **Sequential Parent Assumption**: Old stack format assumes sequential parent-child relationships
4. **GitHub CLI Dependency**: Submit command requires `gh` CLI tool installed

### Areas Requiring Special Attention
1. **Backward Compatibility**: Code maintains compatibility with old stack format (without `branchParents`)
2. **Rebase Conflicts**: Modify operation saves state to handle conflict resolution
3. **Force Push Safety**: Uses `--force-with-lease` for safer force pushes
4. **Branch Deletion**: Sync command can delete merged branches

### Performance Considerations
- Fetches from remote can be slow on large repos
- Stack file grows with each repository
- No pagination for large stack displays

### Security Considerations
- No authentication handling (relies on git/gh auth)
- Stack data stored in plain text JSON
- No validation of branch names beyond git requirements

## Code Examples

### Well-Written Command Pattern
```javascript
export const createCommand = new Command('create')
  .alias('c')
  .description('Create a new branch in your stack')
  .argument('[branch-name]', 'Name for the new branch')
  .option('-m, --message <message>', 'Commit message for any uncommitted changes')
  .action(async (branchName, options) => {
    const spinner = ora();
    
    try {
      await ensureCleanWorkingTree();
      
      const currentBranch = await getCurrentBranch();
      let currentStack = await getStackForBranch(currentBranch);
      
      // Implementation...
      
      spinner.succeed(chalk.green(`Created branch '${branchName}'`));
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });
```

### Error Handling Pattern
```javascript
export async function rebaseBranch(branch, onto) {
  try {
    await git.rebase([onto, branch]);
    return true;
  } catch (error) {
    console.error(chalk.red(`Rebase failed: ${error.message}`));
    return false;
  }
}
```

### Interactive Prompt Pattern
```javascript
const { confirmDelete } = await inquirer.prompt([{
  type: 'confirm',
  name: 'confirmDelete',
  message: 'Delete these branches?',
  default: true
}]);

if (!confirmDelete) {
  console.log(chalk.yellow('Skipping branch deletion'));
  return;
}
```

### Stack State Management
```javascript
export async function addBranchToStack(stackName, branch, parentBranch = null) {
  const repo = await getCurrentRepo();
  if (!repo) throw new Error('Not in a git repository');
  
  const stacks = await loadStacks();
  if (!stacks[repo] || !stacks[repo][stackName]) {
    throw new Error(`Stack ${stackName} not found`);
  }
  
  if (!stacks[repo][stackName].branches.includes(branch)) {
    stacks[repo][stackName].branches.push(branch);
    
    if (!stacks[repo][stackName].branchParents) {
      stacks[repo][stackName].branchParents = {};
    }
    
    if (parentBranch) {
      stacks[repo][stackName].branchParents[branch] = parentBranch;
    }
    
    await saveStacks(stacks);
  }
}
```