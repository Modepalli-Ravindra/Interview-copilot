# CI/CD Guide: Automated Pipelines & Deployment Gates

## 1. Automated Delivery Pipeline
The platform uses automated CI/CD pipelines (via GitHub Actions) to run checks, compile code, build Docker images, and deploy services to staging and production environments.

```mermaid
graph TD
    CodePush[Code Push / PR open] --> Lint[Step 1: Lint & Format check]
    Lint --> Test[Step 2: Run Unit & Integration tests]
    Test --> Build[Step 3: Compile assets & Build Docker]
    
    Build --> DeployStaging[Step 4: Deploy to Staging env]
    DeployStaging --> E2E[Step 5: Run Playwright E2E checks]
    
    E2E --> Gate{Manual Approval & Error Signals?}
    Gate -->|Approved| DeployProd[Step 6: Deploy to Prod env]
    Gate -->|Rejected| Rollback[Automatic Rollback to last stable]
```

---

## 2. GitHub Actions Workflow Configuration
Create the following workflow configuration file at `.github/workflows/deploy.yml`:

```yaml
name: Enterprise Build & Deploy Pipeline

on:
  push:
    branches: [ main, staging ]
  pull_request:
    branches: [ main, staging ]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 20.x
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Run Linter & Formatter
        run: npm run lint

      - name: Run Unit Tests
        run: npm run test

  deploy-staging:
    needs: validate
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Railway Staging
        uses: bervProject/railway-deploy@v1
        with:
          railway_token: ${{ secrets.RAILWAY_STAGING_TOKEN }}

  deploy-production:
    needs: validate
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Railway Production
        uses: bervProject/railway-deploy@v1
        with:
          railway_token: ${{ secrets.RAILWAY_PROD_TOKEN }}
```

---

## 3. Production Deployment Gates & Rollbacks
*   **Manual Gates:** Deployments to production must be approved by at least one lead engineer in the GitHub repository.
*   **Canary Deployments:** Production builds are rolled out gradually, routing 10% of user traffic to the new version initially and increasing volume over one hour.
*   **Automated Rollback Rules:** The gateway monitors system error logs. If the error rate spikes above 2% or API latency increases by more than 20% during rollout, the deployment is canceled and traffic is routed back to the last stable version.
*   **Pipeline Secrets:** Sensitive credentials (such as API tokens and certificates) are stored in GitHub Secrets and injected into container contexts during build steps.
