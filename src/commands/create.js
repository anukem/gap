import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import {
  ensureCleanWorkingTree,
  branchExists,
  createBranch,
  getCurrentCommit,
} from "../utils/git.js";
import {
  getCurrentBranch,
  getStackForBranch,
  createStack,
  addBranchToStack,
  getParentBranch,
} from "../utils/stack.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger("create");

export const createCommand = new Command("create")
  .alias("c")
  .description("Create a new branch in your stack")
  .argument("[branch-name]", "Name for the new branch")
  .option(
    "-m, --message <message>",
    "Commit message for any uncommitted changes",
  )
  .action(async (branchName, options) => {
    const spinner = ora();
    logger.debug("Starting create command", { branchName, options });

    try {
      await ensureCleanWorkingTree();

      const currentBranch = await getCurrentBranch();
      logger.debug(`Current branch: ${currentBranch}`);

      let currentStack = await getStackForBranch(currentBranch);
      logger.debug("Current stack:", currentStack);

      if (!currentStack) {
        logger.info("No stack found, creating new stack");
        console.log(chalk.yellow("No stack found. Creating a new stack..."));

        const { stackName } = await inquirer.prompt([
          {
            type: "input",
            name: "stackName",
            message: "Enter a name for the new stack:",
            default: `stack-${Date.now()}`,
          },
        ]);

        logger.debug(`Creating new stack: ${stackName}`);
        await createStack(stackName, currentBranch);
        currentStack = await getStackForBranch(currentBranch);
      }

      if (!branchName) {
        logger.debug("No branch name provided, prompting user");
        const { name } = await inquirer.prompt([
          {
            type: "input",
            name: "name",
            message: "Enter branch name:",
            validate: (input) => {
              if (!input) return "Branch name is required";
              if (input.includes(" "))
                return "Branch name cannot contain spaces";
              return true;
            },
          },
        ]);
        branchName = name;
        logger.debug(`User provided branch name: ${branchName}`);
      }

      if (await branchExists(branchName)) {
        logger.error(`Branch ${branchName} already exists`);
        console.error(chalk.red(`Branch '${branchName}' already exists`));
        process.exit(1);
      }

      spinner.start(`Creating branch '${branchName}'...`);
      logger.info(`Creating branch ${branchName} from ${currentBranch}`);

      await createBranch(branchName, currentBranch);
      spinner.succeed(`Branch '${branchName}' created`);

      if (currentStack) {
        logger.debug(`Adding branch to existing stack: ${currentStack.name}`);
        await addBranchToStack(currentStack.name, branchName, currentBranch);
      } else {
        logger.debug("No current stack, prompting to create new stack");
        const { createNewStack } = await inquirer.prompt([
          {
            type: "confirm",
            name: "createNewStack",
            message: "Would you like to create a new stack?",
            default: true,
          },
        ]);

        if (createNewStack) {
          const { stackName } = await inquirer.prompt([
            {
              type: "input",
              name: "stackName",
              message: "Enter stack name:",
              default: `stack-${Date.now()}`,
            },
          ]);

          await createStack(stackName, currentBranch);
          await addBranchToStack(stackName, branchName, currentBranch);
        }
      }

      spinner.succeed(
        chalk.green(
          `Created branch '${branchName}' on top of '${currentBranch}'`,
        ),
      );
      logger.info(`Successfully created branch ${branchName}`);

      const updatedStack = await getStackForBranch(branchName);
      if (updatedStack) {
        logger.debug("Updated stack structure:", updatedStack);
        console.log(chalk.dim(`Stack: ${updatedStack.name}`));
        console.log(
          chalk.dim(`Branches in stack: ${updatedStack.branches.join(" → ")}`),
        );
      }
    } catch (error) {
      logger.error("Create command failed:", error);
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });
