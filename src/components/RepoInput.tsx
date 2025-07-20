import { useState } from 'react'
import { Octokit } from '@octokit/rest'
import type { GitHubRepo } from '../types.js'

interface RepoInputProps {
  onRepoSelect: (repo: GitHubRepo) => void
}

const RepoInput: React.FC<RepoInputProps> = ({ onRepoSelect }) => {
  const [repoUrl, setRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const octokit = new Octokit()

  const parseRepoUrl = (url: string): { owner: string; repo: string } | null => {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/)
    if (match) {
      return { owner: match[1], repo: match[2] }
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const parsed = parseRepoUrl(repoUrl)
      if (!parsed) {
        throw new Error('Invalid GitHub repository URL')
      }

      const { data } = await octokit.rest.repos.get({
        owner: parsed.owner,
        repo: parsed.repo,
      })

      const repo: GitHubRepo = {
        name: data.name,
        full_name: data.full_name,
        description: data.description || '',
        url: data.html_url,
        default_branch: data.default_branch,
      }

      onRepoSelect(repo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch repository')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="repo-input">
      <form onSubmit={handleSubmit}>
        <input
          type="url"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          disabled={loading}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Loading...' : 'Load Repository'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
    </div>
  )
}

export default RepoInput