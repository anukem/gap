import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import simpleGit from 'simple-git';
import { getCurrentBranch, getStackForBranch } from '../utils/stack.js';
import { ensureCleanWorkingTree, checkoutBranch, rebaseBranch, getCurrentCommit } from '../utils/git.js';

const git = simpleGit();

export const modifyCommand = new Command('modify')
  .alias('m')
  .description('Update changes across your stack with automatic rebasing')
  .option('-c, --continue', 'Continue after resolving conflicts')
  .option('-a, --abort', 'Abort the current modify operation')
  .action(async (options) => {
    const spinner = ora();
    
    try {
      if (options.continue) {
        await continueModify();
        return;
      }
      
      if (options.abort) {
        await abortModify();
        return;
      }
      
      await ensureCleanWorkingTree();
      
      const currentBranch = await getCurrentBranch();
      const stack = await getStackForBranch(currentBranch);
      
      if (!stack) {
        console.error(chalk.red('Current branch is not part of any stack'));
        process.exit(1);
      }
      
      const branchIndex = stack.branches.indexOf(currentBranch);
      if (branchIndex === -1) {
        console.error(chalk.red('Current branch not found in stack'));
        process.exit(1);
      }
      
      const downstreamBranches = stack.branches.slice(branchIndex + 1);
      
      if (downstreamBranches.length === 0) {
        console.log(chalk.yellow('No downstream branches to update'));
        return;
      }
      
      console.log(chalk.cyan.bold('\n🔄 Modifying stack...\n'));
      console.log(chalk.dim(`Current branch: ${currentBranch}`));
      console.log(chalk.dim(`Downstream branches: ${downstreamBranches.join(', ')}\n`));
      
      const { confirmModify } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmModify',
        message: `This will rebase ${downstreamBranches.length} downstream branch(es). Continue?`,
        default: true
      }]);
      
      if (!confirmModify) {
        console.log(chalk.yellow('Modify cancelled'));
        return;
      }
      
      await saveModifyState({
        stack: stack.name,
        currentBranch,
        downstreamBranches,
        processed: []
      });
      
      spinner.start('Starting recursive rebase...');
      
      let previousBranch = currentBranch;
      
      for (const branch of downstreamBranches) {
        spinner.text = `Rebasing ${branch} onto ${previousBranch}...`;
        
        const currentCommit = await getCurrentCommit();
        await checkoutBranch(branch);
        
        const success = await rebaseBranch(branch, previousBranch);
        
        if (!success) {
          spinner.fail(chalk.red(`Conflict while rebasing ${branch}`));
          console.log(chalk.yellow('\nResolve conflicts and run:'));
          console.log(chalk.cyan('  gap modify --continue'));
          console.log(chalk.dim('Or abort with:'));
          console.log(chalk.cyan('  gap modify --abort'));
          
          await updateModifyState({ currentBranch: branch });
          process.exit(1);
        }
        
        spinner.text = `Successfully rebased ${branch}`;
        await updateModifyState({ processed: branch });
        previousBranch = branch;
      }
      
      spinner.succeed(chalk.green('All branches successfully rebased!'));
      
      await checkoutBranch(currentBranch);
      await clearModifyState();
      
      console.log(chalk.green.bold('\n✅ Stack modification complete!'));
      
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

async function saveModifyState(state) {
  await git.addConfig('gap.modify.state', JSON.stringify(state));
}

async function getModifyState() {
  try {
    const state = await git.getConfig('gap.modify.state');
    return state.value ? JSON.parse(state.value) : null;
  } catch (error) {
    return null;
  }
}

async function updateModifyState(updates) {
  const state = await getModifyState();
  if (!state) return;
  
  if (updates.processed) {
    state.processed.push(updates.processed);
  }
  if (updates.currentBranch) {
    state.currentBranch = updates.currentBranch;
  }
  
  await saveModifyState(state);
}

async function clearModifyState() {
  await git.raw(['config', '--unset', 'gap.modify.state']);
}

async function continueModify() {
  const spinner = ora();
  const state = await getModifyState();
  
  if (!state) {
    console.error(chalk.red('No modify operation in progress'));
    process.exit(1);
  }
  
  try {
    await git.rebase(['--continue']);
  } catch (error) {
    console.error(chalk.red('Failed to continue rebase. Resolve remaining conflicts.'));
    process.exit(1);
  }
  
  const remainingBranches = state.downstreamBranches.filter(
    b => !state.processed.includes(b) && b !== state.currentBranch
  );
  
  if (remainingBranches.length === 0) {
    spinner.succeed(chalk.green('Modify operation complete!'));
    await clearModifyState();
    return;
  }
  
  spinner.start(`Continuing with ${remainingBranches.length} remaining branches...`);
  
  let previousBranch = state.currentBranch;
  
  for (const branch of remainingBranches) {
    spinner.text = `Rebasing ${branch} onto ${previousBranch}...`;
    
    await checkoutBranch(branch);
    const success = await rebaseBranch(branch, previousBranch);
    
    if (!success) {
      spinner.fail(chalk.red(`Conflict while rebasing ${branch}`));
      console.log(chalk.yellow('\nResolve conflicts and run:'));
      console.log(chalk.cyan('  gap modify --continue'));
      
      await updateModifyState({ currentBranch: branch });
      process.exit(1);
    }
    
    await updateModifyState({ processed: branch });
    previousBranch = branch;
  }
  
  spinner.succeed(chalk.green('All branches successfully rebased!'));
  await clearModifyState();
}

async function abortModify() {
  const state = await getModifyState();
  
  if (!state) {
    console.error(chalk.red('No modify operation in progress'));
    process.exit(1);
  }
  
  try {
    await git.rebase(['--abort']);
    await clearModifyState();
    console.log(chalk.yellow('Modify operation aborted'));
  } catch (error) {
    console.error(chalk.red('Failed to abort modify operation'));
    process.exit(1);
  }
}