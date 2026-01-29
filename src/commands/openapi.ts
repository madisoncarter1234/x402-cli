import axios from 'axios';
import { logger } from '../utils/logger.js';
import ora from 'ora';
import { writeFileSync } from 'fs';

interface OpenAPIOptions {
  output?: string;
  title?: string;
  json?: boolean;
}

export async function openapiCommand(url: string, options: OpenAPIOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('Generate OpenAPI Spec');
  logger.info(`Target: ${url}`);

  const spinner = ora();

  try {
    // Fetch payment requirements
    spinner.start('Fetching endpoint information');

    const response = await axios.get(url, {
      validateStatus: (status) => status === 402 || status === 200
    });

    spinner.succeed('Endpoint information retrieved');

    const urlObj = new URL(url);
    const basePath = urlObj.pathname;
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

    let paymentRequired = response.status === 402;
    let paymentData: any = null;

    if (paymentRequired) {
      const paymentHeader = response.headers['x-payment-required'];
      if (paymentHeader) {
        try {
          paymentData = JSON.parse(paymentHeader);
        } catch {
          paymentData = response.data;
        }
      } else {
        paymentData = response.data;
      }
    }

    const accepts = paymentData?.accepts || paymentData?.paymentRequirements || [];
    const req = accepts[0];

    // Generate OpenAPI spec
    const spec: any = {
      openapi: '3.1.0',
      info: {
        title: options.title || `x402 API - ${urlObj.hostname}`,
        version: '1.0.0',
        description: paymentRequired
          ? 'This API uses x402 payment protocol. Requests require payment via the X-Payment header.'
          : 'API endpoint specification',
        'x-x402-enabled': paymentRequired
      },
      servers: [
        {
          url: baseUrl,
          description: 'Production server'
        }
      ],
      paths: {
        [basePath]: {
          get: {
            summary: `Access ${basePath}`,
            description: paymentRequired
              ? 'This endpoint requires x402 payment. Send a signed payment in the X-Payment header.'
              : 'Access this resource',
            operationId: 'getResource',
            parameters: [],
            responses: {
              '200': {
                description: 'Successful response',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      description: 'Resource data'
                    }
                  }
                }
              }
            }
          }
        }
      },
      components: {
        securitySchemes: {},
        schemas: {}
      }
    };

    // Add x402 specific information
    if (paymentRequired && req) {
      // Add 402 response
      spec.paths[basePath].get.responses['402'] = {
        description: 'Payment Required',
        headers: {
          'X-Payment-Required': {
            description: 'JSON object containing payment requirements',
            schema: {
              type: 'string'
            }
          }
        },
        content: {
          'application/json': {
            schema: {
              '$ref': '#/components/schemas/PaymentRequirements'
            },
            example: paymentData
          }
        }
      };

      // Add X-Payment header parameter
      spec.paths[basePath].get.parameters.push({
        name: 'X-Payment',
        in: 'header',
        required: true,
        description: 'Signed x402 payment authorization',
        schema: {
          type: 'string',
          format: 'json'
        }
      });

      // Add payment schemas
      spec.components.schemas.PaymentRequirements = {
        type: 'object',
        properties: {
          x402Version: {
            type: 'integer',
            description: 'x402 protocol version'
          },
          accepts: {
            type: 'array',
            items: {
              '$ref': '#/components/schemas/PaymentOption'
            }
          }
        }
      };

      spec.components.schemas.PaymentOption = {
        type: 'object',
        properties: {
          scheme: {
            type: 'string',
            description: 'Payment scheme (e.g., exact)',
            example: req.scheme || 'exact'
          },
          network: {
            type: 'string',
            description: 'Blockchain network (CAIP-2 format)',
            example: req.network
          },
          maxAmountRequired: {
            type: 'string',
            description: 'Maximum payment amount in base units',
            example: req.maxAmountRequired || req.amount
          },
          asset: {
            type: 'string',
            description: 'Payment asset (CAIP-19 format)',
            example: req.asset
          },
          payTo: {
            type: 'string',
            description: 'Recipient address',
            example: req.payTo || req.recipient
          },
          maxTimeoutSeconds: {
            type: 'integer',
            description: 'Maximum time for payment validity',
            example: req.maxTimeoutSeconds || 60
          }
        }
      };

      spec.components.schemas.PaymentHeader = {
        type: 'object',
        description: 'Structure of the X-Payment header',
        properties: {
          x402Version: {
            type: 'integer',
            example: 1
          },
          scheme: {
            type: 'string',
            example: 'exact'
          },
          network: {
            type: 'string',
            example: req.network
          },
          payload: {
            type: 'object',
            properties: {
              signature: {
                type: 'string',
                description: 'EIP-3009 authorization signature'
              },
              authorization: {
                type: 'object',
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                  value: { type: 'string' },
                  validAfter: { type: 'string' },
                  validBefore: { type: 'string' },
                  nonce: { type: 'string' }
                }
              }
            }
          }
        }
      };

      // Add x402 security scheme
      spec.components.securitySchemes.x402Payment = {
        type: 'apiKey',
        in: 'header',
        name: 'X-Payment',
        description: 'x402 payment authorization. Must be a JSON object containing the signed payment.'
      };

      spec.paths[basePath].get.security = [{ x402Payment: [] }];

      // Add x-x402 extension
      spec.paths[basePath].get['x-x402'] = {
        enabled: true,
        amount: req.maxAmountRequired || req.amount,
        asset: req.asset,
        network: req.network,
        recipient: req.payTo || req.recipient
      };
    }

    // Output the spec
    const specYaml = JSON.stringify(spec, null, 2);

    if (options.output) {
      writeFileSync(options.output, specYaml);
      logger.success(`OpenAPI spec saved to: ${options.output}`);
    } else {
      logger.header('OpenAPI Specification');
      logger.log(specYaml);
    }

    logger.setJsonData('openapi', spec);

    // Summary
    logger.header('Summary');
    logger.keyValue('Base URL', baseUrl);
    logger.keyValue('Path', basePath);
    logger.keyValue('x402 Enabled', paymentRequired ? 'Yes' : 'No');

    if (paymentRequired && req) {
      logger.keyValue('Payment Amount', req.maxAmountRequired || req.amount);
      logger.keyValue('Network', req.network);
    }

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Failed to generate OpenAPI spec');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
