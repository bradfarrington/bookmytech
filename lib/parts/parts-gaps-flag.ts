// The admin Parts gaps screen (Task 77) is local-only for now (Brad,
// 2026-11-17: "hide the parts gap page from the live site … we haven't
// figured out what we're doing with that yet"). It shows on `next dev` and
// nowhere else: not on production, not on preview deploys. The pricing it
// feeds (engine codes, approved code matches, model part picks, gap
// recording) runs everywhere, but does nothing until something is approved
// or picked on this screen.
//
// To switch it on for the live site, make this true (or read an env var).
export const PARTS_GAPS_SCREEN_ENABLED = process.env.NODE_ENV === "development";
