import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import simpleGit from 'simple-git';
import { getLogger } from './logger.js';

const git = simpleGit();
const logger = getLogger('stack');
const GAP_DIR = path.join(os.homedir(), '.gap');
const STACKS_FILE = path.join(GAP_DIR, 'stacks.json');

export async function ensureGapDir() {
  logger.debug(`Ensuring gap directory exists at: ${GAP_DIR}`);
  try {
    await fs.mkdir(GAP_DIR, { recursive: true });
    logger.debug('Gap directory is ready');
  } catch (error) {
    logger.error('Failed to create gap directory:', error);
    console.error('Failed to create gap directory:', error);
  }
}

export async function loadStacks() {
  logger.debug('Loading stacks from file');
  await ensureGapDir();
  try {
    const data = await fs.readFile(STACKS_FILE, 'utf8');
    const stacks = JSON.parse(data);
    logger.debug(`Loaded ${Object.keys(stacks).length} repositories from stacks file`);
    return stacks;
  } catch (error) {
    logger.debug('No existing stacks file found, returning empty object');
    return {};
  }
}

export async function saveStacks(stacks) {
  logger.debug('Saving stacks to file');
  await ensureGapDir();
  await fs.writeFile(STACKS_FILE, JSON.stringify(stacks, null, 2));
  logger.info(`Saved ${Object.keys(stacks).length} repositories to stacks file`);
}

export async function getCurrentRepo() {
  logger.debug('Getting current repository');
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    if (origin) {
      const repo = origin.refs.fetch || origin.refs.push;
      logger.debug(`Current repository: ${repo}`);
      return repo;
    }
    logger.debug('No origin remote found');
    return null;
  } catch (error) {
    logger.error('Error getting current repository:', error);
    return null;
  }
}

export async function getCurrentBranch() {
  logger.debug('Getting current branch');
  const status = await git.status();
  logger.debug(`Current branch: ${status.current}`);
  return status.current;
}

export async function getStackForBranch(branch) {
  logger.debug(`Getting stack for branch: ${branch}`);
  const repo = await getCurrentRepo();
  if (!repo) {
    logger.debug('No repository found');
    return null;
  }
  
  const stacks = await loadStacks();
  const repoStacks = stacks[repo] || {};
  
  for (const [stackName, stack] of Object.entries(repoStacks)) {
    if (stack.branches.includes(branch)) {
      logger.debug(`Found branch ${branch} in stack: ${stackName}`);
      return { name: stackName, ...stack };
    }
  }
  logger.debug(`Branch ${branch} not found in any stack`);
  return null;
}

export async function createStack(stackName, baseBranch = 'main') {
  logger.debug(`Creating stack: ${stackName} with base branch: ${baseBranch}`);
  const repo = await getCurrentRepo();
  if (!repo) {
    logger.error('Cannot create stack: not in a git repository');
    throw new Error('Not in a git repository');
  }
  
  const stacks = await loadStacks();
  if (!stacks[repo]) stacks[repo] = {};
  
  stacks[repo][stackName] = {
    baseBranch,
    branches: [],
    branchParents: {},  // Maps branch name to its parent branch
    created: new Date().toISOString()
  };
  
  await saveStacks(stacks);
  logger.info(`Created stack: ${stackName}`);
  return stacks[repo][stackName];
}

export async function addBranchToStack(stackName, branch, parentBranch = null) {
  logger.debug(`Adding branch ${branch} to stack ${stackName}`, { parentBranch });
  const repo = await getCurrentRepo();
  if (!repo) {
    logger.error('Cannot add branch to stack: not in a git repository');
    throw new Error('Not in a git repository');
  }
  
  const stacks = await loadStacks();
  if (!stacks[repo] || !stacks[repo][stackName]) {
    logger.error(`Stack ${stackName} not found`);
    throw new Error(`Stack ${stackName} not found`);
  }
  
  if (!stacks[repo][stackName].branches.includes(branch)) {
    stacks[repo][stackName].branches.push(branch);
    
    // Initialize branchParents if it doesn't exist (for backward compatibility)
    if (!stacks[repo][stackName].branchParents) {
      stacks[repo][stackName].branchParents = {};
    }
    
    // Store the parent branch
    if (parentBranch) {
      stacks[repo][stackName].branchParents[branch] = parentBranch;
    }
    
    await saveStacks(stacks);
    logger.info(`Added branch ${branch} to stack ${stackName}`);
  } else {
    logger.debug(`Branch ${branch} already exists in stack ${stackName}`);
  }
}

export async function removeBranchFromStack(branch) {
  logger.debug(`Removing branch ${branch} from all stacks`);
  const repo = await getCurrentRepo();
  if (!repo) {
    logger.debug('No repository found, skipping');
    return;
  }
  
  const stacks = await loadStacks();
  const repoStacks = stacks[repo] || {};
  
  for (const [stackName, stack] of Object.entries(repoStacks)) {
    const index = stack.branches.indexOf(branch);
    if (index > -1) {
      stack.branches.splice(index, 1);
      logger.info(`Removed branch ${branch} from stack ${stackName}`);
      if (stack.branches.length === 0) {
        delete repoStacks[stackName];
        logger.info(`Deleted empty stack ${stackName}`);
      }
    }
  }
  
  await saveStacks(stacks);
}

export async function getParentBranch(branch) {
  logger.debug(`Getting parent branch for: ${branch}`);
  const stack = await getStackForBranch(branch);
  if (!stack) {
    logger.debug(`No stack found for ${branch}, returning 'main'`);
    return 'main';
  }
  
  // Use branchParents if available (new structure)
  if (stack.branchParents && stack.branchParents[branch]) {
    const parent = stack.branchParents[branch];
    logger.debug(`Found parent ${parent} for ${branch} in branchParents`);
    return parent;
  }
  
  // Fallback to old behavior for backward compatibility
  const index = stack.branches.indexOf(branch);
  if (index <= 0) {
    logger.debug(`${branch} is at base, returning base branch: ${stack.baseBranch}`);
    return stack.baseBranch;
  }
  
  const parent = stack.branches[index - 1];
  logger.debug(`Found parent ${parent} for ${branch} using sequential order`);
  return parent;
}

export async function getChildBranches(branch) {
  logger.debug(`Getting child branches for: ${branch}`);
  const stack = await getStackForBranch(branch);
  if (!stack) {
    logger.debug(`No stack found for ${branch}`);
    return [];
  }
  
  const children = [];
  
  if (stack.branchParents) {
    // New structure with explicit parent mapping
    for (const [childBranch, parent] of Object.entries(stack.branchParents)) {
      if (parent === branch) {
        children.push(childBranch);
      }
    }
    logger.debug(`Found ${children.length} children for ${branch} using branchParents`);
  } else {
    // Old structure - find the next branch in the array
    const allBranches = [stack.baseBranch, ...stack.branches];
    const currentIndex = allBranches.indexOf(branch);
    if (currentIndex >= 0 && currentIndex < allBranches.length - 1) {
      children.push(allBranches[currentIndex + 1]);
    }
    logger.debug(`Found ${children.length} children for ${branch} using sequential order`);
  }
  
  logger.debug(`Children of ${branch}: ${children.join(', ')}`);
  return children;
}