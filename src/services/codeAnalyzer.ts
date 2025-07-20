import type { CodeSymbol, FileStructure, FunctionCall } from '../types.js'

export class CodeAnalyzer {
  private parser: any = null
  private languages: Map<string, any> = new Map()
  private Parser: any = null
  private Language: any = null

  async initialize() {
    const TreeSitter = await import('web-tree-sitter')
    this.Parser = TreeSitter.Parser
    this.Language = TreeSitter.Language
    await this.Parser.init({
      locateFile(scriptName: string, scriptDirectory: string) {
        return `/tree-sitter.wasm`
      }
    })
    this.parser = new this.Parser()
  }

  async loadLanguage(language: string): Promise<any> {
    if (this.languages.has(language)) {
      return this.languages.get(language)!
    }

    let wasmUrl: string
    switch (language) {
      case 'javascript':
      case 'typescript':
        wasmUrl = '/tree-sitter-javascript.wasm'
        break
      case 'python':
        wasmUrl = '/tree-sitter-python.wasm'
        break
      case 'rust':
        wasmUrl = '/tree-sitter-rust.wasm'
        break
      default:
        throw new Error(`Language ${language} not supported`)
    }

    const Language = await this.Language.load(wasmUrl)
    this.languages.set(language, Language)
    return Language
  }

  detectLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'js':
      case 'jsx':
        return 'javascript'
      case 'ts':
      case 'tsx':
        return 'typescript'
      case 'py':
        return 'python'
      case 'rs':
        return 'rust'
      default:
        return 'javascript' // Default fallback
    }
  }

  async analyzeFile(content: string, filename: string): Promise<FileStructure> {
    if (!this.parser) {
      throw new Error('Parser not initialized')
    }

    const language = this.detectLanguage(filename)
    const treeSitterLang = await this.loadLanguage(language)
    
    this.parser.setLanguage(treeSitterLang)
    const tree = this.parser.parse(content)

    const symbols = this.extractSymbols(tree.rootNode, content)
    const imports = this.extractImports(tree.rootNode, content)
    const exports = this.extractExports(tree.rootNode, content)
    const functionCalls = this.extractFunctionCalls(tree.rootNode, content, filename)

    return {
      path: filename,
      language,
      symbols,
      imports,
      exports,
      functionCalls
    }
  }

  private extractSymbols(node: any, content: string): CodeSymbol[] {
    const symbols: CodeSymbol[] = []
    
    const traverse = (n: any) => {
      switch (n.type) {
        case 'function_declaration':
        case 'function_expression':
        case 'arrow_function':
          const funcName = this.extractFunctionName(n, content)
          if (funcName) {
            symbols.push({
              name: funcName,
              type: 'function',
              line: n.startPosition.row + 1,
              column: n.startPosition.column,
              endLine: n.endPosition.row + 1,
              endColumn: n.endPosition.column
            })
          }
          break
        
        case 'class_declaration':
          const className = this.extractClassName(n, content)
          if (className) {
            symbols.push({
              name: className,
              type: 'class',
              line: n.startPosition.row + 1,
              column: n.startPosition.column,
              endLine: n.endPosition.row + 1,
              endColumn: n.endPosition.column
            })
          }
          break
        
        case 'variable_declaration':
          const varNames = this.extractVariableNames(n, content)
          varNames.forEach(name => {
            symbols.push({
              name,
              type: 'variable',
              line: n.startPosition.row + 1,
              column: n.startPosition.column
            })
          })
          break
      }

      for (const child of n.children) {
        traverse(child)
      }
    }

    traverse(node)
    return symbols
  }

  private extractImports(node: any, content: string): string[] {
    const imports: string[] = []
    
    const traverse = (n: any) => {
      if (n.type === 'import_statement') {
        const source = n.children.find(child => child.type === 'string')
        if (source) {
          const importPath = content.slice(source.startIndex + 1, source.endIndex - 1)
          imports.push(importPath)
        }
      }
      
      for (const child of n.children) {
        traverse(child)
      }
    }
    
    traverse(node)
    return imports
  }

  private extractExports(node: any, content: string): string[] {
    const exports: string[] = []
    
    const traverse = (n: any) => {
      if (n.type === 'export_statement') {
        // Extract export names
        const exportName = this.extractExportName(n, content)
        if (exportName) {
          exports.push(exportName)
        }
      }
      
      for (const child of n.children) {
        traverse(child)
      }
    }
    
    traverse(node)
    return exports
  }

  private extractFunctionName(node: any, content: string): string | null {
    const nameNode = node.children.find(child => child.type === 'identifier')
    return nameNode ? content.slice(nameNode.startIndex, nameNode.endIndex) : null
  }

  private extractClassName(node: any, content: string): string | null {
    const nameNode = node.children.find(child => child.type === 'identifier')
    return nameNode ? content.slice(nameNode.startIndex, nameNode.endIndex) : null
  }

  private extractVariableNames(node: any, content: string): string[] {
    const names: string[] = []
    const declaratorList = node.children.find(child => child.type === 'variable_declarator')
    if (declaratorList) {
      const identifier = declaratorList.children.find(child => child.type === 'identifier')
      if (identifier) {
        names.push(content.slice(identifier.startIndex, identifier.endIndex))
      }
    }
    return names
  }

  private extractExportName(node: any, content: string): string | null {
    // Simplified export name extraction
    const identifier = node.children.find(child => child.type === 'identifier')
    return identifier ? content.slice(identifier.startIndex, identifier.endIndex) : null
  }

  private extractFunctionCalls(node: any, content: string, filename: string): FunctionCall[] {
    const calls: FunctionCall[] = []
    
    const traverse = (n: any) => {
      if (n.type === 'call_expression') {
        const functionNode = n.children[0]
        if (functionNode && functionNode.type === 'identifier') {
          const functionName = content.slice(functionNode.startIndex, functionNode.endIndex)
          calls.push({
            functionName,
            line: n.startPosition.row + 1,
            column: n.startPosition.column,
            callerFile: filename
          })
        } else if (functionNode && functionNode.type === 'member_expression') {
          // Handle method calls like obj.method()
          const propertyNode = functionNode.children.find(child => child.type === 'property_identifier')
          if (propertyNode) {
            const functionName = content.slice(propertyNode.startIndex, propertyNode.endIndex)
            calls.push({
              functionName,
              line: n.startPosition.row + 1,
              column: n.startPosition.column,
              callerFile: filename
            })
          }
        }
      }
      
      for (const child of n.children) {
        traverse(child)
      }
    }
    
    traverse(node)
    return calls
  }
}
