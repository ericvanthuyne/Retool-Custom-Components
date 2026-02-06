import React, { type FC, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Retool } from '@tryretool/custom-component-support'

/** Schema shape for schema-based autocomplete */
interface SchemaColumn {
  name: string
  type?: string
  dataType?: string
}

interface SchemaTable {
  name: string
  columns?: SchemaColumn[]
}

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AND', 'OR', 'AS', 'IN', 'NOT', 'NULL',
  'ORDER BY', 'GROUP BY', 'LIMIT', 'OFFSET', 'HAVING', 'DISTINCT', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'DEFAULT',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'BETWEEN', 'LIKE', 'IS', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'UNION', 'ALL', 'ASC', 'DESC', 'WITH', 'CAST', 'COALESCE', 'NULLIF', 'TRUE', 'FALSE',
]

const DEFAULT_HEIGHT = 300

/** Normalize various schema shapes to SchemaTable[] */
function parseSchema(schema: unknown): SchemaTable[] {
  if (schema == null || typeof schema !== 'object') return []

  // { tables: [...] }
  if ('tables' in schema && Array.isArray((schema as { tables?: unknown }).tables)) {
    const tables = (schema as { tables: unknown[] }).tables
    return tables.map((t) => {
      if (t && typeof t === 'object' && 'name' in t) {
        const name = typeof (t as { name?: unknown }).name === 'string' ? (t as { name: string }).name : 'table'
        const cols = (t as { columns?: unknown[] }).columns
        const columns = Array.isArray(cols)
          ? cols.map((c) => {
              if (c && typeof c === 'object' && 'name' in c) {
                const n = typeof (c as { name?: unknown }).name === 'string' ? (c as { name: string }).name : String(c)
                const type = (c as { type?: string; dataType?: string }).type ?? (c as { dataType?: string }).dataType
                return { name: n, type }
              }
              return { name: String(c) }
            })
          : undefined
        return { name, columns }
      }
      return { name: 'table', columns: undefined }
    })
  }

  // { columns: [...] } – single logical table
  if ('columns' in schema && Array.isArray((schema as { columns?: unknown }).columns)) {
    const columns = (schema as { columns: unknown[] }).columns.map((c) => {
      if (c && typeof c === 'object' && 'name' in c) {
        const n = typeof (c as { name?: unknown }).name === 'string' ? (c as { name: string }).name : String(c)
        const type = (c as { type?: string; dataType?: string }).type ?? (c as { dataType?: string }).dataType
        return { name: n, type }
      }
      return { name: String(c) }
    })
    return [{ name: 'table', columns }]
  }

  // Array of tables
  if (Array.isArray(schema)) {
    return schema.map((t) => {
      if (t && typeof t === 'object' && 'name' in t) {
        const name = typeof (t as { name?: unknown }).name === 'string' ? (t as { name: string }).name : 'table'
        const cols = (t as { columns?: unknown[] }).columns
        const columns = Array.isArray(cols)
          ? cols.map((c) => {
              if (c && typeof c === 'object' && 'name' in c) {
                const n = typeof (c as { name?: unknown }).name === 'string' ? (c as { name: string }).name : String(c)
                const type = (c as { type?: string; dataType?: string }).type ?? (c as { dataType?: string }).dataType
                return { name: n, type }
              }
              return { name: String(c) }
            })
          : undefined
        return { name, columns }
      }
      return { name: 'table', columns: undefined }
    })
  }

  return []
}

type CompletionContext =
  | { type: 'table' }
  | { type: 'column'; tableName: string }
  | { type: 'default' }

