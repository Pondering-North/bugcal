# Deploying BugCal to Google Cloud Run

## What you'll need
- A Google Cloud account (free tier works — Cloud Run has a generous free quota)
- [Google Cloud CLI (`gcloud`)](https://cloud.google.com/sdk/docs/install) installed
- An [Anthropic API key](https://console.anthropic.com/)
- Docker installed (only needed if you want to test locally first)

---

## Part 1 — One-time setup

### 1. Install the Google Cloud CLI

```bash
# macOS (Homebrew)
brew install google-cloud-sdk

# Or download the installer:
# https://cloud.google.com/sdk/docs/install
```

### 2. Log in and create a project

```bash
gcloud auth login

# Create a new project (or use an existing one)
gcloud projects create bugcal-app --name="BugCal"

# Set it as your active project
gcloud config set project bugcal-app
```

### 3. Enable the required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

---

## Part 2 — Deploy to Cloud Run

Cloud Run can build and deploy directly from your source folder —
no local Docker required.

### Option A: Deploy straight from source (easiest)

```bash
cd bugcal/

gcloud run deploy bugcal \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
```

Cloud Build compiles your Docker image automatically. After a minute or two
you'll see a URL like:

```
Service URL: https://bugcal-abc123-uc.a.run.app
```

Open that URL — BugCal is live. ✅

---

### Option B: Build and push the image yourself (more control)

```bash
# 1. Create an Artifact Registry repo to store your image
gcloud artifacts repositories create bugcal-repo \
  --repository-format=docker \
  --location=us-central1

# 2. Configure Docker to use gcloud credentials
gcloud auth configure-docker us-central1-docker.pkg.dev

# 3. Build and push
docker build -t us-central1-docker.pkg.dev/bugcal-app/bugcal-repo/bugcal:latest .
docker push us-central1-docker.pkg.dev/bugcal-app/bugcal-repo/bugcal:latest

# 4. Deploy
gcloud run deploy bugcal \
  --image us-central1-docker.pkg.dev/bugcal-app/bugcal-repo/bugcal:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
```

---

## Part 3 — Storing your API key securely (recommended)

Passing secrets via `--set-env-vars` is fine for testing but Google recommends
Secret Manager for production.

```bash
# 1. Create the secret
echo -n "sk-ant-YOUR_KEY_HERE" | \
  gcloud secrets create anthropic-api-key --data-file=-

# 2. Grant Cloud Run access to it
gcloud secrets add-iam-policy-binding anthropic-api-key \
  --member="serviceAccount:$(gcloud projects describe bugcal-app \
    --format='value(projectNumber)')-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# 3. Redeploy referencing the secret instead of a raw value
gcloud run deploy bugcal \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --update-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest
```

---

## Part 4 — Test locally with Docker first (optional)

```bash
# Build the image
docker build -t bugcal .

# Run it locally
docker run -p 8080:8080 \
  -e ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE \
  bugcal

# Open http://localhost:8080
```

---

## Part 5 — Updating the app

Every time you change the code, redeploy with the same command:

```bash
gcloud run deploy bugcal \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --update-secrets ANTHROPIC_API_KEY=anthropic-api-key:latest
```

Cloud Run keeps the old revision running until the new one is healthy,
so there's zero downtime.

---

## Part 6 — Custom domain (optional)

```bash
# Map your domain
gcloud run domain-mappings create \
  --service bugcal \
  --domain calendar.yourdomain.com \
  --region us-central1
```

Then add the DNS records it prints to your domain registrar.
HTTPS is provisioned automatically.

---

## Costs

Cloud Run pricing on the free tier:
- **2 million requests/month** free
- **360,000 vCPU-seconds** free
- **180,000 GB-seconds** of memory free

For personal use BugCal will almost certainly stay within the free tier.
The Anthropic API is separate — you pay per token used by the AI agents.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Permission denied` on deploy | Run `gcloud auth login` again |
| `API not enabled` error | Re-run the `gcloud services enable` command |
| App loads but AI features don't work | Check `ANTHROPIC_API_KEY` is set: `gcloud run services describe bugcal --region us-central1` |
| Want to see server logs | `gcloud run services logs read bugcal --region us-central1` |
| Rollback to previous version | `gcloud run services update-traffic bugcal --to-revisions PREV_REVISION=100 --region us-central1` |
