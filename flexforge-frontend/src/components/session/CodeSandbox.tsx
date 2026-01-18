import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, RotateCcw, Maximize2, Minimize2, ExternalLink, Code2, Eye, Loader2, Terminal, Package, Copy, AlertTriangle, Info, Lightbulb } from 'lucide-react';
import { clsx } from 'clsx';

// ============================================
// ENVIRONMENT BOUNDARY DETECTION
// ============================================

/**
 * Three-layer model for error classification:
 * Layer 1: LOGIC - code bugs, syntax errors
 * Layer 2: ENVIRONMENT - module not available in sandbox
 * Layer 3: REALITY - external service blocks/fails
 */
type ErrorLayer = 'logic' | 'environment' | 'reality';

interface BoundaryInfo {
  layer: ErrorLayer;
  title: string;
  description: string;
  suggestions: string[];
  showPaidOptions: boolean;
}

// Modules that aren't available in Pyodide (browser Python)
const ENVIRONMENT_BLOCKED_MODULES = [
  'requests', 'httpx', 'aiohttp', 'urllib3',
  'selenium', 'playwright', 'scrapy',
  'psycopg2', 'pymongo', 'redis', 'sqlalchemy',
  'flask', 'django', 'fastapi',
  'subprocess', 'multiprocessing', 'socket',
];

// Patterns indicating reality layer issues (external service problems)
const REALITY_ERROR_PATTERNS = [
  /403.*forbidden/i,
  /captcha/i,
  /rate.?limit/i,
  /blocked/i,
  /access.?denied/i,
  /bot.?detection/i,
  /cloudflare/i,
];

/**
 * Detect which layer an error belongs to
 */
