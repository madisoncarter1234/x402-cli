import chalk from 'chalk';

let jsonMode = false;
let jsonOutput: Record<string, any> = {};

export const logger = {
  setJsonMode: (enabled: boolean) => {
    jsonMode = enabled;
    jsonOutput = {};
  },

  isJsonMode: () => jsonMode,

  // Collect data for JSON output
  setJsonData: (key: string, value: any) => {
    jsonOutput[key] = value;
  },

  appendJsonData: (key: string, value: any) => {
    if (!jsonOutput[key]) {
      jsonOutput[key] = [];
    }
    jsonOutput[key].push(value);
  },

  // Output final JSON
  outputJson: () => {
    console.log(JSON.stringify(jsonOutput, null, 2));
  },

  success: (message: string) => {
    if (!jsonMode) console.log(chalk.green('✓'), message);
  },

  error: (message: string) => {
    if (jsonMode) {
      jsonOutput.error = message;
    } else {
      console.log(chalk.red('✗'), message);
    }
  },

  info: (message: string) => {
    if (!jsonMode) console.log(chalk.blue('ℹ'), message);
  },

  warn: (message: string) => {
    if (jsonMode) {
      jsonOutput.warning = message;
    } else {
      console.log(chalk.yellow('⚠'), message);
    }
  },

  step: (message: string) => chalk.cyan('→') + ' ' + message,

  log: (message: string) => {
    if (!jsonMode) console.log(message);
  },

  header: (message: string) => {
    if (!jsonMode) console.log('\n' + chalk.bold.underline(message));
  },

  json: (data: any) => {
    if (jsonMode) {
      Object.assign(jsonOutput, data);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  },

  keyValue: (key: string, value: string) => {
    if (!jsonMode) {
      console.log(`  ${chalk.gray(key + ':')} ${value}`);
    }
  }
};
