import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import simpleGit from 'simple-git';

const git = simpleGit();
const GAP_DIR = path.join(os.homedir(), '.gap');
const STACKS_FILE = path.join(GAP_DIR, 'stacks.json');

export async function ensureGapDir() {
  try {
    await fs.mkdir(GAP_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create gap directory:', error);
  }
}

export async function loadStacks() {
  await ensureGapDir();
  try {
    const data = await fs.readFile(STACKS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

export async function saveStacks(stacks) {
  await ensureGapDir();
  await fs.writeFile(STACKS_FILE, JSON.stringify(stacks, null, 2));
}

export async function getCurrentRepo() {
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    if (origin) {
      return origin.refs.fetch || origin.refs.push;
    }
    return null;
  } catch (error) {
    return null;
  }
}

export async function getCurrentBranch() {
  const status = await git.status();
  return status.current;
}

export async function getStackForBranch(branch) {
  const repo = await getCurrentRepo();
  if (!repo) return null;
  
  const stacks = await loadStacks();
  const repoStacks = stacks[repo] || {};
  
  for (const [stackName, stack] of Object.entries(repoStacks)) {
    if (stack.branches.includes(branch)) {
      return { name: stackName, ...stack };
    }
  }
  return null;
}

export async function createStack(stackName, baseBranch = 'main') {
  const repo = await getCurrentRepo();
  if (!repo) throw new Error('Not in a git repository');
  
  const stacks = await loadStacks();
  if (!stacks[repo]) stacks[repo] = {};
  
  stacks[repo][stackName] = {
    baseBranch,
    branches: [],
    branchParents: {},  // Maps branch name to its parent branch
    created: new Date().toISOString()
  };
  
  await saveStacks(stacks);
  return stacks[repo][stackName];
}

export async function addBranchToStack(stackName, branch, parentBranch = null) {
  const repo = await getCurrentRepo();
  if (!repo) throw new Error('Not in a git repository');
  
  const stacks = await loadStacks();
  if (!stacks[repo] || !stacks[repo][stackName]) {
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
  }
}

export async function removeBranchFromStack(branch) {
  const repo = await getCurrentRepo();
  if (!repo) return;
  
  const stacks = await loadStacks();
  const repoStacks = stacks[repo] || {};
  
  for (const [stackName, stack] of Object.entries(repoStacks)) {
    const index = stack.branches.indexOf(branch);
    if (index > -1) {
      stack.branches.splice(index, 1);
      if (stack.branches.length === 0) {
        delete repoStacks[stackName];
      }
    }
  }
  
  await saveStacks(stacks);
}

export async function getParentBranch(branch) {
  const stack = await getStackForBranch(branch);
  if (!stack) return 'main';
  
  // Use branchParents if available (new structure)
  if (stack.branchParents && stack.branchParents[branch]) {
    return stack.branchParents[branch];
  }
  
  // Fallback to old behavior for backward compatibility
  const index = stack.branches.indexOf(branch);
  if (index <= 0) return stack.baseBranch;
  
  return stack.branches[index - 1];
}

export async function getChildBranches(branch) {
  const stack = await getStackForBranch(branch);
  if (!stack) return [];
  
  const children = [];
  
  if (stack.branchParents) {
    // New structure with explicit parent mapping
    for (const [childBranch, parent] of Object.entries(stack.branchParents)) {
      if (parent === branch) {
        children.push(childBranch);
      }
    }
  } else {
    // Old structure - find the next branch in the array
    const allBranches = [stack.baseBranch, ...stack.branches];
    const currentIndex = allBranches.indexOf(branch);
    if (currentIndex >= 0 && currentIndex < allBranches.length - 1) {
      children.push(allBranches[currentIndex + 1]);
    }
  }
  
  return children;
}