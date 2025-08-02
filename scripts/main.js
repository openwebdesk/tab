import { IDBManager, VFS } from './vfs.js';
import App from './apps.js';

const idb = new IDBManager();
const vfs = new VFS(idb);

(async () => {
    const mem = await idb.loadMemory();
    if (!mem || !mem['/']) await firstTimeSetup();
    console.log(await vfs._getMemory());
    await runDemoApp();  // Run the demo app after setup
})();

async function firstTimeSetup() {
    console.log("First-time setup: Initializing demo app...");

    // Setup demo.js file in vfs if it doesn't exist
    await vfs.setFile({
        dir: '/apps',
        name: 'demo.js',
        content: new Blob([`
            // Worker code - inline without export
            async function run(api) {
                api.log('Hello from demo app.');
                const name = await api.input({ prompt: 'Enter your name' }); // Prompt for name
                api.log('Welcome, ' + name + '.');
                const cmd = await api.input({ prompt: 'What do you want to do?' }); // Prompt for command
                api.log('You said: ' + cmd);
            }
        `], { type: 'application/javascript' })});
}

async function runDemoApp() {
    const demoAppFile = await vfs.getFile('/apps/demo.js');
    if (!demoAppFile) {
        console.error("Demo app not found.");
        return;
    }

    // Dynamically execute the demo app code
    const scriptContent = await demoAppFile.text();
    const workerBlob = new Blob([scriptContent], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(workerBlob));

    // Handle messages from the worker (i.e., logs and inputs)
    worker.onmessage = (e) => {
        const { type, msg, result } = e.data;
        if (type === 'log') {
            log(msg);  // Display log messages in terminal
        } else if (type === 'input') {
            inputResponse(result);  // Handle input responses
        }
    };

    // Start the worker with the run method and an api to handle log and input
    worker.postMessage({
        method: 'run',
        params: {
            api: {
                log: (msg) => {
                    worker.postMessage({ type: 'log', msg });
                },
                input: (prompt) => {
                    return new Promise((resolve) => {
                        input.placeholder = prompt;
                        input.focus();
                        waitingResolve = resolve;
                    });
                }
            }
        }
    });
}

function log(msg) {
    const terminal = document.getElementById('terminal_logs');
    const div = document.createElement('div');
    div.textContent = msg;
    terminal.appendChild(div);
    terminal.scrollTop = terminal.scrollHeight;
}

function inputResponse(result) {
    const inputField = document.querySelector('.std_inp');
    inputField.value = result;  // Fill in the input field with the result
    inputField.blur();  // Blur to simulate focus loss after input
}

const app = new App();
const input = document.querySelector('.std_inp');

let waitingResolve = null;


document.querySelector('.std_inp').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && waitingResolve) {
        const val = e.target.value.trim();
        e.target.value = '';
        log('> ' + val);
        const res = waitingResolve;
        waitingResolve = null;
        res(val);
    }
});

// Register the function handler for 'run'
app.registerCallHandler('run', async (data, caller) => {
    if (!data) {
        console.error('Received null or undefined data.');
        return;
    }

    const { method, params } = data;

    if (method === 'log') {
        log(params.msg);
    } else if (method === 'input') {
        const result = await waitInput(params.prompt);
        return result;
    } else {
        console.error('Unknown method');
    }
});

// Function to create a Worker and inject the processor
function createWorkerWithInjectedCode(workerCode) {
    const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(workerBlob));

    worker.onmessage = (e) => {
        const { type, msg } = e.data;
        if (type === 'log') {
            log(msg);
        }
    };

    return worker;
}

// Worker processing function to handle received methods and params
function injectWorkerProcessor() {
    return `
        onmessage = function(e) {
            const { method, params } = e.data;
            
            if (method === 'log') {
                postMessage({ type: 'log', msg: params.msg });
            } else if (method === 'input') {
                const result = prompt(params.prompt); // Simple prompt as a placeholder for input
                postMessage({ type: 'input', result: result });
            } else {
                console.error('Unknown method in worker');
            }
        }
    `;
}

// Example function to process JSON commands
function processJsonRequest(json) {
    const request = JSON.parse(json);

    // Create a worker with injected processor code
    const worker = createWorkerWithInjectedCode(injectWorkerProcessor());

    // Send the method and params to the worker
    worker.postMessage(request);
}

// Example JSON request from app
const jsonRequest = JSON.stringify({
    method: 'log',
    params: {
        msg: 'Hello, this is a log message!'
    }
});

// Process the request
processJsonRequest(jsonRequest);