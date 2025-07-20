import { useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import RepoInput from './components/RepoInput.js'
import FileBrowser from './components/FileBrowser.js'
import CodeCanvas from './components/CodeCanvas.js'
import type { GitHubRepo, GitHubFile } from './types.js'
import './App.css'
function App() {
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<GitHubFile[]>([])

  const handleFileSelect = (file: GitHubFile) => {
    if (!selectedFiles.find(f => f.path === file.path)) {
      setSelectedFiles(prev => [...prev, file])
    }
  }

  const removeFile = (filePath: string) => {
    setSelectedFiles(prev => prev.filter(f => f.path !== filePath))
  }

  return (
    <div className="app">
      <div className="sidebar">
        <h1>Code Canvas</h1>
        <RepoInput onRepoSelect={setSelectedRepo} />
        
        {selectedRepo && (
          <>
            <div className="repo-info">
              <h3>{selectedRepo.name}</h3>
              <p>{selectedRepo.description}</p>
            </div>
            
            <FileBrowser 
              repo={selectedRepo}
              onFileSelect={handleFileSelect}
            />
            
            {selectedFiles.length > 0 && (
              <div className="selected-files">
                <h4>Selected Files ({selectedFiles.length})</h4>
                {selectedFiles.map(file => (
                  <div key={file.path} className="selected-file">
                    <span className="file-name">{file.name || file.path}</span>
                    <button onClick={() => removeFile(file.path)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      
      <div className="canvas-container">
        {selectedRepo && selectedFiles.length > 0 ? (
          <ReactFlowProvider>
            <CodeCanvas 
              repoUrl={selectedRepo.url}
              selectedFiles={selectedFiles}
            />
          </ReactFlowProvider>
        ) : (
          <div className="canvas-placeholder">
            <h2>Welcome to Code Canvas</h2>
            <p>Enter a GitHub repository URL and select files to visualize their structure and relationships.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
