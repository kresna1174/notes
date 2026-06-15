const { spawn } = require('child_process');

console.log('\x1b[36m%s\x1b[0m', '🚀 Starting Frontend (Vite) and AI Agent (FastAPI) concurrently...');

// Start the Vite dev server for the web workspace
const web = spawn('npm', ['run', 'dev', '--workspace=apps/web'], { 
  stdio: 'inherit', 
  shell: true 
});

// Start the FastAPI dev server for the AI agent
const ai = spawn('npm', ['run', 'ai:dev'], { 
  stdio: 'inherit', 
  shell: true 
});

function cleanup() {
  console.log('\n\x1b[33m%s\x1b[0m', '👋 Stopping all dev servers...');
  
  // Send kill signals to the child processes
  try {
    web.kill('SIGINT');
  } catch (e) {}
  
  try {
    ai.kill('SIGINT');
  } catch (e) {}
  
  process.exit(0);
}

// Handle termination signals to ensure no processes are left hanging
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGHUP', cleanup);
