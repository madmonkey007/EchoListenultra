# EchoListen website conversion

Approved scope: public product homepage, usable no-login learning tool, desktop/mobile layouts, real demo, help, metadata and production asset fixes. Keep existing local storage keys and uploaded audio. No accounts, cloud sync, billing or automatic production publication.

Preserve the dark navy / cyan EchoListen identity, but use full-width website navigation, restrained mint emphasis, readable type, and a responsive learning workspace. Homepage explains the mechanism and exposes the real sample. Routes: /, /library, /add, /player/:id, /vocabulary, /help, /settings. Existing # links redirect to real routes.

Privacy truth: files and learning data are browser-local; AI transcription explicitly sends audio to the selected provider and needs a user-supplied key. Do not inject operator keys into bundles. No fabricated usage statistics or testimonials.

Verification: node built-in regression tests, TypeScript, Vite production build, local HTTP checks and browser desktop/mobile navigation, real sample playback, upload/segmentation, loop and local persistence. External AI without credentials remains unverified.
