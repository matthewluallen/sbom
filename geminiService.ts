
import { GoogleGenAI, Type } from "@google/genai";
import { InitialDiscoveryResult, RiskAssessment, LicenseInfo, DiscoveredDependency } from '../types';
import { getRepoFileTree, getFileContent } from './githubService';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.warn("API_KEY environment variable not set. App will not function correctly.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY || 'MISSING_API_KEY' });
const analysisModel = 'gemini-2.5-pro';
const discoveryModel = 'gemini-2.5-flash';

const cveFindingSchema = {
    type: Type.OBJECT,
    properties: {
        id: { type: Type.STRING, description: "The full CVE identifier (e.g., 'CVE-2025-5688')." },
        summary: { type: Type.STRING, description: "A brief summary of the CVE." },
    },
    required: ["id", "summary"],
};

const cweFindingSchema = {
    type: Type.OBJECT,
    properties: {
        cweId: { type: Type.STRING, description: "The Common Weakness Enumeration ID (e.g., 'CWE-787')." },
        cweTitle: { type: Type.STRING, description: "The official title of the CWE." },
        riskSummary: { type: Type.STRING, description: "A summary of the risk this weakness category poses to the library." },
        cves: { type: Type.ARRAY, items: cveFindingSchema, description: "An array of CVEs that fall under this CWE category." },
    },
    required: ["cweId", "cweTitle", "riskSummary", "cves"],
};

const licenseInfoSchema = {
    type: Type.OBJECT,
    properties: {
        spdxId: { type: Type.STRING, description: "The SPDX identifier for the license (e.g., 'Apache-2.0', 'MIT', 'GPL-3.0', 'Proprietary', 'Unknown')." },
        complianceSummary: { type: Type.STRING, description: "A summary of the license's compliance requirements and potential risks (e.g., copyleft obligations, patent clauses)." },
    },
    required: ["spdxId", "complianceSummary"],
};

const riskAssessmentSchema = {
  type: Type.OBJECT,
  properties: {
    maintainerAnalysis: { type: Type.STRING, description: "Analysis of the library's maintainers (individual, organization, reputation)." },
    codeSecurityAnalysis: { type: Type.STRING, description: "Analysis of the code for security risks like unsafe functions, injection flaws, etc." },
    licenseAnalysis: licenseInfoSchema,
    vulnerabilityAnalysis: { type: Type.ARRAY, items: cweFindingSchema, description: "A structured analysis of known CVEs, grouped by their CWE category, especially those published after the provided compilation date." },
    riskLevel: { type: Type.STRING, enum: ["Low", "Medium", "High", "Critical"], description: "Overall risk level assessment." },
    riskSummary: { type: Type.STRING, description: "A single sentence summarizing the risk." },
  },
  required: ["maintainerAnalysis", "codeSecurityAnalysis", "licenseAnalysis", "vulnerabilityAnalysis", "riskLevel", "riskSummary"]
};

const parseGeminiJson = <T,>(text: string, context: string): T | null => {
    try {
        const cleanedText = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        return JSON.parse(cleanedText) as T;
    } catch (e) {
        console.error(`Failed to parse JSON for ${context}:`, text, e);
        return null;
    }
};

const extractedDependenciesSchema = {
    type: Type.OBJECT,
    properties: {
        dependencies: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    url: { type: Type.STRING },
                },
                required: ["name", "url"]
            }
        }
    },
    required: ["dependencies"]
};

