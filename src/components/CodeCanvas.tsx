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
import type { GitHubFile, FileStructure, CodeSymbol, FunctionCall, SymbolReference } from '../types.js'
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
    console.log('🔬 useEffect triggered - isAnalyzerReady:', isAnalyzerReady, 'selectedFiles.length:', selectedFiles.length)
    if (isAnalyzerReady && selectedFiles.length > 0) {
      console.log('🔬 Calling analyzeFiles...')
      analyzeFiles()
    } else {
      console.log('🔬 Not calling analyzeFiles - conditions not met')
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
    console.log('🔬 Starting analyzeFiles...')
    console.log('🔬 Selected files count:', selectedFiles.length)
    console.log('🔬 Repo URL:', repoUrl)
    
    const parsed = githubService.parseRepoUrl(repoUrl)
    if (!parsed) {
      console.log('🔬 Failed to parse repo URL')
      return
    }

    const newNodes: Node[] = []
    const newEdges: Edge[] = []
    const structures: Map<string, FileStructure> = new Map()

    // Analyze each file
    console.log('🔬 Starting file analysis loop...')
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      console.log('🔬 Analyzing file:', file.name, 'path:', file.path)
      try {
        const content = await githubService.getFileContentByUrl(file.download_url!)
        console.log('🔬 Got content for', file.name, 'length:', content.length)
        const structure = await analyzer.analyzeFile(content, file.name)
        console.log('🔬 Analysis complete for', file.name, 'symbols:', structure.symbols.length)
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
    
    console.log('🔬 Setting nodes:', layoutNodes.length)
    console.log('🔬 Setting edges:', newEdges.length)
    console.log('🔬 Setting file structures:', structures.size)
    console.log('🔬 File structure keys:', Array.from(structures.keys()))
    
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
    
    groups.forEach((group) => {
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
    console.log('🔥 SYMBOL CLICKED!', symbol.name, symbol.type, 'in file:', file.name)
    console.log('🔥 Current nodes count:', nodes.length)
    console.log('🔥 File structures from state:', fileStructures.size)
    
    // Try to get file structures from the clicked node's data if state is empty
    let structuresToUse = fileStructures
    if (fileStructures.size === 0) {
      console.log('🔥 State fileStructures is empty, trying to get from node data...')
      const sourceNode = nodes.find(n => n.id === file.path)
      if (sourceNode?.data?.allStructures) {
        structuresToUse = sourceNode.data.allStructures
        console.log('🔥 Found structures in node data:', structuresToUse.size)
      }
    }
    
    // Clear any existing function details panel
    setSelectedFunction(null)
    
    // Find all usages of this symbol (function calls and references)
    const usages: (FunctionCall | SymbolReference)[] = []
    const callerFunctions = new Map<string, { functions: string[], file: GitHubFile, filePath: string }>()
    
    console.log('🔍 Starting search for symbol:', symbol.name, 'type:', symbol.type)
    console.log('🔍 Available file structures:', Array.from(structuresToUse.keys()))
    
    structuresToUse.forEach((structure, filePath) => {
      console.log('🔍 Checking file:', filePath, 'for symbol:', symbol.name)
      console.log('🔍 File has', structure.functionCalls?.length || 0, 'function calls')
      console.log('🔍 File has', structure.symbolReferences?.length || 0, 'symbol references')
      
      if (symbol.type === 'function') {
        const calls = structure.functionCalls.filter(call => call.functionName === symbol.name)
        console.log('Found', calls.length, 'function calls in', filePath)
        usages.push(...calls)
        
        // For each call, find which function contains it OR create a node for the file itself
        calls.forEach(call => {
          const callerFile = selectedFiles.find((f: GitHubFile) => f.path === filePath)
          if (callerFile) {
            // Try to find containing function, but if not found, use the file itself
            const containingFunction = structure.symbols.find(sym => 
              sym.type === 'function' && 
              sym.line <= call.line && 
              (sym.endLine ? sym.endLine >= call.line : true)
            )
            
            const functionKey = containingFunction ? 
              `${containingFunction.name}-${filePath}` : 
              `file-${filePath}`
            
            if (!callerFunctions.has(functionKey)) {
              callerFunctions.set(functionKey, { 
                functions: [], 
                file: callerFile, 
                filePath: filePath 
              })
            }
            callerFunctions.get(functionKey)!.functions.push(symbol.name)
          }
        })
      } else if (symbol.type === 'class') {
        if (structure.symbolReferences) {
          const refs = structure.symbolReferences.filter(ref => 
            ref.symbolName === symbol.name && 
            ref.symbolType === 'class' &&
            (ref.referenceType === 'instantiation' || ref.referenceType === 'inheritance')
          )
          console.log('Found', refs.length, 'class references in', filePath)
          usages.push(...refs)
          
          // For each reference, find which function contains it OR create a node for the file itself
          refs.forEach(ref => {
            const callerFile = selectedFiles.find((f: GitHubFile) => f.path === filePath)
            if (callerFile) {
              const containingFunction = structure.symbols.find(sym => 
                sym.type === 'function' && 
                sym.line <= ref.line && 
                (sym.endLine ? sym.endLine >= ref.line : true)
              )
              
              const functionKey = containingFunction ? 
                `${containingFunction.name}-${filePath}` : 
                `file-${filePath}`
              
              if (!callerFunctions.has(functionKey)) {
                callerFunctions.set(functionKey, { 
                  functions: [], 
                  file: callerFile, 
                  filePath: filePath 
                })
              }
              callerFunctions.get(functionKey)!.functions.push(symbol.name)
            }
          })
        }
      } else if (symbol.type === 'interface' || symbol.type === 'type') {
        if (structure.symbolReferences) {
          const refs = structure.symbolReferences.filter(ref => 
            ref.symbolName === symbol.name && 
            (ref.symbolType === 'interface' || ref.symbolType === 'type') &&
            ref.referenceType === 'usage'
          )
          console.log('Found', refs.length, 'type/interface references in', filePath)
          usages.push(...refs)
          
          // For each reference, find which function contains it OR create a node for the file itself
          refs.forEach(ref => {
            const callerFile = selectedFiles.find((f: GitHubFile) => f.path === filePath)
            if (callerFile) {
              const containingFunction = structure.symbols.find(sym => 
                sym.type === 'function' && 
                sym.line <= ref.line && 
                (sym.endLine ? sym.endLine >= ref.line : true)
              )
              
              const functionKey = containingFunction ? 
                `${containingFunction.name}-${filePath}` : 
                `file-${filePath}`
              
              if (!callerFunctions.has(functionKey)) {
                callerFunctions.set(functionKey, { 
                  functions: [], 
                  file: callerFile, 
                  filePath: filePath 
                })
              }
              callerFunctions.get(functionKey)!.functions.push(symbol.name)
            }
          })
        }
      }
    })

    console.log('Found caller functions:', callerFunctions.size)

    // Create new nodes for each calling function/file
    const newNodes: Node[] = []
    const newEdges: Edge[] = []
    
    // Get the position of the clicked node to position new nodes around it
    const sourceNode = nodes.find(n => n.id === file.path)
    const baseX = sourceNode ? sourceNode.position.x + 400 : 400
    const baseY = sourceNode ? sourceNode.position.y : 100
    let nodeIndex = 0

    callerFunctions.forEach((callerInfo, functionKey) => {
      const callerStructure = structuresToUse.get(callerInfo.filePath)
      
      if (callerStructure) {
        const nodeId = `caller-${symbol.name}-${functionKey}-${Date.now()}`
        
        // Create a structure for display
        let displayStructure: FileStructure
        
        if (functionKey.startsWith('file-')) {
          // Show the whole file
          displayStructure = callerStructure
        } else {
          // Show just the specific function
          const functionName = functionKey.split('-')[0]
          const callerFunction = callerStructure.symbols.find(sym => sym.name === functionName && sym.type === 'function')
          
          if (callerFunction) {
            displayStructure = {
              ...callerStructure,
              symbols: [callerFunction]
            }
          } else {
            displayStructure = callerStructure
          }
        }
        
        const displayName = functionKey.startsWith('file-') ? 
          `${callerInfo.file.name} (uses ${symbol.name})` :
          `${functionKey.split('-')[0]} (calls ${symbol.name})`
        
        const newNode: Node = {
          id: nodeId,
          type: 'fileNode',
          position: { 
            x: baseX + (nodeIndex % 3) * 350, 
            y: baseY + Math.floor(nodeIndex / 3) * 250 
          },
          data: {
            label: displayName,
            file: callerInfo.file,
            structure: displayStructure,
            onSymbolClick: handleSymbolClick,
            allStructures: structuresToUse,
          },
          style: {
            border: '2px solid #ff6b6b',
            backgroundColor: '#fff5f5'
          }
        }
        
        newNodes.push(newNode)
        console.log('Created new node:', nodeId, 'at position:', newNode.position)
        
        // Create edge from original node to caller node
        const edge: Edge = {
          id: `edge-${file.path}-${nodeId}`,
          source: file.path,
          target: nodeId,
          label: `calls ${symbol.name}`,
          type: 'smoothstep',
          style: { stroke: '#ff6b6b', strokeWidth: 2 },
          animated: true,
        }
        
        newEdges.push(edge)
        nodeIndex++
      }
    })

    console.log('Creating', newNodes.length, 'new nodes')
    console.log('Caller functions found:', callerFunctions.size)
    console.log('File structures available:', fileStructures.size)

    // If no nodes were created, create a simple test node to verify the mechanism works
    if (newNodes.length === 0) {
      console.log('No usages found, creating test node to verify mechanism')
      const testNode: Node = {
        id: `test-${symbol.name}-${Date.now()}`,
        type: 'fileNode',
        position: { 
          x: (sourceNode?.position.x || 0) + 400, 
          y: (sourceNode?.position.y || 0) + 100 
        },
        data: {
          label: `Test: No usages found for ${symbol.name}`,
          file: file,
          structure: structuresToUse.get(file.path),
          onSymbolClick: handleSymbolClick,
          allStructures: structuresToUse,
        },
        style: {
          border: '2px solid #ffa500',
          backgroundColor: '#fff8dc'
        }
      }
      newNodes.push(testNode)
    }

    // Remove any existing caller nodes for this symbol and add new ones
    setNodes(currentNodes => {
      const filteredNodes = currentNodes.filter(node => !node.id.startsWith(`caller-${symbol.name}-`) && !node.id.startsWith(`test-${symbol.name}-`))
      console.log('Filtered nodes:', filteredNodes.length, 'Adding nodes:', newNodes.length)
      return [...filteredNodes, ...newNodes]
    })
    
    // Remove existing symbol edges and add new ones
    setEdges(currentEdges => [
      ...currentEdges.filter(e => !e.id.startsWith('symbol-usage-') && !e.id.startsWith(`edge-${file.path}-caller-${symbol.name}-`)),
      ...newEdges
    ])
  }, [fileStructures, setEdges, setNodes, selectedFiles, nodes])

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
            <h3>{selectedFunction.symbol.type === 'class' ? 'Class' : 'Function'}: {selectedFunction.symbol.name}</h3>
            <button onClick={() => setSelectedFunction(null)}>×</button>
          </div>
          <div className="function-details-content">
            <p>Defined in: {selectedFunction.file.name} (line {selectedFunction.symbol.line})</p>
            <h4>{selectedFunction.symbol.type === 'class' ? 'Referenced from:' : 'Called from:'}</h4>
            <div className="function-usages">
              {(() => {
                const usages: (FunctionCall | SymbolReference)[] = []
                fileStructures.forEach((structure) => {
                  if (selectedFunction.symbol.type === 'function') {
                    const calls = structure.functionCalls.filter(call => call.functionName === selectedFunction.symbol.name)
                    usages.push(...calls.map(call => ({ ...call, type: 'call' })))
                  } else if (selectedFunction.symbol.type === 'class') {
                    if (structure.symbolReferences) {
                      const refs = structure.symbolReferences.filter(ref => 
                        ref.symbolName === selectedFunction.symbol.name && 
                        ref.symbolType === 'class' &&
                        (ref.referenceType === 'instantiation' || ref.referenceType === 'inheritance')
                      )
                      usages.push(...refs.map(ref => ({ ...ref, type: 'reference' })))
                    }
                  } else if (selectedFunction.symbol.type === 'interface' || selectedFunction.symbol.type === 'type') {
                    if (structure.symbolReferences) {
                      const refs = structure.symbolReferences.filter(ref => 
                        ref.symbolName === selectedFunction.symbol.name && 
                        (ref.symbolType === 'interface' || ref.symbolType === 'type') &&
                        ref.referenceType === 'usage'
                      )
                      usages.push(...refs.map(ref => ({ ...ref, type: 'reference' })))
                    }
                  }
                })
                
                // Group by file
                const groupedUsages = usages.reduce((acc, usage) => {
                  const fileName = ('callerFile' in usage ? usage.callerFile : usage.referencedInFile) || 'unknown'
                  if (!acc[fileName]) {
                    acc[fileName] = []
                  }
                  acc[fileName].push(usage)
                  return acc
                }, {} as Record<string, (FunctionCall | SymbolReference)[]>)
                
                return Object.keys(groupedUsages).length > 0 ? (Object.entries(groupedUsages) as [string, (FunctionCall | SymbolReference)[]][]).map(([fileName, fileUsages]) => (
                  <div key={fileName} className="file-usage-group">
                    <div className="usage-file-header">{fileName}</div>
                    <div className="usage-symbols">
                      {fileUsages.map((usage: FunctionCall | SymbolReference, index: number) => (
                        <div key={index} className="usage-item">
                          <span className="usage-type">{'referenceType' in usage ? usage.referenceType : 'call'}</span>
                          <span className="usage-location">line {usage.line}</span>
                        </div>
                      ))}
                    </div>
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
