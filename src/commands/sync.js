import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import simpleGit from "simple-git";
import {
  getCurrentBranch,
  loadStacks,
  getCurrentRepo,
  removeBranchFromStack,
} from "../utils/stack.js";
import {
  fetchFromRemote,
  deleteBranch,
  getRemoteBranches,
} from "../utils/git.js";
import { getLogger } from "../utils/logger.js";

const git = simpleGit();
const logger = getLogger("sync");

export const syncCommand = new Command("sync")
  .description(
    "Sync your local stack with remote changes and clean up stale branches",
  )
  .option("-d, --delete-merged", "Delete local branches that have been merged")
  .option("-f, --force", "Force delete branches without confirmation")
  .action(async (options) => {
    const spinner = ora();
    logger.debug("Starting sync command", options);

    try {
      spinner.start("Fetching from remote...");
      await fetchFromRemote();
      spinner.succeed("Fetched latest changes from remote");
      logger.info("Fetched latest changes from remote");

      const repo = await getCurrentRepo();
      if (!repo) {
        logger.error("Not in a git repository");
        console.error(chalk.red("Not in a git repository"));
        process.exit(1);
      }

      const currentBranch = await getCurrentBranch();
      const allStacks = await loadStacks();
      const repoStacks = allStacks[repo] || {};
      logger.debug(`Found ${Object.keys(repoStacks).length} stacks in current repo`);

      console.log(chalk.cyan.bold("\n🔄 Syncing stacks...\n"));

      spinner.start("Checking for updates...");

      const mainBranch = await getMainBranch();
      logger.debug(`Main branch: ${mainBranch}`);
      
      const behind = await getBehindCount(
        currentBranch,
        `origin/${currentBranch}`,
      );
      logger.debug(`Current branch is ${behind} commits behind origin`);

      if (behind > 0) {
        spinner.warn(
          chalk.yellow(`Current branch is ${behind} commits behind origin`),
        );

        const { pullChanges } = await inquirer.prompt([
          {
            type: "confirm",
            name: "pullChanges",
            message: "Pull latest changes?",
            default: true,
          },
        ]);

        if (pullChanges) {
          spinner.start("Pulling changes...");
          logger.info("Pulling latest changes");
          await git.pull();
          spinner.succeed("Pulled latest changes");
          logger.info("Successfully pulled latest changes");
        }
      } else {
        spinner.info("Current branch is up to date");
      }

      if (options.deleteMerged) {
        spinner.start("Finding merged branches...");
        logger.debug("Looking for merged branches");
        const { merged: mergedBranches } = await getMergedBranches(mainBranch);
        spinner.stop();
        logger.info(`Found ${mergedBranches.length} merged branches`);

        if (mergedBranches.length === 0) {
          console.log(chalk.dim("No merged branches to delete"));
        } else {
          console.log(
            chalk.yellow(`\nFound ${mergedBranches.length} merged branches:`),
          );
          mergedBranches.forEach((branch) =>
            console.log(chalk.dim(`  - ${branch}`)),
          );

          if (!options.force) {
            const { confirmDelete } = await inquirer.prompt([
              {
                type: "confirm",
                name: "confirmDelete",
                message: "Delete these branches?",
                default: true,
              },
            ]);

            if (!confirmDelete) {
              console.log(chalk.yellow("Skipping branch deletion"));
              return;
            }
          }

          for (const branch of mergedBranches) {
            spinner.start(`Deleting ${branch}...`);

            try {
              logger.debug(`Deleting branch: ${branch}`);
              await deleteBranch(branch);
              await removeBranchFromStack(branch);
              spinner.succeed(chalk.green(`Deleted ${branch}`));
              logger.info(`Successfully deleted branch: ${branch}`);
            } catch (error) {
              logger.error(`Failed to delete branch ${branch}:`, error);
              spinner.fail(
                chalk.red(`Failed to delete ${branch}: ${error.message}`),
              );
            }
          }
        }
      }

      spinner.start("Checking for stale remote branches...");
      logger.debug("Checking for stale remote branches");
      const localBranches = await git.branchLocal();
      const remoteBranches = await getRemoteBranches();
      const staleBranches = [];
      logger.debug(`Local branches: ${localBranches.all.length}, Remote branches: ${remoteBranches.length}`);

      for (const [stackName, stack] of Object.entries(repoStacks)) {
        for (const branch of stack.branches) {
          if (
            !remoteBranches.includes(`origin/${branch}`) &&
            localBranches.all.includes(branch)
          ) {
            staleBranches.push(branch);
          }
        }
      }

      spinner.stop();

      if (staleBranches.length > 0) {
        logger.info(`Found ${staleBranches.length} stale branches without remote`);
        console.log(
          chalk.yellow(
            `\nFound ${staleBranches.length} branches without remote:`,
          ),
        );
        staleBranches.forEach((branch) => {
          logger.debug(`Stale branch: ${branch}`);
          console.log(chalk.dim(`  - ${branch}`));
        });
        console.log(
          chalk.dim(
            "\nConsider pushing these branches or removing them from your stacks",
          ),
        );
      }

      console.log(chalk.green.bold("\n✅ Sync complete!"));
      logger.info("Sync command completed successfully");
    } catch (error) {
      logger.error("Sync command failed:", error);
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

async function getMainBranch() {
  logger.debug("Determining main branch");
  try {
    const branches = await git.branch();
    if (branches.all.includes("main")) {
      logger.debug("Main branch found: main");
      return "main";
    }
    if (branches.all.includes("master")) {
      logger.debug("Main branch found: master");
      return "master";
    }
    logger.debug("No main/master branch found, defaulting to main");
    return "main";
  } catch (error) {
    logger.error("Error getting main branch:", error);
    return "main";
  }
}

async function getBehindCount(localBranch, remoteBranch) {
  logger.debug(`Checking behind count: ${localBranch} vs ${remoteBranch}`);
  try {
    const result = await git.raw([
      "rev-list",
      "--count",
      `${localBranch}..${remoteBranch}`,
    ]);
    const count = parseInt(result.trim()) || 0;
    logger.debug(`Behind count: ${count}`);
    return count;
  } catch (error) {
    logger.debug("Error getting behind count:", error);
    return 0;
  }
}

async function getMergedBranches(mainBranch) {
  logger.debug(`Getting merged branches relative to ${mainBranch}`);
  try {
    // Get all local branches
    const allBranchesResult = await git.raw([
      "branch",
      "--format=%(refname:short)",
    ]);

    const allBranches = allBranchesResult
      .split("\n")
      .map((b) => b.trim())
      .filter((b) => b && b !== mainBranch && b !== "master" && b !== "main");

    if (allBranches.length === 0) {
      logger.debug("No branches to check");
      return { merged: [], unmerged: [] };
    }
    
    logger.debug(`Checking ${allBranches.length} branches for merge status`);

    // Batch operation: Check all branches in parallel for better performance
    const branchChecks = await Promise.all(
      allBranches.map(async (branch) => {
        try {
          // Get the merge base between main and the branch
          const mergeBase = await git
            .raw(["merge-base", mainBranch, branch])
            .catch(() => null);
          if (!mergeBase) {
            return { branch, merged: false, reason: "no-common-ancestor" };
          }

          // Check if branch has any changes that aren't in main
          // --cherry-pick handles squashed commits by comparing patches, not commit SHAs
          const unmergedCommits = await git.raw([
            "rev-list",
            "--count",
            "--cherry-pick",
            "--right-only",
            "--no-merges", // Ignore merge commits in the branch
            `${mainBranch}...${branch}`,
          ]);

          const count = parseInt(unmergedCommits.trim());

          // Also check if the branch tip is directly reachable from main
          // (handles case where branch was updated after squash merge)
          let isReachable = false;
          try {
            await git.raw(["merge-base", "--is-ancestor", branch, mainBranch]);
            isReachable = true;
          } catch (e) {
            // Not reachable
          }

          return {
            branch,
            merged: count === 0 || isReachable,
            unmergedCount: count,
            isReachable,
            reason: isReachable
              ? "reachable-from-main"
              : count === 0
                ? "all-changes-in-main"
                : "has-unmerged-changes",
          };
        } catch (error) {
          logger.warn(`Error checking branch ${branch}:`, error.message);
          console.warn(`Error checking branch ${branch}:`, error.message);
          return {
            branch,
            merged: false,
            reason: "error",
            error: error.message,
          };
        }
      }),
    );

    // Separate merged and unmerged branches
    const merged = [];
    const unmerged = [];

    for (const check of branchChecks) {
      if (check.merged) {
        merged.push(check.branch);
      } else {
        unmerged.push({
          branch: check.branch,
          reason: check.reason,
          unmergedCount: check.unmergedCount,
        });
      }
    }

    logger.debug(`Found ${merged.length} merged and ${unmerged.length} unmerged branches`);
    return {
      merged: merged.sort(),
      unmerged: unmerged.sort((a, b) => a.branch.localeCompare(b.branch)),
    };
  } catch (error) {
    logger.error("Error finding merged branches:", error);
    console.error("Error finding merged branches:", error);
    return { merged: [], unmerged: [] };
  }
}
