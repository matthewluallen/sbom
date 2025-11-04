import React from 'react';
import { DependencyNode } from '../types';
import { ChevronDownIcon } from './icons';
import DependencyCard, { RiskBadge } from './DependencyCard';

interface DependencyNodeViewProps {
  node: DependencyNode;
  onDiscoverChildren: (node: DependencyNode) => void;
  onAnalyze: (node: DependencyNode) => void;
  onToggleExpand: (node: DependencyNode) => void;
}

const ActionButton: React.FC<{ onClick: () => void; disabled: boolean; children: React.ReactNode; className?: string; }> = 
({ onClick, disabled, children, className = 'bg-teal-600 hover:bg-teal-700 disabled:bg-teal-800' }) => (
    <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        disabled={disabled}
        className={`text-white text-xs font-bold py-1 px-3 rounded-md disabled:cursor-not-allowed transition-colors flex items-center justify-center ${className}`}
    >
        {children}
    </button>
);

const DiscoverySourceTag: React.FC<{ source: string }> = ({ source }) => {
    let colorClass = 'bg-gray-600 text-gray-200';
    if (source.includes('platformio') || source.includes('json')) {
        colorClass = 'bg-sky-800 text-sky-200';
    } else if (source.includes('include') || source.includes('header')) {
        colorClass = 'bg-amber-800 text-amber-200';
    } else if (source.includes('comment')) {
        colorClass = 'bg-fuchsia-800 text-fuchsia-200';
    }

    return (
        <span className={`ml-2 text-xs font-medium me-2 px-2.5 py-0.5 rounded ${colorClass} hidden sm:inline-block`}>
            {source}
        </span>
    );
};


const DependencyNodeView: React.FC<DependencyNodeViewProps> = ({ node, onDiscoverChildren, onAnalyze, onToggleExpand }) => {
  const hasChildren = node.dependencies.length > 0;
  const isRoot = node.level === 0;

  const handleNodeClick = () => {
      if (isRoot) return; // Don't collapse the root
      if (hasChildren || node.dependencies.length === 0) {
          onToggleExpand(node);
      }
  }

  return (
    <div style={!isRoot ? { marginLeft: `${node.level * 1.5}rem` } : {}}>
      <div 
        className={`flex items-center justify-between p-2 my-1 bg-gray-800/40 rounded-lg border border-transparent transition-all ${!isRoot && 'hover:bg-gray-700/50 hover:border-gray-600 cursor-pointer'}`}
        onClick={handleNodeClick}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {(hasChildren || node.isLoading) && (
             <ChevronDownIcon className={`h-5 w-5 text-gray-400 transition-transform duration-300 flex-shrink-0 ${node.isExpanded ? 'rotate-180' : ''}`} />
          )}
          {!hasChildren && !node.isLoading && <div className="w-5 h-5 flex-shrink-0" />}
          
          <div className="flex items-baseline flex-wrap">
            <a href={node.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="font-mono text-sm sm:text-base text-blue-400 hover:underline">
                {node.name}
            </a>
            <DiscoverySourceTag source={node.discoverySource} />
          </div>
        </div>
        
        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            {node.isLoading && (
                 <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-400"></div>
            )}
            {node.assessment && (
                <RiskBadge level={node.assessment.riskLevel} />
            )}
            {!node.isLoading && (
                <>
                    {node.dependencies.length === 0 && !isRoot && (
                        <ActionButton onClick={() => onDiscoverChildren(node)} disabled={node.isLoading}>
                            Discover
                        </ActionButton>
                    )}
                     <ActionButton onClick={() => onAnalyze(node)} disabled={node.isLoading} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800">
                        Analyze
                    </ActionButton>
                </>
            )}
        </div>
      </div>

      {node.assessment && (
        <div className="pl-4">
            <DependencyCard assessment={node.assessment} />
        </div>
      )}

      {node.isExpanded && hasChildren && (
        <div className={!isRoot ? "border-l-2 border-gray-700/50" : ""}>
          {node.dependencies.map(child => (
            <DependencyNodeView
              key={child.path}
              node={child}
              onDiscoverChildren={onDiscoverChildren}
              onAnalyze={onAnalyze}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default DependencyNodeView;
