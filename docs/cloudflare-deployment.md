# Automatic Cloudflare Pages deployment

Status: October 9, 2026. Brandon reports a Cloudflare account with MFA and a manually uploaded guest preview. The exact project name, hosted URL, and account ID have not been recorded. This workflow proposal is not evidence that credentials have been configured or that an automated deployment has succeeded.

## Configure the existing Pages project

These instructions apply to a Pages project with a `.pages.dev` address. A Worker with a `.workers.dev` address uses a different deployment command and token permission.

1. In Cloudflare, open **My Profile > API Tokens > Create Token > Create Custom Token**.
2. Name the token `GitHub Pages deployment`. Set **Account > Cloudflare Pages > Edit**, with **Account Resources > Include > Specific account** set to the account owning the preview. Leave client IP filtering empty for GitHub-hosted runners.
3. Copy the token directly into GitHub **Settings > Secrets and variables > Actions > Secrets > New repository secret**, named `CLOUDFLARE_API_TOKEN`. Do not put the value in source, chat, or workflow logs.
4. In Cloudflare, press Command/Control-K, search for **Copy account ID**, and copy it. Workers & Pages also displays the account ID under Account Details.
5. In GitHub's **Variables** tab on the same Actions settings page, add the following repository variables:

| Name | Value |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | The account ID copied from Cloudflare |
| `CLOUDFLARE_PAGES_PROJECT` | The exact existing Pages project name, without a URL or `.pages.dev` |

An account ID identifies the destination account. It grants no access by itself. The token provides authorization and grants Pages edit access across the selected account; it is not restricted to a single Pages project.

Add the secret before enabling deployment with the project variable. The deployment job is skipped while `CLOUDFLARE_PAGES_PROJECT` is absent. Once that variable exists, missing or invalid credentials fail the deployment job with a setup error.

## How the pipeline works

The existing **Desktop web checks** workflow builds the TNoodle engine and UI and runs application, integrity, and Chromium/Firefox/WebKit tests. A separate deployment job depends on that job succeeding and downloads `desktop-web-evidence` from the same workflow run. It publishes only the artifact's `dist/` folder.

Deployment runs only for pushes to `main` or a manual workflow run on `main`. Pull-request runs test the changes without publishing. The existing push path filters remain in effect, so documentation-only changes do not automatically rebuild and deploy the app.

The deployment job queries Cloudflare for the existing project's production branch, then tells Wrangler to deploy to that branch. This updates the project's existing base `.pages.dev` address even if the first drag-and-drop upload used a production branch other than `main`. It does not create another project or change domain DNS.

The word **production** here refers to the existing guest-preview project's primary deployment slot. Publishing the final app at `cubingcompsim.com` still requires the separate release steps.

Wrangler 4 is installed in the deployment job by Cloudflare's official action. Local Wrangler installation is not required to use this pipeline.

## First automatic deployment and verification

1. Configure the secret and both variables.
2. Merge the reviewed deployment pull request into `main`. Its workflow change triggers the build and deployment.
3. In **Actions > Desktop web checks**, verify that both the web job and **Deploy guest preview to Cloudflare Pages** succeed.
4. Open the existing Pages URL and check the app on the actual device.
5. To redeploy later without a code change, choose **Run workflow** under Desktop web checks and select `main`. This rebuilds and reruns checks before uploading.

A failed web job prevents publishing. A failed upload leaves the previous successful deployment available. After credentials are corrected, use **Run workflow** to retry. Record the canonical URL and the successful automated run before marking setup complete.

## References

- [Cloudflare Direct Upload from CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [Cloudflare API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [Find the Cloudflare account ID](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/)
- [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
