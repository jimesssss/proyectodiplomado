# Environment configuration

This project uses separate configuration by environment.

## Development
- `NODE_ENV=development`
- `PORT=3000` or local API port
- `MONGODB_URI` points to a local MongoDB or Atlas development database
- `CORS_ORIGINS` includes `http://localhost:*` and local web hosts
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be local-secret values
- public client values such as `API_BASE_URL` stay in the app env file

## Production
- `NODE_ENV=production`
- `PORT` is provided by Render automatically
- `MONGODB_URI` is a secret stored in Render, never in Git
- `CORS_ORIGINS` contains the exact production web origins
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are secure production secrets

## Public vs private values

Public / safe for mobile/web:
- `API_BASE_URL`
- `EXPO_PUBLIC_API_BASE_URL`
- `WEB_API_BASE_URL`

Private / server only:
- `MONGODB_URI`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- any admin credentials or private internal keys

Never commit `.env`, `.env.local`, `.env.production`, or any Android signing material to Git.
