# Deployment

Warpgrid is packaged as a Node/Vite container. The image builds the static app
with `npm run build`, then serves the built `dist` directory through
`vite preview` on port `4173`.

This keeps the deployment close to the current Vite app while leaving room to
add backend services later in Docker Compose.

## Local Docker Run

Build and run the image locally:

```bash
docker build -t warpgrid .
docker run --rm -p 4173:4173 warpgrid
```

Open `http://localhost:4173`.

## Local Docker Compose

```bash
cp .env.example .env
docker compose up -d --build
```

The default host port is `4173`. Change `WARPGRID_PORT` in `.env` if the port is
already in use.

## GitHub Actions Auto Deploy

The workflow in `.github/workflows/deploy.yml` runs on every push to `main` and
can also be started manually from GitHub Actions.

It performs these steps:

1. Install dependencies with `npm ci`.
2. Run `npm test`.
3. Run `npm run build`.
4. Build and push Docker images to GitHub Container Registry:
   `ghcr.io/<owner>/<repo>:latest` and `ghcr.io/<owner>/<repo>:<commit-sha>`.
5. SSH into the deployment server, write/update `docker-compose.yml`, pull the
   new image, and restart the service.

### Required Repository Secrets

Set these in GitHub: `Settings` -> `Secrets and variables` -> `Actions`.

| Secret | Description |
|---|---|
| `DEPLOY_HOST` | Server IP or hostname |
| `DEPLOY_USER` | SSH user on the server |
| `DEPLOY_SSH_KEY` | Private SSH key used by GitHub Actions |
| `DEPLOY_PORT` | Optional SSH port; defaults to `22` |
| `GHCR_TOKEN` | Optional PAT with `read:packages`; useful if the GHCR package is private |

If `GHCR_TOKEN` is not set, the workflow uses `GITHUB_TOKEN` during the deploy
job. For private packages, a PAT with `read:packages` is usually more reliable
for server-side image pulls.

### Optional Repository Variables

Set these under `Settings` -> `Secrets and variables` -> `Actions` ->
`Variables`.

| Variable | Default | Description |
|---|---:|---|
| `DEPLOY_PATH` | `/opt/warpgrid` | Directory on the server for the generated Compose file |
| `APP_PORT` | `4173` | Host port exposed by Docker Compose |

## Server Preparation

Install Docker and the Compose plugin on the server, then make sure the deploy
user can run Docker commands.

Example for Ubuntu:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker <deploy-user>
```

Log out and back in after changing the user's Docker group membership.

For a reverse proxy, forward your domain to `http://127.0.0.1:4173`.
