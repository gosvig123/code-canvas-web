export interface GitHubRepo {
  name: string
  full_name: string
  description: string
  url: string
  default_branch: string
}

export interface GitHubFile {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  content?: string
  download_url?: string
}

export interface CodeSymbol {
  name: string
  type: 'function' | 'class' | 'variable' | 'import' | 'export' | 'interface' | 'type'
  line: number
  column: number
  endLine?: number
  endColumn?: number
}

export interface FunctionCall {
  functionName: string
  line: number
  column: number
  callerFile: string
}

export interface SymbolReference {
  symbolName: string
  symbolType: 'function' | 'class' | 'variable' | 'interface' | 'type'
  referencedInFile: string
  line: number
  column: number
  referenceType: 'call' | 'instantiation' | 'usage' | 'inheritance'
}

export interface ConnectedNode {
  file: GitHubFile
  symbols: CodeSymbol[]
  references: SymbolReference[]
}

export interface FileStructure {
  path: string
  language: string
  symbols: CodeSymbol[]
  imports: string[]
  exports: string[]
  functionCalls: FunctionCall[]
  symbolReferences: SymbolReference[]
}

export interface CanvasNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    label: string
    file?: GitHubFile
    symbols?: CodeSymbol[]
  }
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
  type?: string
  label?: string
}