function detectErrorBoundary(error: string, code: string): BoundaryInfo | null {
  const lowerError = error.toLowerCase();

  // Check for environment layer (module not available)
  if (lowerError.includes('no module named') || lowerError.includes('modulenotfounderror')) {
    const moduleMatch = error.match(/no module named ['"]?(\w+)['"]?/i);
    const moduleName = moduleMatch?.[1] || 'unknown';

    if (ENVIRONMENT_BLOCKED_MODULES.some(m => lowerError.includes(m))) {
      return {
        layer: 'environment',
        title: "Environment Boundary",
        description: `The '${moduleName}' module isn't available in the browser sandbox. This is an environment limitation, not a bug in your code.`,
        suggestions: [
          "Use fixture data to practice the parsing logic",
          "Run this code locally with Python installed",
          "Use a cloud IDE like Google Colab",
        ],
        showPaidOptions: true,
      };
    }
  }

  // Check for reality layer (external service issues)
  if (REALITY_ERROR_PATTERNS.some(pattern => pattern.test(error))) {
    return {
      layer: 'reality',
      title: "Real-World Boundary",
      description: "The site actively blocks automated access. This isn't a bug—it's how production systems protect themselves.",
      suggestions: [
        "Practice parsing with the provided fixture data",
        "Learn to detect and handle block responses",
        "Understand this is expected behavior, not failure",
      ],
      showPaidOptions: true,
    };
  }

  // Check if code uses blocked modules but hasn't errored yet (preemptive)
  for (const module of ENVIRONMENT_BLOCKED_MODULES) {
    if (code.includes(`import ${module}`) || code.includes(`from ${module}`)) {
      if (lowerError.includes('error')) {
        return {
          layer: 'environment',
          title: "Environment Boundary",
          description: `This code uses '${module}' which requires server-side Python, not browser sandbox.`,
          suggestions: [
            "Modify code to use fixture data instead",
            "Run locally or in cloud IDE",
          ],
          showPaidOptions: true,
        };
      }
    }
  }

  return null; // Regular error, not a boundary issue
}

/**
 * Boundary notification component
 * Educates users about the three-layer model instead of just showing errors
 */
function BoundaryNotification({
  boundary,
  onDismiss
}: {
  boundary: BoundaryInfo;
  onDismiss?: () => void;
}) {
  const layerColors = {
    logic: 'border-red-200 bg-red-50',
    environment: 'border-amber-200 bg-amber-50',
    reality: 'border-blue-200 bg-blue-50',
  };

  const layerIcons = {
    logic: AlertTriangle,
    environment: Info,
    reality: Lightbulb,
  };

  const Icon = layerIcons[boundary.layer];

  return (
    <div className={clsx(
      'rounded-lg border p-4 mb-3',
      layerColors[boundary.layer]
    )}>
      <div className="flex items-start gap-3">
        <Icon className={clsx(
          'w-5 h-5 flex-shrink-0 mt-0.5',
          boundary.layer === 'logic' ? 'text-red-600' :
          boundary.layer === 'environment' ? 'text-amber-600' : 'text-blue-600'
        )} />
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900 mb-1">{boundary.title}</h4>
          <p className="text-sm text-gray-700 mb-3">{boundary.description}</p>

          <div className="text-sm text-gray-600 mb-3">
            <p className="font-medium mb-1">What you can do:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {boundary.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>

          {boundary.showPaidOptions && (
            <div className="text-xs text-gray-500 bg-white/50 rounded p-2 border border-gray-200">
              <p className="font-medium mb-1 flex items-center gap-1">
                <Lightbulb className="w-3 h-3" />
                Going Further (Production Solutions):
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Backend proxy (Cloudflare Workers, AWS Lambda)</li>
                <li>Managed APIs (ScraperAPI, Bright Data)</li>
                <li>Headless browser services</li>
              </ul>
              <p className="mt-1 italic">This lesson focuses on the logic that works everywhere.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Sandbox execution modes (no server-side execution - all browser or external services)
type SandboxMode = 'simple' | 'stackblitz' | 'iframe_preview' | 'codesandbox' | 'python' | 'copy_only';

interface CodeSandboxProps {
  code: string;
  language: string;
  onCodeChange?: (code: string) => void;
  title?: string;
  readOnly?: boolean;
  // For complex projects with npm dependencies
  template?: 'vanilla' | 'react' | 'vue' | 'node' | 'nextjs' | 'python';
  dependencies?: Record<string, string>;
  // AI-generated setup instructions for StackBlitz
  setupInstructions?: {
    files: Array<{ path: string; description: string }>;
    steps: string[];
    runCommand?: string;
  };
}

// Complex architecture patterns that require copy-only mode
const COMPLEX_ARCHITECTURE_PATTERNS = [
  /dockerfile/i,
  /docker-compose/i,
  /FROM\s+\w+:\w+/,
  /EXPOSE\s+\d+/,
  /app\.listen\s*\(/i,
  /http\.createServer/i,
  /express\(\)/,
  /fastify\(\)/,
  /Flask\s*\(/,
  /django/i,
  /new\s+Worker\s*\(/,
  /worker_threads/,
  /cluster\.fork/,
  /redis\.createClient/i,
  /mongoose\.connect/i,
  /prisma\.\$connect/i,
  /apiVersion:\s*apps\/v1/,
  /kind:\s*Deployment/i,
];

function hasComplexArchitecture(code: string): boolean {
  return COMPLEX_ARCHITECTURE_PATTERNS.some(pattern => pattern.test(code));
}

function needsStackBlitz(code: string, language: string): boolean {
  const lang = language.toLowerCase();
  if (['node', 'react', 'vue', 'nextjs', 'next'].includes(lang)) return true;

  if (['javascript', 'typescript', 'js', 'ts'].includes(lang)) {
    const nodePatterns = [
      /require\s*\(['"][\w@/-]+['"]\)/,
      /import\s+.*from\s+['"][\w@/-]+['"]/,
      /process\.env/,
      /module\.exports/,
      /import\s+React/i,
      /from\s+['"]react['"]/,
      /from\s+['"]vue['"]/,
      /from\s+['"]express['"]/,
      /from\s+['"]next['"]/,
      /from\s+['"]next\//,
    ];
    return nodePatterns.some(pattern => pattern.test(code));
  }
  return false;
}

function needsIframePreview(code: string, language: string): boolean {
  const lang = language.toLowerCase();
  if (['html', 'css', 'html_css', 'html/css', 'web'].includes(lang)) return true;
  if (!lang) return /<(!DOCTYPE|html|head|body|div)/i.test(code);
  return false;
}

// Detect if code is Python based on content patterns
function isPythonCode(code: string): boolean {
  const pythonPatterns = [
    /^import\s+\w+/m,                    // import requests
    /^from\s+\w+\s+import/m,             // from bs4 import
    /def\s+\w+\s*\([^)]*\)\s*:/,         // def function():
    /print\s*\(/,                         // print()
    /:\s*$/m,                             // lines ending with :
    /\bTrue\b|\bFalse\b|\bNone\b/,       // Python keywords
  ];
  return pythonPatterns.some(pattern => pattern.test(code));
}

// Detect which sandbox mode to use based on language, code content, and dependencies
function detectSandboxMode(language: string, code: string, dependencies?: Record<string, string>): SandboxMode {
  const lang = language.toLowerCase();

  // Step 1: Check for complex architecture → copy_only
  if (hasComplexArchitecture(code)) {
    return 'copy_only';
  }

  // Step 2: Check for HTML/CSS → iframe_preview
  if (needsIframePreview(code, language)) {
    return 'iframe_preview';
  }

  // Step 3: Check for Node/React/Vue → stackblitz
  if (needsStackBlitz(code, language)) {
    return 'stackblitz';
  }

  // Step 4: Python → pyodide (browser)
  if (lang === 'python' || lang === 'py' || isPythonCode(code)) {
    return 'python';
  }

  // Step 5: If there are npm dependencies, use StackBlitz
  if (dependencies && Object.keys(dependencies).length > 0) {
    return 'stackblitz';
  }

  // Step 6: Languages that need external tools (local) - no server execution
  const externalOnlyLanguages = ['go', 'rust', 'java', 'c', 'cpp', 'ruby', 'php', 'kotlin', 'swift', 'csharp'];
  if (externalOnlyLanguages.includes(lang)) {
    return 'copy_only';
  }

  // Step 7: Simple JS/TS can run in browser
  return 'simple';
}

// Simple in-browser JavaScript/HTML execution
function SimpleExecutor({
  code,
  language,
  onResult,
}: {
  code: string;
  language: string;
  onResult: (output: string, isError?: boolean) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isWebLanguage = ['html', 'html/css', 'web', 'css'].includes(language.toLowerCase());

  const runJavaScript = useCallback(() => {
    try {
      const sandboxCode = `
        (function() {
          const logs = [];
          const console = {
            log: (...args) => logs.push(args.map(a =>
              typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
            ).join(' ')),
            error: (...args) => logs.push('❌ Error: ' + args.join(' ')),
            warn: (...args) => logs.push('⚠️ Warning: ' + args.join(' ')),
            info: (...args) => logs.push('ℹ️ ' + args.join(' ')),
          };
          try {
            ${code}
          } catch (e) {
            logs.push('❌ Error: ' + e.message);
          }
          return logs.join('\\n');
        })()
      `;
      const result = eval(sandboxCode);
      onResult(result || '✅ Code executed successfully (no output)');
    } catch (error: any) {
      onResult(`❌ Error: ${error.message}`, true);
    }
  }, [code, onResult]);

  const runHTML = useCallback(() => {
    if (iframeRef.current) {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;

      if (doc) {
        let htmlContent = code;
        if (!code.toLowerCase().includes('<!doctype') && !code.toLowerCase().includes('<html')) {
          htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; padding: 16px; margin: 0; }
              </style>
            </head>
            <body>
              ${code}
            </body>
            </html>
          `;
        }
        doc.open();
        doc.write(htmlContent);
        doc.close();
        onResult('');
      }
    }
  }, [code, onResult]);

  const run = useCallback(() => {
    const lang = language.toLowerCase();
    if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
      runJavaScript();
    } else if (isWebLanguage) {
      runHTML();
    } else {
      onResult(`⚠️ Language "${language}" is not supported in simple mode.`);
    }
  }, [language, isWebLanguage, runJavaScript, runHTML, onResult]);

  return { run, iframeRef, isWebLanguage };
}

// Pyodide Python executor (loads Python runtime in browser)
let pyodideInstance: any = null;
let pyodideLoading = false;
let pyodideLoadPromise: Promise<any> | null = null;

async function loadPyodide(): Promise<any> {
  if (pyodideInstance) return pyodideInstance;

  if (pyodideLoading && pyodideLoadPromise) {
    return pyodideLoadPromise;
  }

  pyodideLoading = true;

  // Load Pyodide from CDN
  pyodideLoadPromise = new Promise(async (resolve, reject) => {
    try {
      // Check if already loaded
      if ((window as any).loadPyodide) {
        pyodideInstance = await (window as any).loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
        });
        resolve(pyodideInstance);
        return;
      }

      // Load script
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
      script.async = true;

      script.onload = async () => {
        try {
          pyodideInstance = await (window as any).loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
          });
          resolve(pyodideInstance);
        } catch (err) {
          reject(err);
        }
      };

      script.onerror = () => reject(new Error('Failed to load Pyodide'));
      document.head.appendChild(script);
    } catch (err) {
      reject(err);
    }
  });

  return pyodideLoadPromise;
}

async function runPython(code: string): Promise<string> {
  // For Python, use Pyodide (browser-based) for simple code
  const pyodide = await loadPyodide();

  // Capture stdout
  let output = '';
  pyodide.setStdout({
    batched: (text: string) => {
      output += text + '\n';
    },
  });

  try {
    // Run the code
    const result = await pyodide.runPythonAsync(code);

    // If there's a return value and no stdout, show it
    if (result !== undefined && result !== null && !output.trim()) {
      output = String(result);
    }

    return output.trim() || '✅ Code executed successfully (no output)';
  } catch (error: any) {
    return `❌ Python Error: ${error.message}`;
  }
}

// CodeSandbox API integration for complex projects
const CODESANDBOX_TEMPLATES: Record<string, { files: Record<string, { content: string }> }> = {
  vanilla: {
    files: {
      'index.js': { content: '' },
      'index.html': { content: '<!DOCTYPE html>\n<html>\n<head>\n  <script src="index.js"></script>\n</head>\n<body></body>\n</html>' },
      'package.json': { content: JSON.stringify({ dependencies: {} }, null, 2) },
    },
  },
  react: {
    files: {
      'src/App.js': { content: '' },
      'src/index.js': { content: 'import React from "react";\nimport ReactDOM from "react-dom";\nimport App from "./App";\nReactDOM.render(<App />, document.getElementById("root"));' },
      'public/index.html': { content: '<!DOCTYPE html>\n<html>\n<head><title>React App</title></head>\n<body><div id="root"></div></body>\n</html>' },
      'package.json': { content: JSON.stringify({ dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' } }, null, 2) },
    },
  },
  node: {
    files: {
      'index.js': { content: '' },
      'package.json': { content: JSON.stringify({ dependencies: {} }, null, 2) },
    },
  },
};

async function createCodeSandbox(
  code: string,
  template: string = 'vanilla',
  dependencies?: Record<string, string>
): Promise<string> {
  const templateFiles = CODESANDBOX_TEMPLATES[template] || CODESANDBOX_TEMPLATES.vanilla;

  // Determine main file based on template
  const mainFile = template === 'react' ? 'src/App.js' : 'index.js';

  // Build files object
  const files: Record<string, { content: string }> = {
    ...templateFiles.files,
    [mainFile]: { content: code },
  };

  // Update package.json with dependencies
  if (dependencies) {
    const pkgJson = JSON.parse(files['package.json'].content);
    pkgJson.dependencies = { ...pkgJson.dependencies, ...dependencies };
    files['package.json'] = { content: JSON.stringify(pkgJson, null, 2) };
  }

  // Create sandbox via CodeSandbox Define API
  const response = await fetch('https://codesandbox.io/api/v1/sandboxes/define?json=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });

  if (!response.ok) {
    throw new Error('Failed to create CodeSandbox');
  }

  const data = await response.json();
  return data.sandbox_id;
}

// StackBlitz project templates
const STACKBLITZ_TEMPLATES: Record<string, { template: string; files: Record<string, string> }> = {
  node: {
    template: 'node',
    files: {
      'index.js': '',
      'package.json': JSON.stringify({ name: 'node-project', main: 'index.js', scripts: { start: 'node index.js' } }, null, 2),
    },
  },
  react: {
    template: 'create-react-app',
    files: {
      'src/App.js': '',
      'src/index.js': 'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\nconst root = createRoot(document.getElementById("root"));\nroot.render(<App />);',
      'public/index.html': '<!DOCTYPE html><html><head><title>React App</title></head><body><div id="root"></div></body></html>',
    },
  },
  nextjs: {
    template: 'nextjs',
    files: {
      'pages/index.js': '',
      'package.json': JSON.stringify({ name: 'nextjs-project', scripts: { dev: 'next dev', build: 'next build', start: 'next start' }, dependencies: { next: 'latest', react: 'latest', 'react-dom': 'latest' } }, null, 2),
    },
  },
  vue: {
    template: 'vue',
    files: {
      'src/App.vue': '',
      'src/main.js': 'import { createApp } from "vue";\nimport App from "./App.vue";\ncreateApp(App).mount("#app");',
    },
  },
  vanilla: {
    template: 'node',
    files: {
      'index.js': '',
      'package.json': JSON.stringify({ name: 'project', main: 'index.js', scripts: { start: 'node index.js' } }, null, 2),
    },
  },
};

async function createStackBlitzProject(
  code: string,
  template: string = 'node',
  dependencies?: Record<string, string>
): Promise<string> {
  const templateConfig = STACKBLITZ_TEMPLATES[template] || STACKBLITZ_TEMPLATES.node;
  const mainFile = template === 'react' ? 'src/App.js' : template === 'vue' ? 'src/App.vue' : template === 'nextjs' ? 'pages/index.js' : 'index.js';

  // Build files
  const files: Record<string, string> = {
    ...templateConfig.files,
    [mainFile]: code,
  };

  // Add dependencies to package.json
  if (dependencies) {
    const pkgJson = JSON.parse(files['package.json'] || '{}');
    pkgJson.dependencies = { ...pkgJson.dependencies, ...dependencies };
    files['package.json'] = JSON.stringify(pkgJson, null, 2);
  }

  // Use StackBlitz SDK to create project
  // Note: For actual production, you'd use @stackblitz/sdk
  // For now, we create via the URL API
  const projectData = {
    title: 'FlexForge Project',
    description: 'Created from FlexForge',
    template: templateConfig.template,
    files,
  };

  // Encode for URL
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(projectData))));

  // Return a pseudo-ID that we'll use to construct the embed URL
  // In production, you'd call the StackBlitz API
  return `data:${encoded}`;
}

// StackBlitz fork URLs per template
const STACKBLITZ_URLS: Record<string, string> = {
  react: 'https://stackblitz.com/fork/react',
  node: 'https://stackblitz.com/fork/node',
  nextjs: 'https://stackblitz.com/fork/nextjs',
  vue: 'https://stackblitz.com/fork/node',
};

// Detect template from code content (React, Next.js, Vue patterns)
function detectTemplateFromCode(code: string): 'react' | 'nextjs' | 'vue' | 'node' {
  // React patterns
  if (/import\s+React/i.test(code) || /from\s+['"]react['"]/i.test(code) || /<\w+[^>]*\/?>/.test(code) && /useState|useEffect|Component/.test(code)) {
    return 'react';
  }
  // Next.js patterns
  if (/from\s+['"]next['"]/i.test(code) || /from\s+['"]next\//.test(code) || /getServerSideProps|getStaticProps/.test(code)) {
    return 'nextjs';
  }
  // Vue patterns
  if (/from\s+['"]vue['"]/i.test(code) || /<template>/.test(code) || /defineComponent/.test(code)) {
    return 'vue';
  }
  return 'node';
}

// Open code in StackBlitz (new tab) with proper template URL
function openInStackBlitz(
  code: string,
  language: string,
  setupInstructions?: CodeSandboxProps['setupInstructions']
) {
  const lang = language.toLowerCase();

  // First check explicit language, then detect from code content
  let template: 'react' | 'nextjs' | 'vue' | 'node';
  if (lang === 'react') {
    template = 'react';
  } else if (lang === 'vue') {
    template = 'vue';
  } else if (lang === 'nextjs' || lang === 'next') {
    template = 'nextjs';
  } else {
    // Detect from code content for generic js/ts languages
    template = detectTemplateFromCode(code);
  }

  const forkUrl = STACKBLITZ_URLS[template] || STACKBLITZ_URLS.node;

  // Open the correct StackBlitz fork URL
  window.open(forkUrl, '_blank');

  // Copy code to clipboard
  navigator.clipboard.writeText(code);

  // Build guidance message from AI-generated instructions or fallback
  let guidance = 'Code copied to clipboard!\n\n';

  if (setupInstructions) {
    // Use AI-generated setup instructions
    if (setupInstructions.files.length > 0) {
      guidance += 'Files to create:\n';
      setupInstructions.files.forEach(f => {
        guidance += `  • ${f.path} - ${f.description}\n`;
      });
      guidance += '\n';
    }
    if (setupInstructions.steps.length > 0) {
      guidance += 'Setup steps:\n';
      setupInstructions.steps.forEach((step, i) => {
        guidance += `${i + 1}. ${step}\n`;
      });
    }
    if (setupInstructions.runCommand) {
      guidance += `\nRun: ${setupInstructions.runCommand}`;
    }
  } else {
    // Fallback guidance - generic instructions
    guidance += `Paste the code into the main file and run it.`;
  }

  return { template, guidance };
}

// Main CodeSandbox component
export function CodeSandbox({
  code: initialCode,
  language,
  onCodeChange,
  title = 'Live Preview',
  readOnly = false,
  template = 'vanilla',
  dependencies,
  setupInstructions,
}: CodeSandboxProps) {
  const [code, setCode] = useState(initialCode);
  const [output, setOutput] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [isExpanded, setIsExpanded] = useState(false);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [isPyodideLoading, setIsPyodideLoading] = useState(false);
  const [copied, setCopied] = useState<'code' | 'cmd' | null>(null);
  const [boundary, setBoundary] = useState<BoundaryInfo | null>(null);

  const sandboxMode = detectSandboxMode(language, code, dependencies);

  // Show cloud options for Python
  const showCloudOptions = sandboxMode === 'python';

  const copyToClipboard = async (text: string, type: 'code' | 'cmd') => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  // Open in GitHub Codespaces - for serious systems work
  const openInCodespaces = () => {
    // Create a GitHub gist-like experience via codespaces
    // Uses github.dev which opens VS Code in browser
    const encodedCode = encodeURIComponent(code);
    // Open github.dev with the code (user can create repo from there)
    window.open(`https://vscode.dev`, '_blank');
    // Copy code to clipboard so user can paste
    navigator.clipboard.writeText(code);
    alert('Code copied! Paste it in VS Code that just opened.');
  };

  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    onCodeChange?.(newCode);
    // Reset sandbox when code changes (for CodeSandbox mode)
    if (sandboxMode === 'codesandbox') {
      setSandboxId(null);
    }
  };

  const handleResult = useCallback((result: string, isError?: boolean) => {
    setOutput(result);
    setIsRunning(false);

    // Check if this is a boundary error (environment or reality layer)
    if (isError || result.includes('❌')) {
      const detectedBoundary = detectErrorBoundary(result, code);
      setBoundary(detectedBoundary);
    } else {
      setBoundary(null);
    }
  }, [code]);

  const simpleExecutor = SimpleExecutor({ code, language, onResult: handleResult });

  const runCode = async () => {
    setIsRunning(true);
    setActiveTab('preview');

    try {
      switch (sandboxMode) {
        // Copy-only: just show the copy UI, no execution
        case 'copy_only':
          setOutput('');
          setIsRunning(false);
          return;

        // iframe preview for HTML/CSS
        case 'iframe_preview':
          simpleExecutor.run();
          return;

        // StackBlitz for Node/React/Vue/Next.js
        case 'stackblitz':
          if (!sandboxId) {
            const { guidance } = openInStackBlitz(code, language, setupInstructions);
            setOutput(`Opening StackBlitz...\n\n${guidance}`);
          }
          setIsRunning(false);
          return;

        // Simple JS/TS in browser
        case 'simple':
          simpleExecutor.run();
          return;

        // Python: use Pyodide (browser-based)
        case 'python':
          setIsPyodideLoading(true);
          const pythonResult = await runPython(code);
          setOutput(pythonResult);
          setIsPyodideLoading(false);
          break;

        // CodeSandbox for complex npm projects
        case 'codesandbox':
          if (!sandboxId) {
            const id = await createCodeSandbox(code, template, dependencies);
            setSandboxId(id);
          }
          setOutput('');
          break;
      }
    } catch (error: any) {
      setOutput(`❌ Error: ${error.message}`);
    }

    setIsRunning(false);
  };

  const resetCode = () => {
    setCode(initialCode);
    setOutput('');
    setSandboxId(null);
    setBoundary(null);
    onCodeChange?.(initialCode);
  };

  const openInCodeSandbox = () => {
    if (sandboxId) {
      window.open(`https://codesandbox.io/s/${sandboxId}`, '_blank');
    }
  };

  const isWebLanguage = ['html', 'html/css', 'web', 'css'].includes(language.toLowerCase());

  // Render preview content based on mode
  const renderPreview = () => {
    if (isRunning || isPyodideLoading) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 text-gray-100">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-3" />
          <p className="text-sm text-gray-400">
            {isPyodideLoading ? 'Loading Python runtime...' : 'Running...'}
          </p>
        </div>
      );
    }

    // Copy-only mode: show instructions
    if (sandboxMode === 'copy_only') {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Local Environment Required</h3>
          <p className="text-sm text-gray-600 mb-4 max-w-md">
            This code requires Docker, servers, or multi-service architecture that can't run in the browser.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => copyToClipboard(code, 'code')}
              className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
            >
              <Copy className="w-4 h-4" />
              {copied === 'code' ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Run this code locally with Docker, VS Code, or your preferred IDE
          </p>
        </div>
      );
    }

    // StackBlitz embed
    if (sandboxMode === 'stackblitz' && sandboxId) {
      return (
        <iframe
          src={`https://stackblitz.com/edit/${sandboxId}?embed=1&file=index.js&theme=dark`}
          className="w-full h-full"
          title="StackBlitz Preview"
          allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
          sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
        />
      );
    }

    // CodeSandbox embed
    if (sandboxMode === 'codesandbox' && sandboxId) {
      return (
        <iframe
          src={`https://codesandbox.io/embed/${sandboxId}?fontsize=14&hidenavigation=1&theme=dark&view=preview`}
          className="w-full h-full"
          title="CodeSandbox Preview"
          allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
          sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
        />
      );
    }

    // HTML iframe preview
    if (sandboxMode === 'iframe_preview' || (sandboxMode === 'simple' && isWebLanguage)) {
      return (
        <iframe
          ref={simpleExecutor.iframeRef}
          className="w-full h-full bg-white"
          title="Code Preview"
          sandbox="allow-scripts"
        />
      );
    }

    // Console output for Judge0 and other modes
    return (
      <div className="w-full h-full p-4 bg-gray-900 text-gray-100 font-mono text-sm overflow-auto">
        {/* Show boundary notification if detected */}
        {boundary && (
          <div className="mb-3">
            <BoundaryNotification
              boundary={boundary}
              onDismiss={() => setBoundary(null)}
            />
          </div>
        )}
        <pre className="whitespace-pre-wrap">
          {output || 'Click "Run" to see output...'}
        </pre>
      </div>
    );
  };

  // Get mode badge info
  const getModeInfo = () => {
    switch (sandboxMode) {
      case 'stackblitz':
        return { label: 'StackBlitz', icon: Package, color: 'bg-blue-100 text-blue-700' };
      case 'iframe_preview':
        return { label: 'Preview', icon: Eye, color: 'bg-green-100 text-green-700' };
      case 'python':
        return { label: 'Python', icon: Terminal, color: 'bg-yellow-100 text-yellow-700' };
      case 'codesandbox':
        return { label: 'CodeSandbox', icon: Package, color: 'bg-blue-100 text-blue-700' };
      case 'copy_only':
        return { label: 'Local Only', icon: Copy, color: 'bg-amber-100 text-amber-700' };
      default:
        return { label: language.toUpperCase(), icon: Code2, color: 'bg-gray-200 text-gray-600' };
    }
  };

  const modeInfo = getModeInfo();

  return (
    <motion.div
      layout
      className={clsx(
        'rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm',
        isExpanded && 'fixed inset-4 z-50'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">{title}</span>
          <span className={clsx('flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', modeInfo.color)}>
            <modeInfo.icon className="w-3 h-3" />
            {modeInfo.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {sandboxMode === 'codesandbox' && sandboxId && (
            <button
              onClick={openInCodeSandbox}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
              title="Open in CodeSandbox"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={resetCode}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
            title="Reset code"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
            title={isExpanded ? 'Minimize' : 'Expand'}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('code')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'code'
              ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          )}
        >
          <Code2 className="w-4 h-4" />
          Code
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'preview'
              ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          )}
        >
          <Eye className="w-4 h-4" />
          Preview
        </button>
      </div>

      {/* Content */}
      <div className={clsx('relative', isExpanded ? 'h-[calc(100%-88px)]' : 'h-80')}>
        {activeTab === 'code' ? (
          <textarea
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            readOnly={readOnly}
            className={clsx(
              'w-full h-full p-4 font-mono text-sm resize-none',
              'bg-gray-900 text-gray-100',
              'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-inset',
              readOnly && 'cursor-not-allowed opacity-75'
            )}
            spellCheck={false}
            placeholder="// Write your code here..."
          />
        ) : (
          <div className="h-full">
            {renderPreview()}
          </div>
        )}
      </div>

      {/* Run Button + Cloud Options */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 space-y-2">
        {/* Copy-only mode: just show copy button */}
        {sandboxMode === 'copy_only' ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="text-sm text-amber-800">
                This code requires Docker/servers. Copy and run locally.
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => copyToClipboard(code, 'code')}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors font-medium"
              >
                <Copy className="w-4 h-4" />
                {copied === 'code' ? 'Copied!' : 'Copy Code'}
              </button>
              <button
                onClick={openInCodespaces}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-gray-700"
              >
                <Code2 className="w-4 h-4" />
                Open VS Code
              </button>
            </div>
          </div>
        ) : sandboxMode === 'stackblitz' ? (
          /* StackBlitz mode: Run in browser or open in new tab */
          <div className="space-y-2">
            <button
              onClick={runCode}
              disabled={isRunning || !code.trim()}
              className={clsx(
                'flex items-center justify-center gap-2 w-full py-2.5 rounded-lg font-medium text-sm transition-all',
                'bg-gradient-to-r from-blue-500 to-indigo-600 text-white',
                'hover:from-blue-600 hover:to-indigo-700',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'shadow-sm hover:shadow-md'
              )}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Opening StackBlitz...
                </>
              ) : (
                <>
                  <Package className="w-4 h-4" />
                  Run in StackBlitz
                </>
              )}
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => copyToClipboard(code, 'code')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
              >
                {copied === 'code' ? '✓ Copied' : 'Copy Code'}
              </button>
            </div>
          </div>
        ) : (
          /* Default: Run in browser */
          <>
            <button
              onClick={runCode}
              disabled={isRunning || !code.trim()}
              className={clsx(
                'flex items-center justify-center gap-2 w-full py-2.5 rounded-lg font-medium text-sm transition-all',
                'bg-gradient-to-r from-green-500 to-emerald-600 text-white',
                'hover:from-green-600 hover:to-emerald-700',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'shadow-sm hover:shadow-md'
              )}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {sandboxMode === 'codesandbox' ? 'Creating Sandbox...' : 'Running...'}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run Code
                </>
              )}
            </button>

            {/* Cloud options for Python/complex code */}
            {showCloudOptions && (
              <div className="flex gap-2">
                <button
                  onClick={openInCodespaces}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-purple-600 hover:bg-purple-50 rounded-lg transition-colors border border-purple-200"
                  title="Opens VS Code"
                >
                  <Code2 className="w-3 h-3" />
                  VS Code
                </button>
                <button
                  onClick={() => copyToClipboard(code, 'code')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                >
                  {copied === 'code' ? '✓' : '📋'} Copy
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Expanded backdrop */}
      {isExpanded && (
        <div
          className="fixed inset-0 bg-black/50 -z-10"
          onClick={() => setIsExpanded(false)}
        />
      )}

    </motion.div>
  );
}

// For embedding existing external sandboxes
export function ExternalSandbox({
  sandboxId,
  provider = 'codesandbox',
  height = 500
}: {
  sandboxId: string;
  provider?: 'codesandbox' | 'stackblitz';
  height?: number;
}) {
  const src = provider === 'codesandbox'
    ? `https://codesandbox.io/embed/${sandboxId}?fontsize=14&hidenavigation=1&theme=dark`
    : `https://stackblitz.com/edit/${sandboxId}?embed=1&file=index.js`;

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      <iframe
        src={src}
        style={{ width: '100%', height: `${height}px`, border: 0 }}
        title="Code Sandbox"
        allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
        sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
      />
    </div>
  );
}
