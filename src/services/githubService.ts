import { Octokit } from '@octokit/rest'
import type { GitHubFile, GitHubRepo } from '../types.js'

export class GitHubService {
  private octokit: Octokit

  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token
    })
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepo> {
    const { data } = await this.octokit.rest.repos.get({
      owner,
      repo,
    })

    return {
      name: data.name,
      full_name: data.full_name,
      description: data.description || '',
      url: data.html_url,
      default_branch: data.default_branch,
    }
  }

  async getFileTree(owner: string, repo: string, path: string = '', branch?: string): Promise<GitHubFile[]> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      })

      if (Array.isArray(data)) {
        return data.map(item => ({
          name: item.name,
          path: item.path,
          type: item.type as 'file' | 'dir',
          size: item.size,
          download_url: item.download_url || undefined,
        }))
      } else {
        return [{
          name: data.name,
          path: data.path,
          type: data.type as 'file' | 'dir',
          size: data.size,
          download_url: data.download_url || undefined,
        }]
      }
    } catch (error) {
      console.error('Error fetching file tree:', error)
      return []
    }
  }

  async getFileContent(owner: string, repo: string, path: string, branch?: string): Promise<string> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      })

      if (!Array.isArray(data) && data.type === 'file') {
        // Content is base64 encoded
        const content = atob(data.content.replace(/\s/g, ''))
        return content
      } else {
        throw new Error('Not a file')
      }
    } catch (error) {
      console.error('Error fetching file content:', error)
      throw error
    }
  }

  async getFileContentByUrl(downloadUrl: string): Promise<string> {
    try {
      const response = await fetch(downloadUrl)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.text()
    } catch (error) {
      console.error('Error fetching file content by URL:', error)
      throw error
    }
  }

  parseRepoUrl(url: string): { owner: string; repo: string } | null {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/)
    if (match) {
      return { owner: match[1], repo: match[2] }
    }
    return null
  }
}
