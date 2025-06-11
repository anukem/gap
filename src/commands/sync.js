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

const git = simpleGit();

export const syncCommand = new Command("sync")
  .description(
    "Sync your local stack with remote changes and clean up stale branches",
  )
  .option("-d, --delete-merged", "Delete local branches that have been merged")
  .option("-f, --force", "Force delete branches without confirmation")
  .action(async (options) => {
    const spinner = ora();

    try {
      spinner.start("Fetching from remote...");
      await fetchFromRemote();
      spinner.succeed("Fetched latest changes from remote");

      const repo = await getCurrentRepo();
      if (!repo) {
        console.error(chalk.red("Not in a git repository"));
        process.exit(1);
      }

      const currentBranch = await getCurrentBranch();
      const allStacks = await loadStacks();
      const repoStacks = allStacks[repo] || {};

      console.log(chalk.cyan.bold("\n🔄 Syncing stacks...\n"));

      spinner.start("Checking for updates...");

      const mainBranch = await getMainBranch();
      const behind = await getBehindCount(
        currentBranch,
        `origin/${currentBranch}`,
      );

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
          await git.pull();
          spinner.succeed("Pulled latest changes");
        }
      } else {
        spinner.info("Current branch is up to date");
      }

      // some comment
      if (options.deleteMerged) {
        spinner.start("Finding merged branches...");
        const mergedBranches = await getMergedBranches(mainBranch);
        spinner.stop();

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
              await deleteBranch(branch);
              await removeBranchFromStack(branch);
              spinner.succeed(chalk.green(`Deleted ${branch}`));
            } catch (error) {
              spinner.fail(
                chalk.red(`Failed to delete ${branch}: ${error.message}`),
              );
            }
          }
        }
      }

      spinner.start("Checking for stale remote branches...");
      const localBranches = await git.branchLocal();
      const remoteBranches = await getRemoteBranches();
      const staleBranches = [];

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
        console.log(
          chalk.yellow(
            `\nFound ${staleBranches.length} branches without remote:`,
          ),
        );
        staleBranches.forEach((branch) =>
          console.log(chalk.dim(`  - ${branch}`)),
        );
        console.log(
          chalk.dim(
            "\nConsider pushing these branches or removing them from your stacks",
          ),
        );
      }

      console.log(chalk.green.bold("\n✅ Sync complete!"));
    } catch (error) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

async function getMainBranch() {
  try {
    const branches = await git.branch();
    if (branches.all.includes("main")) return "main";
    if (branches.all.includes("master")) return "master";
    return "main";
  } catch (error) {
    return "main";
  }
}

async function getBehindCount(localBranch, remoteBranch) {
  try {
    const result = await git.raw([
      "rev-list",
      "--count",
      `${localBranch}..${remoteBranch}`,
    ]);
    return parseInt(result.trim()) || 0;
  } catch (error) {
    return 0;
  }
}

async function getMergedBranches(mainBranch) {
  try {
    const result = await git.raw(["branch", "--merged", mainBranch]);
    const branches = result
      .split("\n")
      .map((b) => b.trim())
      .filter(
        (b) =>
          b &&
          !b.startsWith("*") &&
          b !== mainBranch &&
          b !== "master" &&
          b !== "main",
      );

    return branches;
  } catch (error) {
    return [];
  }
}
