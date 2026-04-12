# Wei Studio

Static browser app for drawing bubble markup, first-pass dimension scanning, manual correction, and iterative Qwen reruns.

## GitHub Pages

This repo is ready to deploy on GitHub Pages through the included workflow:

- [deploy-pages.yml](./.github/workflows/deploy-pages.yml)

### First-time setup

1. Push this repository to GitHub.
2. In the GitHub repo, open `Settings` > `Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.
4. Push to `main`, or manually run the `Deploy GitHub Pages` workflow.

After deployment, the site URL will look like:

- `https://<github-username>.github.io/<repo-name>/`

The app uses relative asset paths, so it works correctly from a repo subpath on GitHub Pages.

## Local Preview

You can preview locally in either of these ways:

- Double-click [serve.command](./serve.command)
- Run `python3 -m http.server 8000` in the repo root

Then open:

- `http://localhost:8000`

## Notes

- The sample PDF is bundled into [sample-data.js](./sample-data.js) so the demo sample can load more reliably.
- Qwen API settings are entered in the browser. For a client-facing production deployment, a small backend proxy is safer than exposing a shared API key in the front end.
- The site includes a lightweight access-code gate for GitHub Pages demos. The current access code is `975310`. If you want to rotate it later, replace `ACCESS_CODE_HASH` in [app.js](./app.js) with the SHA-256 hash of your new shared code.
