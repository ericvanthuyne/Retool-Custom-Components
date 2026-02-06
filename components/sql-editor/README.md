# SQL Editor

An SQL editor component for Retool with syntax highlighting (Monaco) and optional schema-based autocomplete.

## Installation

```bash
npm install @ericvanthuyne/retool-sql-editor
```

## Usage

After installing and deploying (`npx retool-ccl deploy`), add the component from the Component Library in Retool.

### Props

- **Value** (string): The SQL query text. Use `{{ components.SqlEditor1.value }}` in a Retool query or state to run or save the query.
- **Schema** (object, optional): For table/column autocomplete, pass a JSON object:  
  `{ "tables": [{ "name": "users", "columns": [{ "name": "id", "type": "int" }, { "name": "email", "type": "text" }] }] }`
- **Height** (number, optional): Editor height in pixels (default 300).
- **Theme** (enum): Editor theme - `light`, `dark`, or `retool` (follows Retool app theme).
- **Show Line Numbers** (boolean): Show line numbers in the editor (default: true).
- **Resizable** (boolean): Show a drag handle to resize the editor (default: false).

## Schema Transformer

If your schema comes from a query that returns one row per column (e.g. `table_name`, `column_name`, `data_type`), use this transformer in a Retool **Transformer** to convert it into the format expected by the Schema input:

```javascript
const rows = formatDataAsArray(data);

// Group columns by table name
const tableMap = {};

rows.forEach(row => {
  const tableName = row.table_name;
  
  if (!tableMap[tableName]) {
    tableMap[tableName] = {
      name: tableName,
      columns: []
    };
  }
  
  tableMap[tableName].columns.push({
    name: row.column_name,
    type: row.data_type
  });
});

// Convert map to array
const tables = Object.values(tableMap);

return { tables };
```

Wire the transformer's output to the SqlEditor's **Schema** prop so autocomplete uses your database schema.

## Development

```bash
# Install dependencies
npm install

# Run dev mode
npm run dev

# Deploy to Retool
npm run deploy
```

## License

MIT