/** Parse FROM/JOIN clauses and build alias (and table name) -> canonical table name */
function buildAliasMap(text: string, tables: SchemaTable[]): Map<string, string> {
  const map = new Map<string, string>()
  const normalized = text.replace(/\s+/g, ' ').replace(/\/\*[\s\S]*?\*\//g, '')
  const joinPattern =
    /(?:FROM|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|OUTER\s+JOIN|CROSS\s+JOIN|LEFT\s+OUTER\s+JOIN|RIGHT\s+OUTER\s+JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+(?:AS\s+)?([a-zA-Z_][a-zA-Z0-9_]*))?/gi
  let m: RegExpExecArray | null
  while ((m = joinPattern.exec(normalized)) !== null) {
    const tableRef = m[1]
    const alias = m[2]
    const tableLower = tableRef.toLowerCase()
    map.set(tableLower, tableRef)
    map.set(tableRef, tableRef)
    if (alias) {
      map.set(alias.toLowerCase(), tableRef)
      map.set(alias, tableRef)
    }
  }
  return map
}

/** Determine what to suggest at the current position */
function getCompletionContext(
  model: import('monaco-editor').editor.ITextModel,
  position: { lineNumber: number; column: number },
  aliasMap: Map<string, string>,
  tables: SchemaTable[]
): CompletionContext {
  const lineContent = model.getLineContent(position.lineNumber) ?? ''
  const textBeforeCursor = lineContent.slice(0, position.column - 1)
  const textUpToCursor = model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  })
  const tokens = textBeforeCursor.trim().split(/\s+/)
  const lastToken = tokens[tokens.length - 1]?.toUpperCase()

  if (lastToken === 'FROM' || lastToken === 'JOIN') {
    return { type: 'table' }
  }

  const afterDotMatch = textBeforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*$/)
  if (afterDotMatch) {
    const ref = afterDotMatch[1]
    const tableName = aliasMap.get(ref) ?? aliasMap.get(ref.toLowerCase())
    if (tableName) {
      return { type: 'column', tableName }
    }
    const tableNames = tables.map((t) => (typeof t?.name === 'string' ? t.name : String(t)))
    if (tableNames.some((n) => n === ref || n.toLowerCase() === ref.toLowerCase())) {
      return { type: 'column', tableName: ref }
    }
  }

  return { type: 'default' }
}

const TABLE_CONTEXT_KEYWORDS = ['ON', 'WHERE', 'AND', 'OR']

type MonacoApi = {
  languages: typeof import('monaco-editor').languages
  editor: typeof import('monaco-editor').editor
}

function registerSqlCompletions(monaco: MonacoApi, schema: unknown): () => void {
  const tables = parseSchema(schema)
  const disposable = monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' ', '\n', '\t'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const wordStart = word.startColumn
      const wordEnd = word.endColumn
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordStart,
        endColumn: wordEnd,
      }
      const currentWord = (model.getLineContent(position.lineNumber) || '').slice(wordStart - 1, wordEnd - 1).toUpperCase()
      const items: import('monaco-editor').languages.CompletionItem[] = []

      const textUpToCursor = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })
      const aliasMap = buildAliasMap(textUpToCursor, tables)
      const context = getCompletionContext(model, position, aliasMap, tables)

      const suggestKeywords = context.type === 'default' || (context.type === 'table' && TABLE_CONTEXT_KEYWORDS)
      const keywordsToUse = context.type === 'table' ? TABLE_CONTEXT_KEYWORDS : SQL_KEYWORDS

      if (suggestKeywords) {
        for (const kw of keywordsToUse) {
          if (!currentWord || kw.startsWith(currentWord) || currentWord.startsWith(kw)) {
            items.push({
              label: kw,
              kind: monaco.languages.CompletionItemKind.Keyword,
              detail: 'SQL keyword',
              insertText: kw,
              range,
            })
          }
        }
      }

      if (context.type === 'column') {
        const targetTable = context.tableName
        const table = tables.find(
          (t) =>
            (typeof t?.name === 'string' ? t.name : String(t)).toLowerCase() === targetTable.toLowerCase()
        )
        if (table?.columns && Array.isArray(table.columns)) {
          for (const c of table.columns) {
            const colName = typeof c?.name === 'string' ? c.name : String(c)
            const type = c?.type ?? c?.dataType
            const detail = type ? `${targetTable}.${colName} (${type})` : `${targetTable}.${colName}`
            items.push({
              label: colName,
              kind: monaco.languages.CompletionItemKind.Field,
              detail,
              insertText: colName,
              range,
            })
          }
        }
      } else {
        for (const t of tables) {
          const tableName = typeof t?.name === 'string' ? t.name : String(t)
          items.push({
            label: tableName,
            kind: monaco.languages.CompletionItemKind.Class,
            detail: 'Table',
            insertText: tableName,
            range,
          })
          if (context.type === 'default' && t.columns && Array.isArray(t.columns)) {
            for (const c of t.columns) {
              const colName = typeof c?.name === 'string' ? c.name : String(c)
              const type = c?.type ?? c?.dataType
              const detail = type ? `${tableName}.${colName} (${type})` : `${tableName}.${colName}`
              items.push({
                label: colName,
                kind: monaco.languages.CompletionItemKind.Field,
                detail,
                insertText: colName,
                range,
              })
            }
          }
        }
      }

      // Deduplicate by stable key (label for keywords/tables, label + detail for columns)
      const seen = new Set<string>()
      const deduped = items.filter((item) => {
        const labelStr = typeof item.label === 'string' ? item.label : (item.label as { label: string }).label
        const detailStr =
          item.detail === undefined
            ? ''
            : typeof item.detail === 'string'
              ? item.detail
              : String((item.detail as { detail?: string }).detail ?? '')
        const key = detailStr ? `${labelStr}\0${detailStr}` : labelStr
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      return { suggestions: deduped }
    },
  })
  return () => disposable.dispose()
}

