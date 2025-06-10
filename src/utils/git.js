import simpleGit from 'simple-git';
import chalk from 'chalk';

const git = simpleGit();

export async function ensureCleanWorkingTree() {
  const status = await git.status();
  if (!status.isClean()) {
    throw new Error('Working tree is not clean. Please commit or stash your changes.');
  }
}

export async function branchExists(branchName) {
  try {
    const branches = await git.branch();
    return branches.all.includes(branchName);
  } catch (error) {
    return false;
  }
}

export async function createBranch(branchName, startPoint = 'HEAD') {
  await git.checkoutLocalBranch(branchName, startPoint);
}

export async function checkoutBranch(branchName) {
  await git.checkout(branchName);
}

export async function getCurrentCommit() {
  const commit = await git.revparse(['HEAD']);
  return commit.trim();
}

export async function getCommitsBetween(from, to) {
  const logs = await git.log({ from, to, format: { hash: '%H', message: '%s', author: '%an', date: '%ai' } });
  return logs.all;
}

export async function rebaseBranch(branch, onto) {
  try {
    await git.rebase([onto, branch]);
    return true;
  } catch (error) {
    console.error(chalk.red(`Rebase failed: ${error.message}`));
    return false;
  }
}

export async function pushBranch(branch, force = false) {
  const args = ['origin', branch];
  if (force) args.push('--force-with-lease');
  
  try {
    await git.push(args);
    return true;
  } catch (error) {
    console.error(chalk.red(`Push failed: ${error.message}`));
    return false;
  }
}

export async function fetchFromRemote() {
  await git.fetch(['origin']);
}

export async function deleteBranch(branch, force = false) {
  const args = force ? ['-D', branch] : ['-d', branch];
  await git.branch(args);
}

export async function getRemoteBranches() {
  const branches = await git.branch(['-r']);
  return branches.all.filter(b => b.startsWith('origin/'));
}