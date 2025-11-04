
import React, { useState, useCallback } from 'react';
import { DependencyNode, LicenseInfo } from './types';
import { discoverDependencies, analyzeDependency } from './services/geminiService';
import LoadingSpinner from './components/LoadingSpinner';
import DependencyNodeView from './components/DependencyNodeView';
import { DocumentTextIcon } from './components/icons';

const today = new Date().toISOString().split('T')[0];

// Helper to immutably update a node in the tree
const updateNodeByPath = (
  nodes: DependencyNode[], 
  path: string, 
  updater: (node: DependencyNode) => DependencyNode
): DependencyNode[] => {
  const pathParts = path.split('-').map(Number);
  const newNodes = [...nodes];
  let currentLevel = newNodes;

  for (let i = 0; i < pathParts.length - 1; i++) {
    const index = pathParts[i];
    const newNode = { ...currentLevel[index], dependencies: [...currentLevel[index].dependencies] };
    currentLevel[index] = newNode;
    currentLevel = newNode.dependencies;
  }
  
  const finalIndex = pathParts[pathParts.length - 1];
  if (currentLevel[finalIndex]) {
    currentLevel[finalIndex] = updater(currentLevel[finalIndex]);
  }
  
  return newNodes;
};

const App: React.FC = () => {
  const [repoUrl, setRepoUrl] = useState<string>('https://github.com/m5stack/M5StampLC');
  const [compilationDate, setCompilationDate] = useState<string>(today);
  const [githubToken, setGithubToken] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [dependencyTree, setDependencyTree] = useState<DependencyNode[]>([]);
  const [rootAnalysis, setRootAnalysis] = useState<{ toolchain?: string; license?: LicenseInfo } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInitialDiscover = useCallback(async () => {
    if (!repoUrl) {
      setError('Please enter a GitHub repository URL.');
      return;
    }
    if (!/(https?:\/\/)?(www\.)?github\.com\/.+\/.+/.test(repoUrl)) {
      setError('Please enter a valid GitHub repository URL.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setDependencyTree([]);
    setRootAnalysis(null);
    setStatusMessage('Initiating deep analysis...');

    try {
      const { dependencies, toolchainInfo, rootLicenseInfo } = await discoverDependencies(repoUrl, setStatusMessage, githubToken);
      
      setRootAnalysis({ toolchain: toolchainInfo, license: rootLicenseInfo });

      const topLevelNode: DependencyNode = {
        name: repoUrl.split('/').slice(-2).join('/'),
        url: repoUrl,
        path: '0',
        level: 0,
        discoverySource: 'Root Repository',
        isLoading: false,
        isExpanded: true,
        dependencies: dependencies.map((dep, index): DependencyNode => ({
          ...dep,
          path: `0-${index}`,
          level: 1,
          isLoading: false,
          isExpanded: false,
          dependencies: [],
        })),
      };
      setDependencyTree([topLevelNode]);

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      setDependencyTree([]);
    } finally {
      setIsLoading(false);
      setStatusMessage('');
    }
  }, [repoUrl, githubToken]);
  
  const handleDiscoverChildren = useCallback(async (node: DependencyNode) => {
    setDependencyTree(prev => updateNodeByPath(prev, node.path, n => ({ ...n, isLoading: true, isExpanded: true })));
    setError(null);
    try {
        const { dependencies } = await discoverDependencies(node.url, setStatusMessage, githubToken);
        const childNodes = dependencies.map((dep, index): DependencyNode => ({
            ...dep,
            path: `${node.path}-${index}`,
            level: node.level + 1,
            isLoading: false,
            isExpanded: false,
            dependencies: [],
        }));
        setDependencyTree(prev => updateNodeByPath(prev, node.path, n => ({ ...n, isLoading: false, dependencies: childNodes })));

    } catch (err) {
        console.error(err);
        setError(`Failed to discover dependencies for ${node.name}`);
        setDependencyTree(prev => updateNodeByPath(prev, node.path, n => ({ ...n, isLoading: false })));
    } finally {
        setStatusMessage('');
    }
  }, [githubToken]);
  
  const handleAnalyzeNode = useCallback(async (node: DependencyNode) => {
    setDependencyTree(prev => updateNodeByPath(prev, node.path, n => ({ ...n, isLoading: true })));
    setError(null);
    try {
        const assessment = await analyzeDependency(node.name, node.url, compilationDate, setStatusMessage);
        setDependencyTree(prev => updateNodeByPath(prev, node.path, n => ({ ...n, isLoading: false, assessment })));
    } catch (err) {
        console.error(err);
        setError(`Failed to analyze ${node.name}`);
        setDependencyTree(prev => updateNodeByPath(prev, node.path, n => ({ ...n, isLoading: false })));
    } finally {
        setStatusMessage('');
    }
  }, [compilationDate]);

  const handleToggleExpand = useCallback((node: DependencyNode) => {
    setDependencyTree(prev => updateNodeByPath(prev, node.path, n => ({ ...n, isExpanded: !n.isExpanded })));
  }, []);

  const rootNode = dependencyTree.length > 0 ? dependencyTree[0] : null;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-400">
            SBOM Risk Analyzer
          </h1>
          <p className="text-gray-400 mt-2">
            Deep source code analysis with date-aware, CWE-categorized vulnerability intelligence.
          </p>
        </header>

        <main>
          <div className="bg-gray-800/50 rounded-lg p-6 shadow-lg border border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label htmlFor="repoUrl" className="text-sm font-semibold text-gray-300 mb-2 block">Repository URL</label>
                    <input
                        id="repoUrl"
                        type="text"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        placeholder="https://github.com/owner/repo"
                        disabled={isLoading}
                        className="w-full bg-gray-900 border border-gray-600 rounded-md px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:opacity-50"
                    />
                </div>
                <div>
                    <label htmlFor="compilationDate" className="text-sm font-semibold text-gray-300 mb-2 block">Compilation Date</label>
                    <input
                        id="compilationDate"
                        type="date"
                        value={compilationDate}
                        onChange={(e) => setCompilationDate(e.target.value)}
                        disabled={isLoading}
                        className="w-full bg-gray-900 border border-gray-600 rounded-md px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:opacity-50"
                    />
                </div>
                 <div className="md:col-span-2">
                    <label htmlFor="githubToken" className="text-sm font-semibold text-gray-300 mb-2 block">GitHub Token (Optional)</label>
                    <input
                        id="githubToken"
                        type="password"
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        placeholder="ghp_..."
                        disabled={isLoading}
                        className="w-full bg-gray-900 border border-gray-600 rounded-md px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:opacity-50 font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        Recommended for large repos to avoid API rate limits. 
                        <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-1">
                            Create a token here
                        </a>.
                    </p>
                </div>
            </div>
            <div className="mt-6">
                 <button
                    onClick={handleInitialDiscover}
                    disabled={isLoading}
                    className="bg-blue-600 w-full text-white font-bold py-3 px-6 rounded-md hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-lg"
                >
                    {isLoading ? 'Analyzing...' : 'Start Analysis'}
                </button>
            </div>
          </div>
          
          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-md mt-6">
              <p className="font-bold">An Error Occurred</p>
              <p>{error}</p>
            </div>
          )}

          {(isLoading || statusMessage) && (
            <div className="mt-6 text-center">
              {isLoading && <LoadingSpinner />}
              <p className="text-blue-300 mt-4 animate-pulse">{statusMessage}</p>
            </div>
          )}

          {rootAnalysis && !isLoading && (
            <div className="mt-8 bg-gray-800/30 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-gray-200 mb-4">Initial Repository Scan</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div>
                        <h4 className="text-md font-semibold text-gray-300 uppercase tracking-wider">Toolchain & Build Environment</h4>
                        <p className="mt-2 text-gray-300 whitespace-pre-wrap">{rootAnalysis.toolchain || 'Not determined.'}</p>
                    </div>
                    {rootAnalysis.license && (
                        <div>
                            <h4 className="text-md font-semibold text-gray-300 uppercase tracking-wider">Root License</h4>
                            <div className="flex items-start gap-3 mt-2">
                                <DocumentTextIcon className="h-6 w-6 text-gray-400 flex-shrink-0 mt-1" />
                                <div>
                                    <span className="font-mono bg-gray-700 text-teal-300 px-2 py-1 rounded-md text-sm">
                                        {rootAnalysis.license.spdxId}
                                    </span>
                                    <p className="text-sm text-gray-400 mt-2">{rootAnalysis.license.complianceSummary}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
          )}

          {rootNode && !isLoading && (
            <div className="mt-4 bg-gray-800/30 rounded-lg p-4 border border-gray-700">
                <h3 className="text-lg font-semibold text-gray-200 mb-2">Dependency Tree</h3>
                <DependencyNodeView 
                    key={rootNode.path}
                    node={rootNode}
                    onDiscoverChildren={handleDiscoverChildren}
                    onAnalyze={handleAnalyzeNode}
                    onToggleExpand={handleToggleExpand}
                />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
