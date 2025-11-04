export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

// Represents a CVE finding
export interface CveInfo {
  id: string;
  summary: string;
}

// Groups CVE findings under a common weakness (CWE)
export interface CweFinding {
  cweId: string;
  cweTitle: string;
  riskSummary: string;
  cves: CveInfo[];
}

// Represents license information
export interface LicenseInfo {
  spdxId: string; // e.g., "Apache-2.0", "MIT", "Unknown"
  complianceSummary: string; // AI-generated summary of risks/obligations
}

// Detailed risk assessment for a single library
export interface RiskAssessment {
  maintainerAnalysis: string;
  codeSecurityAnalysis: string;
  licenseAnalysis: LicenseInfo;
  vulnerabilityAnalysis: CweFinding[]; // Structured analysis grouping CVEs by CWE
  riskLevel: RiskLevel;
  riskSummary: string;
}

// Represents a dependency in the recursive tree structure
export interface DependencyNode {
  name: string;
  url: string;
  discoverySource: string; // How this dependency was found (e.g., "platformio.ini")
  path: string; // A unique identifier for the node's position in the tree, e.g., "0-1-2"
  level: number;
  isLoading: boolean;
  isExpanded: boolean;
  dependencies: DependencyNode[];
  assessment?: RiskAssessment;
}

// A simple type for the direct output of dependency discovery
export interface DiscoveredDependency {
  name: string;
  url: string;
  discoverySource: string;
}

// Type for the initial discovery result, including toolchain and root license info
export interface InitialDiscoveryResult {
    dependencies: DiscoveredDependency[];
    toolchainInfo: string;
    rootLicenseInfo?: LicenseInfo;
}