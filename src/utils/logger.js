import chalk from "chalk";

class Logger {
  constructor(scope = "", options = {}) {
    this.scope = scope;
    this.isDebugEnabled = options.debug || false;
    this.isVerboseEnabled = options.verbose || false;
  }

  _formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const scopePrefix = this.scope ? `[${this.scope}] ` : "";
    return `${chalk.dim(timestamp)} ${level} ${scopePrefix}${message}`;
  }

  debug(message, ...args) {
    if (this.isDebugEnabled || this.isVerboseEnabled) {
      console.log(this._formatMessage(chalk.blue("[DEBUG]"), message), ...args);
    }
  }

  info(message, ...args) {
    if (this.isVerboseEnabled) {
      console.log(this._formatMessage(chalk.cyan("[INFO]"), message), ...args);
    }
  }

  warn(message, ...args) {
    console.warn(this._formatMessage(chalk.yellow("[WARN]"), message), ...args);
  }

  error(message, ...args) {
    console.error(this._formatMessage(chalk.red("[ERROR]"), message), ...args);
  }

  createChildLogger(childScope) {
    const newScope = this.scope ? `${this.scope}:${childScope}` : childScope;
    return new Logger(newScope, {
      debug: this.isDebugEnabled,
      verbose: this.isVerboseEnabled,
    });
  }
}

let globalLogger = new Logger();

export function initializeLogger(options = {}) {
  globalLogger = new Logger("", options);
  return globalLogger;
}

export function getLogger(scope = "") {
  if (scope) {
    return globalLogger.createChildLogger(scope);
  }
  return globalLogger;
}

export default Logger;
