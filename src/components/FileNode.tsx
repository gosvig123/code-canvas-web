import { memo } from 'react'
import { Handle, Position, type Node } from 'reactflow'
import type { GitHubFile, FileStructure, CodeSymbol } from '../types.js'

interface FileNodeData {
  label: string
  file: GitHubFile
  structure?: FileStructure
  content?: string
  onSymbolClick?: (symbol: CodeSymbol, file: GitHubFile) => void
  allStructures?: Map<string, FileStructure>
}

const FileNode = memo(({ data }: Node<FileNodeData>) => {
  const { label, structure, content, onSymbolClick, file, allStructures } = data

  const handleSymbolClick = (symbol: CodeSymbol) => {
    if (onSymbolClick && symbol.type === 'function') {
      onSymbolClick(symbol, file)
    }
  }

  const getFunctionUsages = (functionName: string) => {
    if (!allStructures) return []
    const usages = []
    for (const [filePath, fileStructure] of allStructures) {
      const calls = fileStructure.functionCalls.filter(call => call.functionName === functionName)
      usages.push(...calls)
    }
    return usages
  }

  return (
    <div className="file-node">
      <Handle type="target" position={Position.Top} />
      
      <div className="file-node-header">
        <div className="file-name">{label}</div>
        {structure && (
          <div className="file-language">{structure.language}</div>
        )}
      </div>
      
      {structure && (
        <div className="file-node-content">
          <div className="symbols-section">
            <h4>Symbols ({structure.symbols.length})</h4>
            <div className="symbols-list">
              {structure.symbols.slice(0, 5).map((symbol, index) => {
                const usages = symbol.type === 'function' ? getFunctionUsages(symbol.name) : []
                return (
                  <div 
                    key={index} 
                    className={`symbol symbol-${symbol.type} ${symbol.type === 'function' ? 'clickable' : ''}`}
                    onClick={() => handleSymbolClick(symbol)}
                    title={symbol.type === 'function' ? `${usages.length} usage(s) found` : ''}
                  >
                    <span className="symbol-type">{symbol.type}</span>
                    <span className="symbol-name">{symbol.name}</span>
                    {symbol.type === 'function' && usages.length > 0 && (
                      <span className="usage-count">({usages.length})</span>
                    )}
                  </div>
                )
              })}
              {structure.symbols.length > 5 && (
                <div className="symbol-more">
                  +{structure.symbols.length - 5} more...
                </div>
              )}
            </div>
          </div>
          
          {structure.imports.length > 0 && (
            <div className="imports-section">
              <h4>Imports ({structure.imports.length})</h4>
              <div className="imports-list">
                {structure.imports.slice(0, 3).map((imp, index) => (
                  <div key={index} className="import-item">
                    {imp}
                  </div>
                ))}
                {structure.imports.length > 3 && (
                  <div className="import-more">
                    +{structure.imports.length - 3} more...
                  </div>
                )}
              </div>
            </div>
          )}
          
          {content && (
            <div className="preview-section">
              <h4>Preview</h4>
              <pre className="code-preview">{content}</pre>
            </div>
          )}
        </div>
      )}
      
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
})

FileNode.displayName = 'FileNode'

export default FileNode