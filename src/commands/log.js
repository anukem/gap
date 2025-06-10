import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getCurrentBranch, getStackForBranch, loadStacks, getCurrentRepo } from '../utils/stack.js';
import { getCommitsBetween, getCurrentCommit } from '../utils/git.js';
import simpleGit from 'simple-git';

const git = simpleGit();

export const logCommand = new Command('log')
  .alias('l')
  .description('Get a bird\'s eye view of your stack')
  .option('-a, --all', 'Show all stacks in the repository')
  .option('-v, --verbose', 'Show more details including commits')
  .action(async (options) => {
    const spinner = ora();
    
    try {
      const currentBranch = await getCurrentBranch();
      const repo = await getCurrentRepo();
      
      if (!repo) {
        console.error(chalk.red('Not in a git repository'));
        process.exit(1);
      }
      
      if (options.all) {
        spinner.start('Loading all stacks...');
        const allStacks = await loadStacks();
        const repoStacks = allStacks[repo] || {};
        spinner.stop();
        
        if (Object.keys(repoStacks).length === 0) {
          console.log(chalk.yellow('No stacks found in this repository'));
          return;
        }
        
        console.log(chalk.bold('\nAll stacks in this repository:\n'));
        
        for (const [stackName, stack] of Object.entries(repoStacks)) {
          console.log(chalk.cyan.bold(`📚 ${stackName}`));
          console.log(chalk.dim(`   Base: ${stack.baseBranch}`));
          console.log(chalk.dim(`   Created: ${new Date(stack.created).toLocaleDateString()}`));
          
          if (stack.branches.length === 0) {
            console.log(chalk.dim('   (empty stack)'));
          } else {
            await displayStackBranches(stack, currentBranch, options.verbose);
          }
          console.log();
        }
      } else {
        const currentStack = await getStackForBranch(currentBranch);
        
        if (!currentStack) {
          console.log(chalk.yellow('Current branch is not part of any stack'));
          console.log(chalk.dim('Use "gap create" to start a new stack'));
          return;
        }
        
        spinner.start('Loading stack information...');
        spinner.stop();
        
        console.log(chalk.cyan.bold(`\n📚 Stack: ${currentStack.name}\n`));
        console.log(chalk.dim(`Base branch: ${currentStack.baseBranch}`));
        
        await displayStackBranches(currentStack, currentBranch, options.verbose);
      }
      
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

async function displayStackBranches(stack, currentBranch, verbose) {
  // Build a tree structure from the parent-child relationships
  const tree = buildBranchTree(stack);
  
  // Display the tree recursively
  await displayBranchNode(tree, '', currentBranch, verbose, true);
}

function buildBranchTree(stack) {
  // Create a map of children for each branch
  const childrenMap = {};
  
  // Initialize with base branch
  childrenMap[stack.baseBranch] = [];
  
  // Build parent-child relationships
  if (stack.branchParents) {
    // New structure with explicit parent mapping
    for (const branch of stack.branches) {
      const parent = stack.branchParents[branch] || stack.baseBranch;
      if (!childrenMap[parent]) childrenMap[parent] = [];
      childrenMap[parent].push(branch);
      if (!childrenMap[branch]) childrenMap[branch] = [];
    }
  } else {
    // Old structure - assume sequential parent-child
    const allBranches = [stack.baseBranch, ...stack.branches];
    for (let i = 1; i < allBranches.length; i++) {
      const parent = allBranches[i - 1];
      const child = allBranches[i];
      childrenMap[parent].push(child);
      if (!childrenMap[child]) childrenMap[child] = [];
    }
  }
  
  return {
    name: stack.baseBranch,
    children: childrenMap[stack.baseBranch],
    childrenMap
  };
}

async function displayBranchNode(node, prefix, currentBranch, verbose, isRoot, parentBranch = null, isLast = true) {
  const { name, children, childrenMap } = node;
  const isCurrent = name === currentBranch;
  const isBase = isRoot;
  
  let branchDisplay = name;
  if (isCurrent) {
    branchDisplay = chalk.green.bold(`● ${name} (current)`);
  } else if (isBase) {
    branchDisplay = chalk.gray(`○ ${name} (base)`);
  } else {
    branchDisplay = `○ ${name}`;
  }
  
  console.log(`${prefix}${branchDisplay}`);
  
  // Calculate the new prefix for child elements
  let newPrefix = prefix;
  if (!isRoot) {
    // Remove the last 3 characters (├─ or └─ ) and add appropriate spacing
    newPrefix = prefix.slice(0, -3) + (isLast ? '   ' : '│  ');
  }
  
  // Show commits if verbose and not root
  if (verbose && parentBranch) {
    try {
      const commits = await getCommitsBetween(parentBranch, name);
      
      if (commits.length > 0) {
        commits.forEach((commit, idx) => {
          const commitIsLast = idx === commits.length - 1;
          const commitPrefix = commitIsLast ? '└─' : '├─';
          console.log(chalk.dim(`${newPrefix}│   ${commitPrefix} ${commit.hash.slice(0, 7)} ${commit.message}`));
        });
      } else {
        console.log(chalk.dim(`${newPrefix}│   └─ (no commits)`));
      }
    } catch (error) {
      console.log(chalk.dim(`${newPrefix}│   └─ (unable to load commits)`));
    }
  }
  
  // Display children
  if (children && children.length > 0) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childIsLast = i === children.length - 1;
      const childPrefix = childIsLast ? '└─ ' : '├─ ';
      
      // Recursively display the child branch
      await displayBranchNode(
        { name: child, children: childrenMap[child] || [], childrenMap },
        newPrefix + childPrefix,
        currentBranch,
        verbose,
        false,
        name,
        childIsLast
      );
    }
  }
}