import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { getCurrentBranch, getStackForBranch, getParentBranch } from '../utils/stack.js';
import { pushBranch, getCommitsBetween } from '../utils/git.js';

export const submitCommand = new Command('submit')
  .alias('s')
  .description('Create or update PRs for every branch in your stack')
  .option('-b, --branch <branch>', 'Submit only a specific branch')
  .option('-f, --force', 'Force push branches')
  .option('--no-push', 'Skip pushing branches to remote')
  .action(async (options) => {
    const spinner = ora();
    
    try {
      const currentBranch = options.branch || await getCurrentBranch();
      const stack = await getStackForBranch(currentBranch);
      
      if (!stack) {
        console.error(chalk.red('Current branch is not part of any stack'));
        process.exit(1);
      }
      
      const branchesToSubmit = options.branch 
        ? [options.branch]
        : stack.branches;
      
      if (branchesToSubmit.length === 0) {
        console.log(chalk.yellow('No branches to submit'));
        return;
      }
      
      console.log(chalk.cyan.bold(`\n📤 Submitting ${branchesToSubmit.length} branch(es) from stack: ${stack.name}\n`));
      
      for (const branch of branchesToSubmit) {
        console.log(chalk.bold(`\n${branch}:`));
        
        if (!options.noPush) {
          spinner.start(`Pushing ${branch}...`);
          const pushed = await pushBranch(branch, options.force);
          
          if (pushed) {
            spinner.succeed(chalk.green(`Pushed ${branch}`));
          } else {
            spinner.fail(chalk.red(`Failed to push ${branch}`));
            continue;
          }
        }
        
        const parentBranch = await getParentBranch(branch);
        const prExists = await checkPRExists(branch);
        
        if (prExists) {
          console.log(chalk.dim(`  PR already exists for ${branch}`));
          
          const { updatePR } = await inquirer.prompt([{
            type: 'confirm',
            name: 'updatePR',
            message: `Update PR for ${branch}?`,
            default: true
          }]);
          
          if (updatePR) {
            await updatePR(branch);
          }
        } else {
          const commits = await getCommitsBetween(parentBranch, branch);
          const defaultTitle = commits.length > 0 ? commits[commits.length - 1].message : branch;
          
          const { title, body } = await inquirer.prompt([
            {
              type: 'input',
              name: 'title',
              message: 'PR title:',
              default: defaultTitle
            },
            {
              type: 'editor',
              name: 'body',
              message: 'PR description:'
            }
          ]);
          
          spinner.start('Creating PR...');
          
          try {
            const prUrl = await createPR(branch, parentBranch, title, body);
            spinner.succeed(chalk.green(`Created PR: ${prUrl}`));
          } catch (error) {
            spinner.fail(chalk.red(`Failed to create PR: ${error.message}`));
          }
        }
      }
      
      console.log(chalk.green.bold('\n✅ Submission complete!'));
      
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

async function checkPRExists(branch) {
  try {
    const output = execSync(`gh pr list --head ${branch} --json number`, { encoding: 'utf8' });
    const prs = JSON.parse(output);
    return prs.length > 0;
  } catch (error) {
    return false;
  }
}

async function createPR(branch, baseBranch, title, body) {
  try {
    const command = `gh pr create --head ${branch} --base ${baseBranch} --title "${title}" --body "${body}"`;
    const output = execSync(command, { encoding: 'utf8' });
    return output.trim();
  } catch (error) {
    if (error.message.includes('gh: command not found')) {
      throw new Error('GitHub CLI (gh) is not installed. Please install it from https://cli.github.com/');
    }
    throw error;
  }
}

async function updatePR(branch) {
  try {
    execSync(`gh pr edit ${branch} --add-label "updated"`, { encoding: 'utf8' });
    console.log(chalk.dim(`  Updated PR for ${branch}`));
  } catch (error) {
    console.error(chalk.red(`  Failed to update PR: ${error.message}`));
  }
}