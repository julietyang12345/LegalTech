import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, RotateCcw, Maximize2, Minimize2, ExternalLink, Code2, Eye, Loader2, Terminal, Package } from 'lucide-react';
import { clsx } from 'clsx';

// Sandbox execution modes
type SandboxMode = 'simple' | 'codesandbox' | 'python';

interface CodeSandboxProps {
  code: string;
  language: string;
  onCodeChange?: (code: string) => void;
  title?: string;
  readOnly?: boolean;
  // For complex projects with npm dependencies
  template?: 'vanilla' | 'react' | 'vue' | 'node' | 'python';
  dependencies?: Record<string, string>;
}

// Detect which sandbox mode to use based on language and dependencies
function detectSandboxMode(language: string, dependencies?: Record<string, string>): SandboxMode {
  const lang = language.toLowerCase();

  // Python always uses Pyodide
  if (lang === 'python' || lang === 'py') {
    return 'python';
  }

  // If there are npm dependencies, use CodeSandbox
  if (dependencies && Object.keys(dependencies).length > 0) {
    return 'codesandbox';
  }

  // React/Vue/Node templates need CodeSandbox
  if (['react', 'vue', 'node', 'nodejs'].includes(lang)) {
    return 'codesandbox';
  }

  // Simple JS/HTML/CSS can run in browser
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

// Main CodeSandbox component
export function CodeSandbox({
  code: initialCode,
  language,
  onCodeChange,
  title = 'Live Preview',
  readOnly = false,
  template = 'vanilla',
  dependencies,
}: CodeSandboxProps) {
  const [code, setCode] = useState(initialCode);
  const [output, setOutput] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [isExpanded, setIsExpanded] = useState(false);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [isPyodideLoading, setIsPyodideLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sandboxMode = detectSandboxMode(language, dependencies);

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
  }, []);

  const simpleExecutor = SimpleExecutor({ code, language, onResult: handleResult });

  const runCode = async () => {
    setIsRunning(true);
    setActiveTab('preview');

    try {
      switch (sandboxMode) {
        case 'python':
          setIsPyodideLoading(true);
          const pythonResult = await runPython(code);
          setOutput(pythonResult);
          setIsPyodideLoading(false);
          break;

        case 'codesandbox':
          if (!sandboxId) {
            const id = await createCodeSandbox(code, template, dependencies);
            setSandboxId(id);
          }
          setOutput(''); // Sandbox shows its own output
          break;

        case 'simple':
        default:
          simpleExecutor.run();
          return; // run() handles setIsRunning
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
    if (sandboxMode === 'simple' && isWebLanguage) {
      return (
        <iframe
          ref={iframeRef}
          className="w-full h-full bg-white"
          title="Code Preview"
          sandbox="allow-scripts"
        />
      );
    }

    // Console output
    return (
      <div className="w-full h-full p-4 bg-gray-900 text-gray-100 font-mono text-sm overflow-auto whitespace-pre-wrap">
        {output || 'Click "Run" to see output...'}
      </div>
    );
  };

  // Get mode badge info
  const getModeInfo = () => {
    switch (sandboxMode) {
      case 'python':
        return { label: 'Pyodide', icon: Terminal, color: 'bg-yellow-100 text-yellow-700' };
      case 'codesandbox':
        return { label: 'CodeSandbox', icon: Package, color: 'bg-blue-100 text-blue-700' };
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

      {/* Run Button */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
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
