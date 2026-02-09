import { logger } from '../utils/logger.js';
import ora from 'ora';
import prompts from 'prompts';
import axios from 'axios';
import { execFileSync } from 'child_process';

interface BrowseOptions {
  category?: string;
  json?: boolean;
}

// Sample endpoint data - in production, this would come from a registry API
const SAMPLE_ENDPOINTS = [
  {
    name: 'Weather API',
    url: 'https://api.example.com/weather',
    category: 'api',
    description: 'Real-time weather data',
    price: '100',
    network: 'base-sepolia'
  },
  {
    name: 'AI Image Generation',
    url: 'https://api.example.com/generate',
    category: 'ai',
    description: 'Generate images from text prompts',
    price: '1000',
    network: 'base'
  },
  {
    name: 'Stock Data',
    url: 'https://api.example.com/stocks',
    category: 'finance',
    description: 'Real-time stock prices and analytics',
    price: '500',
    network: 'base'
  },
  {
    name: 'News Feed',
    url: 'https://api.example.com/news',
    category: 'data',
    description: 'Curated news articles',
    price: '50',
    network: 'base-sepolia'
  }
];

const REGISTRY_URL = process.env.X402_REGISTRY_URL || 'https://registry.x402.org';

export async function browseCommand(options: BrowseOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('x402 Endpoint Browser');

  const spinner = ora();
  let endpoints = SAMPLE_ENDPOINTS;

  // Try to fetch from registry
  try {
    spinner.start('Fetching endpoints from registry');

    const response = await axios.get(`${REGISTRY_URL}/api/endpoints`, {
      timeout: 5000,
      params: {
        category: options.category,
        limit: 50
      }
    });

    if (response.data?.endpoints) {
      endpoints = response.data.endpoints;
      spinner.succeed(`Loaded ${endpoints.length} endpoints from registry`);
    } else {
      throw new Error('Invalid response');
    }

  } catch {
    spinner.warn('Registry unavailable - showing sample data');
    logger.info('Set X402_REGISTRY_URL to use a custom registry');
  }

  // Filter by category if specified
  if (options.category) {
    endpoints = endpoints.filter(e =>
      e.category?.toLowerCase() === options.category?.toLowerCase()
    );
    logger.info(`Filtered by category: ${options.category}`);
  }

  if (endpoints.length === 0) {
    logger.info('No endpoints found');
    logger.setJsonData('endpoints', []);
    if (options.json) logger.outputJson();
    return;
  }

  // Interactive browsing loop
  let browsing = true;

  while (browsing) {
    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { title: 'Browse all endpoints', value: 'browse' },
        { title: 'Filter by category', value: 'category' },
        { title: 'Search endpoints', value: 'search' },
        { title: 'Exit', value: 'exit' }
      ]
    }, {
      onCancel: () => {
        browsing = false;
        return false;
      }
    });

    if (!action || action === 'exit') {
      browsing = false;
      break;
    }

    if (action === 'category') {
      const categories = [...new Set(endpoints.map(e => e.category))].filter(Boolean);

      const { selectedCategory } = await prompts({
        type: 'select',
        name: 'selectedCategory',
        message: 'Select category:',
        choices: [
          { title: 'All', value: null },
          ...categories.map(c => ({ title: c, value: c }))
        ]
      });

      const filtered = selectedCategory
        ? endpoints.filter(e => e.category === selectedCategory)
        : endpoints;

      await displayEndpoints(filtered);
    }

    else if (action === 'search') {
      const { query } = await prompts({
        type: 'text',
        name: 'query',
        message: 'Search term:'
      });

      if (query) {
        const searchLower = query.toLowerCase();
        const filtered = endpoints.filter(e =>
          e.name?.toLowerCase().includes(searchLower) ||
          e.description?.toLowerCase().includes(searchLower) ||
          e.url?.toLowerCase().includes(searchLower)
        );

        await displayEndpoints(filtered);
      }
    }

    else if (action === 'browse') {
      await displayEndpoints(endpoints);
    }
  }

  logger.setJsonData('endpoints', endpoints);
  if (options.json) logger.outputJson();
}

function copyToClipboard(text: string): boolean {
  try {
    if (process.platform === 'darwin') {
      execFileSync('pbcopy', [], { input: text });
      return true;
    } else if (process.platform === 'linux') {
      execFileSync('xclip', ['-selection', 'clipboard'], { input: text });
      return true;
    } else if (process.platform === 'win32') {
      execFileSync('clip', [], { input: text });
      return true;
    }
  } catch {
    // Clipboard not available
  }
  return false;
}

async function displayEndpoints(endpoints: any[]): Promise<void> {
  if (endpoints.length === 0) {
    logger.info('No endpoints match your criteria');
    return;
  }

  const { selected } = await prompts({
    type: 'select',
    name: 'selected',
    message: `Select endpoint (${endpoints.length} available):`,
    choices: [
      ...endpoints.map((e, i) => ({
        title: `${e.name} - ${e.description?.substring(0, 40) || 'No description'}`,
        description: `${e.price || '?'} ${e.network || ''}`,
        value: i
      })),
      { title: '← Back', value: -1 }
    ]
  });

  if (selected === undefined || selected === -1) {
    return;
  }

  const endpoint = endpoints[selected];

  // Show endpoint details
  logger.header(endpoint.name || 'Endpoint Details');
  logger.keyValue('URL', endpoint.url);
  logger.keyValue('Category', endpoint.category || 'N/A');
  logger.keyValue('Description', endpoint.description || 'N/A');
  logger.keyValue('Price', endpoint.price ? `${endpoint.price} USDC` : 'N/A');
  logger.keyValue('Network', endpoint.network || 'N/A');

  // Offer actions
  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { title: 'Get payment info', value: 'info' },
      { title: 'Test endpoint (dry run)', value: 'test' },
      { title: 'Star this endpoint', value: 'star' },
      { title: 'Copy URL', value: 'copy' },
      { title: '← Back', value: 'back' }
    ]
  });

  if (action === 'info') {
    const { getEndpointInfo } = await import('./info.js');
    await getEndpointInfo(endpoint.url, { verbose: true });
  }

  else if (action === 'test') {
    const { testEndpoint } = await import('./test.js');
    await testEndpoint(endpoint.url, { dryRun: true });
  }

  else if (action === 'star') {
    const { starCommand } = await import('./star.js');
    await starCommand(endpoint.url, {});
  }

  else if (action === 'copy') {
    logger.log(`\n${endpoint.url}\n`);

    if (copyToClipboard(endpoint.url)) {
      logger.success('Copied to clipboard');
    } else {
      logger.info('URL displayed above (copy it manually)');
    }
  }
}
