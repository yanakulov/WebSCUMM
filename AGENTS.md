# WebSCUMM

- Work on a `codex/` branch. Commit every completed change, push the branch, open a pull request to `main`, verify its checks, and merge it.
- Each merge to `main` builds the project in GitHub Actions. The workflow publishes the compiled site to the `deploy` branch, and the AkulaFlow host picks it up for [the test site](https://akulaflow.ru/webscummtest/).
- Verify a release by comparing the merged commit with [the deployed revision](https://akulaflow.ru/webscummtest/revision.txt) and opening the site. The host checks for a build every minute.
- Keep the English and Russian README in sync when behavior or setup changes. Game archives and local exports belong outside Git and the static build.
