import { logger } from '../utils/logger.js';
import { getPrivateKey, getNetwork } from '../utils/config.js';
import { testEndpoint } from './test.js';
import { getEndpointInfo } from './info.js';
import ora from 'ora';
import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';

interface ScriptOptions {
  key?: string;
  network?: string;
  dryRun?: boolean;
  json?: boolean;
}

interface ScriptStep {
  name?: string;
  action: 'test' | 'info' | 'wait' | 'assert' | 'log';
  url?: string;
  delay?: number;
  condition?: string;
  message?: string;
  options?: Record<string, any>;
}

interface Script {
  name?: string;
  description?: string;
  variables?: Record<string, string>;
  steps: ScriptStep[];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function evaluateCondition(condition: string, vars: Record<string, any>): boolean {
  // Simple condition evaluator - supports: varName, varName == value, varName != value
  const trimmed = condition.trim();

  // Check for equality comparison
  if (trimmed.includes('==')) {
    const [left, right] = trimmed.split('==').map(s => s.trim());
    const leftVal = vars[left] ?? left;
    const rightVal = vars[right] ?? right;
    return String(leftVal) === String(rightVal);
  }

  // Check for inequality comparison
  if (trimmed.includes('!=')) {
    const [left, right] = trimmed.split('!=').map(s => s.trim());
    const leftVal = vars[left] ?? left;
    const rightVal = vars[right] ?? right;
    return String(leftVal) !== String(rightVal);
  }

  // Check for greater than
  if (trimmed.includes('>')) {
    const [left, right] = trimmed.split('>').map(s => s.trim());
    const leftVal = parseFloat(vars[left] ?? left);
    const rightVal = parseFloat(vars[right] ?? right);
    return leftVal > rightVal;
  }

  // Check for less than
  if (trimmed.includes('<')) {
    const [left, right] = trimmed.split('<').map(s => s.trim());
    const leftVal = parseFloat(vars[left] ?? left);
    const rightVal = parseFloat(vars[right] ?? right);
    return leftVal < rightVal;
  }

  // Simple truthy check for variable existence
  return Boolean(vars[trimmed]);
}

export async function scriptCommand(file: string, options: ScriptOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('x402 Script Runner');
  logger.info(`Script: ${file}`);

  const spinner = ora();

  try {
    // Load script file
    if (!existsSync(file)) {
      logger.error(`Script file not found: ${file}`);
      if (options.json) logger.outputJson();
      process.exit(1);
    }

    spinner.start('Loading script');

    const content = readFileSync(file, 'utf-8');
    let script: Script;

    // Parse as YAML or JSON
    if (file.endsWith('.json')) {
      script = JSON.parse(content);
    } else {
      script = parseYaml(content);
    }

    if (!script.steps || !Array.isArray(script.steps)) {
      throw new Error('Script must contain a "steps" array');
    }

    spinner.succeed(`Loaded script: ${script.name || file}`);

    if (script.description) {
      logger.info(script.description);
    }

    logger.info(`Steps: ${script.steps.length}`);

    // Initialize variables
    const vars: Record<string, any> = {
      ...script.variables,
      NETWORK: getNetwork(options.network),
      DRY_RUN: options.dryRun ? 'true' : 'false'
    };

    logger.setJsonData('script', {
      name: script.name,
      file,
      totalSteps: script.steps.length
    });

    // Execute steps
    const results: any[] = [];
    let successCount = 0;
    let failCount = 0;

    logger.header('Execution');

    for (let i = 0; i < script.steps.length; i++) {
      const step = script.steps[i];
      const stepNum = i + 1;
      const stepName = step.name || `Step ${stepNum}`;

      // Variable substitution
      const substituteVars = (str: string): string => {
        return str.replace(/\$\{(\w+)\}/g, (_, key) => vars[key] || '');
      };

      logger.log(`\n[${stepNum}/${script.steps.length}] ${stepName}`);

      try {
        switch (step.action) {
          case 'test': {
            if (!step.url) throw new Error('test action requires url');
            const url = substituteVars(step.url);
            logger.info(`Testing: ${url}`);

            if (options.dryRun) {
              logger.info('(dry-run: skipping actual payment)');
            }

            await testEndpoint(url, {
              key: options.key,
              network: options.network,
              dryRun: options.dryRun,
              verbose: step.options?.verbose
            });

            successCount++;
            results.push({ step: stepNum, name: stepName, action: 'test', url, status: 'success' });
            break;
          }

          case 'info': {
            if (!step.url) throw new Error('info action requires url');
            const url = substituteVars(step.url);
            logger.info(`Getting info: ${url}`);

            await getEndpointInfo(url, {
              verbose: step.options?.verbose
            });

            successCount++;
            results.push({ step: stepNum, name: stepName, action: 'info', url, status: 'success' });
            break;
          }

          case 'wait': {
            const delay = step.delay || 1000;
            logger.info(`Waiting ${delay}ms...`);
            await sleep(delay);
            successCount++;
            results.push({ step: stepNum, name: stepName, action: 'wait', delay, status: 'success' });
            break;
          }

          case 'log': {
            const message = step.message ? substituteVars(step.message) : '';
            logger.log(`  ${message}`);
            successCount++;
            results.push({ step: stepNum, name: stepName, action: 'log', message, status: 'success' });
            break;
          }

          case 'assert': {
            if (!step.condition) throw new Error('assert action requires condition');
            const condition = substituteVars(step.condition);
            const result = evaluateCondition(condition, vars);
            if (!result) {
              throw new Error(`Assertion failed: ${condition}`);
            }
            logger.success(`Assertion passed: ${condition}`);
            successCount++;
            results.push({ step: stepNum, name: stepName, action: 'assert', condition, status: 'success' });
            break;
          }

          default:
            throw new Error(`Unknown action: ${step.action}`);
        }

      } catch (error: any) {
        failCount++;
        logger.error(`Step failed: ${error.message}`);
        results.push({ step: stepNum, name: stepName, action: step.action, status: 'failed', error: error.message });

        // Continue to next step unless strict mode
        if (step.options?.stopOnError) {
          logger.error('Stopping script due to error');
          break;
        }
      }
    }

    // Summary
    logger.header('Summary');
    logger.keyValue('Total Steps', script.steps.length.toString());
    logger.keyValue('Successful', successCount.toString());
    logger.keyValue('Failed', failCount.toString());
    logger.keyValue('Success Rate', `${((successCount / script.steps.length) * 100).toFixed(1)}%`);

    logger.setJsonData('results', {
      steps: results,
      successful: successCount,
      failed: failCount,
      total: script.steps.length
    });

    if (failCount > 0) {
      logger.warn('Some steps failed - review the output above');
    } else {
      logger.success('All steps completed successfully');
    }

    if (options.json) logger.outputJson();

    if (failCount > 0) {
      process.exit(1);
    }

  } catch (error: any) {
    spinner.fail('Script execution failed');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
