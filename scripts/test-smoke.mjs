#!/usr/bin/env node

/**
 * Simple smoke test script that verifies basic functionality
 * This can run without Playwright dependencies
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🧪 Running smoke tests...\n');

// Test 1: Build application
console.log('1️⃣ Testing application build...');
const buildResult = await runCommand('npm run build', projectRoot);
if (buildResult.success) {
  console.log('✅ Application build successful');
} else {
  console.log('❌ Application build failed');
  process.exit(1);
}

// Test 2: Build functions
console.log('\n2️⃣ Testing functions build...');
const functionsBuildResult = await runCommand('npm --prefix functions run build', projectRoot);
if (functionsBuildResult.success) {
  console.log('✅ Functions build successful');
} else {
  console.log('❌ Functions build failed');
  process.exit(1);
}

// Test 3: Type check
console.log('\n3️⃣ Testing type check...');
const typeCheckResult = await runCommand('npm run typecheck', projectRoot);
if (typeCheckResult.success) {
  console.log('✅ Type check successful');
} else {
  console.log('❌ Type check failed');
  process.exit(1);
}

// Test 4: Unit tests
console.log('\n4️⃣ Testing unit tests...');
const unitTestResult = await runCommand('npm run test', projectRoot);
if (unitTestResult.success) {
  console.log('✅ Unit tests successful');
} else {
  console.log('❌ Unit tests failed');
  process.exit(1);
}

console.log('\n🎉 All smoke tests passed!');

function runCommand(command, cwd) {
  return new Promise((resolve) => {
    const [cmd, ...args] = command.split(' ');
    const child = spawn(cmd, args, { 
      cwd, 
      stdio: 'pipe',
      shell: true 
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
        code
      });
    });
  });
}