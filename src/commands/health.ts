import axios from 'axios';
import { logger } from '../utils/logger.js';
import ora from 'ora';

interface HealthOptions {
  timeout?: string;
  full?: boolean;
  json?: boolean;
}

interface HealthCheckResult {
  url: string;
  reachable: boolean;
  statusCode?: number;
  responseTime?: number;
  hasPaymentRequirements: boolean;
  paymentRequirements?: any;
  tlsValid?: boolean;
  errors: string[];
  warnings: string[];
  score: number;
}

export async function healthCommand(url: string, options: HealthOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('Endpoint Health Check');
  logger.info(`Target: ${url}`);

  const spinner = ora();
  const timeout = parseInt(options.timeout || '10') * 1000;

  const result: HealthCheckResult = {
    url,
    reachable: false,
    hasPaymentRequirements: false,
    errors: [],
    warnings: [],
    score: 0
  };

  try {
    // Check 1: Basic reachability
    spinner.start('Checking reachability');

    const startTime = Date.now();

    try {
      const response = await axios.get(url, {
        timeout,
        validateStatus: () => true,
        maxRedirects: 5
      });

      result.reachable = true;
      result.statusCode = response.status;
      result.responseTime = Date.now() - startTime;

      spinner.succeed(`Reachable (${result.responseTime}ms, status: ${result.statusCode})`);
      result.score += 30;

    } catch (error: any) {
      spinner.fail('Not reachable');
      result.errors.push(`Connection failed: ${error.message}`);

      if (error.code === 'ENOTFOUND') {
        result.errors.push('DNS resolution failed');
      } else if (error.code === 'ECONNREFUSED') {
        result.errors.push('Connection refused - server may be down');
      } else if (error.code === 'ETIMEDOUT') {
        result.errors.push('Connection timed out');
      }
    }

    // Check 2: x402 Payment Requirements
    if (result.reachable) {
      spinner.start('Checking x402 payment requirements');

      try {
        const response = await axios.get(url, {
          timeout,
          validateStatus: (status) => status === 402 || status === 200
        });

        if (response.status === 402) {
          result.hasPaymentRequirements = true;

          // Parse payment requirements
          const paymentHeader = response.headers['x-payment-required'];
          let paymentData: any;

          if (paymentHeader) {
            try {
              paymentData = JSON.parse(paymentHeader);
              result.paymentRequirements = paymentData;
              spinner.succeed('Valid x402 endpoint (payment required)');
              result.score += 40;
            } catch {
              spinner.warn('402 response but invalid X-Payment-Required header');
              result.warnings.push('X-Payment-Required header is not valid JSON');
              result.score += 20;
            }
          } else if (response.data && (response.data.accepts || response.data.paymentRequirements)) {
            result.paymentRequirements = response.data;
            spinner.succeed('Valid x402 endpoint (v1 format)');
            result.score += 35;
            result.warnings.push('Using legacy body-based payment requirements');
          } else {
            spinner.warn('402 response but no payment requirements found');
            result.warnings.push('Missing X-Payment-Required header');
            result.score += 10;
          }
        } else if (response.status === 200) {
          spinner.succeed('Endpoint is publicly accessible (no payment required)');
          result.hasPaymentRequirements = false;
          result.score += 30;
        }
      } catch (error: any) {
        spinner.warn(`Payment check failed: ${error.message}`);
        result.warnings.push(`Could not verify payment requirements: ${error.message}`);
      }
    }

    // Check 3: TLS/HTTPS
    spinner.start('Checking TLS/HTTPS');

    const urlObj = new URL(url);
    if (urlObj.protocol === 'https:') {
      result.tlsValid = true;
      spinner.succeed('Using HTTPS');
      result.score += 20;
    } else {
      result.tlsValid = false;
      spinner.warn('Not using HTTPS');
      result.warnings.push('Endpoint does not use HTTPS - payments may be insecure');
    }

    // Check 4: Response time assessment
    if (result.responseTime) {
      spinner.start('Assessing response time');

      if (result.responseTime < 200) {
        spinner.succeed('Excellent response time (<200ms)');
        result.score += 10;
      } else if (result.responseTime < 500) {
        spinner.succeed('Good response time (<500ms)');
        result.score += 7;
      } else if (result.responseTime < 1000) {
        spinner.warn('Moderate response time (<1s)');
        result.score += 4;
        result.warnings.push('Response time could be improved');
      } else {
        spinner.warn('Slow response time (>1s)');
        result.warnings.push('Slow response time may affect user experience');
      }
    }

    // Display detailed results
    if (options.full && result.paymentRequirements) {
      logger.header('Payment Requirements');
      logger.json(result.paymentRequirements);
    }

    // Summary
    logger.header('Health Summary');

    const scoreLabel = result.score >= 80 ? 'Healthy' :
                       result.score >= 50 ? 'Degraded' :
                       result.score >= 20 ? 'Unhealthy' : 'Critical';

    logger.keyValue('Status', scoreLabel);
    logger.keyValue('Score', `${result.score}/100`);
    logger.keyValue('Reachable', result.reachable ? '✓' : '✗');
    logger.keyValue('x402 Enabled', result.hasPaymentRequirements ? '✓' : '✗');
    logger.keyValue('HTTPS', result.tlsValid ? '✓' : '✗');

    if (result.responseTime) {
      logger.keyValue('Response Time', `${result.responseTime}ms`);
    }

    if (result.errors.length > 0) {
      logger.header('Errors');
      for (const error of result.errors) {
        logger.error(error);
      }
    }

    if (result.warnings.length > 0) {
      logger.header('Warnings');
      for (const warning of result.warnings) {
        logger.warn(warning);
      }
    }

    // Overall assessment
    logger.header('Assessment');
    if (result.score >= 80) {
      logger.success('Endpoint is healthy and properly configured for x402 payments');
    } else if (result.score >= 50) {
      logger.warn('Endpoint has some issues that should be addressed');
    } else if (result.reachable) {
      logger.error('Endpoint has significant issues');
    } else {
      logger.error('Endpoint is not accessible');
    }

    logger.setJsonData('health', result);

    if (options.json) logger.outputJson();

    // Exit with appropriate code
    if (result.score < 50) {
      process.exit(1);
    }

  } catch (error: any) {
    spinner.fail('Health check failed');
    logger.error(error.message);
    result.errors.push(error.message);
    logger.setJsonData('health', result);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
