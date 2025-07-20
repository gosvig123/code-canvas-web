import type { CodeSymbol, FileStructure, FunctionCall, SymbolReference } from '../types.js'

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
      locateFile() {
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
    const symbolReferences = this.extractSymbolReferences(tree.rootNode, content, filename)

    console.log(`Analysis complete for ${filename}: ${symbols.length} symbols found`)
    if (symbols.length > 0) {
      console.log('Symbols:', symbols.map(s => `${s.type}:${s.name}`))
    }

    return {
      path: filename,
      language,
      symbols,
      imports,
      exports,
      functionCalls,
      symbolReferences
    }
  }

  private extractSymbols(node: any, content: string): CodeSymbol[] {
    const symbols: CodeSymbol[] = []
    
    const traverse = (n: any) => {
      if (!n || !n.type) return
      
      switch (n.type) {
        case 'function_declaration':
        case 'function_expression':
        case 'arrow_function':
        case 'method_definition':
        case 'function_signature':
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
        case 'lexical_declaration':
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
          
        case 'interface_declaration':
          const interfaceName = this.extractInterfaceName(n, content)
          if (interfaceName) {
            symbols.push({
              name: interfaceName,
              type: 'interface',
              line: n.startPosition.row + 1,
              column: n.startPosition.column,
              endLine: n.endPosition.row + 1,
              endColumn: n.endPosition.column
            })
          }
          break
          
        case 'type_alias_declaration':
          const typeName = this.extractTypeName(n, content)
          if (typeName) {
            symbols.push({
              name: typeName,
              type: 'type',
              line: n.startPosition.row + 1,
              column: n.startPosition.column,
              endLine: n.endPosition.row + 1,
              endColumn: n.endPosition.column
            })
          }
          break
      }

      if (n.children) {
        for (const child of n.children) {
          traverse(child)
        }
      }
    }

    traverse(node)
    return symbols
  }

  private extractImports(node: any, content: string): string[] {
    const imports: string[] = []
    
    const traverse = (n: any) => {
      if (n.type === 'import_statement') {
        const source = n.children.find((child: any) => child.type === 'string')
        if (source) {
          const importPath = content.slice(source.startIndex + 1, source.endIndex - 1)
          imports.push(importPath)
        }
      }
      
      if (n.children) {
        for (const child of n.children) {
          traverse(child)
        }
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
      
      if (n.children) {
        for (const child of n.children) {
          traverse(child)
        }
      }
    }
    
    traverse(node)
    return exports
  }

  private extractFunctionName(node: any, content: string): string | null {
    // Handle different function types
    if (node.type === 'function_declaration') {
      const nameNode = node.children.find((child: any) => child.type === 'identifier')
      return nameNode ? content.slice(nameNode.startIndex, nameNode.endIndex) : null
    }
    
    if (node.type === 'method_definition') {
      const nameNode = node.children.find((child: any) => child.type === 'property_identifier')
      return nameNode ? content.slice(nameNode.startIndex, nameNode.endIndex) : null
    }
    
    if (node.type === 'arrow_function' || node.type === 'function_expression') {
      // For arrow functions, look for assignment pattern
      let parent = node.parent
      while (parent) {
        if (parent.type === 'variable_declarator') {
          const nameNode = parent.children.find((child: any) => child.type === 'identifier')
          return nameNode ? content.slice(nameNode.startIndex, nameNode.endIndex) : null
        }
        if (parent.type === 'assignment_expression') {
          const leftNode = parent.children[0]
          if (leftNode && leftNode.type === 'identifier') {
            return content.slice(leftNode.startIndex, leftNode.endIndex)
          }
        }
        parent = parent.parent
      }
    }
    
    return null
  }

  private extractClassName(node: any, content: string): string | null {
    const nameNode = node.children.find((child: any) => child.type === 'identifier')
    return nameNode ? content.slice(nameNode.startIndex, nameNode.endIndex) : null
  }

  private extractVariableNames(node: any, content: string): string[] {
    const names: string[] = []
    
    const traverse = (n: any) => {
      if (n.type === 'variable_declarator') {
        const identifier = n.children.find((child: any) => child.type === 'identifier')
        if (identifier) {
          names.push(content.slice(identifier.startIndex, identifier.endIndex))
        }
      }
      
      for (const child of n.children || []) {
        traverse(child)
      }
    }
    
    traverse(node)
    return names
  }

  private extractExportName(node: any, content: string): string | null {
    // Simplified export name extraction
    const identifier = node.children.find((child: any) => child.type === 'identifier')
    return identifier ? content.slice(identifier.startIndex, identifier.endIndex) : null
  }

  private extractInterfaceName(node: any, content: string): string | null {
    const nameNode = node.children.find((child: any) => child.type === 'type_identifier')
    return nameNode ? content.slice(nameNode.startIndex, nameNode.endIndex) : null
  }

  private extractTypeName(node: any, content: string): string | null {
    const nameNode = node.children.find((child: any) => child.type === 'type_identifier')
    return nameNode ? content.slice(nameNode.startIndex, nameNode.endIndex) : null
  }

  private extractFunctionCalls(node: any, content: string, filename: string): FunctionCall[] {
    const calls: FunctionCall[] = []
    
    const traverse = (n: any) => {
      if (n.type === 'call_expression') {
        const functionNode = n.children[0]
        if (functionNode && functionNode.type === 'identifier') {
          const functionName = content.slice(functionNode.startIndex, functionNode.endIndex)
          // Skip built-in functions and common methods that are not user-defined
          if (!this.isBuiltInFunction(functionName)) {
            calls.push({
              functionName,
              line: n.startPosition.row + 1,
              column: n.startPosition.column,
              callerFile: filename
            })
          }
        } else if (functionNode && functionNode.type === 'member_expression') {
          // Handle method calls like obj.method()
          const propertyNode = functionNode.children.find((child: any) => child.type === 'property_identifier')
          if (propertyNode) {
            const functionName = content.slice(propertyNode.startIndex, propertyNode.endIndex)
            // Only count method calls that might be user-defined functions
            if (!this.isBuiltInMethod(functionName)) {
              calls.push({
                functionName,
                line: n.startPosition.row + 1,
                column: n.startPosition.column,
                callerFile: filename
              })
            }
          }
        }
      }
      
      if (n.children) {
        for (const child of n.children) {
          traverse(child)
        }
      }
    }
    
    traverse(node)
    return calls
  }

  private isBuiltInFunction(name: string): boolean {
    const builtIns = new Set([
      'console', 'require', 'import', 'export', 'setTimeout', 'setInterval',
      'clearTimeout', 'clearInterval', 'parseInt', 'parseFloat', 'isNaN',
      'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'JSON',
      'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'RegExp',
      'Math', 'Promise', 'Error', 'TypeError', 'ReferenceError'
    ])
    return builtIns.has(name)
  }

  private isBuiltInMethod(name: string): boolean {
    const builtInMethods = new Set([
      'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'concat',
      'join', 'reverse', 'sort', 'indexOf', 'lastIndexOf', 'includes',
      'find', 'findIndex', 'filter', 'map', 'reduce', 'reduceRight',
      'forEach', 'some', 'every', 'toString', 'valueOf', 'hasOwnProperty',
      'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
      'charAt', 'charCodeAt', 'substring', 'substr', 'toLowerCase',
      'toUpperCase', 'trim', 'split', 'replace', 'match', 'search',
      'log', 'warn', 'error', 'info', 'debug', 'trace', 'assert',
      'then', 'catch', 'finally', 'resolve', 'reject', 'all', 'race'
    ])
    return builtInMethods.has(name)
  }

  private extractSymbolReferences(node: any, content: string, filename: string): SymbolReference[] {
    const references: SymbolReference[] = []
    
    const traverse = (n: any) => {
      if (!n || !n.type) return
      
      // Track class instantiations (new ClassName())
      if (n.type === 'new_expression') {
        const classNode = n.children.find((child: any) => child.type === 'identifier')
        if (classNode) {
          const className = content.slice(classNode.startIndex, classNode.endIndex)
          references.push({
            symbolName: className,
            symbolType: 'class',
            referencedInFile: filename,
            line: n.startPosition.row + 1,
            column: n.startPosition.column,
            referenceType: 'instantiation'
          })
        }
      }
      
      // Track class inheritance
      if (n.type === 'class_heritage') {
        const superClassNode = n.children.find((child: any) => child.type === 'identifier')
        if (superClassNode) {
          const superClassName = content.slice(superClassNode.startIndex, superClassNode.endIndex)
          references.push({
            symbolName: superClassName,
            symbolType: 'class',
            referencedInFile: filename,
            line: n.startPosition.row + 1,
            column: n.startPosition.column,
            referenceType: 'inheritance'
          })
        }
      }
      
      // Track type references in TypeScript
      if (n.type === 'type_identifier') {
        const typeName = content.slice(n.startIndex, n.endIndex)
        references.push({
          symbolName: typeName,
          symbolType: 'type',
          referencedInFile: filename,
          line: n.startPosition.row + 1,
          column: n.startPosition.column,
          referenceType: 'usage'
        })
      }
      
      // Track interface usage in type annotations
      if (n.type === 'type_annotation' || n.type === 'type_arguments') {
        const typeIdentifiers = this.findTypeIdentifiers(n, content)
        typeIdentifiers.forEach(typeId => {
          references.push({
            symbolName: typeId.name,
            symbolType: 'interface',
            referencedInFile: filename,
            line: typeId.line,
            column: typeId.column,
            referenceType: 'usage'
          })
        })
      }
      
      if (n.children) {
        for (const child of n.children) {
          traverse(child)
        }
      }
    }
    
    traverse(node)
    return references
  }

  private findTypeIdentifiers(node: any, content: string): Array<{name: string, line: number, column: number}> {
    const identifiers: Array<{name: string, line: number, column: number}> = []
    
    const traverse = (n: any) => {
      if (n.type === 'type_identifier') {
        const name = content.slice(n.startIndex, n.endIndex)
        identifiers.push({
          name,
          line: n.startPosition.row + 1,
          column: n.startPosition.column
        })
      }
      
      if (n.children) {
        for (const child of n.children) {
          traverse(child)
        }
      }
    }
    
    traverse(node)
    return identifiers
  }
}
