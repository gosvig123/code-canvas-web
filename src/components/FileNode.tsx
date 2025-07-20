import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { GitHubFile, FileStructure, CodeSymbol } from '../types.js'

interface FileNodeData {
  label: string
  file: GitHubFile
  structure?: FileStructure
  content?: string
  onSymbolClick?: (symbol: CodeSymbol, file: GitHubFile) => void
  allStructures?: Map<string, FileStructure>
}

const FileNode = memo(({ data }: NodeProps<FileNodeData>) => {
  const { label, structure, onSymbolClick, file, allStructures } = data

  const handleSymbolClick = (symbol: CodeSymbol) => {
    console.log('🎯 FileNode: Symbol clicked:', symbol.name, symbol.type)
    console.log('🎯 FileNode: onSymbolClick exists?', !!onSymbolClick)
    console.log('🎯 FileNode: Is clickable?', symbol.type === 'function' || symbol.type === 'class')
    
    // TEMPORARY: Make ALL symbols clickable for testing
    if (onSymbolClick) {
      console.log('🎯 FileNode: Calling onSymbolClick (TESTING MODE)')
      onSymbolClick(symbol, file)
    } else {
      console.log('🎯 FileNode: onSymbolClick is null/undefined')
    }
  }

  const getSymbolUsages = (symbolName: string, symbolType: string) => {
    if (!allStructures) return []
    const usages = []
    
    for (const [, fileStructure] of allStructures) {
      if (symbolType === 'function') {
        // For functions, count function calls
        const calls = fileStructure.functionCalls.filter(call => call.functionName === symbolName)
        usages.push(...calls)
      } else if (symbolType === 'class') {
        // For classes, count instantiations and inheritance references
        if (fileStructure.symbolReferences) {
          const refs = fileStructure.symbolReferences.filter(ref => 
            ref.symbolName === symbolName && 
            ref.symbolType === 'class' &&
            (ref.referenceType === 'instantiation' || ref.referenceType === 'inheritance')
          )
          usages.push(...refs)
        }
      } else if (symbolType === 'interface' || symbolType === 'type') {
        // For interfaces and types, count type usage references
        if (fileStructure.symbolReferences) {
          const refs = fileStructure.symbolReferences.filter(ref => 
            ref.symbolName === symbolName && 
            (ref.symbolType === 'interface' || ref.symbolType === 'type') &&
            ref.referenceType === 'usage'
          )
          usages.push(...refs)
        }
      }
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
                const usages = getSymbolUsages(symbol.name, symbol.type)
                const isClickable = true // TEMPORARY: Make all symbols clickable for testing
                console.log('🔍 Rendering symbol:', symbol.name, symbol.type, 'clickable:', isClickable)
                return (
                  <div
                    key={index}
                    className={`symbol symbol-${symbol.type} ${isClickable ? 'clickable' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      console.log('🎯 Click event fired on symbol:', symbol.name)
                      handleSymbolClick(symbol)
                    }}
                    title={isClickable ? `${usages.length} usage(s) found` : ''}
                  >
                    <span className="symbol-type">{symbol.type}</span>
                    <span className="symbol-name">{symbol.name}</span>
                    {isClickable && usages.length > 0 && (
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

        </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  )
})

FileNode.displayName = 'FileNode'

export default FileNode
