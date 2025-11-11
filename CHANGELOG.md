# Changelog
All notable changes to this project are documented here.

## [v1.0.0] – 2024-05-06
### Added
- Multi-signer support with per-investor field assignment and automatic link generation.
- Request-sign workflow refinements (sticky header, centered PDF dropzone, admin-token prompt).
- Admin dashboard enhancements: project investors panel, signed/outstanding document views, access-token “Share” tab, request CTA.
- SMTP email sending (Gmail-compatible) for signature requests.

### Fixed
- Magic links now persist per signer, and finishing a signature shows clear post-sign status.
- Back-to-admin navigation restores the selected project context.
- PDF viewer now renders the same files in both designer and signer flows (PDF.js worker tweaks).

