import axios from 'axios';
import { logger } from '../utils/logger.js';
import ora from 'ora';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

interface StarOptions {
  remove?: boolean;
  list?: boolean;
  json?: boolean;
}

interface StarredEndpoint {
  url: string;
  name?: string;
  price?: string;
  asset?: string;
  network?: string;
  starredAt: string;
  lastChecked?: string;
  notes?: string;
}

interface StarsFile {
  version: number;
  stars: StarredEndpoint[];
}

const STARS_FILE = join(homedir(), '.x402', 'stars.json');

function loadStars(): StarsFile {
  if (existsSync(STARS_FILE)) {
    try {
      return JSON.parse(readFileSync(STARS_FILE, 'utf-8'));
    } catch {
      return { version: 1, stars: [] };
    }
  }
  return { version: 1, stars: [] };
}

function saveStars(data: StarsFile): void {
  const dir = join(homedir(), '.x402');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(STARS_FILE, JSON.stringify(data, null, 2));
}

export async function starCommand(url: string | undefined, options: StarOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('Starred Endpoints');

  const spinner = ora();
  const data = loadStars();

  try {
    // List starred endpoints
    if (options.list || (!url && !options.remove)) {
      if (data.stars.length === 0) {
        logger.info('No starred endpoints');
        logger.log('\nUse "x402 star <url>" to bookmark an endpoint');
        logger.setJsonData('stars', []);
        if (options.json) logger.outputJson();
        return;
      }

      logger.info(`${data.stars.length} starred endpoint(s)`);

      for (const star of data.stars) {
        logger.log('');
        logger.keyValue('URL', star.url);

        if (star.name) {
          logger.keyValue('Name', star.name);
        }

        if (star.price) {
          logger.keyValue('Price', `${star.price} ${star.asset || 'USDC'}`);
        }

        if (star.network) {
          logger.keyValue('Network', star.network);
        }

        logger.keyValue('Starred', new Date(star.starredAt).toLocaleDateString());

        if (star.notes) {
          logger.keyValue('Notes', star.notes);
        }
      }

      logger.setJsonData('stars', data.stars);

      logger.log('\nQuick access:');
      for (const star of data.stars.slice(0, 5)) {
        const name = star.name || new URL(star.url).hostname;
        logger.log(`  x402 test "${star.url}"  # ${name}`);
      }

      if (options.json) logger.outputJson();
      return;
    }

    // Remove star
    if (options.remove && url) {
      const initialLength = data.stars.length;
      data.stars = data.stars.filter(s => s.url !== url);

      if (data.stars.length < initialLength) {
        saveStars(data);
        logger.success(`Removed star for: ${url}`);
        logger.setJsonData('action', 'remove');
        logger.setJsonData('removed', url);
      } else {
        logger.warn(`No star found for: ${url}`);
      }

      if (options.json) logger.outputJson();
      return;
    }

    // Add new star
    if (url) {
      // Check if already starred
      if (data.stars.some(s => s.url === url)) {
        logger.info(`Already starred: ${url}`);
        const existing = data.stars.find(s => s.url === url);
        logger.setJsonData('star', existing);
        if (options.json) logger.outputJson();
        return;
      }

      spinner.start('Fetching endpoint info');

      const star: StarredEndpoint = {
        url,
        starredAt: new Date().toISOString()
      };

      try {
        const response = await axios.get(url, {
          timeout: 10000,
          validateStatus: (status) => status === 402 || status === 200
        });

        if (response.status === 402) {
          const paymentHeader = response.headers['x-payment-required'];
          let paymentData: any;

          if (paymentHeader) {
            paymentData = JSON.parse(paymentHeader);
          } else {
            paymentData = response.data;
          }

          const accepts = paymentData?.accepts || paymentData?.paymentRequirements || [];
          const req = accepts[0];

          if (req) {
            star.price = req.maxAmountRequired || req.amount;
            star.asset = req.extra?.name || 'USDC';
            star.network = req.network;
          }
        }

        // Try to get a name from the URL
        try {
          const urlObj = new URL(url);
          star.name = urlObj.hostname + urlObj.pathname;
        } catch {
          star.name = url.substring(0, 50);
        }

        star.lastChecked = new Date().toISOString();

        spinner.succeed('Endpoint info retrieved');

      } catch (error: any) {
        spinner.warn(`Could not fetch info: ${error.message}`);
        // Still add the star, just without details
        try {
          star.name = new URL(url).hostname;
        } catch {
          star.name = url.substring(0, 50);
        }
      }

      data.stars.push(star);
      saveStars(data);

      logger.success(`Starred: ${url}`);

      if (star.price) {
        logger.keyValue('Price', `${star.price} ${star.asset || 'USDC'}`);
      }

      if (star.network) {
        logger.keyValue('Network', star.network);
      }

      logger.setJsonData('action', 'add');
      logger.setJsonData('star', star);

      logger.log('\nQuick test:');
      logger.log(`  x402 test "${url}"`);
    }

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Star operation failed');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
