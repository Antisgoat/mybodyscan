#!/usr/bin/env node

/**
 * Sanity Check Tool
 * 
 * Probes Sanity endpoints for health and availability.
 * Usage: node tools/sanity-check.mjs [baseUrl]
 * 
 * Environment variables:
 * - SANITY_BASE_URL: Base URL for Sanity instance (required)
 * - SANITY_TOKEN: Optional token for authenticated requests
 */

import { URL } from 'url';

const DEFAULT_TIMEOUT = 10000; // 10 seconds
const REQUIRED_ENDPOINTS = ['/system/health', '/'];
const OPTIONAL_ENDPOINTS = ['/demo'];

class SanityChecker {
  constructor(baseUrl, token = null) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.token = token;
    this.results = {
      baseUrl: this.baseUrl,
      timestamp: new Date().toISOString(),
      checks: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        optional: 0
      }
    };
  }

  async checkEndpoint(path, required = true) {
    const url = `${this.baseUrl}${path}`;
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
      
      const headers = {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      const result = {
        path,
        url,
        status: response.status,
        statusText: response.statusText,
        duration,
        success: response.ok,
        required,
        headers: Object.fromEntries(response.headers.entries())
      };
      
      // Try to get response body for additional context
      try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          result.body = await response.json();
        } else if (contentType.includes('text/')) {
          result.body = await response.text();
        }
      } catch (e) {
        // Ignore body parsing errors
      }
      
      this.results.checks.push(result);
      this.results.summary.total++;
      
      if (result.success) {
        this.results.summary.passed++;
        if (!required) {
          this.results.summary.optional++;
        }
      } else {
        this.results.summary.failed++;
      }
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const result = {
        path,
        url,
        error: error.message,
        duration,
        success: false,
        required,
        status: error.name === 'AbortError' ? 'TIMEOUT' : 'ERROR'
      };
      
      this.results.checks.push(result);
      this.results.summary.total++;
      this.results.summary.failed++;
      
      return result;
    }
  }

  async runChecks() {
    console.log(`🔍 Sanity Check starting for: ${this.baseUrl}`);
    console.log(`⏰ Timestamp: ${this.results.timestamp}\n`);

    // Check required endpoints
    for (const endpoint of REQUIRED_ENDPOINTS) {
      console.log(`📋 Checking required endpoint: ${endpoint}`);
      const result = await this.checkEndpoint(endpoint, true);
      this.logResult(result);
    }

    // Check optional endpoints
    for (const endpoint of OPTIONAL_ENDPOINTS) {
      console.log(`🔍 Checking optional endpoint: ${endpoint}`);
      const result = await this.checkEndpoint(endpoint, false);
      this.logResult(result);
    }

    this.logSummary();
    return this.results;
  }

  logResult(result) {
    const status = result.success ? '✅' : '❌';
    const type = result.required ? 'REQUIRED' : 'OPTIONAL';
    const duration = `${result.duration}ms`;
    
    if (result.success) {
      console.log(`  ${status} ${type} ${result.path} - ${result.status} ${result.statusText} (${duration})`);
    } else {
      const error = result.error || `${result.status} ${result.statusText}`;
      console.log(`  ${status} ${type} ${result.path} - FAILED: ${error} (${duration})`);
    }
  }

  logSummary() {
    const { total, passed, failed, optional } = this.results.summary;
    const successRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    
    console.log('\n📊 Summary:');
    console.log(`  Total checks: ${total}`);
    console.log(`  Passed: ${passed} (${successRate}%)`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Optional: ${optional}`);
    
    if (failed === 0) {
      console.log('\n🎉 All checks passed! Sanity instance is healthy.');
    } else {
      console.log('\n⚠️  Some checks failed. Please review the results above.');
    }
  }

  getExitCode() {
    // Exit with error code if any required checks failed
    const requiredFailures = this.results.checks.filter(
      check => check.required && !check.success
    );
    return requiredFailures.length > 0 ? 1 : 0;
  }

  getGitHubComment() {
    const { total, passed, failed, optional } = this.results.summary;
    const successRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    
    let comment = `## 🔍 Sanity Check Results\n\n`;
    comment += `**Base URL:** \`${this.baseUrl}\`\n`;
    comment += `**Timestamp:** ${this.results.timestamp}\n\n`;
    
    comment += `### 📊 Summary\n`;
    comment += `- **Total checks:** ${total}\n`;
    comment += `- **Passed:** ${passed} (${successRate}%)\n`;
    comment += `- **Failed:** ${failed}\n`;
    comment += `- **Optional:** ${optional}\n\n`;
    
    comment += `### 📋 Detailed Results\n\n`;
    
    for (const check of this.results.checks) {
      const status = check.success ? '✅' : '❌';
      const type = check.required ? '**REQUIRED**' : '*optional*';
      const duration = `${check.duration}ms`;
      
      if (check.success) {
        comment += `${status} **${check.path}** (${type}) - \`${check.status} ${check.statusText}\` (${duration})\n`;
      } else {
        const error = check.error || `${check.status} ${check.statusText}`;
        comment += `${status} **${check.path}** (${type}) - ❌ **FAILED:** \`${error}\` (${duration})\n`;
      }
    }
    
    if (failed === 0) {
      comment += `\n🎉 **All checks passed!** Sanity instance is healthy.`;
    } else {
      comment += `\n⚠️ **Some checks failed.** Please review the results above.`;
    }
    
    return comment;
  }
}

async function main() {
  // Get base URL from command line argument or environment variable
  const baseUrl = process.argv[2] || process.env.SANITY_BASE_URL;
  const token = process.env.SANITY_TOKEN;
  
  if (!baseUrl) {
    console.error('❌ Error: Base URL is required');
    console.error('Usage: node tools/sanity-check.mjs <baseUrl>');
    console.error('Or set SANITY_BASE_URL environment variable');
    process.exit(1);
  }
  
  // Validate URL
  try {
    new URL(baseUrl);
  } catch (error) {
    console.error(`❌ Error: Invalid URL format: ${baseUrl}`);
    process.exit(1);
  }
  
  const checker = new SanityChecker(baseUrl, token);
  const results = await checker.runChecks();
  
  // Store results for GitHub Actions
  if (process.env.GITHUB_ACTIONS) {
    const fs = await import('fs');
    const path = await import('path');
    
    const outputDir = process.env.GITHUB_OUTPUT || '.';
    const resultsFile = path.join(outputDir, 'sanity-results.json');
    
    await fs.promises.writeFile(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\n📄 Results saved to: ${resultsFile}`);
  }
  
  process.exit(checker.getExitCode());
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});