// New function to analyze a batch of source code content
const analyzeSourceCodeBatch = async (
    fileContents: { path: string; content: string }[],
    existingDeps: string[]
): Promise<DiscoveredDependency[]> => {
    
    if (fileContents.length === 0) return [];

    const sourceScanPrompt = `
        You are a C/C++ expert analyzing source code for dependencies.
        Based on the FULL TEXT of the following source files, identify external libraries from their #include directives.

        - IGNORE standard libraries (e.g., <string>, <vector>, <stdio.h>).
        - IGNORE core framework includes like "Arduino.h", "esp_system.h", etc.
        - IGNORE includes that are local to the project (e.g., #include "my_local_header.h").
        - FOCUS on identifying distinct third-party libraries by name.
        - The list of already found dependencies is: ${existingDeps.join(', ')}. Do not report these again.

        File Contents:
        ${fileContents.map(f => `--- START FILE: ${f.path} ---\n${f.content.substring(0, 5000)}\n--- END FILE: ${f.path} ---`).join('\n\n')}
        
        Return a single JSON object containing a 'dependencies' array. For each dependency, provide its 'name' and a probable source 'url'. If you can't find a URL, use a placeholder.
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: discoveryModel,
            contents: sourceScanPrompt,
            config: { responseMimeType: "application/json", responseSchema: extractedDependenciesSchema }
        });
        const result = parseGeminiJson<{ dependencies: {name:string, url:string}[] }>(response.text, 'source code batch scan');
        return result?.dependencies.map(d => ({...d, discoverySource: 'Source Code Scan'})) || [];
    } catch (e) {
        console.error("Error analyzing source code batch:", e);
        return []; // Return empty on error to not halt the entire process
    }
};


export const discoverDependencies = async (
    repoUrl: string,
    updateStatus: (message: string) => void,
    githubToken?: string,
): Promise<InitialDiscoveryResult> => {
    const repoNameMatch = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
    const repoName = repoNameMatch ? repoNameMatch[1] : repoUrl;
    
    const allDependencies = new Map<string, DiscoveredDependency>();
    let toolchainInfo = "Not determined.";
    let rootLicenseInfo: LicenseInfo | undefined = undefined;

    const addDependencies = (deps: DiscoveredDependency[]) => {
        deps.forEach(dep => {
            const key = dep.name.toLowerCase();
            if (!allDependencies.has(key) && dep.name) {
                allDependencies.set(key, dep);
            }
        });
    };

    try {
        // Step 1: Get file list from GitHub
        updateStatus(`Phase 1/4: Mapping file structure for ${repoName}...`);
        const fileTree = await getRepoFileTree(repoUrl, githubToken);
        const sourceFilePaths = fileTree
            .filter(f => /\.(h|hpp|c|cpp|ino)$/i.test(f.path))
            .map(f => f.path);
        const manifestPaths = fileTree
            .filter(f => /(platformio\.ini|library\.json|makefile|cmakelists\.txt)/i.test(f.path))
            .map(f => f.path);
        const licenseFile = fileTree.find(f => /^license/i.test(f.path));

        // Step 2: Analyze build manifests
        if (manifestPaths.length > 0) {
            updateStatus(`Phase 2/4: Analyzing ${manifestPaths.length} build manifest(s)...`);
            const manifestContents = await Promise.all(
                manifestPaths.map(async (path) => ({
                    path,
                    content: await getFileContent(repoUrl, path, githubToken)
                }))
            );
            
            const manifestPrompt = `
                You are a build system expert. Based on the following manifest file(s), identify:
                1. The toolchain and framework (e.g., "PlatformIO with Arduino framework for ESP32").
                2. All external library dependencies, providing their common name and a source URL.
                
                File Contents:
                ${manifestContents.map(m => `--- ${m.path} ---\n${m.content}`).join('\n\n')}

                Return a single JSON object with 'toolchainInfo' (a string) and 'dependencies' (an array of objects with 'name' and 'url').
            `;

            const manifestSchema = {
                type: Type.OBJECT,
                properties: {
                    toolchainInfo: { type: Type.STRING },
                    dependencies: { type: Type.ARRAY, items: {
                        type: Type.OBJECT,
                        properties: { name: { type: Type.STRING }, url: { type: Type.STRING } },
                        required: ["name", "url"]
                    }}
                },
                required: ["toolchainInfo", "dependencies"]
            };

            const response = await ai.models.generateContent({
                model: discoveryModel,
                contents: manifestPrompt,
                config: { responseMimeType: "application/json", responseSchema: manifestSchema }
            });
            const result = parseGeminiJson<{ toolchainInfo: string; dependencies: {name:string, url:string}[] }>(response.text, 'manifest analysis');

            if (result) {
                toolchainInfo = result.toolchainInfo;
                addDependencies(result.dependencies.map(d => ({ ...d, discoverySource: 'Build Manifest'})));
            }
        }

        // Step 3: Forensic scan of all source code content
        if (sourceFilePaths.length > 0) {
             const BATCH_SIZE = 15; // Number of files per batch
             for (let i = 0; i < sourceFilePaths.length; i += BATCH_SIZE) {
                const batchPaths = sourceFilePaths.slice(i, i + BATCH_SIZE);
                updateStatus(`Phase 3/4: Deep scanning source files (${i + 1}-${Math.min(i + BATCH_SIZE, sourceFilePaths.length)} of ${sourceFilePaths.length})...`);
                
                const batchContents = await Promise.all(
                    batchPaths.map(async (path) => ({
                        path,
                        content: await getFileContent(repoUrl, path, githubToken)
                    }))
                );
                
                const foundDeps = await analyzeSourceCodeBatch(batchContents, [...allDependencies.keys()]);
                addDependencies(foundDeps);
             }
        }

        // Step 4: Analyze root license file
        if (licenseFile) {
            updateStatus("Phase 4/4: Analyzing root license file...");
            const licenseContent = await getFileContent(repoUrl, licenseFile.path, githubToken);
            const licensePrompt = `
                Analyze the following license text and identify its SPDX identifier and summarize its compliance risks.
                
                License Text:
                ${licenseContent.substring(0, 5000)}

                Return a single JSON object matching the schema.
            `;
            const response = await ai.models.generateContent({
                model: discoveryModel,
                contents: licensePrompt,
                config: { responseMimeType: "application/json", responseSchema: licenseInfoSchema }
            });
            rootLicenseInfo = parseGeminiJson<LicenseInfo>(response.text, 'root license analysis') || undefined;
        }

        updateStatus("Finalizing dependency list...");

        return {
            dependencies: Array.from(allDependencies.values()),
            toolchainInfo,
            rootLicenseInfo,
        };

    } catch (err) {
        console.error("Error during dependency discovery:", err);
        if (err instanceof Error) {
            // Re-throw the specific, user-friendly error from the githubService
            throw err;
        }
        throw new Error("An unknown error occurred during dependency discovery.");
    }
};

export const analyzeDependency = async (
    dependencyName: string,
    dependencyUrl: string,
    compilationDate: string,
    updateStatus: (message: string) => void
): Promise<RiskAssessment> => {
    updateStatus(`Analyzing vulnerabilities for ${dependencyName}...`);

    const assessmentPrompt = `
      You are an expert cybersecurity and compliance analyst reviewing the software library "${dependencyName}" from: ${dependencyUrl}.
      The product using this was compiled around: ${compilationDate}.

      Perform a detailed risk assessment.
      1.  **Maintainer Analysis:** Analyze the maintainers and their reputation.
      2.  **Code Security Analysis:** Briefly analyze the code for inherent security risks.
      3.  **License Analysis:** Scan source files (especially headers) and license files (LICENSE, COPYING) to identify the software license. Provide the SPDX identifier and summarize compliance risks (e.g., copyleft obligations, patent clauses).
      4.  **Vulnerability Analysis (CWE Mapping):**
          *   Find all relevant CVEs for "${dependencyName}" disclosed *after* ${compilationDate}.
          *   For each CVE, identify its corresponding CWE ID from MITRE (e.g., CWE-120).
          *   Group all found CVEs under their parent CWE. If a CVE fits multiple CWEs, pick the most specific one.
          *   Provide a risk summary for each CWE category found.
          *   If no relevant CVEs are found, return an empty array for 'vulnerabilityAnalysis'.
      5.  **Overall Risk:** Provide a risk level ("Low", "Medium", "High", "Critical") and a one-sentence summary based on all factors.

      Return a single, valid JSON object matching the provided schema.
    `;
    
    const assessmentResponse = await ai.models.generateContent({
        model: analysisModel,
        contents: assessmentPrompt,
        config: { responseMimeType: "application/json", responseSchema: riskAssessmentSchema }
    });

    const assessment = parseGeminiJson<RiskAssessment>(assessmentResponse.text, `assessment of ${dependencyName}`);
    
    if (!assessment) {
        return {
            maintainerAnalysis: "Could not analyze maintainers.",
            codeSecurityAnalysis: "Could not perform code security analysis.",
            licenseAnalysis: { spdxId: "Unknown", complianceSummary: "Failed to perform AI analysis on the license." },
            vulnerabilityAnalysis: [],
            riskLevel: "Critical",
            riskSummary: "Failed to perform AI analysis. Treat with extreme caution."
        };
    }
    return assessment;
};
