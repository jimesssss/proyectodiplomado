# Render deployment

## API service configuration
- Platform: Render Web Service
- Runtime: Node
- Root directory: `apps/api` if the API is deployed separately from the monorepo
- Build command: `cd apps/api && npm install && npm run build`
- Start command: `cd apps/api && npm run start`
- Health check path: `/api/v1/health` or `/health` depending on the final API convention

## Required environment variables
- `NODE_ENV=production`
- `PORT=10000`
- `MONGODB_URI=<MongoDB Atlas connection string>`
- `JWT_ACCESS_SECRET=<secret>`
- `JWT_REFRESH_SECRET=<secret>`
- `CORS_ORIGINS=https://your-web-app.example.com`
- `LOG_LEVEL=info`

## Deploy flow
1. Push to the GitHub branch connected to Render.
2. Render reads the repo and executes the build command.
3. If TypeScript or startup checks fail, fix the root cause and redeploy.
4. Confirm `/health` and the main API routes return `2xx` responses.

## Rollback
- Use the Render dashboard to redeploy the last successful build.
- Keep `.env` and production secrets only in Render's secret environment variables.
