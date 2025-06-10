import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import simpleGit from 'simple-git';
import { getCurrentBranch, getStackForBranch, getChildBranches } from '../utils/stack.js';
import { ensureCleanWorkingTree } from '../utils/git.js';

const git = simpleGit();

export const upCommand = new Command('up')
  .alias('u')
  .description('Navigate to a child branch in the stack')
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
      
      spinner.start('Finding child branches...');
      
      const childBranches = await getChildBranches(currentBranch);
      
      spinner.stop();
      
      if (childBranches.length === 0) {
        console.log(chalk.yellow('No child branches found'));
        console.log(chalk.dim('You are at a leaf branch'));
        return;
      }
      
      let targetBranch;
      
      if (childBranches.length === 1) {
        // Only one child, switch to it directly
        targetBranch = childBranches[0];
      } else {
        // Multiple children, ask user to choose
        const { selected } = await inquirer.prompt([{
          type: 'list',
          name: 'selected',
          message: 'Multiple child branches found. Select one:',
          choices: childBranches.map(branch => ({
            name: branch,
            value: branch
          }))
        }]);
        targetBranch = selected;
      }
      
      spinner.start(`Switching to child branch '${targetBranch}'...`);
      
      await git.checkout(targetBranch);
      
      spinner.succeed(chalk.green(`Switched to child branch '${targetBranch}'`));
      
      // Show the current position in the stack
      console.log(chalk.dim(`Stack: ${stack.name}`));
      console.log(chalk.dim(`${currentBranch} → ${chalk.bold(targetBranch)}`));
      
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });