import axios from 'axios';
import { logger } from '../utils/logger.js';
import ora from 'ora';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

interface AlertOptions {
  add?: string;
  remove?: string;
  list?: boolean;
  check?: boolean;
  webhook?: string;
  json?: boolean;
}

interface AlertConfig {
  url: string;
  name?: string;
  type: 'price' | 'availability' | 'both';
  webhook?: string;
  lastPrice?: string;
  lastStatus?: number;
  lastCheck?: string;
  createdAt: string;
}

interface AlertsFile {
  version: number;
  alerts: AlertConfig[];
}

const ALERTS_FILE = join(homedir(), '.x402', 'alerts.json');

function loadAlerts(): AlertsFile {
  if (existsSync(ALERTS_FILE)) {
    try {
      return JSON.parse(readFileSync(ALERTS_FILE, 'utf-8'));
    } catch {
      return { version: 1, alerts: [] };
    }
  }
  return { version: 1, alerts: [] };
}

function saveAlerts(data: AlertsFile): void {
  const dir = join(homedir(), '.x402');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(ALERTS_FILE, JSON.stringify(data, null, 2));
}

async function sendWebhook(webhookUrl: string, payload: any): Promise<void> {
  try {
    await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });
  } catch (error: any) {
    logger.warn(`Webhook failed: ${error.message}`);
  }
}

export async function alertCommand(options: AlertOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('x402 Alerts');

  const spinner = ora();

  try {
    const data = loadAlerts();

    // Add new alert
    if (options.add) {
      const url = options.add;

      // Check if already exists
      if (data.alerts.some(a => a.url === url)) {
        logger.warn(`Alert already exists for: ${url}`);
        if (options.json) logger.outputJson();
        return;
      }

      spinner.start('Checking endpoint');

      // Verify endpoint is reachable
      let lastPrice: string | undefined;
      let lastStatus: number | undefined;

      try {
        const response = await axios.get(url, {
          timeout: 10000,
          validateStatus: () => true
        });

        lastStatus = response.status;

        if (response.status === 402) {
          const paymentHeader = response.headers['x-payment-required'];
          if (paymentHeader) {
            const requirements = JSON.parse(paymentHeader);
            const accepts = requirements.accepts || requirements.paymentRequirements || [];
            if (accepts[0]) {
              lastPrice = accepts[0].maxAmountRequired || accepts[0].amount;
            }
          }
        }

        spinner.succeed('Endpoint verified');
      } catch (error: any) {
        spinner.warn(`Could not verify endpoint: ${error.message}`);
      }

      const alert: AlertConfig = {
        url,
        type: 'both',
        webhook: options.webhook,
        lastPrice,
        lastStatus,
        lastCheck: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      data.alerts.push(alert);
      saveAlerts(data);

      logger.success(`Alert added for: ${url}`);
      logger.keyValue('Type', 'Price + Availability');

      if (lastPrice) {
        logger.keyValue('Current Price', lastPrice);
      }

      if (options.webhook) {
        logger.keyValue('Webhook', options.webhook);
      }

      logger.setJsonData('action', 'add');
      logger.setJsonData('alert', alert);
    }

    // Remove alert
    else if (options.remove) {
      const url = options.remove;
      const initialLength = data.alerts.length;
      data.alerts = data.alerts.filter(a => a.url !== url);

      if (data.alerts.length < initialLength) {
        saveAlerts(data);
        logger.success(`Alert removed for: ${url}`);
        logger.setJsonData('action', 'remove');
        logger.setJsonData('removed', url);
      } else {
        logger.warn(`No alert found for: ${url}`);
      }
    }

    // Check alerts
    else if (options.check) {
      if (data.alerts.length === 0) {
        logger.info('No alerts configured');
        logger.setJsonData('alerts', []);
        if (options.json) logger.outputJson();
        return;
      }

      logger.info(`Checking ${data.alerts.length} alerts...`);

      const changes: any[] = [];

      for (const alert of data.alerts) {
        spinner.start(`Checking: ${alert.url}`);

        try {
          const response = await axios.get(alert.url, {
            timeout: 10000,
            validateStatus: () => true
          });

          const newStatus = response.status;
          let newPrice: string | undefined;

          if (response.status === 402) {
            const paymentHeader = response.headers['x-payment-required'];
            if (paymentHeader) {
              const requirements = JSON.parse(paymentHeader);
              const accepts = requirements.accepts || requirements.paymentRequirements || [];
              if (accepts[0]) {
                newPrice = accepts[0].maxAmountRequired || accepts[0].amount;
              }
            }
          }

          // Check for changes
          const statusChanged = alert.lastStatus !== undefined && alert.lastStatus !== newStatus;
          const priceChanged = alert.lastPrice !== undefined && alert.lastPrice !== newPrice;

          if (statusChanged || priceChanged) {
            const change = {
              url: alert.url,
              timestamp: new Date().toISOString(),
              statusChanged: statusChanged ? { from: alert.lastStatus, to: newStatus } : null,
              priceChanged: priceChanged ? { from: alert.lastPrice, to: newPrice } : null
            };

            changes.push(change);

            spinner.warn('Change detected!');

            if (statusChanged) {
              logger.keyValue('Status', `${alert.lastStatus} → ${newStatus}`);
            }

            if (priceChanged) {
              logger.keyValue('Price', `${alert.lastPrice} → ${newPrice}`);
            }

            // Send webhook if configured
            if (alert.webhook) {
              await sendWebhook(alert.webhook, {
                type: 'x402_alert',
                ...change
              });
              logger.info('Webhook sent');
            }
          } else {
            spinner.succeed('No changes');
          }

          // Update stored values
          alert.lastStatus = newStatus;
          alert.lastPrice = newPrice;
          alert.lastCheck = new Date().toISOString();

        } catch (error: any) {
          spinner.fail(`Check failed: ${error.message}`);

          if (alert.lastStatus !== undefined && alert.lastStatus !== 0) {
            const change = {
              url: alert.url,
              timestamp: new Date().toISOString(),
              error: error.message,
              statusChanged: { from: alert.lastStatus, to: 'unreachable' }
            };
            changes.push(change);

            if (alert.webhook) {
              await sendWebhook(alert.webhook, {
                type: 'x402_alert',
                ...change
              });
            }
          }

          alert.lastStatus = 0;
          alert.lastCheck = new Date().toISOString();
        }
      }

      saveAlerts(data);

      logger.header('Summary');
      logger.keyValue('Alerts Checked', data.alerts.length.toString());
      logger.keyValue('Changes Detected', changes.length.toString());

      logger.setJsonData('action', 'check');
      logger.setJsonData('checked', data.alerts.length);
      logger.setJsonData('changes', changes);
    }

    // List alerts
    else if (options.list || (!options.add && !options.remove && !options.check)) {
      if (data.alerts.length === 0) {
        logger.info('No alerts configured');
        logger.log('\nUse "x402 alert --add <url>" to add an alert');
        logger.setJsonData('alerts', []);
      } else {
        logger.header('Configured Alerts');

        for (const alert of data.alerts) {
          logger.log('');
          logger.keyValue('URL', alert.url);
          logger.keyValue('Type', alert.type);
          logger.keyValue('Last Price', alert.lastPrice || 'N/A');
          logger.keyValue('Last Status', alert.lastStatus?.toString() || 'N/A');
          logger.keyValue('Last Check', alert.lastCheck ? new Date(alert.lastCheck).toLocaleString() : 'Never');

          if (alert.webhook) {
            logger.keyValue('Webhook', alert.webhook.substring(0, 40) + '...');
          }
        }

        logger.setJsonData('alerts', data.alerts);
      }

      logger.log('\nCommands:');
      logger.log('  x402 alert --add <url>      Add alert for endpoint');
      logger.log('  x402 alert --remove <url>   Remove alert');
      logger.log('  x402 alert --check          Check all alerts now');
      logger.log('  x402 alert --webhook <url>  Set webhook for new alert');
    }

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Alert operation failed');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
