# NORDVEX CHARTING

Private multi-market charting and market-intelligence platform.

## Monorepo
- `apps/web`: React + Vite frontend
- `apps/api`: Node.js HTTP API
- Railway PostgreSQL: persistent application data

## Development
Run each app from its directory with `npm install` then `npm run dev`.

No API credentials belong in source control. Configure secrets as Railway service variables.
