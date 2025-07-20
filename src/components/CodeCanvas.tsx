import { useCallback, useState, useEffect } from 'react'
import ReactFlow, { 
  type Node, 
  type Edge, 
  addEdge, 
  type OnConnect,
  useNodesState, 
  useEdgesState,
  Background,
  Controls,
  MiniMap,
  useReactFlow
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { GitHubFile, FileStructure, CanvasNode, CodeSymbol, FunctionCall } from '../types.js'
import { CodeAnalyzer } from '../services/codeAnalyzer.js'
import { GitHubService } from '../services/githubService.js'
import FileNode from './FileNode.js'

const nodeTypes = {
  fileNode: FileNode,
}

interface CodeCanvasProps {
  repoUrl: string
  selectedFiles: GitHubFile[]
}

const CodeCanvas: React.FC<CodeCanvasProps> = ({ repoUrl, selectedFiles }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [analyzer] = useState(() => new CodeAnalyzer())
  const [githubService] = useState(() => new GitHubService())
  const [isAnalyzerReady, setIsAnalyzerReady] = useState(false)
  const [fileStructures, setFileStructures] = useState<Map<string, FileStructure>>(new Map())
  const [selectedFunction, setSelectedFunction] = useState<{symbol: CodeSymbol, file: GitHubFile} | null>(null)
  const { fitView } = useReactFlow()

  useEffect(() => {
    initializeAnalyzer()
  }, [])

  useEffect(() => {
    if (isAnalyzerReady && selectedFiles.length > 0) {
      analyzeFiles()
    }
  }, [selectedFiles, isAnalyzerReady])

  const initializeAnalyzer = async () => {
    try {
      await analyzer.initialize()
      setIsAnalyzerReady(true)
    } catch (error) {
      console.error('Failed to initialize analyzer:', error)
    }
  }

  const analyzeFiles = async () => {
    const parsed = githubService.parseRepoUrl(repoUrl)
    if (!parsed) return

    const newNodes: Node[] = []
    const newEdges: Edge[] = []
    const structures: Map<string, FileStructure> = new Map()

    // Analyze each file
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      try {
        const content = await githubService.getFileContentByUrl(file.download_url!)
        const structure = await analyzer.analyzeFile(content, file.name)
        structures.set(file.path, structure)

        // Create node for this file
        const node: Node = {
          id: file.path,
          type: 'fileNode',
          position: { 
            x: (i % 4) * 320, 
            y: Math.floor(i / 4) * 250 
          },
          data: {
            label: file.name,
            file,
            structure,
            content: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
            onSymbolClick: handleSymbolClick,
            allStructures: structures,
          },
        }
        newNodes.push(node)
      } catch (error) {
        console.error(`Error analyzing file ${file.path}:`, error)
      }
    }

    // Create edges based on imports
    structures.forEach((structure, filePath) => {
      structure.imports.forEach(importPath => {
        // Try to resolve import to actual file
        const targetFile = selectedFiles.find(f => 
          f.path.includes(importPath) || 
          f.name === importPath + '.js' ||
          f.name === importPath + '.ts' ||
          f.name === importPath + '.jsx' ||
          f.name === importPath + '.tsx'
        )
        
        if (targetFile) {
          const edge: Edge = {
            id: `${filePath}-${targetFile.path}`,
            source: filePath,
            target: targetFile.path,
            label: 'imports',
            type: 'smoothstep',
          }
          newEdges.push(edge)
        }
      })
    })

    // Apply better layout algorithm
    const layoutNodes = applySmartLayout(newNodes, newEdges)
    
    setNodes(layoutNodes)
    setEdges(newEdges)
    setFileStructures(structures)
    
    // Auto-fit the view after a short delay to ensure nodes are rendered
    setTimeout(() => {
      fitView({ padding: 50, duration: 800 })
    }, 100)
  }

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const applySmartLayout = (nodes: Node[], edges: Edge[]): Node[] => {
    // Create a graph of connections
    const connections = new Map<string, Set<string>>()
    
    edges.forEach(edge => {
      if (!connections.has(edge.source)) {
        connections.set(edge.source, new Set())
      }
      if (!connections.has(edge.target)) {
        connections.set(edge.target, new Set())
      }
      connections.get(edge.source)!.add(edge.target)
      connections.get(edge.target)!.add(edge.source)
    })

    // Group connected components
    const visited = new Set<string>()
    const groups: string[][] = []
    
    const dfs = (nodeId: string, group: string[]) => {
      if (visited.has(nodeId)) return
      visited.add(nodeId)
      group.push(nodeId)
      
      const neighbors = connections.get(nodeId) || new Set()
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          dfs(neighbor, group)
        }
      })
    }
    
    nodes.forEach(node => {
      if (!visited.has(node.id)) {
        const group: string[] = []
        dfs(node.id, group)
        groups.push(group)
      }
    })

    // Layout each group in a compact arrangement
    const layoutNodes = [...nodes]
    let groupStartX = 50
    
    groups.forEach((group, groupIndex) => {
      const groupNodes = layoutNodes.filter(node => group.includes(node.id))
      
      if (groupNodes.length === 1) {
        // Single node
        groupNodes[0].position = { x: groupStartX, y: 50 }
        groupStartX += 350
      } else {
        // Multiple connected nodes - arrange in a circle or grid
        const centerX = groupStartX + 200
        const centerY = 200
        const radius = Math.max(100, groupNodes.length * 30)
        
        groupNodes.forEach((node, index) => {
          if (groupNodes.length <= 6) {
            // Circular layout for small groups
            const angle = (index * 2 * Math.PI) / groupNodes.length
            node.position = {
              x: centerX + radius * Math.cos(angle),
              y: centerY + radius * Math.sin(angle)
            }
          } else {
            // Grid layout for larger groups
            const cols = Math.ceil(Math.sqrt(groupNodes.length))
            const row = Math.floor(index / cols)
            const col = index % cols
            node.position = {
              x: groupStartX + col * 320,
              y: 50 + row * 250
            }
          }
        })
        
        groupStartX += Math.max(400, Math.ceil(Math.sqrt(groupNodes.length)) * 320 + 100)
      }
    })

    return layoutNodes
  }

  const handleSymbolClick = useCallback((symbol: CodeSymbol, file: GitHubFile) => {
    setSelectedFunction({ symbol, file })
    
    // Find all usages of this function
    const usages: FunctionCall[] = []
    fileStructures.forEach((structure) => {
      const calls = structure.functionCalls.filter(call => call.functionName === symbol.name)
      usages.push(...calls)
    })

    // Create temporary edges to highlight function calls
    const functionEdges: Edge[] = usages.map((usage, index) => ({
      id: `function-call-${symbol.name}-${index}`,
      source: file.path,
      target: usage.callerFile,
      label: `calls ${symbol.name}`,
      type: 'smoothstep',
      style: { stroke: '#ff6b6b', strokeWidth: 2 },
      animated: true,
    }))

    setEdges(currentEdges => [...currentEdges.filter(e => !e.id.startsWith('function-call-')), ...functionEdges])
  }, [fileStructures, setEdges])

  const reorganizeLayout = useCallback(() => {
    const layoutNodes = applySmartLayout(nodes, edges)
    setNodes(layoutNodes)
    setTimeout(() => {
      fitView({ padding: 50, duration: 800 })
    }, 100)
  }, [nodes, edges, setNodes, fitView])

  return (
    <div className="code-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
      >
        <Background />
        <Controls />
        <MiniMap />
        <div className="layout-controls">
          <button onClick={reorganizeLayout} className="layout-button">
            📐 Auto Layout
          </button>
          <button onClick={() => fitView({ padding: 50, duration: 800 })} className="layout-button">
            🔍 Fit View
          </button>
        </div>
      </ReactFlow>
      
      {!isAnalyzerReady && (
        <div className="analyzer-loading">
          Initializing code analyzer...
        </div>
      )}
      
      {selectedFunction && (
        <div className="function-details-panel">
          <div className="function-details-header">
            <h3>Function: {selectedFunction.symbol.name}</h3>
            <button onClick={() => setSelectedFunction(null)}>×</button>
          </div>
          <div className="function-details-content">
            <p>Defined in: {selectedFunction.file.name} (line {selectedFunction.symbol.line})</p>
            <h4>Called from:</h4>
            <div className="function-usages">
              {(() => {
                const usages: FunctionCall[] = []
                fileStructures.forEach((structure) => {
                  const calls = structure.functionCalls.filter(call => call.functionName === selectedFunction.symbol.name)
                  usages.push(...calls)
                })
                return usages.length > 0 ? usages.map((usage, index) => (
                  <div key={index} className="usage-item">
                    <span className="usage-file">{usage.callerFile}</span>
                    <span className="usage-location">line {usage.line}</span>
                  </div>
                )) : <p>No usages found</p>
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CodeCanvas
