# Customer checkout optimization

- Payment and advanced preview modules mount only when opened, avoiding their initial download and preview setup on checkout load.
- Pricing polling skips hidden tabs, resumes on visibility, allows one request at a time, and aborts after 15 seconds or on unmount. Server checkout continues to validate current pricing independently.
- Pricing refresh validates the current paper selection rather than the selection captured on initial mount.
- Uploads have a synchronous concurrency guard, a 60-second timeout and input reset so the same file can be retried.
- Local image previews use the original file MIME type instead of the converted server PDF type.
- Advanced controls explicitly disclose that they are preview only; printer transformations are not implemented in this installation.

Validation: lint, production build including TypeScript, and 46 unit/integration tests passed. No field performance numbers or real payment/physical print results are claimed. See INSTALLATION_STATUS.md for outstanding merchant and agent activation requirements.
