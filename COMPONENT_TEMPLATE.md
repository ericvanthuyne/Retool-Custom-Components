# Component Template Guide

This guide helps you create a new component in this monorepo.

## Quick Start

1. **Create component directory:**
   ```bash
   mkdir -p components/my-component-name
   ```

2. **Copy template files:**
   ```bash
   cp -r components/sql-editor/* components/my-component-name/
   ```

3. **Update `package.json`:**
   - Change `name` to `@ericvanthuyne/retool-<component-name>`
   - Update `version` to `1.0.0`
   - Update `retoolCustomComponentLibraryConfig`:
     - `name`: Component name (e.g., "My Component")
     - `label`: Display label
     - `description`: Component description

4. **Update `src/index.tsx`:**
   - Export your component: `export { MyComponent } from './MyComponent'`

5. **Create your component:**
   - Create `src/MyComponent.tsx` with your component code
   - Use `@tryretool/custom-component-support` for Retool integration

6. **Update root README.md:**
   - Add your component to the Components section
   - Include installation instructions

7. **Update component README.md:**
   - Document your component's props and usage

## Component Structure

```
components/my-component/
├── src/
│   ├── index.tsx          # Export your component
│   └── MyComponent.tsx    # Your component code
├── dist/                  # Build output (gitignored)
├── package.json           # Component package config
├── README.md              # Component documentation
├── tsconfig.json          # TypeScript config
├── .eslintrc.json         # ESLint config
├── .prettierrc            # Prettier config
└── css-modules.d.ts       # CSS modules types
```

## Development

```bash
# Navigate to your component
cd components/my-component

# Install dependencies (from root)
npm install

# Run dev mode
npm run dev

# Deploy to Retool
npm run deploy
```

## Publishing

```bash
cd components/my-component
npm publish
```

Make sure you're logged into npm: `npm login`

## Tips

- Use TypeScript for type safety
- Follow the existing code style (Prettier + ESLint)
- Document all props in the README
- Test your component in Retool before publishing
- Version your component independently (semantic versioning)