export const SqlEditor: FC = () => {
  // 1. Content / data
  const [value, setValue] = Retool.useStateString({
    name: 'value',
    label: 'Value',
    description: 'The SQL query text. Bind to run or save (e.g. {{ components.SqlEditor1.value }}).',
  })

  const [placeholder] = Retool.useStateString({
    name: 'placeholder',
    label: 'Placeholder',
    description: 'Placeholder text when the editor is empty.',
  })

  // 2. Schema
  const [schemaSource] = Retool.useStateEnumeration({
    name: 'schemaSource',
    enumDefinition: ['none', 'schema', 'schemaJson'],
    initialValue: 'schema',
    inspector: 'segmented',
    label: 'Schema source',
    description: 'Where to read schema from: None (keywords only), Schema (object), or Schema JSON (string).',
  })

  const [schema] = Retool.useStateObject({
    name: 'schema',
    label: 'Schema (object)',
    description:
      'Bind a query or state that returns tables and columns for autocomplete. Shape: { tables: [ { name: "tableName", columns: [ { name: "columnName", type: "dataType" } ] } ] }. You can also pass { columns: [...] } for a single table or an array of tables.',
  })

  const [schemaJson] = Retool.useStateString({
    name: 'schemaJson',
    label: 'Schema (string)',
    description:
      'Same shape as Schema, as a JSON string. Use when your source is text (e.g. {{ JSON.stringify(schemaQuery.data) }}). Ignored when Schema source is not "Schema JSON".',
  })

  const [schemaLoading] = Retool.useStateBoolean({
    name: 'schemaLoading',
    initialValue: false,
    inspector: 'checkbox',
    label: 'Schema loading',
    description: 'Set to true while the schema query is loading (e.g. {{ schemaQuery.isLoading }}). Shows "Loading…" in the status.',
  })

  // 3. Layout / dimensions
  const [heightMode] = Retool.useStateEnumeration({
    name: 'heightMode',
    enumDefinition: ['inherit', 'fixed'],
    enumLabels: { inherit: 'Inherit from layout', fixed: 'Fixed (px)' },
    initialValue: 'inherit',
    inspector: 'segmented',
    label: 'Height',
    description:
      "Inherit from layout: fill height from Retool's component spacing (Spacing → Height: Fixed). Fixed: use the Fixed height (px) value below.",
  })

  const [height, setHeight] = Retool.useStateNumber({
    name: 'height',
    initialValue: 300,
    label: 'Fixed height (px)',
    description: 'Editor height in pixels. Only used when Height is set to Fixed (px).',
  })

  const [resizable] = Retool.useStateBoolean({
    name: 'resizable',
    initialValue: false,
    inspector: 'checkbox',
    label: 'Resizable',
    description: 'Show a drag handle at the bottom to resize the editor. Only applies when Height is Fixed (px).',
  })

  const [minHeight] = Retool.useStateNumber({
    name: 'minHeight',
    initialValue: 120,
    inspector: 'hidden',
    label: 'Min height',
    description: 'Minimum editor height when resizable (px).',
  })

  const [maxHeight] = Retool.useStateNumber({
    name: 'maxHeight',
    initialValue: 800,
    inspector: 'hidden',
    label: 'Max height',
    description: 'Maximum editor height when resizable (px).',
  })

  const inheritHeight = heightMode === 'inherit'

  const [editorPadding] = Retool.useStateNumber({
    name: 'editorPadding',
    initialValue: 8,
    label: 'Editor padding',
    description: 'Vertical padding inside the editor (px).',
  })

  const [borderRadius] = Retool.useStateNumber({
    name: 'borderRadius',
    initialValue: 4,
    label: 'Border radius',
    description: 'Container border radius in pixels.',
  })

  // 4. Editor appearance
  const [theme] = Retool.useStateEnumeration({
    name: 'theme',
    enumDefinition: ['light', 'dark', 'retool'],
    initialValue: 'light',
    inspector: 'segmented',
    label: 'Theme',
    description: 'Editor theme: light, dark, or retool (follows Retool app theme).',
  })

  const [fontFamily] = Retool.useStateString({
    name: 'fontFamily',
    label: 'Font family',
    description: 'Editor font family (e.g. "Menlo", "Fira Code"). Empty uses Monaco default.',
  })

  const [fontSize] = Retool.useStateNumber({
    name: 'fontSize',
    initialValue: 13,
    label: 'Font size',
    description: 'Editor font size in pixels.',
  })

  const [showLineNumbers] = Retool.useStateBoolean({
    name: 'showLineNumbers',
    initialValue: true,
    inspector: 'checkbox',
    label: 'Show line numbers',
    description: 'Show line numbers in the gutter.',
  })

  const [wordWrap] = Retool.useStateBoolean({
    name: 'wordWrap',
    initialValue: true,
    inspector: 'checkbox',
    label: 'Word wrap',
    description: 'Wrap long lines.',
  })

  const [showBorder] = Retool.useStateBoolean({
    name: 'showBorder',
    initialValue: true,
    inspector: 'checkbox',
    label: 'Show border',
    description: 'Show a border around the editor.',
  })

  // 5. Behavior
  const [suggestOnFocus] = Retool.useStateBoolean({
    name: 'suggestOnFocus',
    initialValue: false,
    inspector: 'checkbox',
    label: 'Suggest on focus',
    description: 'Show autocomplete when the editor gains focus (otherwise use Ctrl+Space).',
  })

  const [monacoInstance, setMonacoInstance] = useState<MonacoApi | null>(null)
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null)
  const [resizing, setResizing] = useState(false)
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null)
  const [retoolDetectedTheme, setRetoolDetectedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    if (theme !== 'retool' || typeof document === 'undefined') return
    const detect = () => {
      const el = document.querySelector('[data-theme]')
      const attr = el?.getAttribute('data-theme')
      const cssVar = typeof getComputedStyle !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--retool-theme').trim().toLowerCase() : ''
      const v = (attr || cssVar || 'light').toLowerCase()
      setRetoolDetectedTheme(v === 'dark' ? 'dark' : 'light')
    }
    detect()
  }, [theme])

  Retool.useComponentSettings({
    defaultWidth: 8,
    defaultHeight: 10,
  })

  // Resolve schema from schemaSource: none → no schema, schema → object, schemaJson → parse string
  const resolvedSchema =
    schemaSource === 'none'
      ? null
      : schemaSource === 'schemaJson'
        ? (() => {
            if (schemaJson && typeof schemaJson === 'string' && schemaJson.trim() !== '') {
              try {
                return JSON.parse(schemaJson) as unknown
              } catch {
                return null
              }
            }
            return null
          })()
        : schema

  useEffect(() => {
    if (!monacoInstance) return
    const dispose = registerSqlCompletions(monacoInstance, resolvedSchema)
    return () => dispose()
  }, [monacoInstance, resolvedSchema])

  const effectiveTheme = theme === 'retool' ? retoolDetectedTheme : theme === 'dark' ? 'dark' : 'light'

  useEffect(() => {
    if (!monacoInstance) return
    const themeName = effectiveTheme === 'dark' ? 'vs-dark' : 'vs'
    monacoInstance.editor.setTheme(themeName)
  }, [monacoInstance, effectiveTheme])

  // Resize handle: mouse move/up listeners
  useEffect(() => {
    if (!resizing) return
    const min = minHeight ?? 120
    const max = maxHeight ?? 800
    const onMove = (e: MouseEvent) => {
      const start = resizeStartRef.current
      if (!start) return
      const delta = e.clientY - start.y
      const next = Math.min(max, Math.max(min, start.height + delta))
      setHeight(next)
    }
    const onUp = () => {
      setResizing(false)
      resizeStartRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [resizing, minHeight, maxHeight, setHeight])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    const currentHeight = height ?? DEFAULT_HEIGHT
    resizeStartRef.current = { y: e.clientY, height: currentHeight }
    setResizing(true)
  }

  const handleEditorMount = (
    editor: import('monaco-editor').editor.IStandaloneCodeEditor,
    monaco: MonacoApi
  ) => {
    setMonacoInstance(monaco)
    editorRef.current = editor
    if (suggestOnFocus) {
      setTimeout(() => {
        editor.trigger('keyboard', 'editor.action.triggerSuggest', {})
      }, 100)
    }
  }

  const monacoTheme = effectiveTheme === 'dark' ? 'vs-dark' : 'vs'
  const isEmpty = value == null || String(value).trim() === ''

  const schemaTables = parseSchema(resolvedSchema)
  const schemaStatusMessage =
    schemaSource === 'none'
      ? null
      : schemaLoading
        ? 'Loading…'
        : schemaTables.length === 0
          ? 'No schema'
          : `Schema: ${schemaTables.length} table(s)`

  const statusBarHeight = schemaStatusMessage ? 18 : 0
  const rootHeightStyle = inheritHeight
    ? { height: '100%' as const, minHeight: 120 + statusBarHeight }
    : { minHeight: Math.max(120, height || DEFAULT_HEIGHT) + statusBarHeight }

  return (
    <div
      style={{
        width: '100%',
        ...rootHeightStyle,
        position: 'relative',
        borderRadius: borderRadius,
        border: showBorder ? `1px solid ${effectiveTheme === 'dark' ? '#444' : '#d9d9d9'}` : 'none',
        overflow: 'hidden',
        backgroundColor: effectiveTheme === 'dark' ? '#1e1e1e' : '#fff',
      }}
    >
      {isEmpty && placeholder ? (
        <div
          style={{
            position: 'absolute',
            left: showLineNumbers ? 40 : 10,
            top: editorPadding + 10,
            pointerEvents: 'none',
            color: effectiveTheme === 'dark' ? '#6a6a6a' : '#999',
            fontSize: fontSize,
            fontFamily: fontFamily?.trim() ? fontFamily : 'var(--monaco-font-family, "Menlo", monospace)',
          }}
        >
          {placeholder}
        </div>
      ) : null}
      <Editor
        height={height ? `${height}px` : `${DEFAULT_HEIGHT}px`}
        language="sql"
        theme={monacoTheme}
        value={value ?? ''}
        onChange={(v) => setValue(v ?? '')}
        onMount={handleEditorMount}
        options={{
          minimap: { enabled: false },
          fontFamily: fontFamily && fontFamily.trim() ? fontFamily : undefined,
          fontSize,
          lineNumbers: showLineNumbers ? 'on' : 'off',
          scrollBeyondLastLine: false,
          wordWrap: wordWrap ? 'on' : 'off',
          automaticLayout: true,
          padding: { top: editorPadding, bottom: editorPadding },
        }}
      />
      {resizable && !inheritHeight ? (
        <div
          role="separator"
          aria-label="Resize editor"
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            bottom: schemaStatusMessage ? 22 : 0,
            left: 0,
            right: 0,
            height: 8,
            cursor: 'ns-resize',
            backgroundColor: 'transparent',
          }}
        />
      ) : null}
      {schemaStatusMessage ? (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 18,
            paddingLeft: 8,
            paddingRight: 8,
            fontSize: 11,
            lineHeight: '18px',
            color: effectiveTheme === 'dark' ? '#858585' : '#666',
            backgroundColor: effectiveTheme === 'dark' ? '#252526' : '#f3f3f3',
            borderTop: effectiveTheme === 'dark' ? '1px solid #444' : '1px solid #e0e0e0',
          }}
        >
          {schemaStatusMessage}
        </div>
      ) : null}
    </div>
  )
}
