const { promisify } = require('util');
const { exec } = require('child_process');

const isWindows = process.platform === 'win32';
const execAsync = promisify(exec);

async function main() {
  try {
    if (isWindows) {
      await execAsync('taskkill /F /IM node.exe /T');
    } else {
      await execAsync('pkill -f api/server/index.js');
    }
    console.log('The backend process has been terminated');
  } catch (err) {
    console.warn('Failed to terminate backend process:', err.message);
  }
}

main();
