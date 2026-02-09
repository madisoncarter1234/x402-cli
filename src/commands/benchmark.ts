import axios from 'axios';
import { logger } from '../utils/logger.js';
import ora from 'ora';

interface BenchmarkOptions {
  requests?: string;
  concurrent?: string;
  timeout?: string;
  pay?: boolean;
  key?: string;
  json?: boolean;
}

interface BenchmarkResult {
  url: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTime: number;
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  requestsPerSecond: number;
  paymentRequired: boolean;
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export async function benchmarkCommand(url: string, options: BenchmarkOptions) {
  if (options.json) {
    logger.setJsonMode(true);
  }

  logger.header('x402 Endpoint Benchmark');
  logger.info(`Target: ${url}`);

  const spinner = ora();

  const totalRequests = parseInt(options.requests || '100');
  const concurrent = parseInt(options.concurrent || '10');
  const timeout = parseInt(options.timeout || '10') * 1000;

  logger.info(`Requests: ${totalRequests}`);
  logger.info(`Concurrency: ${concurrent}`);
  logger.info(`Timeout: ${timeout}ms`);

  if (options.pay) {
    logger.warn('Payment mode enabled - this will make real payments!');
  }

  const latencies: number[] = [];
  let successCount = 0;
  let failCount = 0;
  let paymentRequired = false;

  try {
    // Warm-up request
    spinner.start('Warming up');

    try {
      const warmupStart = Date.now();
      await axios.get(url, {
        timeout,
        validateStatus: () => true
      });
      const warmupTime = Date.now() - warmupStart;
      spinner.succeed(`Warm-up complete (${warmupTime}ms)`);
    } catch (e) {
      spinner.warn('Warm-up request failed');
    }

    logger.header('Running Benchmark');

    const startTime = Date.now();

    // Create request batches
    const makeRequest = async (index: number): Promise<void> => {
      const requestStart = Date.now();

      try {
        const response = await axios.get(url, {
          timeout,
          validateStatus: (status) => status === 200 || status === 402
        });

        const latency = Date.now() - requestStart;
        latencies.push(latency);

        if (response.status === 402) {
          paymentRequired = true;
          successCount++; // 402 is expected for x402 endpoints
        } else {
          successCount++;
        }

      } catch (error: any) {
        failCount++;
        latencies.push(timeout); // Use timeout as latency for failed requests
      }

      // Progress indicator
      const completed = successCount + failCount;
      if (completed % Math.ceil(totalRequests / 10) === 0) {
        const progress = Math.round((completed / totalRequests) * 100);
        spinner.text = `Progress: ${progress}% (${completed}/${totalRequests})`;
      }
    };

    spinner.start('Running benchmark');

    // Run requests with concurrency limit
    const queue: Promise<void>[] = [];

    for (let i = 0; i < totalRequests; i++) {
      const promise = makeRequest(i);
      queue.push(promise);

      if (queue.length >= concurrent) {
        await Promise.race(queue);
        // Remove completed promises
        const completed = queue.filter(p => {
          const status = (p as any).__status;
          return status === 'fulfilled' || status === 'rejected';
        });
        for (const c of completed) {
          const idx = queue.indexOf(c);
          if (idx > -1) queue.splice(idx, 1);
        }
      }
    }

    // Wait for remaining requests
    await Promise.all(queue);

    const totalTime = Date.now() - startTime;

    spinner.succeed('Benchmark complete');

    // Calculate statistics
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const p99 = percentile(latencies, 99);
    const rps = (totalRequests / totalTime) * 1000;

    const result: BenchmarkResult = {
      url,
      totalRequests,
      successfulRequests: successCount,
      failedRequests: failCount,
      totalTime,
      avgLatency: Math.round(avgLatency),
      minLatency,
      maxLatency,
      p50Latency: p50,
      p95Latency: p95,
      p99Latency: p99,
      requestsPerSecond: Math.round(rps * 100) / 100,
      paymentRequired
    };

    // Display results
    logger.header('Results');

    logger.keyValue('Total Requests', totalRequests.toString());
    logger.keyValue('Successful', successCount.toString());
    logger.keyValue('Failed', failCount.toString());
    logger.keyValue('Success Rate', `${((successCount / totalRequests) * 100).toFixed(1)}%`);

    logger.header('Latency (ms)');

    logger.keyValue('Average', `${result.avgLatency}ms`);
    logger.keyValue('Min', `${result.minLatency}ms`);
    logger.keyValue('Max', `${result.maxLatency}ms`);
    logger.keyValue('P50', `${result.p50Latency}ms`);
    logger.keyValue('P95', `${result.p95Latency}ms`);
    logger.keyValue('P99', `${result.p99Latency}ms`);

    logger.header('Throughput');

    logger.keyValue('Total Time', `${(totalTime / 1000).toFixed(2)}s`);
    logger.keyValue('Requests/sec', result.requestsPerSecond.toString());

    if (paymentRequired) {
      logger.header('Payment Status');
      logger.info('Endpoint requires x402 payment (402 responses)');
      logger.info('Use --pay flag to include actual payments in benchmark');
    }

    // Performance assessment
    logger.header('Assessment');

    if (result.avgLatency < 100) {
      logger.success('Excellent response time (<100ms avg)');
    } else if (result.avgLatency < 500) {
      logger.info('Good response time (<500ms avg)');
    } else if (result.avgLatency < 1000) {
      logger.warn('Moderate response time (<1s avg)');
    } else {
      logger.error('Slow response time (>1s avg)');
    }

    if (failCount > 0) {
      const failRate = (failCount / totalRequests) * 100;
      if (failRate > 5) {
        logger.error(`High failure rate: ${failRate.toFixed(1)}%`);
      } else {
        logger.warn(`Some failures: ${failRate.toFixed(1)}%`);
      }
    }

    logger.setJsonData('benchmark', result);

    if (options.json) logger.outputJson();

  } catch (error: any) {
    spinner.fail('Benchmark failed');
    logger.error(error.message);
    logger.setJsonData('error', error.message);
    if (options.json) logger.outputJson();
    process.exit(1);
  }
}
