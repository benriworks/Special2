Original prompt: おまかせであなたの力を最大限に活用して、みんなを驚かせるアプリを作って。公開する。GitHub pagesでホストする。Fable 5は以下を作った https://benriworks.github.io/special/

## Direction

- Preserve Fable 5 and publish this work to the empty `benriworks/Special2` repository.
- Build **KOTODAMA**, a zero-backend 3D experience that turns a word into a deterministic living constellation.
- Core states: SIGNAL (word constellation) → SEED → LIFE (unique organism).

## Progress

- [x] Audited the existing Fable 5 site and GitHub Pages setup.
- [x] Selected the concept and initialized the target repository.
- [x] Implement 3D organism renderer and interaction.
- [x] Implement generative audio and optional microphone response.
- [x] Build the full UI, share/save/fullscreen flows, and accessibility fallbacks.
- [x] Add architecture documentation.
- [x] Run build and Playwright verification.
- [ ] Publish and verify the production URL (Pages is enabled; commit/deploy pending).

## Notes

- Vite base path must remain `/Special2/` unless the repository is renamed.
- The microphone must be opt-in and no audio data may leave the browser.
- Keep particle count and DPR adaptive for mobile performance.
- `npm run build` passes with TypeScript 7.0.2 and Vite 8.1.4.
- `npm run verify` passes intro, birth, timeline, echo, mutation, language, dialog, PNG, mobile bounds, and console checks.
- Browser screenshots were visually reviewed for intro, SIGNAL, LIFE, and 390x844 mobile layouts.
- Adversarial code and UX reviews completed; all Critical/High findings were resolved.
- Added single-flight audio/microphone ownership, stale-stream cleanup, GPU attribute disposal, accessible mobile labels, hidden-control focus isolation, dynamic reduced-motion, and viewport drift self-healing.
- Added regression coverage for 320x568 portrait, 390x844 fine/coarse pointer paths, 844x390 landscape, late microphone cancellation, audio start/stop, and viewport pinning.
- GitHub Pages was enabled for `benriworks/Special2` with `build_type=workflow` before the first deployment.
