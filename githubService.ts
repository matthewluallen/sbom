
// services/githubService.ts

const GITHUB_API_DELAY = 300; // ms delay between requests to stay well under limits

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let lastRequestTime = 0;

// Throttled fetch function to avoid hitting GitHub API rate limits
const throttledFetch = async (url: string, token?: string): Promise<Response> => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    if (timeSinceLastRequest < GITHUB_API_DELAY) {
        await delay(GITHUB_API_DELAY - timeSinceLastRequest);
    }
    lastRequestTime = Date.now();

    const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });


    if (!response.ok) {
        if (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') {
            const resetTime = Number(response.headers.get('X-RateLimit-Reset')) * 1000;
            const waitTime = Math.max(0, resetTime - Date.now());
            const waitMinutes = Math.ceil(waitTime / (1000 * 60));
            throw new Error(`GitHub API rate limit exceeded. Please wait ~${waitMinutes} minute(s) or provide a GitHub Personal Access Token to increase the limit.`);
        }
         if (response.status === 404) {
            throw new Error(`Resource not found (404). The repository or file at ${url} may be private or may not exist.`);
        }
        throw new Error(`GitHub API request failed for ${url} with status ${response.status}.`);
    }

    return response;
};


// Extracts "owner/repo" from various GitHub URL formats
const parseRepoUrl = (url: string): { owner: string; repo: string } | null => {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (match) {
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }
  return null;
};

// Fetches the file tree for the default branch
export const getRepoFileTree = async (repoUrl: string, token?: string): Promise<{ path: string; type: string }[]> => {
  const repoInfo = parseRepoUrl(repoUrl);
  if (!repoInfo) throw new Error("Invalid GitHub URL");
  const { owner, repo } = repoInfo;

  // First, get the default branch name
  const repoDataResponse = await throttledFetch(`https://api.github.com/repos/${owner}/${repo}`, token);
  const repoData = await repoDataResponse.json();
  const defaultBranch = repoData.default_branch;

  // Then, get the file tree for that branch
  const treeResponse = await throttledFetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, token);
  const treeData = await treeResponse.json();
  
  if (treeData.truncated) {
    console.warn("Repository file tree is truncated. Some dependencies may be missed.");
  }
  
  return treeData.tree.filter((node: any) => node.type === 'blob').map((node: any) => ({ path: node.path, type: node.type }));
};

// Fetches the content of a specific file
export const getFileContent = async (repoUrl: string, filePath: string, token?: string): Promise<string> => {
    const repoInfo = parseRepoUrl(repoUrl);
    if (!repoInfo) throw new Error("Invalid GitHub URL");
    const { owner, repo } = repoInfo;

    const contentResponse = await throttledFetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, token);
    const contentData = await contentResponse.json();

    if (contentData.message?.toLowerCase().includes("not found")) {
        throw new Error(`File not found: ${filePath}`);
    }

    // Handle large files (encoding: 'none') by fetching from the blob API URL
    if (contentData.encoding === 'none') {
        if (!contentData.git_url) {
            throw new Error(`File content is not available and no blob URL was provided for: ${filePath}`);
        }

        const blobResponse = await throttledFetch(contentData.git_url, token);
        const blobData = await blobResponse.json();

        if (blobData.encoding !== 'base64' || !blobData.content) {
            throw new Error(`Failed to retrieve content from blob for ${filePath}. Encoding: ${blobData.encoding || 'N/A'}`);
        }
        
        // Decode base64 content from blob, removing newlines that GitHub's API might add.
        return atob(blobData.content.replace(/\n/g, ''));
    }

    if (contentData.encoding !== 'base64') {
        throw new Error(`Unsupported file encoding for ${filePath}: ${contentData.encoding}`);
    }
    
    if (!contentData.content) {
        throw new Error(`Content field is empty for file: ${filePath}`);
    }

    // Decode base64 content for smaller files
    return atob(contentData.content);
};
