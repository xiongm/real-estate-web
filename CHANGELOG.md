# Changelog
All notable changes to this project are documented here.

## [v1.1.0] – 2024-05-27
### Added
- Inline field settings for designers: drag-placed text fields now display their selected font badge, and signature/date/text boxes show the same icons used in the toolbar.
- Times New Roman font choice (plus other presets) carried end-to-end from designer → signing UI → sealed PDF.
- Additional loading and verification indicators so admin-token validation and signing submission show immediate spinner feedback.

### Changed
- Request-sign canvas tweaks keep PDF coordinates consistent, preventing misalignment between what’s placed and what signers see.
- Checkbox fields now keep a compact box with tooltip labels, and the designer highlights investor tools with updated hover styles inspired by sign.com.
- Admin/request-sign UI polish: clearer CTA styling (“Request Signatures”), mobile-friendly warnings, and better placement of navigation controls.

### Fixed
- Text/date inputs on the signing page render exactly where they were positioned, eliminating the downward drift that overwrote nearby content.
- Checkbox icon regression resolved (restored familiar ✕ marker) and draggable settings popovers no longer block interaction.

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
