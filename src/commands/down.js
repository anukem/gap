import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import simpleGit from 'simple-git';
import { getCurrentBranch, getStackForBranch, getParentBranch } from '../utils/stack.js';
import { ensureCleanWorkingTree } from '../utils/git.js';

const git = simpleGit();

export const downCommand = new Command('down')
  .alias('d')
  .description('Navigate to the parent branch in the stack')
  .action(async () => {
    const spinner = ora();
    
    try {
      // Ensure working tree is clean before switching branches
      await ensureCleanWorkingTree();
      
      const currentBranch = await getCurrentBranch();
      const stack = await getStackForBranch(currentBranch);
      
      if (!stack) {
        console.log(chalk.yellow('Current branch is not part of any stack'));
        return;
      }
      
      spinner.start('Finding parent branch...');
      
      const parentBranch = await getParentBranch(currentBranch);
      
      if (!parentBranch || parentBranch === currentBranch) {
        spinner.fail(chalk.yellow('No parent branch found'));
        console.log(chalk.dim('You are at the base of the stack'));
        return;
      }
      
      spinner.text = `Switching to parent branch '${parentBranch}'...`;
      
      await git.checkout(parentBranch);
      
      spinner.succeed(chalk.green(`Switched to parent branch '${parentBranch}'`));
      
      // Show the current position in the stack
      const newStack = await getStackForBranch(parentBranch);
      if (newStack) {
        console.log(chalk.dim(`Stack: ${newStack.name}`));
        console.log(chalk.dim(`${currentBranch} → ${chalk.bold(parentBranch)}`));
      }
      
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });