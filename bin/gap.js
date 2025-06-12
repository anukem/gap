#!/usr/bin/env node

import { Command } from 'commander';
import { createCommand } from '../src/commands/create.js';
import { downCommand } from '../src/commands/down.js';
import { logCommand } from '../src/commands/log.js';
import { modifyCommand } from '../src/commands/modify.js';
import { submitCommand } from '../src/commands/submit.js';
import { syncCommand } from '../src/commands/sync.js';
import { upCommand } from '../src/commands/up.js';

const program = new Command();

program
  .name('gap')
  .description('A CLI tool for managing stacked Git branches')
  .version('1.0.0');

program.addCommand(createCommand);
program.addCommand(downCommand);
program.addCommand(logCommand);
program.addCommand(modifyCommand);
program.addCommand(submitCommand);
program.addCommand(syncCommand);
program.addCommand(upCommand);

program.parse();