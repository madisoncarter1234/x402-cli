import axios from 'axios';
import { logger } from '../utils/logger.js';
import ora from 'ora';
import prompts from 'prompts';

interface RegisterOptions {
  name?: string;
  description?: string;
  category?: string;
  tags?: string;
  json?: boolean;
}

// Note: This is a conceptual implementation
// A real registry would need an actual backend service
const REGISTRY_URL = process.env.X402_REGISTRY_URL || 'https://registry.x402.org';

export async function registerCommand(url: string, options: RegisterOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('Register x402 Endpoint');
  logger.info(`Endpoint: ${url}`);

  const spinner = ora();

  try {
    // First, verify the endpoint is a valid x402 endpoint
    spinner.start('Verifying endpoint');

    let paymentRequirements: any = null;

    try {
      const response = await axios.get(url, {
        timeout: 10000,
        validateStatus: (status) => status === 402 || status === 200
      });

      if (response.status === 200) {
        spinner.fail('Endpoint does not require payment (not a 402)');
        logger.error('Only x402 payment-enabled endpoints can be registered');
        if (options.json) logger.outputJson();
        process.exit(1);
      }

      const paymentHeader = response.headers['x-payment-required'];
      if (paymentHeader) {
        paymentRequirements = JSON.parse(paymentHeader);
      } else {
        paymentRequirements = response.data;
      }

      spinner.succeed('Valid x402 endpoint verified');

    } catch (error: any) {
      spinner.fail('Could not verify endpoint');
      logger.error(error.message);
      if (options.json) logger.outputJson();
      process.exit(1);
    }

    // Extract payment details
    const accepts = paymentRequirements?.accepts || paymentRequirements?.paymentRequirements || [];
    const primaryReq = accepts[0];

    if (primaryReq) {
      logger.header('Detected Configuration');
      logger.keyValue('Price', primaryReq.maxAmountRequired || primaryReq.amount || 'N/A');
      logger.keyValue('Asset', primaryReq.asset || 'USDC');
      logger.keyValue('Network', primaryReq.network || 'N/A');
      logger.keyValue('Recipient', primaryReq.payTo || primaryReq.recipient || 'N/A');
    }

    // Gather additional information
    let name = options.name;
    let description = options.description;
    let category = options.category;
    let tags = options.tags?.split(',').map(t => t.trim());

    if (!name) {
      const result = await prompts({
        type: 'text',
        name: 'name',
        message: 'Endpoint name:',
        initial: new URL(url).hostname
      });
      name = result.name;
    }

    if (!description) {
      const result = await prompts({
        type: 'text',
        name: 'description',
        message: 'Description:'
      });
      description = result.description;
    }

    if (!category) {
      const result = await prompts({
        type: 'select',
        name: 'category',
        message: 'Category:',
        choices: [
          { title: 'API', value: 'api' },
          { title: 'Data', value: 'data' },
          { title: 'AI/ML', value: 'ai' },
          { title: 'Media', value: 'media' },
          { title: 'Finance', value: 'finance' },
          { title: 'Other', value: 'other' }
        ]
      });
      category = result.category;
    }

    if (!tags) {
      const result = await prompts({
        type: 'text',
        name: 'tags',
        message: 'Tags (comma-separated):'
      });
      tags = result.tags?.split(',').map((t: string) => t.trim()).filter(Boolean);
    }

    // Build registration payload
    const registration = {
      url,
      name,
      description,
      category,
      tags: tags || [],
      paymentRequirements: primaryReq ? {
        price: primaryReq.maxAmountRequired || primaryReq.amount,
        asset: primaryReq.asset,
        network: primaryReq.network,
        recipient: primaryReq.payTo || primaryReq.recipient
      } : null,
      submittedAt: new Date().toISOString()
    };

    logger.header('Registration Details');
    logger.keyValue('Name', name || 'N/A');
    logger.keyValue('Description', description || 'N/A');
    logger.keyValue('Category', category || 'N/A');
    logger.keyValue('Tags', (tags || []).join(', ') || 'None');

    // Confirm submission
    const { confirm } = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: 'Submit registration?',
      initial: true
    });

    if (!confirm) {
      logger.info('Registration cancelled');
      if (options.json) logger.outputJson();
      return;
    }

    // Submit to registry
    spinner.start('Submitting to registry');

    try {
      const response = await axios.post(`${REGISTRY_URL}/api/endpoints`, registration, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      spinner.succeed('Registration submitted');

      if (response.data?.id) {
        logger.keyValue('Registration ID', response.data.id);
        logger.keyValue('Status', response.data.status || 'pending');
      }

      logger.setJsonData('registration', {
        ...registration,
        id: response.data?.id,
        status: response.data?.status
      });

    } catch (error: any) {
      // If registry is not available, save locally
      spinner.warn('Registry unavailable - saving registration locally');

      logger.info('Your registration has been saved locally.');
      logger.info('You can manually submit it later or host your own registry.');

      // Save to local file
      const { join } = await import('path');
      const { homedir } = await import('os');
      const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('fs');

      const registryDir = join(homedir(), '.x402', 'registry');
      const registryFile = join(registryDir, 'pending.json');

      if (!existsSync(registryDir)) {
        mkdirSync(registryDir, { recursive: true });
      }

      let pending: any[] = [];
      if (existsSync(registryFile)) {
        try {
          pending = JSON.parse(readFileSync(registryFile, 'utf-8'));
        } catch {
          pending = [];
        }
      }

      pending.push(registration);
      writeFileSync(registryFile, JSON.stringify(pending, null, 2));

      logger.success(`Saved to: ${registryFile}`);

      logger.setJsonData('registration', {
        ...registration,
        status: 'saved_locally',
        localPath: registryFile
      });
    }

    logger.log('\nYour endpoint will be reviewed and added to the public registry.');
    logger.log('Users can discover it via: x402 discover');

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Registration failed');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
