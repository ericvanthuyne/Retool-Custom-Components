# Retool Custom Components

A collection of custom Retool components published as individual npm packages.

## Components

### [SQL Editor](./components/sql-editor)
An SQL editor with syntax highlighting (Monaco) and schema-based autocomplete.

**Install:** `npm install @ericvanthuyne/retool-sql-editor`

## Adding a New Component

1. Create a new directory in `components/` (e.g., `components/my-component`)
2. Copy the structure from an existing component (use `sql-editor` as a template)
3. Update `package.json` with your component's details:
   - Set `name` to `@ericvanthuyne/retool-<component-name>`
   - Update `retoolCustomComponentLibraryConfig` with your component info
4. Export your component from `src/index.tsx`
5. Update this README to include your new component

## Development

```bash
# Install dependencies for all components
npm install

# Run dev mode for a specific component
cd components/sql-editor
npm run dev

# Deploy a component
cd components/sql-editor
npm run deploy
```

## Publishing

Each component is published independently to npm:

```bash
cd components/sql-editor
npm publish
```

Make sure you're logged into npm: `npm login`

## License

MIT
