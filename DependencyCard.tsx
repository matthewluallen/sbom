import React, { useState } from 'react';
import { RiskAssessment, RiskLevel, CweFinding } from '../types';
import { ShieldCheckIcon, ShieldExclamationIcon, ChevronDownIcon, DocumentTextIcon } from './icons';

interface DependencyCardProps {
  assessment: RiskAssessment;
}

const riskLevelStyles: Record<RiskLevel, { bg: string; text: string; border: string }> = {
  Low: { bg: 'bg-green-900/50', text: 'text-green-300', border: 'border-green-700' },
  Medium: { bg: 'bg-yellow-900/50', text: 'text-yellow-300', border: 'border-yellow-700' },
  High: { bg: 'bg-orange-900/50', text: 'text-orange-300', border: 'border-orange-700' },
  Critical: { bg: 'bg-red-900/50', text: 'text-red-300', border: 'border-red-700' },
};

export const RiskBadge: React.FC<{ level: RiskLevel }> = ({ level }) => {
  const styles = riskLevelStyles[level] || riskLevelStyles.Medium;
  const isHighRisk = level === 'High' || level === 'Critical';
  
  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${styles.bg} ${styles.text}`}>
      {isHighRisk ? <ShieldExclamationIcon className="h-5 w-5" /> : <ShieldCheckIcon className="h-5 w-5" />}
      <span>{level} Risk</span>
    </div>
  );
};

const DetailSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="mt-4">
        <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{title}</h4>
        <div className="text-gray-300 mt-1 whitespace-pre-wrap">{children}</div>
    </div>
);

const CweFindingView: React.FC<{ finding: CweFinding }> = ({ finding }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div className="mt-3 p-3 bg-gray-900/50 border border-gray-700 rounded-md">
            <button 
                className="w-full flex justify-between items-center text-left"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex-1">
                    <p className="font-semibold text-blue-300">{finding.cweId}: {finding.cweTitle}</p>
                    <p className="text-sm text-gray-400 mt-1">{finding.riskSummary}</p>
                </div>
                <ChevronDownIcon className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
            {isExpanded && (
                <div className="mt-3 border-t border-gray-600 pt-3">
                    <h5 className="text-xs font-bold text-gray-500 uppercase">Associated CVEs ({finding.cves.length})</h5>
                    {finding.cves.length > 0 ? (
                        <ul className="mt-2 space-y-2">
                           {finding.cves.map(cve => (
                               <li key={cve.id} className="text-sm">
                                   <p className="font-mono text-orange-400">{cve.id}</p>
                                   <p className="text-gray-300 pl-2">{cve.summary}</p>
                               </li>
                           ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-gray-400 italic mt-1">No specific CVEs listed for this weakness category post-compilation.</p>
                    )}
                </div>
            )}
        </div>
    )
}

const DependencyCard: React.FC<DependencyCardProps> = ({ assessment }) => {
  const styles = riskLevelStyles[assessment.riskLevel] || riskLevelStyles.Medium;

  return (
    <div className={`mt-2 p-4 rounded-lg border-t-2 ${styles.border} bg-gray-900/30`}>
        <DetailSection title="Maintainer Analysis">
            <p>{assessment.maintainerAnalysis}</p>
        </DetailSection>
        <DetailSection title="Code Security Analysis">
             <p>{assessment.codeSecurityAnalysis}</p>
        </DetailSection>
        <DetailSection title="License & Compliance">
            <div className="flex items-center gap-3">
                <DocumentTextIcon className="h-6 w-6 text-gray-400 flex-shrink-0" />
                <div>
                    <span className="font-mono bg-gray-700 text-teal-300 px-2 py-1 rounded-md text-sm">
                        {assessment.licenseAnalysis.spdxId}
                    </span>
                    <p className="text-sm text-gray-400 mt-2">{assessment.licenseAnalysis.complianceSummary}</p>
                </div>
            </div>
        </DetailSection>
        <DetailSection title="Vulnerability Analysis (by CWE)">
            {assessment.vulnerabilityAnalysis.length > 0 ? (
                assessment.vulnerabilityAnalysis.map(finding => <CweFindingView key={finding.cweId} finding={finding} />)
            ) : (
                <p className="text-green-400 italic mt-2">No relevant CVEs found for the specified compilation date.</p>
            )}
        </DetailSection>
    </div>
  );
};

export default DependencyCard;