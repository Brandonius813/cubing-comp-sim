# Automatic Cloudflare Workers deployment

Status: October 9, 2026. Brandon reports a Cloudflare account with MFA and a manually uploaded static guest preview at https://morning-base-55f2.btrue813.workers.dev/. This is a Worker with static assets. Brandon reports adding the GitHub repository secret and account variable. Automated authentication and deployment have not yet been verified.

## Configure access to the existing Worker

1. In Cloudflare, select the account owning the preview and open **Manage Account > Account API Tokens > Create Token**.
2. Name the token `GitHub guest preview deployment`. Grant the Workers **Editor** role scoped to the existing `morning-base-55f2` Worker. Current Workers permissions support tokens limited to individual Workers; Editor permits deploying an existing Worker.
3. Brandon's dashboard displayed **My Profile > API Tokens > Create Custom Token**, with legacy permission dropdowns. On that form, create a custom token with **Account > Workers Scripts > Edit** and **Account > Account Settings > Read**. Under **Account Resources**, select **Include > Specific account** and choose the account owning the Worker. Legacy Workers Scripts permissions remain supported and grant access across the selected account.
4. Leave client IP filtering empty for GitHub-hosted runners. Copy the token directly into GitHub **Settings > Secrets and variables > Actions > Secrets > New repository secret**, named `CLOUDFLARE_API_TOKEN`. Do not put the value in source, chat, or workflow logs.
5. In Cloudflare, press Command/Control-K, search for **Copy account ID**, and copy it. Workers & Pages also displays the account ID under Account Details.
6. In GitHub's **Variables** tab on the same Actions settings page, create `CLOUDFLARE_ACCOUNT_ID` with the copied account ID.

An account ID identifies the destination account and grants no access by itself. The token provides authorization. A Pages-only token cannot deploy this Worker. The broader Edit Cloudflare Workers template includes permissions for other services; the existing static preview only needs Workers deployment access.

Add the secret before the account variable. The deployment job is skipped while `CLOUDFLARE_ACCOUNT_ID` is absent. Once that variable exists, missing or invalid credentials fail the deployment job with a setup error.

The public Worker name is versioned in `wrangler.json`; no Pages project variable is needed. Preserve `morning-base-55f2` to keep the current hostname and browser origin.

## How the pipeline works

The existing **Desktop web checks** workflow builds the TNoodle engine and UI and runs application, integrity, and Chromium/Firefox/WebKit tests. It also runs a Wrangler dry run to validate the static deployment configuration without publishing.

A separate deployment job depends on those checks succeeding. It downloads `desktop-web-evidence` from the same workflow run, including the tested `dist/` and `wrangler.json`. It confirms the Worker exists in the selected account, then invokes `wrangler deploy --config verified/wrangler.json` through Cloudflare's official action.

Deployment runs only for pushes to `main` or a manual workflow run on `main`. Pull-request runs test changes without publishing. Push path filters include the app, build, workflow and Wrangler configuration; documentation-only changes do not automatically rebuild and deploy.

The Worker serves static files directly. No custom server-side Worker script is introduced. The single-page application fallback serves `index.html` for app routes. The existing `_headers` file is included in the Vite build and is supported by Workers static assets.

The same Worker name and account preserve the current `.workers.dev` address. This does not change domain DNS. The Java/Maven TNoodle compilation stays in the GitHub Actions environment already testing it; Cloudflare receives its compiled output.

Wrangler 4 is installed in CI. Local Wrangler installation is not required.

## First automatic deployment and verification

1. Configure the secret and account variable.
2. Merge the reviewed deployment pull request into `main`. Its workflow change triggers the build and deployment.
3. In **Actions > Desktop web checks**, verify that both the web job and **Deploy guest preview to Cloudflare Workers** succeed.
4. Open https://morning-base-55f2.btrue813.workers.dev/ and check the app on an actual device.
5. To redeploy later without a code change, choose **Run workflow** under Desktop web checks and select `main`. This rebuilds and reruns checks before uploading.

A failed web job prevents publishing. A failed upload does not establish a new successful deployment. After correcting credentials, use **Run workflow** to retry. Record the successful automated run and perform device checks before marking setup complete.

## References

- [Workers deployment from GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Workers roles and permissions](https://developers.cloudflare.com/workers/authorization/workers/)
- [Workers static assets](https://developers.cloudflare.com/workers/static-assets/get-started/)
- [Workers static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Cloudflare API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [Find the Cloudflare account ID](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/)
- [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
