import simpleGit from 'simple-git';
import chalk from 'chalk';
import { getLogger } from './logger.js';

const git = simpleGit();
const logger = getLogger('git');

export async function ensureCleanWorkingTree() {
  logger.debug('Checking working tree status');
  const status = await git.status();
  logger.debug('Working tree status:', { isClean: status.isClean(), files: status.files });
  if (!status.isClean()) {
    logger.error('Working tree is not clean', { files: status.files });
    throw new Error('Working tree is not clean. Please commit or stash your changes.');
  }
  logger.debug('Working tree is clean');
}

export async function branchExists(branchName) {
  logger.debug(`Checking if branch exists: ${branchName}`);
  try {
    const branches = await git.branch();
    const exists = branches.all.includes(branchName);
    logger.debug(`Branch ${branchName} exists: ${exists}`);
    return exists;
  } catch (error) {
    logger.error(`Error checking branch existence: ${branchName}`, error);
    return false;
  }
}

export async function createBranch(branchName, startPoint = 'HEAD') {
  logger.debug(`Creating branch: ${branchName} from ${startPoint}`);
  await git.checkoutLocalBranch(branchName, startPoint);
  logger.info(`Created and checked out branch: ${branchName}`);
}

export async function checkoutBranch(branchName) {
  logger.debug(`Checking out branch: ${branchName}`);
  await git.checkout(branchName);
  logger.info(`Checked out branch: ${branchName}`);
}

export async function getCurrentCommit() {
  logger.debug('Getting current commit');
  const commit = await git.revparse(['HEAD']);
  const trimmedCommit = commit.trim();
  logger.debug(`Current commit: ${trimmedCommit}`);
  return trimmedCommit;
}

export async function getCommitsBetween(from, to) {
  logger.debug(`Getting commits between ${from} and ${to}`);
  const logs = await git.log({ from, to, format: { hash: '%H', message: '%s', author: '%an', date: '%ai' } });
  logger.debug(`Found ${logs.all.length} commits between ${from} and ${to}`);
  return logs.all;
}

export async function rebaseBranch(branch, onto) {
  logger.debug(`Rebasing ${branch} onto ${onto}`);
  try {
    await git.rebase([onto, branch]);
    logger.info(`Successfully rebased ${branch} onto ${onto}`);
    return true;
  } catch (error) {
    logger.error(`Rebase failed for ${branch} onto ${onto}`, error);
    console.error(chalk.red(`Rebase failed: ${error.message}`));
    return false;
  }
}

export async function pushBranch(branch, force = false) {
  const args = ['origin', branch];
  if (force) args.push('--force-with-lease');
  
  logger.debug(`Pushing branch ${branch}`, { force, args });
  try {
    await git.push(args);
    logger.info(`Successfully pushed ${branch}`);
    return true;
  } catch (error) {
    logger.error(`Push failed for ${branch}`, error);
    console.error(chalk.red(`Push failed: ${error.message}`));
    return false;
  }
}

export async function fetchFromRemote() {
  logger.debug('Fetching from origin');
  await git.fetch(['origin']);
  logger.info('Fetched latest changes from origin');
}

export async function deleteBranch(branch, force = false) {
  const args = force ? ['-D', branch] : ['-d', branch];
  logger.debug(`Deleting branch ${branch}`, { force, args });
  await git.branch(args);
  logger.info(`Deleted branch ${branch}`);
}

export async function getRemoteBranches() {
  logger.debug('Getting remote branches');
  const branches = await git.branch(['-r']);
  const remoteBranches = branches.all.filter(b => b.startsWith('origin/'));
  logger.debug(`Found ${remoteBranches.length} remote branches`);
  return remoteBranches;
}