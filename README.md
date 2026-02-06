## Custom component libraries template

Use this as a base for new custom component library projects within [Retool](https://www.retool.com).

To learn more about how custom component libraries work, visit our [official documentation](https://docs.retool.com/apps/guides/custom/custom-component-libraries).

### SQL Editor component

This library includes an **SqlEditor** component: an SQL editor with syntax highlighting (Monaco) and optional schema-based autocomplete.

- **Value** (string): The SQL query text. Use `{{ components.SqlEditor1.value }}` in a Retool query or state to run or save the query.
- **Schema** (object, optional): For table/column autocomplete, pass a JSON object:  
  `{ "tables": [{ "name": "users", "columns": [{ "name": "id", "type": "int" }, { "name": "email", "type": "text" }] }] }`
- **Height** (number, optional): Editor height in pixels (default 300).

After running `npx retool-ccl init` and `npx retool-ccl deploy`, add the component from the Component Library and bind your database query’s SQL to the component’s **value**.

### Schema transformer

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

Wire the transformer’s output to the SqlEditor’s **Schema** prop so autocomplete uses your database schema.
