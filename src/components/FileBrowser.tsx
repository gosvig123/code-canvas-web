import { useState, useEffect } from 'react'
import type { GitHubRepo, GitHubFile } from '../types.js'
import { GitHubService } from '../services/githubService.js'

interface FileBrowserProps {
  repo: GitHubRepo
  onFileSelect: (file: GitHubFile) => void
}

const FileBrowser: React.FC<FileBrowserProps> = ({ repo, onFileSelect }) => {
  const [files, setFiles] = useState<GitHubFile[]>([])
  const [currentPath, setCurrentPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [githubService] = useState(() => new GitHubService())

  useEffect(() => {
    loadFiles('')
  }, [repo])

  const loadFiles = async (path: string) => {
    setLoading(true)
    try {
      const parsed = githubService.parseRepoUrl(repo.url)
      if (parsed) {
        const fileList = await githubService.getFileTree(
          parsed.owner,
          parsed.repo,
          path,
          repo.default_branch
        )
        setFiles(fileList)
        setCurrentPath(path)
      }
    } catch (error) {
      console.error('Error loading files:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleItemClick = (file: GitHubFile) => {
    if (file.type === 'dir') {
      loadFiles(file.path)
    } else {
      onFileSelect(file)
    }
  }

  const goBack = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/')
    loadFiles(parentPath)
  }

  const isCodeFile = (filename: string): boolean => {
    const codeExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.rs', '.go', '.java']
    return codeExtensions.some(ext => filename.toLowerCase().endsWith(ext))
  }

  if (loading) {
    return <div className="file-browser loading">Loading files...</div>
  }

  return (
    <div className="file-browser">
      <div className="file-browser-header">
        {currentPath && (
          <button onClick={goBack} className="back-button">
            ← Back
          </button>
        )}
        <div className="current-path">
          {currentPath || 'Root'}
        </div>
      </div>
      
      <div className="file-list">
        {files.map((file) => (
          <div
            key={file.path}
            className={`file-item ${file.type} ${isCodeFile(file.name) ? 'code-file' : ''}`}
            onClick={() => handleItemClick(file)}
          >
            <span className="file-icon">
              {file.type === 'dir' ? '📁' : isCodeFile(file.name) ? '📄' : '📋'}
            </span>
            <span className="file-name">{file.name}</span>
            {file.size && (
              <span className="file-size">
                {Math.round(file.size / 1024)}KB
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default FileBrowser