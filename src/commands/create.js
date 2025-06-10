import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { 
  ensureCleanWorkingTree, 
  branchExists, 
  createBranch, 
  getCurrentCommit 
} from '../utils/git.js';
import { 
  getCurrentBranch, 
  getStackForBranch, 
  createStack, 
  addBranchToStack,
  getParentBranch 
} from '../utils/stack.js';

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
      
      if (!currentStack) {
        console.log(chalk.yellow('No stack found. Creating a new stack...'));
        
        const { stackName } = await inquirer.prompt([{
          type: 'input',
          name: 'stackName',
          message: 'Enter a name for the new stack:',
          default: `stack-${Date.now()}`
        }]);
        
        await createStack(stackName, currentBranch);
        currentStack = await getStackForBranch(currentBranch);
      }
      
      if (!branchName) {
        const { name } = await inquirer.prompt([{
          type: 'input',
          name: 'name',
          message: 'Enter branch name:',
          validate: (input) => {
            if (!input) return 'Branch name is required';
            if (input.includes(' ')) return 'Branch name cannot contain spaces';
            return true;
          }
        }]);
        branchName = name;
      }
      
      if (await branchExists(branchName)) {
        console.error(chalk.red(`Branch '${branchName}' already exists`));
        process.exit(1);
      }
      
      spinner.start(`Creating branch '${branchName}'...`);
      
      await createBranch(branchName, currentBranch);
      
      if (currentStack) {
        await addBranchToStack(currentStack.name, branchName, currentBranch);
      } else {
        const { createNewStack } = await inquirer.prompt([{
          type: 'confirm',
          name: 'createNewStack',
          message: 'Would you like to create a new stack?',
          default: true
        }]);
        
        if (createNewStack) {
          const { stackName } = await inquirer.prompt([{
            type: 'input',
            name: 'stackName',
            message: 'Enter stack name:',
            default: `stack-${Date.now()}`
          }]);
          
          await createStack(stackName, currentBranch);
          await addBranchToStack(stackName, branchName, currentBranch);
        }
      }
      
      spinner.succeed(chalk.green(`Created branch '${branchName}' on top of '${currentBranch}'`));
      
      const updatedStack = await getStackForBranch(branchName);
      if (updatedStack) {
        console.log(chalk.dim(`Stack: ${updatedStack.name}`));
        console.log(chalk.dim(`Branches in stack: ${updatedStack.branches.join(' → ')}`));
      }
      
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });